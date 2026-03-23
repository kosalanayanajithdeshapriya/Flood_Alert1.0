// ============================================================
//  Flood Alert App – Frontend Logic (main.js)
//  Firebase JS SDK v10 (modular) + Firestore real-time updates
// ============================================================


import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getMessaging,
  getToken,
  onMessage,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js";
import {
  getFirestore,
  doc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


const firebaseConfig = {
  apiKey: "AIzaSyBt9GtXJn1s3fn9s3JHj4YuQq5cjVBHzDY",
  authDomain: "floodalertweb.firebaseapp.com",
  projectId: "floodalertweb",
  storageBucket: "floodalertweb.firebasestorage.app",
  messagingSenderId: "424330044822",
  appId: "1:424330044822:web:3b5131b1e1a97901afa9b7",
  measurementId: "G-MVGEWY7LJN"
};


const VAPID_KEY = "BBJoYYyTSPOb3e2MedXuF99VlmpqHplyYMNWhNE_n6koLOGDjBoEvFR9U2M3LQM3PheI-P__mZRxgnW-LZmGGMs";
const BACKEND_URL = "https://registerdevice-vfl42spyfq-uc.a.run.app";


// ─── Risk Level Metadata ──────────────────────────────────
const RISK_META = {
  CRITICAL: {
    label: "CRITICAL – Evacuate now",
    cssClass: "risk-CRITICAL",
  },
  WARNING: {
    label: "WARNING – Take immediate precautions",
    cssClass: "risk-WARNING",
  },
  SAFE: {
    label: "SAFE – No flood risk",
    cssClass: "risk-SAFE",
  },
};


// ─── Firebase Init ────────────────────────────────────────
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let messaging;


try {
  messaging = getMessaging(app);
} catch (e) {
  console.warn("Firebase Messaging not available:", e.message);
}


// ─── DOM Elements ─────────────────────────────────────────
const $alertPanel = document.getElementById("alertPanel");
const $emptyState = document.getElementById("emptyState");
const $alertHeader = document.getElementById("alertHeader");
const $riskBadge = document.getElementById("riskBadge");
const $alertArea = document.getElementById("alertArea");
const $alertMessage = document.getElementById("alertMessage");
const $alertInstructions = document.getElementById("alertInstructions");
const $alertTimestamp = document.getElementById("alertTimestamp");
const $btnNotify = document.getElementById("btnNotify");
const $notifyNote = document.getElementById("notifyNote");
const $statusDot = document.getElementById("statusDot");
const $statusLabel = document.getElementById("statusLabel");
const $dashboardPanel = document.getElementById("dashboardPanel");
const $waterLevelVal = document.getElementById("waterLevelVal");
const $flowRateVal = document.getElementById("flowRateVal");


// ─── Map ──────────────────────────────────────────────────
let map;
let mapMarker;


function initMap() {
  if (map) return;
  map = L.map('map').setView([7.8731, 80.7718], 7);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map);
}


async function geocodeLocation(areaName) {
  try {
    const query = encodeURIComponent(`${areaName}, Sri Lanka`);
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`);
    const data = await res.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    }
  } catch (e) {
    console.error("Geocoding failed:", e);
  }
  return null;
}


function updateMap(lat, lon, riskLevel, areaName) {
  if (!map) initMap();
  const coords = [lat, lon];
  map.setView(coords, 12);


  let markerColor = "#22c55e"; // SAFE = green
  if (riskLevel === "CRITICAL") markerColor = "#ef4444";
  else if (riskLevel === "WARNING") markerColor = "#f97316";


  const customIcon = L.divIcon({
    className: 'custom-map-marker',
    html: `<div style="background-color:${markerColor};width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 0 10px ${markerColor};"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });


  if (mapMarker) {
    mapMarker.setLatLng(coords);
    mapMarker.setIcon(customIcon);
  } else {
    mapMarker = L.marker(coords, { icon: customIcon }).addTo(map);
  }


  mapMarker.bindPopup(`<b>${areaName}</b><br>Risk: ${riskLevel}`).openPopup();
  setTimeout(() => map.invalidateSize(), 300);
}


// ─── Shared Render Helper ─────────────────────────────────
function populateAlertPanel(alert, risk, meta) {
  $alertPanel.className = "alert-panel " + meta.cssClass;
  $riskBadge.textContent = meta.label;
  $alertArea.textContent = alert.area || "Unknown area";
  $alertMessage.textContent = alert.message || "No further details available.";
  $alertInstructions.textContent = alert.instructions || "Follow guidance from local authorities.";


  if (alert.timestamp) {
    const date = new Date(alert.timestamp);
    $alertTimestamp.textContent = isNaN(date)
      ? alert.timestamp
      : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } else {
    $alertTimestamp.textContent = "";
  }


  $alertPanel.style.animation = "none";
  requestAnimationFrame(() => { $alertPanel.style.animation = ""; });


  $waterLevelVal.textContent = alert.water_level || alert.sensor_data?.water_level || "N/A";
  $flowRateVal.textContent = alert.flow_rate || alert.sensor_data?.flow_rate || "N/A";


  initMap();
  setTimeout(() => map.invalidateSize(), 100);
  if (alert.area && alert.area !== "Unknown area") {
    geocodeLocation(alert.area).then(coords => {
      if (coords) updateMap(coords.lat, coords.lon, risk, alert.area);
    });
  }
}


