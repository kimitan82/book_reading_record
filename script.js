import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const STORAGE_KEY = "bookReadingFirebaseConfig";
const form = document.getElementById("book-form");
const configForm = document.getElementById("firebase-config-form");
const configInput = document.getElementById("firebase-config-json");
const loginButton = document.getElementById("login-button");
const logoutButton = document.getElementById("logout-button");
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
  return config &&
    typeof config === "object" &&
    typeof config.apiKey === "string" &&
    config.apiKey.trim() &&
    typeof config.projectId === "string" &&
    config.projectId.trim() &&
    typeof config.authDomain === "string" &&
    config.authDomain.trim();
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
  loginButton.classList.toggle("hidden", isLoggedIn);
  logoutButton.classList.toggle("hidden", !isLoggedIn);
  form.querySelector("button[type='submit']").disabled = !isLoggedIn;
  form.querySelector("button[type='submit']").style.opacity = isLoggedIn ? "1" : "0.6";
  titleInput.disabled = !isLoggedIn;
  authorInput.disabled = !isLoggedIn;
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
        const bookRef = doc(db, "readingBooks", book.id);
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
        await deleteDoc(doc(db, "readingBooks", book.id));
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

  const booksCollection = collection(db, "readingBooks");
  const booksQuery = query(
    booksCollection,
    where("uid", "==", user.uid),
    orderBy("createdAt", "desc")
  );

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

  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    setAuthUi(user);

    if (user) {
      setStatus(`${user.displayName || "ユーザー"}でログイン中です。`, "success");
      startBookListener(user);
    } else {
      stopBookListener();
      setStatus("Googleアカウントでログインしてください。", "");
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

loginButton.addEventListener("click", async () => {
  if (!auth) {
    setStatus("Firebase設定を先に保存してください。", "error");
    return;
  }

  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error(error);
    setStatus("Googleログインに失敗しました。", "error");
  }
});

logoutButton.addEventListener("click", async () => {
  if (!auth) {
    return;
  }

  try {
    await signOut(auth);
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
    const booksCollection = collection(db, "readingBooks");
    await addDoc(booksCollection, {
      uid: currentUser.uid,
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
