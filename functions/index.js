// ============================================================
//  Firebase Cloud Functions - Flood Alert App Backend
// ============================================================

const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });

// Initialize Firebase Admin SDK (auto-uses the environment credentials in Cloud Functions)
admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();

/**
 * HTTP POST /registerDevice
 * Receives FCM token from the Vercel frontend and saves it to Firestore.
 * Body: { token: "FCM_TOKEN_STRING" }
 */
exports.registerDevice = onRequest({ cors: true }, async (req, res) => {
  // CORS wrapper handles preflight requests automatically when using { cors: true }
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const { token } = req.body;
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Invalid or missing token." });
  }

  try {
    // Save token to Firestore /tokens collection
    // Using the token itself as the document ID ensures no duplicates
    await db.collection("tokens").doc(token).set({
      registeredAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`📲 New device registered in Firestore.`);
    res.json({ success: true, message: "Device registered for notifications." });
  } catch (error) {
    console.error("Error saving token:", error);
    res.status(500).json({ error: "Failed to register device." });
  }
});

/**
 * HTTP POST /receiveAlert
 * Called by the n8n HTTP Request node.
 * Validates the payload, writes it to Firestore to trigger frontend realtime listeners,
 * and sends out an FCM push notification to all stored tokens.
 */
exports.receiveAlert = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const { alert_type, risk_level, message, instructions, timestamp, area } = req.body;

  if (!risk_level || !message) {
    return res.status(400).json({ error: "Missing required fields: risk_level and message." });
  }

  // 1. Build alert object
  const latestAlert = {
    alert_type: alert_type || "Flood Alert",
    risk_level: (risk_level || "LOW").toUpperCase(),
    message: message || "No details available.",
    instructions: instructions || "Stay calm and follow local authority guidance.",
    timestamp: timestamp || new Date().toISOString(),
    area: area || "Unknown area",
    receivedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  console.log(`🚨 Alert received: [${latestAlert.risk_level}] ${latestAlert.area}`);

  try {
    // 2. Save alert to Firestore to trigger real-time updates on Vercel clients
    await db.collection("alerts").doc("latest").set(latestAlert);

    // 3. Fetch all registered tokens from Firestore
    const tokensSnapshot = await db.collection("tokens").get();
    const tokens = [];
    tokensSnapshot.forEach((doc) => tokens.push(doc.id));

    if (tokens.length === 0) {
      console.log("ℹ️ No registered devices in Firestore. Skipping FCM push.");
      return res.json({ success: true, alert: latestAlert, pushSent: false });
    }

    // 4. Send FCM multicast message
    const riskLabels = {
      CRITICAL: "CRITICAL – Evacuate now",
      HIGH: "HIGH – Take immediate precautions",
      MEDIUM: "MEDIUM – Stay prepared",
      LOW: "LOW – Watch situation",
    };

    const notificationTitle = `🌊 Flood Alert – ${latestAlert.area}`;
    const notificationBody = `${riskLabels[latestAlert.risk_level] || latestAlert.risk_level}: ${latestAlert.message}`;

    const multicastMessage = {
      tokens: tokens,
      notification: {
        title: notificationTitle,
        body: notificationBody,
      },
      data: {
        risk_level: latestAlert.risk_level,
        area: latestAlert.area,
        message: latestAlert.message,
        timestamp: latestAlert.timestamp,
      },
      webpush: {
        notification: {
          icon: "/icon.png",
          badge: "/icon.png",
          requireInteraction: latestAlert.risk_level === "CRITICAL",
        },
      },
    };

    const response = await messaging.sendEachForMulticast(multicastMessage);
    console.log(`📨 FCM sent: ${response.successCount} success, ${response.failureCount} failed.`);

    // 5. Cleanup failed tokens from Firestore
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
          if (
            errorCode === "messaging/registration-token-not-registered" ||
            errorCode === "messaging/invalid-registration-token"
          ) {
            failedTokens.push(tokens[idx]);
          }
        }
      });
      
      if (failedTokens.length > 0) {
        const batch = db.batch();
        failedTokens.forEach(token => {
          batch.delete(db.collection("tokens").doc(token));
        });
        await batch.commit();
        console.log(`🧹 Cleaned up ${failedTokens.length} stale tokens from Firestore.`);
      }
    }

    res.json({ success: true, alert: latestAlert, pushSent: true });
  } catch (error) {
    console.error("Error processing alert:", error);
    res.status(500).json({ error: "Failed to process alert." });
  }
});
