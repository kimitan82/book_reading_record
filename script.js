import app from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  initializeFirestore,
  onSnapshot,
  orderBy,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
const auth = getAuth(app);

const form = document.getElementById("book-form");
const configForm = document.getElementById("firebase-config-form");
const configInput = document.getElementById("firebase-config-json");
const titleInput = document.getElementById("book-title");
const numberInput = document.getElementById("book-number");
const courseInput = document.getElementById("book-course");
const seriesInput = document.getElementById("book-series");
const authorInput = document.getElementById("book-author");
const publisherInput = document.getElementById("book-publisher");
const isbnInput = document.getElementById("book-isbn");
const readInput = document.getElementById("book-read");
const readDateInput = document.getElementById("book-read-date");
const commentInput = document.getElementById("book-comment");
const bookList = document.getElementById("book-list");
const statusMessage = document.getElementById("status-message");
const bookCount = document.getElementById("book-count");
const authStatus = document.getElementById("auth-status");
const userNameLabel = document.getElementById("user-name");
const userIdLabel = document.getElementById("user-id");
const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const resetPasswordButton = document.getElementById("reset-password-button");
const logoutButton = document.getElementById("logout-button");
const authForms = document.querySelector(".auth-forms");
const appSections = document.querySelectorAll("[data-auth-required]");

let booksUnsubscribe = null;
let currentUser = null;

numberInput?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") {
    return;
  }

  event.preventDefault();
  courseInput?.focus();
});

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
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
      return "メールアドレスまたはパスワードが正しくありません。";
    case "auth/user-disabled":
      return "このアカウントは無効になっています。Firebase Consoleで状態を確認してください。";
    case "auth/operation-not-allowed":
      return "メールアドレスとパスワードによるログインがFirebaseで有効になっていません。";
    case "auth/too-many-requests":
      return "ログイン試行回数が多いため、しばらく待ってから再試行してください。";
    default:
      return error?.message || "認証に失敗しました。";
  }
}

function getFirestoreErrorMessage(error, action) {
  if (error?.code === "unavailable") {
    return `${action}できません。ネットワーク接続を確認して再試行してください。`;
  }

  if (error?.code === "permission-denied") {
    return `${action}権限がありません。ログイン状態を確認してから再試行してください。`;
  }

  if (error?.code === "failed-precondition") {
    return `${action}に必要なFirebaseの設定が完了していません。`;
  }

  return `${action}に失敗しました。通信状態を確認して再試行してください。`;
}

function getReadingRecordsCollection(user) {
  // ブラウザ間で、この「user.uid」の文字列が1文字も違わず完全に一致するか確認する
  console.log("現在アクセスしているUID:", user?.uid); 
  return collection(db, "users", user.uid, "readingRecords");
}

