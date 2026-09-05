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
  getDocs,
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
const lookupIsbnButton = document.getElementById("lookup-isbn-button");
const readInput = document.getElementById("book-read");
const readDateInput = document.getElementById("book-read-date");
const commentInput = document.getElementById("book-comment");
const exportCsvButton = document.getElementById("export-csv-button");
const csvFileInput = document.getElementById("csv-file");
const csvImportMode = document.getElementById("csv-import-mode");
const importCsvButton = document.getElementById("import-csv-button");
const bookList = document.getElementById("book-list");
const statusMessage = document.getElementById("status-message");
const bookCount = document.getElementById("book-count");
const sortField = document.getElementById("sort-field");
const sortDirection = document.getElementById("sort-direction");
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
let currentBooks = [];

numberInput?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") {
    return;
  }

  event.preventDefault();
  courseInput?.focus();
});

function getXmlText(element, localName) {
  return [...element.children].find((child) => child.localName === localName)?.textContent.trim() || "";
}

function getResponsibilityStatement(item) {
  const description = [...item.children].find((child) => child.localName === "description")?.textContent || "";
  const responsibility = description.match(/責任表示：([^<]+)/)?.[1]?.trim();
  return responsibility ? responsibility.replace(/\s*,\s*/g, " / ") : "";
}

async function lookupBookByIsbn() {
  const isbn = isbnInput?.value.replace(/[-\s]/g, "").trim();

  if (!isbn) {
    setStatus("ISBNを入力してください。", "error");
    isbnInput?.focus();
    return;
  }

  lookupIsbnButton.disabled = true;
  setStatus("ISBNから書誌情報を検索しています。", "");

  try {
    const endpoint = new URL("https://ndlsearch.ndl.go.jp/api/opensearch");
    endpoint.searchParams.set("cnt", "1");
    endpoint.searchParams.set("isbn", isbn);
    const response = await fetch(endpoint);

    if (!response.ok) {
      throw new Error(`NDL Search API returned ${response.status}`);
    }

    const xml = new DOMParser().parseFromString(await response.text(), "application/xml");
    if (xml.querySelector("parsererror")) {
      throw new Error("NDL Search API returned invalid XML");
    }

    const item = xml.getElementsByTagName("item")[0];
    if (!item) {
      setStatus("該当する書誌情報が見つかりませんでした。", "error");
      return;
    }

    const title = getXmlText(item, "title");
    const creators = [...item.children]
      .filter((child) => child.localName === "creator")
      .map((child) => child.textContent.trim())
      .filter(Boolean);
    const responsibility = getResponsibilityStatement(item);
    const series = getXmlText(item, "seriesTitle");
    const publisher = getXmlText(item, "publisher");

    if (title) {
      titleInput.value = title;
    }
    if (series) {
      seriesInput.value = series;
    }
    if (creators.length > 0) {
      authorInput.value = responsibility || creators.join(" / ");
    }
    if (publisher) {
      publisherInput.value = publisher;
    }

    setStatus("書誌情報を取得しました。内容を確認して登録してください。", "success");
  } catch (error) {
    console.error(error);
    setStatus("書誌情報の取得に失敗しました。ISBNを確認するか、手入力してください。", "error");
  } finally {
    lookupIsbnButton.disabled = false;
  }
}

lookupIsbnButton?.addEventListener("click", lookupBookByIsbn);
isbnInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    void lookupBookByIsbn();
  }
});