// ─── Render Alert ─────────────────────────────────────────
function renderAlert(alert) {
  if (!alert) return;


  const risk = (alert.risk_level || "SAFE").toUpperCase();
  const meta = RISK_META[risk] || RISK_META.SAFE;


  // ALL risk levels now show the alert panel
  $emptyState.classList.add("hidden");
  $alertPanel.classList.remove("hidden");
  $dashboardPanel.classList.remove("hidden");


  populateAlertPanel(alert, risk, meta);
}


// ─── Firestore Listener ───────────────────────────────────
function connectFirestoreAlerts() {
  setStatus("connected", "Connecting...");
  const alertDocRef = doc(db, "alerts", "latest");


  onSnapshot(
    alertDocRef,
    (docSnap) => {
      if (docSnap.exists()) {
        setStatus("connected", "Live");
        renderAlert(docSnap.data());
      } else {
        setStatus("connected", "No alerts");
        $alertPanel.classList.add("hidden");
        $dashboardPanel.classList.add("hidden");
        $emptyState.classList.remove("hidden");
      }
    },
    (err) => {
      console.warn("Firestore snapshot error:", err);
      setStatus("error", "Reconnecting…");
    }
  );
}


function setStatus(state, label) {
  $statusDot.className = "status-dot " + state;
  $statusLabel.textContent = label;
}


// ─── FCM Foreground Messages ──────────────────────────────
if (messaging) {
  onMessage(messaging, (payload) => {
    console.log("📩 FCM foreground message:", payload);
    if (payload.data) {
      renderAlert({
        risk_level: payload.data.risk_level,
        area: payload.data.area,
        message: payload.data.message,
        instructions: payload.data.instructions,
        timestamp: payload.data.timestamp,
        water_level: payload.data.water_level,
        flow_rate: payload.data.flow_rate,
      });
    }
  });
}


// ─── Notification Permission ──────────────────────────────
window.requestNotificationPermission = async function () {
  if (!messaging) {
    showNotifyNote("⚠️ Push notifications are not supported in this browser.", "error");
    return;
  }


  $btnNotify.disabled = true;
  $btnNotify.textContent = "Requesting permission…";


  try {
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    console.log("✅ Service worker registered:", registration.scope);


    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      showNotifyNote("❌ Notification permission denied. Please allow it in your browser settings.", "error");
      resetBtn();
      return;
    }


    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });


    if (!token) {
      showNotifyNote("⚠️ Could not retrieve notification token.", "error");
      resetBtn();
      return;
    }


    console.log("📲 FCM Token:", token);


    const res = await fetch(`${BACKEND_URL}/registerDevice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });


    if (!res.ok) throw new Error("Backend registration failed");


    showNotifyNote("✅ Notifications enabled! You're all set.", "success");
    $btnNotify.textContent = "✔ Notifications Enabled";
    $btnNotify.disabled = true;
  } catch (err) {
    console.error("Notification setup error:", err);
    showNotifyNote(`❌ Error: ${err.message}`, "error");
    resetBtn();
  }
};


function showNotifyNote(msg, type) {
  $notifyNote.textContent = msg;
  $notifyNote.className = "notify-note " + (type || "");
}


function resetBtn() {
  $btnNotify.disabled = false;
  $btnNotify.innerHTML = '<span class="btn-icon">🔔</span> Enable Notifications';
}


// ─── AI Chatbot Logic ─────────────────────────────────────
const $chatFab = document.getElementById("chatFab");
const $chatWindow = document.getElementById("chatWindow");
const $chatMessages = document.getElementById("chatMessages");
const $chatInput = document.getElementById("chatInput");


let chatHistory = [
  { role: "assistant", content: "Hi there! I'm your AI weather assistant. Need help with the latest weather developments or flood risks? Just ask!" }
];


window.toggleChat = function () {
  if (!$chatWindow) return;
  $chatWindow.classList.toggle("hidden");
  if (!$chatWindow.classList.contains("hidden")) {
    $chatInput.focus();
  }
};


window.sendMessage = async function () {
  const text = $chatInput.value.trim();
  if (!text || !$chatInput) return;


  addMessage("user", text);
  $chatInput.value = "";
  chatHistory.push({ role: "user", content: text });


  const $loadingMsg = addMessage("assistant loading", "AI is thinking...");


  try {
    const CHAT_API_URL = "https://chat-vfl42spyfq-uc.a.run.app";
    const response = await fetch(CHAT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: chatHistory })
    });
    if (!response.ok) throw new Error("Chat API failed");
    const data = await response.json();
    $loadingMsg.remove();
    addMessage("assistant", data.response);
    chatHistory.push({ role: "assistant", content: data.response });
  } catch (error) {
    console.error("Chat error:", error);
    if ($loadingMsg) {
      $loadingMsg.textContent = "Sorry, I'm having trouble connecting to my brain. Please check your internet or try again later.";
      $loadingMsg.classList.remove("loading");
    }
  }
};


function addMessage(role, text) {
  const $msg = document.createElement("div");
  $msg.className = `message ${role}`;
  $msg.textContent = text;
  $chatMessages.appendChild($msg);
  $chatMessages.scrollTop = $chatMessages.scrollHeight;
  return $msg;
}


if ($chatInput) {
  $chatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") window.sendMessage();
  });
}


// ─── Boot ─────────────────────────────────────────────────
connectFirestoreAlerts();