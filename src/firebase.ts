import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// TODO: Replace with your Firebase project configuration
// You can find this in your Firebase Console: Project Settings > General > Your apps
const firebaseConfig = {
  apiKey: "AIzaSyBKwC1xR4mApDsC118ogXjAS53EdgwC_28",
  authDomain: "ingles-srs.firebaseapp.com",
  projectId: "ingles-srs",
  storageBucket: "ingles-srs.firebasestorage.app",
  messagingSenderId: "183917829949",
  appId: "1:183917829949:web:98def0789f0d2b02532f54"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
