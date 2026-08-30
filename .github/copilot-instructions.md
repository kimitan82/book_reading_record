# Copilot instructions for book_reading_record

## Project overview
This repository is a small static web app for tracking assigned reading books. It is intentionally split into three frontend files at the project root:
- `index.html` defines the app layout and UI sections.
- `style.css` contains the visual styling and responsive layout.
- `script.js` contains the app logic, Firebase authentication, Firestore access, and UI rendering.

The app lets a user:
- save Firebase config JSON in browser storage instead of hardcoding API keys in source
- sign in with Google via Firebase Auth
- register assigned books with title and author
- toggle each book between unread/read
- delete books
- keep data in Firebase Firestore so state persists after closing the app

## Architecture and data flow
The app is a static front-end with no bundler, backend, or package manager setup.

- Authentication: Firebase Auth with Google sign-in is used instead of embedding secrets in source. The Firebase configuration is stored in `localStorage` under a key named `bookReadingFirebaseConfig`.
- Data storage: Firestore collection `readingBooks` stores one document per book. Each document includes `uid` plus fields like `title`, `author`, `read`, `createdAt`, and `updatedAt`.
- Real-time updates: `onSnapshot()` listens to the user-specific book list and re-renders the DOM whenever data changes.
- Security model: reads and writes are scoped to the signed-in user (`where("uid", "==", user.uid)`). This keeps each user's records separate.

## Commands to run
There is no `package.json`, no test suite, and no lint configuration in this repository.

Use these commands for validation and local preview:

- JavaScript syntax check:
  `node --check script.js`
- Local static preview:
  `python3 -m http.server 8000`
  Then open `http://localhost:8000/` in a browser.

There are no unit tests to run individually because none exist in the repo. For this project, the practical validation is a browser smoke check after starting the static server and confirming the page loads without JavaScript syntax errors.

## Conventions specific to this repo
- Keep the app as plain HTML/CSS/JS; do not add frameworks or a build tool unless the repo explicitly grows into one.
- Do not commit Firebase API keys or config values directly into source files.
- Keep the Firebase config in the browser, not in repo files.
- Keep the app behavior in `script.js`; avoid splitting business logic across multiple JS files because this repo is intentionally minimal.
- Store data by user ID (`uid`) in Firestore so records remain personal and do not mix with other users.
- Preserve the three-file structure (`index.html`, `style.css`, `script.js`) unless a concrete project need requires changing it.
- If updating the app UI, prefer matching the current single-page layout and minimal style system instead of introducing a new design framework.

## Working safely in this repository
- Prefer small, directly relevant edits to the existing static app.
- Verify JavaScript still parses with `node --check script.js` before considering a change complete.
- When adding Firebase-related behavior, keep the configuration flow consistent with the existing `localStorage` pattern and user-scoped Firestore queries.
- Do not add hidden environment variables or generated config files to the repo unless the project explicitly adopts them later.
