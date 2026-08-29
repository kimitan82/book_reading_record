import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
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

const STORAGE_KEY = "bookReadingFirebaseConfig";
const authForm = document.getElementById("auth-form");
const nameInput = document.getElementById("auth-name");
const emailInput = document.getElementById("auth-email");
const passwordInput = document.getElementById("auth-password");
const signupButton = document.getElementById("signup-button");
const loginButton = document.getElementById("login-button");
const logoutButton = document.getElementById("logout-button");
const form = document.getElementById("book-form");
const configForm = document.getElementById("firebase-config-form");
const configInput = document.getElementById("firebase-config-json");
const titleInput = document.getElementById("book-title");
const authorInput = document.getElementById("book-author");
const bookList = document.getElementById("book-list");
const statusMessage = document.getElementById("status-message");
const bookCount = document.getElementById("book-count");

let auth;
let db;
let currentUser = null;
let unsubscribeBooks = null;

function setStatus(message, type = "") {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`.trim();
}

function isValidFirebaseConfig(config) {
  return (
    config &&
    typeof config === "object" &&
    typeof config.apiKey === "string" &&
    config.apiKey.trim() &&
    typeof config.projectId === "string" &&
    config.projectId.trim() &&
    typeof config.authDomain === "string" &&
    config.authDomain.trim()
  );
}

function getStoredFirebaseConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.error("Firebase config parse error:", error);
    return {};
  }
}

function saveFirebaseConfig(config) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function loadConfigIntoForm() {
  const config = getStoredFirebaseConfig();
  if (isValidFirebaseConfig(config)) {
    configInput.value = JSON.stringify(config, null, 2);
  }
}

function setAuthUi(user) {
  const isLoggedIn = Boolean(user);
  const nameField = document.getElementById("auth-name-field");

  nameField.classList.toggle("hidden", isLoggedIn);
  signupButton.disabled = isLoggedIn;
  signupButton.style.opacity = isLoggedIn ? "0.6" : "1";
  loginButton.disabled = isLoggedIn;
  loginButton.style.opacity = isLoggedIn ? "0.6" : "1";
  logoutButton.classList.toggle("hidden", !isLoggedIn);

  nameInput.disabled = isLoggedIn;
  emailInput.disabled = isLoggedIn;
  passwordInput.disabled = isLoggedIn;

  form.querySelector("button[type='submit']").disabled = !isLoggedIn;
  form.querySelector("button[type='submit']").style.opacity = isLoggedIn ? "1" : "0.6";
  titleInput.disabled = !isLoggedIn;
  authorInput.disabled = !isLoggedIn;
}

async function ensureUserProfile(user, providedName = "") {
  if (!db || !user) {
    return;
  }

  const userRef = doc(db, "users", user.uid);
  const userSnapshot = await getDoc(userRef);
  const displayName =
    providedName || user.displayName || userSnapshot.data()?.name || user.email?.split("@")[0] || "ユーザー";

  const userData = {
    uid: user.uid,
    name: displayName,
    updatedAt: serverTimestamp(),
  };

  if (!userSnapshot.exists()) {
    userData.createdAt = serverTimestamp();
  }

  await setDoc(userRef, userData, { merge: true });
}

function renderEmptyState() {
  const emptyState = document.createElement("li");
  emptyState.className = "empty-state";
  emptyState.textContent = "まだ課題図書が登録されていません。";
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
        await deleteDoc(doc(db, "users", currentUser.uid, "readingRecords", book.id));
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

function stopBookListener() {
  if (unsubscribeBooks) {
    unsubscribeBooks();
    unsubscribeBooks = null;
  }
  bookList.innerHTML = "";
  bookCount.textContent = "0件";
}

function startBookListener(user) {
  stopBookListener();

  const booksCollection = collection(db, "users", user.uid, "readingRecords");
  const booksQuery = query(booksCollection, orderBy("createdAt", "desc"));

  unsubscribeBooks = onSnapshot(
    booksQuery,
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
      setStatus("Firebaseからの読み込みに失敗しました。", "error");
    }
  );
}

async function initFirebaseApp() {
  const config = getStoredFirebaseConfig();

  if (!isValidFirebaseConfig(config)) {
    setStatus("Firebase設定JSONを保存してからログインしてください。", "error");
    return null;
  }

  const app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    setAuthUi(user);

    if (user) {
      await ensureUserProfile(user);
      setStatus(`${user.displayName || "ユーザー"}さんでログイン中です。`, "success");
      startBookListener(user);
    } else {
      stopBookListener();
      setStatus("メールアドレスとパスワードでログインしてください。", "");
    }
  });

  return app;
}

configForm.addEventListener("submit", (event) => {
  event.preventDefault();

  try {
    const config = JSON.parse(configInput.value.trim());

    if (!isValidFirebaseConfig(config)) {
      throw new Error("設定JSONが不正です");
    }

    saveFirebaseConfig(config);
    setStatus("Firebase設定を保存しました。ログインを続けてください。", "success");
    initFirebaseApp();
  } catch (error) {
    console.error(error);
    setStatus("設定JSONの形式が正しくありません。", "error");
  }
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!auth || !db) {
    setStatus("Firebase設定を先に保存してください。", "error");
    return;
  }

  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password || password.length < 6) {
    setStatus("メールアドレスと6文字以上のパスワードを入力してください。", "error");
    return;
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);

    if (name) {
      await updateProfile(userCredential.user, { displayName: name });
    }

    await ensureUserProfile(userCredential.user, name);
    authForm.reset();
    setStatus(`${name || userCredential.user.email}さんを登録しました。`, "success");
  } catch (error) {
    console.error(error);
    setStatus("アカウント登録に失敗しました。もう一度お試しください。", "error");
  }
});

loginButton.addEventListener("click", async () => {
  if (!auth) {
    setStatus("Firebase設定を先に保存してください。", "error");
    return;
  }

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password || password.length < 6) {
    setStatus("メールアドレスと6文字以上のパスワードを入力してください。", "error");
    return;
  }

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    await ensureUserProfile(userCredential.user);
    authForm.reset();
    setStatus(`${userCredential.user.email}でログインしました。`, "success");
  } catch (error) {
    console.error(error);
    setStatus("ログインに失敗しました。メールアドレスとパスワードを確認してください。", "error");
  }
});

logoutButton.addEventListener("click", async () => {
  if (!auth) {
    return;
  }

  try {
    await signOut(auth);
    authForm.reset();
    setStatus("ログアウトしました。", "success");
  } catch (error) {
    console.error(error);
    setStatus("ログアウトに失敗しました。", "error");
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser || !db) {
    setStatus("ログインしてから課題図書を登録してください。", "error");
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
    const booksCollection = collection(db, "users", currentUser.uid, "readingRecords");
    await addDoc(booksCollection, {
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
    setStatus("課題図書の登録に失敗しました。", "error");
  }
});

loadConfigIntoForm();
setAuthUi(null);
initFirebaseApp();