function formatFirestoreTimestamp(timestamp) {
  if (!timestamp) {
    return "未確定";
  }

  const date = typeof timestamp.toDate === "function" ? timestamp.toDate() : new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "不明";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function toggleAuthRequiredSections(isLoggedIn) {
  appSections.forEach((element) => {
    element.classList.toggle("hidden", !isLoggedIn);
  });

  authForms.classList.toggle("hidden", isLoggedIn);
  logoutButton.classList.toggle("hidden", !isLoggedIn);
}

function resetBooksView() {
  if (!bookList || !bookCount) {
    return;
  }

  bookList.innerHTML = "";
  bookCount.textContent = "0件";
  const emptyState = document.createElement("li");
  emptyState.className = "empty-state";
  emptyState.textContent = "ログインして読書記録を管理してください。";
  bookList.appendChild(emptyState);
}

function renderEmptyState() {
  if (!bookList) {
    return;
  }

  const emptyState = document.createElement("li");
  emptyState.className = "empty-state";
  emptyState.textContent = "まだ読書記録が登録されていません。";
  bookList.appendChild(emptyState);
}

function renderBooks(books) {
  if (!bookList || !bookCount) {
    return;
  }

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

    const details = document.createElement("p");
    details.className = "book-details";
    const detailItems = [
      book.number ? `番号: ${book.number}` : "",
      book.course ? `コース: ${book.course}` : "",
      book.series ? `シリーズ: ${book.series}` : "",
      book.publisher ? `出版社: ${book.publisher}` : "",
      book.isbn ? `ISBN: ${book.isbn}` : "",
    ].filter(Boolean);
    details.textContent = detailItems.length > 0 ? detailItems.join(" / ") : "詳細情報未記入";

    const comment = document.createElement("p");
    comment.className = "book-comment";
    comment.textContent = book.comment || "コメント未記入";

    const readDate = document.createElement("p");
    readDate.className = "book-read-date";
    readDate.textContent = `読んだ日: ${book.readDate || "未記入"}`;

    const metadata = document.createElement("p");
    metadata.className = "book-metadata";
    metadata.textContent =
      `作成日時: ${formatFirestoreTimestamp(book.createdAt)} / ` +
      `更新日時: ${formatFirestoreTimestamp(book.updatedAt)}`;

    info.appendChild(title);
    info.appendChild(author);
    info.appendChild(details);
    info.appendChild(comment);
    info.appendChild(readDate);
    info.appendChild(metadata);

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
        const user = auth.currentUser;
        if (!user) {
          setStatus("ログイン状態を確認してから再試行してください。", "error");
          return;
        }
        const bookRef = doc(getReadingRecordsCollection(user), book.id);
        const nextRead = !book.read;
        await updateDoc(bookRef, {
          read: nextRead,
          readDate: nextRead ? book.readDate || new Date().toISOString().slice(0, 10) : "",
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        console.error(error);
        setStatus("読書状況の更新に失敗しました。", "error");
      }
    });

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "secondary-button";
    editButton.textContent = "編集";
    editButton.addEventListener("click", () => {
      const editForm = document.createElement("div");
      editForm.className = "book-edit-form";

      const editStatusField = document.createElement("label");
      editStatusField.textContent = "読書状況";
      const editStatus = document.createElement("select");
      editStatus.innerHTML = '<option value="false">未読</option><option value="true">読んだ</option>';
      editStatus.value = String(Boolean(book.read));
      editStatusField.appendChild(editStatus);

      const editDateField = document.createElement("label");
      editDateField.textContent = "読んだ日";
      const editDate = document.createElement("input");
      editDate.type = "date";
      editDate.value = book.readDate || "";
      editDateField.appendChild(editDate);

      const editCommentField = document.createElement("label");
      editCommentField.textContent = "コメント";
      const editComment = document.createElement("textarea");
      editComment.rows = 3;
      editComment.maxLength = 1000;
      editComment.value = book.comment || "";
      editCommentField.appendChild(editComment);

      const editActions = document.createElement("div");
      editActions.className = "actions";
      const saveButton = document.createElement("button");
      saveButton.type = "button";
      saveButton.className = "primary-button";
      saveButton.textContent = "保存";
      saveButton.addEventListener("click", async () => {
        try {
          const user = auth.currentUser;
          if (!user) {
            setStatus("ログイン状態を確認してから再試行してください。", "error");
            return;
          }
          const bookRef = doc(getReadingRecordsCollection(user), book.id);
          const isRead = editStatus.value === "true";
          await updateDoc(bookRef, {
            read: isRead,
            readDate: isRead ? editDate.value : "",
            comment: editComment.value.trim(),
            updatedAt: serverTimestamp(),
          });
          setStatus(`${book.title}を更新しました。`, "success");
        } catch (error) {
          console.error(error);
          setStatus("読書記録の更新に失敗しました。", "error");
        }
      });

      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.className = "secondary-button";
      cancelButton.textContent = "キャンセル";
      cancelButton.addEventListener("click", () => editForm.remove());

      editActions.appendChild(saveButton);
      editActions.appendChild(cancelButton);
      editForm.appendChild(editStatusField);
      editForm.appendChild(editDateField);
      editForm.appendChild(editCommentField);
      editForm.appendChild(editActions);
      info.appendChild(editForm);
      editButton.disabled = true;
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-button";
    deleteButton.textContent = "削除";
    deleteButton.addEventListener("click", async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          setStatus("ログイン状態を確認してから再試行してください。", "error");
          return;
        }
        const bookRef = doc(getReadingRecordsCollection(user), book.id);
        await deleteDoc(bookRef);
        setStatus(`${book.title}を削除しました。`, "success");
      } catch (error) {
        console.error(error);
        setStatus("削除に失敗しました。", "error");
      }
    });

    actions.appendChild(toggleButton);
    actions.appendChild(editButton);
    actions.appendChild(deleteButton);

    item.appendChild(info);
    item.appendChild(statusChip);
    item.appendChild(actions);
    bookList.appendChild(item);
  });
}

async function loadBooksOnce(userId) {
  if (!db || !userId) {
    return;
  }

  try {
    const readingRecordsCollection = getReadingRecordsCollection({ uid: userId });
    const readingRecordsQuery = query(readingRecordsCollection, orderBy("createdAt", "desc"));
    const snapshot = await getDocsFromServer(readingRecordsQuery);

    const books = snapshot.docs.map((docSnapshot) => ({
      id: docSnapshot.id,
      ...docSnapshot.data(),
      read: Boolean(docSnapshot.data().read),
    }));

    renderBooks(books);
  } catch (error) {
    console.error(error);
    setStatus(getFirestoreErrorMessage(error, "読書記録の読み込み"), "error");
  }
}

