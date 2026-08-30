import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
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
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCQCfaJLVW9zwQ0NuSROI_vBgNE4ySmCjA",
  authDomain: "record-reading-books.firebaseapp.com",
  projectId: "record-reading-books",
  storageBucket: "record-reading-books.firebasestorage.app",
  messagingSenderId: "557327399113",
  appId: "1:557327399113:web:81b1c213de5281a60f7518",
  measurementId: "G-DTJDR0P6P2"
};

const form = document.getElementById("book-form");
const titleInput = document.getElementById("book-title");
const authorInput = document.getElementById("book-author");
const bookList = document.getElementById("book-list");
const statusMessage = document.getElementById("status-message");
const bookCount = document.getElementById("book-count");

const hasFirebaseConfig = Object.values(firebaseConfig).every((value) => value && !value.includes("YOUR_"));

function setStatus(message, type = "") {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`.trim();
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

let db;

if (!hasFirebaseConfig) {
  setStatus("Firebaseの設定を script.js に入力してください。", "error");
} else {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);

  const booksCollection = collection(db, "readingBooks");
  const booksQuery = query(booksCollection, orderBy("createdAt", "desc"));

  onSnapshot(
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

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const title = titleInput.value.trim();
    const author = authorInput.value.trim();

    if (!title) {
      setStatus("タイトルを入力してください。", "error");
      titleInput.focus();
      return;
    }

    try {
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
}
