import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

const firebaseConfig = {
  apiKey: "AIzaSyCQCfaJLVW9zwQ0NuSROI_vBgNE4ySmCjA",
  authDomain: "record-reading-books.firebaseapp.com",
  projectId: "record-reading-books",
  storageBucket: "record-reading-books.firebasestorage.app",
  messagingSenderId: "557327399113",
  appId: "1:557327399113:web:81b1c213de5281a60f7518",
  measurementId: "G-DTJDR0P6P2"
};

const app = initializeApp(firebaseConfig);

export default app;
