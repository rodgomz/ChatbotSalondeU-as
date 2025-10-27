const { initializeApp } = require("firebase/app");
const { getDatabase } = require("firebase/database");

// ⚠️ Configura con tus credenciales de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBZxtwpOWWTKndunPiipqaxGp9lRfkmV8I",
  authDomain: "jaznails-a1d11.firebaseapp.com",
   databaseURL: "https://jaznails-a1d11-default-rtdb.firebaseio.com/",
  projectId: "jaznails-a1d11",
  storageBucket: "jaznails-a1d11.firebasestorage.app",
  messagingSenderId: "982237408746",
  appId: "1:982237408746:web:6de954a3aa350d7b8d9693",
  measurementId: "G-WZE5K2YBBC"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

module.exports = db;
