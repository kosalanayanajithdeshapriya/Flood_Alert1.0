// ============================================================
//  firebase-messaging-sw.js
//  Service Worker for Firebase Background Push Notifications
//
//  ⚠️  IMPORTANT: This file MUST live at /public/firebase-messaging-sw.js
//                 (i.e., served from the root of your domain).
// ============================================================

// ─────────────────────────────────────────────────────────────
// ✏️  Paste your firebaseConfig here (same values as main.js).
//   Service workers cannot use ES modules, so we use importScripts.
// ─────────────────────────────────────────────────────────────
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBt9GtXJn1s3fn9s3JHj4YuQq5cjVBHzDY",
  authDomain: "floodalertweb.firebaseapp.com",
  projectId: "floodalertweb",
  storageBucket: "floodalertweb.firebasestorage.app",
  messagingSenderId: "424330044822",
  appId: "1:424330044822:web:3b5131b1e1a97901afa9b7",
  measurementId: "G-MVGEWY7LJN"
});

const messaging = firebase.messaging();

// ─── Background message handler ──────────────────────────────
// This fires when a push message arrives and the browser tab is
// NOT focused (minimized, in background, or closed).
messaging.onBackgroundMessage((payload) => {
  console.log("[SW] Background message received:", payload);

  const riskLabels = {
    CRITICAL: "🔴 CRITICAL – Evacuate now",
    HIGH:     "🟠 HIGH – Take immediate precautions",
    MEDIUM:   "🟡 MEDIUM – Stay prepared",
    LOW:      "🟢 LOW – Watch situation",
  };

  const data        = payload.data || {};
  const risk        = (data.risk_level || "LOW").toUpperCase();
  const riskLabel   = riskLabels[risk] || risk;
  const area        = data.area || "Unknown area";
  const message     = data.message || payload.notification?.body || "Flood alert issued.";

  const notificationTitle =
    payload.notification?.title || `🌊 Flood Alert – ${area}`;

  const notificationOptions = {
    body: `${riskLabel}\n${message}`,
    icon:  "/icon.png",   // ✏️ Replace with your app icon path
    badge: "/icon.png",   // ✏️ Replace with your badge icon path
    tag:   "flood-alert", // Replaces any previous alert notification
    requireInteraction: risk === "CRITICAL", // CRITICAL alerts stay until dismissed
    data: {
      url: self.registration.scope, // Click opens the app
    },
    actions: [
      { action: "open", title: "Open App" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// ─── Handle notification click ───────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const urlToOpen = event.notification.data?.url || "/";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing tab if open
        for (const client of clientList) {
          if (client.url === urlToOpen && "focus" in client) {
            return client.focus();
          }
        }
        // Otherwise open a new tab
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});
