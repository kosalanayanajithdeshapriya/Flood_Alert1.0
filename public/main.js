// ============================================================
//  Flood Alert App – Frontend Logic (main.js)
//  Firebase JS SDK v10 (modular) + Firestore real-time updates
//  Features: Theme, History, Charts, Forecast, Location,
//            Sound, Checklist, Report, Risk Prediction,
//            Landing Page
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
  onSnapshot,
  collection,
  addDoc,
  serverTimestamp,
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
  CRITICAL: { label: "CRITICAL – Evacuate now", cssClass: "risk-CRITICAL" },
  WARNING: { label: "WARNING – Take immediate precautions", cssClass: "risk-WARNING" },
  SAFE: { label: "SAFE – No flood risk", cssClass: "risk-SAFE" },
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
const $flowRateVal = document.getElementById("flowRateVal");
const $chartsPanel = document.getElementById("chartsPanel");
const $forecastPanel = document.getElementById("forecastPanel");
const $forecastGrid = document.getElementById("forecastGrid");
const $historyTimeline = document.getElementById("historyTimeline");
const $distanceInfo = document.getElementById("distanceInfo");


// ─── Current Sensor State (for AI context) ────────────────
let currentSensorData = { flow_rate: "N/A" };
let currentAlertData = null;


// ─── Map ──────────────────────────────────────────────────
let map;
let mapMarker;
let userMarker;
let userLocation = null;
let alertCoords = null;


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
  alertCoords = { lat, lon };
  map.setView(coords, 12);

  let markerColor = "#22c55e";
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

  // Update distance if user location is known
  if (userLocation) {
    showDistance();
  }
}


