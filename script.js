import app from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
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

function getAuthErrorMessage(error) {
  const code = error?.code || "";

  switch (code) {
    case "auth/email-already-in-use":
      return "このメールアドレスは既に登録されています。";
    case "auth/invalid-email":
      return "メールアドレスの形式が正しくありません。";
    case "auth/weak-password":
      return "パスワードは6文字以上で入力してください。";
    case "auth/user-not-found":
      return "アカウントが見つかりません。メールアドレスを確認してください。";
    case "auth/wrong-password":
      return "パスワードが違います。";
    case "auth/too-many-requests":
      return "ログイン試行回数が多いためしばらく待ってから再試行してください。";
    default:
      return error?.message || "認証に失敗しました。";
  }
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
  const fallbackName = user.displayName?.trim() || user.email?.split("@")[0] || "ユーザー";

  if (!navigator.onLine) {
    userNameLabel.textContent = fallbackName;
    return;
  }

  try {
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      try {
        await setDoc(
          userDocRef,
          {
            name: fallbackName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (createError) {
        console.warn("ユーザープロファイルの作成に失敗しましたが、ログイン処理は継続します。", createError);
      }
    }

    const userData = userDoc.exists() ? userDoc.data() : { name: fallbackName };
    userNameLabel.textContent = userData.name || fallbackName;
  } catch (error) {
    console.warn("ユーザープロファイルの取得に失敗しました。オフライン時でもログインを継続します。", error);
    userNameLabel.textContent = fallbackName;
  }
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

  toggleAuthRequiredSections(true);
  userNameLabel.textContent = user.displayName || user.email?.split("@")[0] || "ユーザー";
  void ensureUserProfile(user);
  try {
    subscribeToBooks(user.uid);
  } catch (error) {
    console.warn("読書記録の購読に失敗しました。", error);
  }
  setAuthStatus(`ログイン中: ${user.email}`, "success");
  setStatus("", "");
}

onAuthStateChanged(auth, handleAuthStateChanged);

async function showLoggedInState(user) {
  if (!user) {
    return;
  }

  currentUser = user;
  toggleAuthRequiredSections(true);
  userNameLabel.textContent = user.displayName || user.email?.split("@")[0] || "ユーザー";
  void ensureUserProfile(user);
  try {
    subscribeToBooks(user.uid);
  } catch (error) {
    console.warn("読書記録の購読に失敗しました。", error);
  }
  setAuthStatus(`ログイン中: ${user.email}`, "success");
  setStatus("", "");
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  if (!email || !password) {
    setAuthStatus("メールアドレスとパスワードを入力してください。", "error");
    return;
  }

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    showLoggedInState(userCredential.user);
    setAuthStatus("ログインに成功しました。", "success");
    loginForm.reset();
  } catch (error) {
    console.error(error);
    setAuthStatus(`ログインに失敗しました。${getAuthErrorMessage(error)}`, "error");
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

    try {
      await setDoc(
        userDocRef,
        {
          name,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (profileError) {
      console.warn("ユーザープロファイルの保存に失敗しましたが、ログイン処理は継続します。", profileError);
    }

    showLoggedInState(userCredential.user);
    setAuthStatus("新規登録に成功しました。", "success");
    signupForm.reset();
  } catch (error) {
    console.error(error);
    setAuthStatus(`新規登録に失敗しました。${getAuthErrorMessage(error)}`, "error");
  }
});

logoutButton.addEventListener("click", async () => {
  try {
    await signOut(auth);
    toggleAuthRequiredSections(false);
    resetBooksView();
    userNameLabel.textContent = "未ログイン";
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