function setStatus(message, type = "") {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`.trim();
}

function setAuthStatus(message, type = "") {
  authStatus.textContent = message;
  authStatus.className = `status-message ${type}`.trim();
}

const csvColumns = [
  ["number", "番号"],
  ["course", "コース"],
  ["title", "タイトル"],
  ["series", "シリーズ名"],
  ["author", "著者"],
  ["publisher", "出版社"],
  ["isbn", "ISBN"],
  ["read", "読書状況"],
  ["readDate", "読んだ日"],
  ["comment", "コメント"],
];

function escapeCsvValue(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];
    if (character === '"' && quoted && nextCharacter === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }
      row.push(value);
      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (value || row.length > 0) {
    row.push(value);
    if (row.some((cell) => cell.trim() !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

function createBookFromCsvRow(row, headerIndex) {
  const getValue = (key) => row[headerIndex.get(key)]?.trim() || "";
  const numberValue = getValue("number");
  const number = numberValue ? Number(numberValue) : null;

  if (!getValue("title")) {
    throw new Error("タイトルが空の行があります。");
  }
  if (numberValue && (!Number.isInteger(number) || number < 1)) {
    throw new Error("番号は1以上の整数で入力してください。");
  }

  const readValue = getValue("read");
  return {
    number,
    course: getValue("course"),
    title: getValue("title"),
    series: getValue("series"),
    author: getValue("author") || "著者未記入",
    publisher: getValue("publisher"),
    isbn: getValue("isbn"),
    read: readValue === "true" || readValue === "読んだ",
    readDate: getValue("readDate"),
    comment: getValue("comment"),
    createdAt: Timestamp.now(),
    updatedAt: serverTimestamp(),
  };
}

async function getCurrentBooks(user) {
  const recordsQuery = query(getReadingRecordsCollection(user), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(recordsQuery);
  return snapshot.docs;
}

async function exportBooksToCsv() {
  const user = auth.currentUser;
  if (!user) {
    setStatus("ログインしてください。", "error");
    return;
  }

  exportCsvButton.disabled = true;
  try {
    const documents = await getCurrentBooks(user);
    const header = csvColumns.map(([, label]) => escapeCsvValue(label)).join(",");
    const lines = documents.map((bookDocument) => {
      const book = bookDocument.data();
      const values = [
        book.number,
        book.course,
        book.title,
        book.series,
        book.author,
        book.publisher,
        book.isbn,
        book.read ? "読んだ" : "未読",
        book.readDate,
        book.comment,
      ];
      return values.map(escapeCsvValue).join(",");
    });
    const blob = new Blob([`\uFEFF${[header, ...lines].join("\r\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `課題図書_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus(`${documents.length}件の課題図書をCSVに書き出しました。`, "success");
  } catch (error) {
    console.error(error);
    setStatus(getFirestoreErrorMessage(error, "CSVの書き出し"), "error");
  } finally {
    exportCsvButton.disabled = false;
  }
}

async function importBooksFromCsv() {
  const user = auth.currentUser;
  const file = csvFileInput?.files[0];
  if (!user) {
    setStatus("ログインしてください。", "error");
    return;
  }
  if (!file) {
    setStatus("読み込むCSVファイルを選択してください。", "error");
    return;
  }
  if (csvImportMode.value === "replace" && !window.confirm("既存の課題図書をすべて削除して上書きします。よろしいですか？")) {
    return;
  }

  importCsvButton.disabled = true;
  try {
    const rows = parseCsv(await file.text());
    if (rows.length < 2) {
      throw new Error("CSVに読み込むデータがありません。");
    }
    const headerIndex = new Map();
    rows[0].forEach((label, index) => {
      const normalizedLabel = label.replace(/^\uFEFF/, "").trim();
      const column = csvColumns.find(([, csvLabel]) => csvLabel === normalizedLabel);
      if (column) {
        headerIndex.set(column[0], index);
      }
    });
    const missingColumns = csvColumns.filter(([key]) => !headerIndex.has(key));
    if (missingColumns.length > 0) {
      throw new Error(`CSVに必要な列がありません: ${missingColumns.map(([, label]) => label).join("、")}`);
    }
    const books = rows.slice(1).map((row) => createBookFromCsvRow(row, headerIndex));
    if (csvImportMode.value === "replace") {
      const existingDocuments = await getCurrentBooks(user);
      await Promise.all(existingDocuments.map((bookDocument) => deleteDoc(bookDocument.ref)));
    }
    await Promise.all(books.map((book) => addDoc(getReadingRecordsCollection(user), book)));
    csvFileInput.value = "";
    setStatus(`${books.length}件の課題図書を${csvImportMode.value === "replace" ? "上書き" : "追加"}しました。`, "success");
  } catch (error) {
    console.error(error);
    setStatus(error.message || getFirestoreErrorMessage(error, "CSVの読み込み"), "error");
  } finally {
    importCsvButton.disabled = false;
  }
}

exportCsvButton?.addEventListener("click", () => void exportBooksToCsv());
importCsvButton?.addEventListener("click", () => void importBooksFromCsv());

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

  currentBooks = books;
  const field = sortField?.value || "createdAt";
  const direction = sortDirection?.value === "desc" ? -1 : 1;
  const sortedBooks = [...books].sort((first, second) => {
    if (field === "createdAt") {
      const firstDate = first.createdAt?.toMillis?.() || 0;
      const secondDate = second.createdAt?.toMillis?.() || 0;
      return (firstDate - secondDate) * direction;
    }

    let firstValue = first[field];
    let secondValue = second[field];
    if (field === "read") {
      firstValue = firstValue ? 1 : 0;
      secondValue = secondValue ? 1 : 0;
    } else if (field === "number") {
      firstValue = firstValue == null ? Number.POSITIVE_INFINITY : Number(firstValue);
      secondValue = secondValue == null ? Number.POSITIVE_INFINITY : Number(secondValue);
    } else {
      firstValue = String(firstValue || "").toLocaleLowerCase("ja");
      secondValue = String(secondValue || "").toLocaleLowerCase("ja");
    }

    if (firstValue < secondValue) return -1 * direction;
    if (firstValue > secondValue) return 1 * direction;
    return 0;
  });

  bookList.innerHTML = "";
  bookCount.textContent = `${sortedBooks.length}件`;

  if (sortedBooks.length === 0) {
    renderEmptyState();
    return;
  }

  sortedBooks.forEach((book) => {
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

    info.appendChild(title);
    info.appendChild(author);
    info.appendChild(details);
    info.appendChild(comment);
    info.appendChild(readDate);

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
      cancelButton.addEventListener("click", () => {
        editForm.remove();
        editButton.disabled = false;
      });

      editActions.appendChild(saveButton);
      editActions.appendChild(cancelButton);
      editForm.appendChild(editStatusField);
      editForm.appendChild(editDateField);
      editForm.appendChild(editCommentField);
      editForm.appendChild(editActions);
      info.appendChild(editForm);
      editButton.disabled = true;
    });

    const bookInfoEditButton = document.createElement("button");
    bookInfoEditButton.type = "button";
    bookInfoEditButton.className = "secondary-button";
    bookInfoEditButton.textContent = "書籍情報を編集";
    bookInfoEditButton.addEventListener("click", () => {
      const editForm = document.createElement("div");
      editForm.className = "book-edit-form";

      const fields = [
        { label: "番号", type: "number", value: book.number || "", min: "1", step: "1" },
        { label: "コース", type: "text", value: book.course || "" },
        { label: "タイトル", type: "text", value: book.title || "", required: true },
        { label: "シリーズ名", type: "text", value: book.series || "" },
        { label: "著者", type: "text", value: book.author === "著者未記入" ? "" : book.author || "" },
        { label: "出版社", type: "text", value: book.publisher || "" },
        { label: "ISBN", type: "text", value: book.isbn || "" },
      ].map((field) => {
        const label = document.createElement("label");
        label.textContent = field.label;
        const input = document.createElement("input");
        input.type = field.type;
        input.value = field.value;
        if (field.min) input.min = field.min;
        if (field.step) input.step = field.step;
        if (field.required) input.required = true;
        label.appendChild(input);
        editForm.appendChild(label);
        return input;
      });

      const editActions = document.createElement("div");
      editActions.className = "actions";
      const saveButton = document.createElement("button");
      saveButton.type = "button";
      saveButton.className = "primary-button";
      saveButton.textContent = "保存";
      saveButton.addEventListener("click", async () => {
        const [numberField, courseField, titleField, seriesField, authorField, publisherField, isbnField] = fields;
        const numberValue = numberField.value.trim();
        const number = numberValue ? Number(numberValue) : null;
        if (!titleField.value.trim()) {
          setStatus("タイトルを入力してください。", "error");
          titleField.focus();
          return;
        }
        if (numberValue && (!Number.isInteger(number) || number < 1)) {
          setStatus("番号は1以上の整数で入力してください。", "error");
          numberField.focus();
          return;
        }

        try {
          const user = auth.currentUser;
          if (!user) {
            setStatus("ログイン状態を確認してから再試行してください。", "error");
            return;
          }
          const bookRef = doc(getReadingRecordsCollection(user), book.id);
          await updateDoc(bookRef, {
            number,
            course: courseField.value.trim(),
            title: titleField.value.trim(),
            series: seriesField.value.trim(),
            author: authorField.value.trim() || "著者未記入",
            publisher: publisherField.value.trim(),
            isbn: isbnField.value.trim(),
            updatedAt: serverTimestamp(),
          });
          setStatus(`${titleField.value.trim()}を更新しました。`, "success");
        } catch (error) {
          console.error(error);
          setStatus("書籍情報の更新に失敗しました。", "error");
        }
      });

      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.className = "secondary-button";
      cancelButton.textContent = "キャンセル";
      cancelButton.addEventListener("click", () => {
        editForm.remove();
        bookInfoEditButton.disabled = false;
      });

      editActions.appendChild(saveButton);
      editActions.appendChild(cancelButton);
      editForm.appendChild(editActions);
      info.appendChild(editForm);
      bookInfoEditButton.disabled = true;
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
    actions.appendChild(bookInfoEditButton);
    actions.appendChild(deleteButton);

    item.appendChild(info);
    item.appendChild(statusChip);
    item.appendChild(actions);
    bookList.appendChild(item);
  });
}

sortField?.addEventListener("change", () => renderBooks(currentBooks));
sortDirection?.addEventListener("change", () => renderBooks(currentBooks));

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