// ─── User Location Detection ──────────────────────────────
window.detectUserLocation = function () {
  if (!navigator.geolocation) {
    alert("Geolocation is not supported by your browser.");
    return;
  }

  const btn = document.getElementById("btnLocate");
  btn.textContent = "📌 Locating...";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      userLocation = {
        lat: position.coords.latitude,
        lon: position.coords.longitude
      };

      if (!map) initMap();

      const userIcon = L.divIcon({
        className: 'user-location-marker',
        html: `<div style="background-color:#3b82f6;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 0 12px rgba(59,130,246,0.8);"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      });

      if (userMarker) {
        userMarker.setLatLng([userLocation.lat, userLocation.lon]);
      } else {
        userMarker = L.marker([userLocation.lat, userLocation.lon], { icon: userIcon }).addTo(map);
      }
      userMarker.bindPopup("<b>📍 Your Location</b>");

      btn.textContent = "📌 My Location";
      showDistance();
    },
    (err) => {
      console.error("Geolocation error:", err);
      btn.textContent = "📌 My Location";
      alert("Could not get your location. Please enable location access.");
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
};


function showDistance() {
  if (!userLocation || !alertCoords) return;

  const R = 6371;
  const dLat = (alertCoords.lat - userLocation.lat) * Math.PI / 180;
  const dLon = (alertCoords.lon - userLocation.lon) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(userLocation.lat * Math.PI / 180) * Math.cos(alertCoords.lat * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = (R * c).toFixed(1);

  $distanceInfo.textContent = `📏 Distance to alert zone: ${distance} km`;
  $distanceInfo.classList.remove("hidden");
}


// ─── Alert Sound Effects ──────────────────────────────────
let lastAlertRisk = null;

function playAlertSound(riskLevel) {
  if (riskLevel !== "CRITICAL" || lastAlertRisk === "CRITICAL") return;

  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // Play 3 beeps
    for (let i = 0; i < 3; i++) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.frequency.value = 880;
      osc.type = "sine";
      gain.gain.value = 0.3;

      const startTime = audioCtx.currentTime + i * 0.4;
      osc.start(startTime);
      osc.stop(startTime + 0.2);
    }
  } catch (e) {
    console.warn("Could not play alert sound:", e);
  }
}


// ─── Sensor Data Charts ──────────────────────────────────
let flowRateChart = null;

function getChartData(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch { return []; }
}

function saveChartData(key, data) {
  const trimmed = data.slice(-20);
  localStorage.setItem(key, JSON.stringify(trimmed));
}

function initCharts() {
  if (typeof Chart === "undefined") return;

  const chartOptions = (label, color) => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, labels: { color: "#7a8ba8", font: { size: 11 } } }
    },
    scales: {
      x: { ticks: { color: "#7a8ba8", font: { size: 10 }, maxRotation: 0 }, grid: { color: "rgba(255,255,255,0.05)" } },
      y: { ticks: { color: "#7a8ba8", font: { size: 10 } }, grid: { color: "rgba(255,255,255,0.05)" } }
    }
  });

  const flowData = getChartData("sensorHistory_flowRate");

  const ctx2 = document.getElementById("flowRateChart").getContext("2d");
  flowRateChart = new Chart(ctx2, {
    type: "line",
    data: {
      labels: flowData.map(d => d.time),
      datasets: [{
        label: "Flow Rate (m³/s)",
        data: flowData.map(d => d.value),
        borderColor: "#f97316",
        backgroundColor: "rgba(249, 115, 22, 0.1)",
        tension: 0.4,
        fill: true,
        pointRadius: 3,
        pointBackgroundColor: "#f97316"
      }]
    },
    options: chartOptions("Flow Rate", "#f97316")
  });
}

function updateCharts(flowRate) {
  if (!flowRateChart) return;

  const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const fVal = parseFloat(flowRate) || 0;

  // Flow Rate
  const fData = getChartData("sensorHistory_flowRate");
  fData.push({ time: now, value: fVal });
  saveChartData("sensorHistory_flowRate", fData);
  flowRateChart.data.labels = fData.slice(-20).map(d => d.time);
  flowRateChart.data.datasets[0].data = fData.slice(-20).map(d => d.value);
  flowRateChart.update("none");
}


// ─── Weather Forecast ─────────────────────────────────────
async function fetchForecast(area) {
  try {
    const FORECAST_URL = `https://forecast-vfl42spyfq-uc.a.run.app`;
    const res = await fetch(`${FORECAST_URL}?city=${encodeURIComponent(area)}`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.forecast && data.forecast.length > 0) {
      renderForecast(data.forecast);
    }
  } catch (e) {
    console.warn("Forecast fetch failed:", e);
  }
}

function getWeatherEmoji(desc) {
  const d = desc.toLowerCase();
  if (d.includes("thunder")) return "⛈️";
  if (d.includes("rain") || d.includes("drizzle")) return "🌧️";
  if (d.includes("cloud")) return "☁️";
  if (d.includes("clear") || d.includes("sun")) return "☀️";
  if (d.includes("snow")) return "❄️";
  if (d.includes("mist") || d.includes("fog")) return "🌫️";
  return "🌤️";
}

function renderForecast(forecast) {
  $forecastPanel.classList.remove("hidden");
  $forecastGrid.innerHTML = forecast.slice(0, 5).map(f => `
    <div class="forecast-card">
      <div class="forecast-day">${f.day}</div>
      <div class="forecast-icon">${getWeatherEmoji(f.description)}</div>
      <div class="forecast-temp">${f.temp}°C</div>
      <div class="forecast-desc">${f.description}</div>
      <div class="forecast-humidity">💧 ${f.humidity}%</div>
    </div>
  `).join("");
}


// ─── Alert History ────────────────────────────────────────
function getAlertHistory() {
  try {
    return JSON.parse(localStorage.getItem("alertHistory")) || [];
  } catch { return []; }
}

function saveAlertHistory(history) {
  localStorage.setItem("alertHistory", JSON.stringify(history.slice(-50)));
}

function addToHistory(alert) {
  const history = getAlertHistory();
  const last = history[history.length - 1];
  // Avoid duplicates
  if (last && last.timestamp === alert.timestamp && last.area === alert.area) return;

  history.push({
    risk_level: (alert.risk_level || "SAFE").toUpperCase(),
    area: alert.area || "Unknown",
    message: alert.message || "",
    timestamp: alert.timestamp || new Date().toISOString()
  });
  saveAlertHistory(history);
  renderHistory();
}

function renderHistory() {
  const history = getAlertHistory();
  if (history.length === 0) {
    $historyTimeline.innerHTML = '<p class="history-empty">No past alerts recorded yet.</p>';
    return;
  }

  $historyTimeline.innerHTML = history.slice().reverse().map(h => {
    const d = new Date(h.timestamp);
    const timeStr = isNaN(d) ? h.timestamp : d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
    return `
      <div class="history-item">
        <div class="history-dot risk-${h.risk_level}"></div>
        <div class="history-info">
          <div class="history-area">${h.risk_level} – ${h.area}</div>
          <div class="history-message">${h.message}</div>
        </div>
        <div class="history-time">${timeStr}</div>
      </div>
    `;
  }).join("");
}

window.clearAlertHistory = function () {
  if (confirm("Clear all alert history?")) {
    localStorage.removeItem("alertHistory");
    renderHistory();
  }
};


// ─── Safety Checklist ─────────────────────────────────────
function loadChecklist() {
  try {
    const saved = JSON.parse(localStorage.getItem("safetyChecklist")) || {};
    document.querySelectorAll("#safetyChecklist input[type='checkbox']").forEach(cb => {
      cb.checked = !!saved[cb.dataset.item];
    });
    updateChecklistProgress();
  } catch { }
}

window.updateChecklist = function () {
  const state = {};
  document.querySelectorAll("#safetyChecklist input[type='checkbox']").forEach(cb => {
    state[cb.dataset.item] = cb.checked;
  });
  localStorage.setItem("safetyChecklist", JSON.stringify(state));
  updateChecklistProgress();
};

function updateChecklistProgress() {
  const cbs = document.querySelectorAll("#safetyChecklist input[type='checkbox']");
  const total = cbs.length;
  const checked = Array.from(cbs).filter(cb => cb.checked).length;
  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;

  document.getElementById("checklistProgress").style.width = pct + "%";
  document.getElementById("checklistProgressText").textContent = pct + "%";
}


// ─── Report Flooding ──────────────────────────────────────
window.openReportModal = function () {
  document.getElementById("reportModal").classList.remove("hidden");
};

window.closeReportModal = function () {
  document.getElementById("reportModal").classList.add("hidden");
  document.getElementById("reportForm").reset();
  document.getElementById("reportStatus").textContent = "";
};

window.submitReport = async function (e) {
  e.preventDefault();
  const btn = document.getElementById("btnSubmitReport");
  const status = document.getElementById("reportStatus");

  btn.disabled = true;
  btn.textContent = "Submitting...";
  status.textContent = "";

  try {
    await addDoc(collection(db, "reports"), {
      area: document.getElementById("reportArea").value.trim(),
      severity: document.getElementById("reportSeverity").value,
      description: document.getElementById("reportDescription").value.trim(),
      createdAt: serverTimestamp(),
      userAgent: navigator.userAgent
    });

    status.textContent = "✅ Report submitted successfully! Thank you.";
    status.style.color = "#22c55e";
    setTimeout(() => closeReportModal(), 2000);
  } catch (err) {
    console.error("Report submission error:", err);
    status.textContent = "❌ Failed to submit report. Please try again.";
    status.style.color = "#ef4444";
  } finally {
    btn.disabled = false;
    btn.textContent = "Submit Report";
  }
};


// ─── Dark/Light Mode Toggle ──────────────────────────────
function loadTheme() {
  const saved = localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  document.getElementById("themeIcon").textContent = saved === "dark" ? "🌙" : "☀️";
}

window.toggleTheme = function () {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
  document.getElementById("themeIcon").textContent = next === "dark" ? "🌙" : "☀️";
};


// ─── Shared Render Helper ─────────────────────────────────
function populateAlertPanel(alert, risk, meta) {
  const $ap = document.getElementById("alertPanel");
  if (!$ap) return;
  $ap.className = "alert-panel " + meta.cssClass;
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

  $ap.style.animation = "none";
  requestAnimationFrame(() => { $ap.style.animation = ""; });

  const fr = alert.flow_rate || alert.sensor_data?.flow_rate || "N/A";
  $flowRateVal.textContent = fr;

  // Update sensor state for AI
  currentSensorData = { flow_rate: fr };
  currentAlertData = alert;

  // Update charts
  updateCharts(fr);
  $chartsPanel.classList.remove("hidden");

  initMap();
  setTimeout(() => map.invalidateSize(), 100);
  if (alert.area && alert.area !== "Unknown area") {
    geocodeLocation(alert.area).then(coords => {
      if (coords) updateMap(coords.lat, coords.lon, risk, alert.area);
    });
    // Fetch forecast for the area
    fetchForecast(alert.area);
  }
}


// ─── Render Alert ─────────────────────────────────────────
function renderAlert(alert) {
  if (!alert) return;

  const risk = (alert.risk_level || "SAFE").toUpperCase();
  const meta = RISK_META[risk] || RISK_META.SAFE;

  // Play sound for CRITICAL
  playAlertSound(risk);
  lastAlertRisk = risk;

  // Show alert panel for ALL risk levels
  $emptyState.classList.add("hidden");
  $alertPanel.classList.remove("hidden");
  $dashboardPanel.classList.remove("hidden");

  populateAlertPanel(alert, risk, meta);

  // Add to history
  addToHistory(alert);
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
  if (!$statusDot) return;
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
  if (!$notifyNote) return;
  $notifyNote.textContent = msg;
  $notifyNote.className = "notify-note " + (type || "");
}


function resetBtn() {
  if (!$btnNotify) return;
  $btnNotify.disabled = false;
  $btnNotify.innerHTML = '<span class="btn-icon">🔔</span> Enable Notifications';
}


// ─── AI Chatbot Logic ─────────────────────────────────────
const $chatFab = document.getElementById("chatFab");
const $chatWindow = document.getElementById("chatWindow");
const $chatMessages = document.getElementById("chatMessages");
const $chatInput = document.getElementById("chatInput");

let chatHistory = [];

window.toggleChat = function () {
  if (!$chatWindow) return;
  $chatWindow.classList.toggle("hidden");
  if (!$chatWindow.classList.contains("hidden")) {
    if ($chatInput) $chatInput.focus();
  }
};

window.sendMessage = async function () {
  if (!$chatInput) return;
  const text = $chatInput.value.trim();
  if (!text) return;

  addMessage("user", text);
  $chatInput.value = "";

  // Inject current sensor data context for risk prediction
  let contextText = text;
  const lowerText = text.toLowerCase();
  if (lowerText.includes("risk") || lowerText.includes("predict") || lowerText.includes("sensor") || lowerText.includes("status")) {
    contextText += `\n[Current Sensor Data - Flow Rate: ${currentSensorData.flow_rate}]`;
    if (currentAlertData) {
      contextText += `\n[Current Alert - Risk: ${currentAlertData.risk_level}, Area: ${currentAlertData.area}, Message: ${currentAlertData.message}]`;
    }
  }

  chatHistory.push({ role: "user", content: contextText });

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
  if (!$chatMessages) return;
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


// ─── Transition Logic ────────────────────────────────────
window.launchDashboard = function() {
  const $lp = document.getElementById("landingPage");
  const $dv = document.getElementById("dashboardView");
  
  if ($lp) $lp.classList.add("fade-out");
  if ($dv) {
    $dv.classList.remove("hidden");
    setTimeout(() => $dv.classList.add("visible"), 50);
  }
  
  setTimeout(() => {
    if ($lp) $lp.classList.add("hidden");
    // Re-trigger map size refresh
    if (typeof map !== 'undefined' && map) {
      setTimeout(() => map.invalidateSize(), 150);
    }
  }, 800);
};

// ─── Boot ─────────────────────────────────────────────────
function bootApp() {
  loadTheme();
  loadChecklist();
  renderHistory();
  initCharts();
  connectFirestoreAlerts();
}

bootApp();