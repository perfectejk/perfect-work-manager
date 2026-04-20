import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyD27XF3RPg1Nb8HTG89ckUFVN7w3HSJUko",
  authDomain: "perfect-work-manager.firebaseapp.com",
  projectId: "perfect-work-manager",
  storageBucket: "perfect-work-manager.firebasestorage.app",
  messagingSenderId: "474404858585",
  appId: "1:474404858585:web:1177ddfd452def165decc8"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