function subscribeToBooks(userId) {
  if (booksUnsubscribe) {
    booksUnsubscribe();
    booksUnsubscribe = null;
  }

  const readingRecordsCollection = getReadingRecordsCollection({ uid: userId });
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
      setStatus(getFirestoreErrorMessage(error, "読書記録の読み込み"), "error");
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
    if (error?.code !== "unavailable") {
      console.warn("ユーザープロファイルの取得に失敗しました。オフライン時でもログインを継続します。", error);
    }
    userNameLabel.textContent = fallbackName;
  }
}

async function handleAuthStateChanged(user) {
  currentUser = user;

  if (!user) {
    toggleAuthRequiredSections(false);
    resetBooksView();
    userNameLabel.textContent = "未ログイン";
    userIdLabel.textContent = "Firebase UID: 未ログイン";
    setStatus("ログインしてください。", "");
    setAuthStatus("", "");
    return;
  }

  toggleAuthRequiredSections(true);
  userNameLabel.textContent = user.displayName || user.email?.split("@")[0] || "ユーザー";
  userIdLabel.textContent = `Firebase UID: ${user.uid}`;
  void ensureUserProfile(user);
  setAuthStatus(`ログイン中: ${user.email || "メールアドレス未設定"}`, "success");
  setStatus("", "");
  subscribeToBooks(user.uid);
}

onAuthStateChanged(auth, handleAuthStateChanged);

window.addEventListener("online", () => {
  const user = auth.currentUser;
  if (!user) {
    return;
  }

  subscribeToBooks(user.uid);
  void ensureUserProfile(user);
});

async function showLoggedInState(user) {
  if (!user) {
    return;
  }

  currentUser = user;
  toggleAuthRequiredSections(true);
  userNameLabel.textContent = user.displayName || user.email?.split("@")[0] || "ユーザー";
  userIdLabel.textContent = `Firebase UID: ${user.uid}`;
  void ensureUserProfile(user);
  setAuthStatus(`ログイン中: ${user.email || "メールアドレス未設定"}`, "success");
  setStatus("", "");
  subscribeToBooks(user.uid);
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
    await showLoggedInState(userCredential.user);
    setAuthStatus("ログインに成功しました。", "success");
    loginForm.reset();
  } catch (error) {
    console.error(error);
    setAuthStatus(`ログインに失敗しました。${getAuthErrorMessage(error)}`, "error");
  }
});

resetPasswordButton.addEventListener("click", async () => {
  const email = document.getElementById("login-email").value.trim();

  if (!email) {
    setAuthStatus("パスワードを再設定するメールアドレスを入力してください。", "error");
    document.getElementById("login-email").focus();
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    setAuthStatus("パスワード再設定用のメールを送信しました。メールをご確認ください。", "success");
  } catch (error) {
    console.error(error);
    setAuthStatus(`パスワード再設定に失敗しました。${getAuthErrorMessage(error)}`, "error");
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

    await showLoggedInState(userCredential.user);
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
    userIdLabel.textContent = "Firebase UID: 未ログイン";
    setAuthStatus("ログアウトしました。", "success");
  } catch (error) {
    console.error(error);
    setAuthStatus("ログアウトに失敗しました。", "error");
  }
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const user = auth.currentUser;

  if (!user || !db) {
    setStatus("ログインしてください。", "error");
    return;
  }

  const title = titleInput.value.trim();
  const numberValue = numberInput.value.trim();
  const number = numberValue ? Number(numberValue) : null;
  const course = courseInput.value.trim();
  const series = seriesInput.value.trim();
  const author = authorInput.value.trim();
  const publisher = publisherInput.value.trim();
  const isbn = isbnInput.value.trim();
  const read = readInput.value === "true";
  const readDate = readDateInput.value;
  const comment = commentInput.value.trim();

  if (!title) {
    setStatus("タイトルを入力してください。", "error");
    titleInput.focus();
    return;
  }

  if (numberValue && (!Number.isInteger(number) || number < 1)) {
    setStatus("番号は1以上の整数で入力してください。", "error");
    numberInput.focus();
    return;
  }

  try {
    const readingRecordsCollection = getReadingRecordsCollection(user);
    await addDoc(readingRecordsCollection, {
      number,
      course,
      title,
      series,
      author: author || "著者未記入",
      publisher,
      isbn,
      read,
      readDate: read ? readDate : "",
      comment,
      createdAt: Timestamp.now(),
      updatedAt: serverTimestamp(),
    });

    form.reset();
    titleInput.focus();
    setStatus(`${title}を登録しました。`, "success");
  } catch (error) {
    console.error(error);
    setStatus(getFirestoreErrorMessage(error, "読書記録の登録"), "error");
  }
});

resetBooksView();
toggleAuthRequiredSections(false);
userNameLabel.textContent = "未ログイン";
