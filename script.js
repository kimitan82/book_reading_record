import app from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const db = getFirestore(app);
const auth = getAuth(app);

const form = document.getElementById("book-form");
const configForm = document.getElementById("firebase-config-form");
const configInput = document.getElementById("firebase-config-json");
const titleInput = document.getElementById("book-title");
const authorInput = document.getElementById("book-author");
const bookList = document.getElementById("book-list");
const statusMessage = document.getElementById("status-message");
const bookCount = document.getElementById("book-count");
const authStatus = document.getElementById("auth-status");
const userNameLabel = document.getElementById("user-name");
const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const logoutButton = document.getElementById("logout-button");
const authForms = document.querySelector(".auth-forms");
const appSections = document.querySelectorAll("[data-auth-required]");

let booksUnsubscribe = null;
let currentUser = null;

function setStatus(message, type = "") {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`.trim();
}

function setAuthStatus(message, type = "") {
  authStatus.textContent = message;
  authStatus.className = `status-message ${type}`.trim();
}

function toggleAuthRequiredSections(isLoggedIn) {
  appSections.forEach((element) => {
    element.classList.toggle("hidden", !isLoggedIn);
  });

  authForms.classList.toggle("hidden", isLoggedIn);
  logoutButton.classList.toggle("hidden", !isLoggedIn);
}

function resetBooksView() {
  bookList.innerHTML = "";
  bookCount.textContent = "0件";
  const emptyState = document.createElement("li");
  emptyState.className = "empty-state";
  emptyState.textContent = "ログインして読書記録を管理してください。";
  bookList.appendChild(emptyState);
}

function renderEmptyState() {
  const emptyState = document.createElement("li");
  emptyState.className = "empty-state";
  emptyState.textContent = "まだ読書記録が登録されていません。";
  bookList.appendChild(emptyState);
}

function renderBooks(books) {
  bookList.innerHTML = "";
  bookCount.textContent = `${books.length}件`;

  if (books.length === 0) {
    renderEmptyState();
    return;
  }

  books.forEach((book) => {
    const item = document.createElement("li");
    item.className = "book-item";

    const info = document.createElement("div");
    info.className = "book-info";

    const title = document.createElement("p");
    title.className = "book-title";
    title.textContent = book.title;

    const author = document.createElement("p");
    author.className = "book-author";
    author.textContent = book.author || "著者未記入";

    info.appendChild(title);
    info.appendChild(author);

    const statusChip = document.createElement("span");
    statusChip.className = `status-chip ${book.read ? "done" : "todo"}`;
    statusChip.textContent = book.read ? "読んだ" : "未読";

    const actions = document.createElement("div");
    actions.className = "actions";

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = `status-button ${book.read ? "done" : ""}`;
    toggleButton.textContent = book.read ? "未読に戻す" : "読んだにする";
    toggleButton.addEventListener("click", async () => {
      try {
        const bookRef = doc(db, "users", currentUser.uid, "readingRecords", book.id);
        await updateDoc(bookRef, {
          read: !book.read,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        console.error(error);
        setStatus("読書状況の更新に失敗しました。", "error");
      }
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-button";
    deleteButton.textContent = "削除";
    deleteButton.addEventListener("click", async () => {
      try {
        const bookRef = doc(db, "users", currentUser.uid, "readingRecords", book.id);
        await deleteDoc(bookRef);
        setStatus(`${book.title}を削除しました。`, "success");
      } catch (error) {
        console.error(error);
        setStatus("削除に失敗しました。", "error");
      }
    });

    actions.appendChild(toggleButton);
    actions.appendChild(deleteButton);

    item.appendChild(info);
    item.appendChild(statusChip);
    item.appendChild(actions);
    bookList.appendChild(item);
  });
}

function subscribeToBooks(userId) {
  if (booksUnsubscribe) {
    booksUnsubscribe();
    booksUnsubscribe = null;
  }

  const readingRecordsCollection = collection(db, "users", userId, "readingRecords");
  const readingRecordsQuery = query(readingRecordsCollection, orderBy("createdAt", "desc"));

  booksUnsubscribe = onSnapshot(
    readingRecordsQuery,
    (snapshot) => {
      const books = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data(),
        read: Boolean(docSnapshot.data().read),
      }));
      renderBooks(books);
    },
    (error) => {
      console.error(error);
      setStatus("Firebaseからの読書記録の読み込みに失敗しました。", "error");
    }
  );
}

async function ensureUserProfile(user) {
  if (!db || !user) {
    return;
  }

  const userDocRef = doc(db, "users", user.uid);
  const userDoc = await getDoc(userDocRef);

  if (!userDoc.exists()) {
    const userName = user.displayName?.trim() || user.email?.split("@")[0] || "ユーザー";
    await setDoc(userDocRef, {
      name: userName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  const userData = userDoc.exists() ? userDoc.data() : { name: user.email?.split("@")[0] || "ユーザー" };
  userNameLabel.textContent = userData.name || "ユーザー";
}

async function handleAuthStateChanged(user) {
  currentUser = user;

  if (!user) {
    toggleAuthRequiredSections(false);
    resetBooksView();
    userNameLabel.textContent = "未ログイン";
    setStatus("ログインしてください。", "");
    setAuthStatus("", "");
    return;
  }

  await ensureUserProfile(user);
  toggleAuthRequiredSections(true);
  subscribeToBooks(user.uid);
  setAuthStatus(`ログイン中: ${user.email}`, "success");
  setStatus("", "");
}

onAuthStateChanged(auth, handleAuthStateChanged);

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  if (!email || !password) {
    setAuthStatus("メールアドレスとパスワードを入力してください。", "error");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    setAuthStatus("ログインしました。", "success");
    loginForm.reset();
  } catch (error) {
    console.error(error);
    setAuthStatus("ログインに失敗しました。入力内容を確認してください。", "error");
  }
});

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = document.getElementById("signup-name").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;

  if (!name || !email || !password) {
    setAuthStatus("名前、メールアドレス、パスワードを入力してください。", "error");
    return;
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const userDocRef = doc(db, "users", userCredential.user.uid);
    await setDoc(userDocRef, {
      name,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    setAuthStatus("新規登録しました。", "success");
    signupForm.reset();
  } catch (error) {
    console.error(error);
    setAuthStatus("新規登録に失敗しました。", "error");
  }
});

logoutButton.addEventListener("click", async () => {
  try {
    await signOut(auth);
    setAuthStatus("ログアウトしました。", "success");
  } catch (error) {
    console.error(error);
    setAuthStatus("ログアウトに失敗しました。", "error");
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser || !db) {
    setStatus("ログインしてください。", "error");
    return;
  }

  const title = titleInput.value.trim();
  const author = authorInput.value.trim();

  if (!title) {
    setStatus("タイトルを入力してください。", "error");
    titleInput.focus();
    return;
  }

  try {
    const readingRecordsCollection = collection(db, "users", currentUser.uid, "readingRecords");
    await addDoc(readingRecordsCollection, {
      title,
      author: author || "著者未記入",
      read: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    form.reset();
    titleInput.focus();
    setStatus(`${title}を登録しました。`, "success");
  } catch (error) {
    console.error(error);
    setStatus("読書記録の登録に失敗しました。", "error");
  }
});

resetBooksView();
toggleAuthRequiredSections(false);
userNameLabel.textContent = "未ログイン";
