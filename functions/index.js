// ============================================================
//  Firebase Cloud Functions - Flood Alert App Backend
// ============================================================

const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();

/**
 * HTTP POST /registerDevice
 */
exports.registerDevice = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const { token } = req.body;
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Invalid or missing token." });
  }

  try {
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

// ─── Constants & API Keys ──────────────────────────────────
const WEATHER_API_KEY = "bc2641ed7eb2c4764c409d838400382b";
// DO NOT PASTE THIS KEY IN THE AI CHAT — GOOGLE WILL REVOKE IT IF IT SEES IT!
// Keep it only in this file locally or use .env file.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyA7_STGmzYBl_xCAfjT12qiANyLizQpQeg";

/**
 * Helper: Fetch real-time weather from OpenWeatherMap
 */
async function get_weather_data(city) {
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${WEATHER_API_KEY}&units=metric`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Weather API error");
    const data = await res.json();
    return {
      location: data.name,
      temperature: `${data.main.temp}°C`,
      condition: data.weather[0].description,
      humidity: `${data.main.humidity}%`,
      wind: `${data.wind.speed} m/s`,
      timestamp: new Date().toLocaleTimeString()
    };
  } catch (error) {
    console.error("fetch_weather error:", error);
    return { error: "Could not fetch weather data for that location." };
  }
}

/**
 * HTTP POST /chat
 */
exports.chat = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Invalid request: 'messages' should be an array." });
  }

  try {
    if (GEMINI_API_KEY === "YOUR_GEMINI_API_KEY" || GEMINI_API_KEY === "PLACE_YOUR_NEW_API_KEY_HERE" || !GEMINI_API_KEY) {
      return res.json({
        response: "The AI Chatbot is almost ready! Please set your GEMINI_API_KEY in the backend (functions/index.js) or as an environment variable to start chatting."
      });
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: "You are a helpful assistant for the Flood Alert App. You provide real-time weather news and details. Be concise, professional, and empathetic, especially when discussing flood risks."
    });

    const lastMessage = messages[messages.length - 1].content.toLowerCase();
    let contextAddition = "";

    if (lastMessage.includes("weather") || lastMessage.includes("temperature") || lastMessage.includes("condition")) {
      const cityMatch = lastMessage.match(/(?:in|for|at)\s+([a-zA-Z\s,]+)/i);
      const city = cityMatch ? cityMatch[1].trim() : "Negombo";
      const weather = await get_weather_data(city);
      if (!weather.error) {
        contextAddition = `\n[Real-time Weather for ${weather.location}: ${weather.condition}, ${weather.temperature}, Humidity ${weather.humidity}, Wind ${weather.wind}]`;
      } else {
        contextAddition = `\n[Note: I tried to fetch weather data but couldn't find details for "${city}".]`;
      }
    }

    const chat = model.startChat({
      history: messages.slice(0, -1).map(m => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }]
      })),
      generationConfig: { maxOutputTokens: 500 }
    });

    const result = await chat.sendMessage(messages[messages.length - 1].content + contextAddition);
    const response = await result.response;
    res.json({ response: response.text() });
  } catch (error) {
    console.error("Chatbot Error:", error);
    res.status(500).json({ error: "Sorry, I'm having trouble thinking right now. Please try again later." });
  }
});

/**
 * HTTP POST /receiveAlert
 */
exports.receiveAlert = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const { alert_type, risk_level, message, instructions, timestamp, area, sensor_data } = req.body;

  if (!risk_level || !message) {
    return res.status(400).json({ error: "Missing required fields: risk_level and message." });
  }

  // 1. Build alert object
  const latestAlert = {
    alert_type: alert_type || "Flood Alert",
    risk_level: (risk_level || "SAFE").toUpperCase(),
    message: message || "No details available.",
    instructions: instructions || "Stay calm and follow local authority guidance.",
    timestamp: timestamp || new Date().toISOString(),
    area: area || "Unknown area",
    sensor_data: sensor_data || null,
    receivedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  console.log(`🚨 Alert received: [${latestAlert.risk_level}] ${latestAlert.area}`);

  try {
    // 2. Save to Firestore
    await db.collection("alerts").doc("latest").set(latestAlert);

    // 3. Fetch all registered tokens
    const tokensSnapshot = await db.collection("tokens").get();
    const allTokens = [];
    tokensSnapshot.forEach((doc) => allTokens.push(doc.id));

    if (allTokens.length === 0) {
      console.log("ℹ️ No registered devices. Skipping FCM push.");
      return res.json({ success: true, alert: latestAlert, pushSent: false });
    }

    // FCM multicast limit is 500 tokens per call
    const CHUNK_SIZE = 500;
    const tokenChunks = [];
    for (let i = 0; i < allTokens.length; i += CHUNK_SIZE) {
      tokenChunks.push(allTokens.slice(i, i + CHUNK_SIZE));
    }

    const riskLabels = {
      CRITICAL: "CRITICAL – Evacuate now",
      WARNING: "WARNING – Take immediate precautions",
      SAFE: "SAFE – No flood risk",
    };

    const notificationTitle = `🌊 Flood Alert – ${latestAlert.area}`;
    const notificationBody = `${riskLabels[latestAlert.risk_level] || latestAlert.risk_level}: ${latestAlert.message}`;

    console.log(`📨 Sending notification to ${allTokens.length} devices in ${tokenChunks.length} chunks.`);

    let totalSuccessCount = 0;
    let totalFailureCount = 0;
    const allFailedTokens = [];

    // Send in chunks
    for (const [chunkIdx, tokens] of tokenChunks.entries()) {
      const multicastMessage = {
        tokens: tokens,
        notification: {
          title: notificationTitle,
          body: notificationBody,
        },
        data: {
          risk_level: String(latestAlert.risk_level ?? ""),
          area: String(latestAlert.area ?? ""),
          message: String(latestAlert.message ?? ""),
          instructions: String(latestAlert.instructions ?? ""),
          timestamp: String(latestAlert.timestamp ?? ""),
          water_level: String(latestAlert.sensor_data?.water_level ?? ""),
          flow_rate: String(latestAlert.sensor_data?.flow_rate ?? ""),
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
      totalSuccessCount += response.successCount;
      totalFailureCount += response.failureCount;

      if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errorCode = resp.error?.code;
            if (
              errorCode === "messaging/registration-token-not-registered" ||
              errorCode === "messaging/invalid-registration-token"
            ) {
              allFailedTokens.push(tokens[idx]);
            }
          }
        });
      }
    }

    console.log(`📨 FCM Summary: ${totalSuccessCount} success, ${totalFailureCount} failed.`);

    // 5. Cleanup failed tokens
    if (allFailedTokens.length > 0) {
      const batch = db.batch();
      allFailedTokens.forEach(token => {
        batch.delete(db.collection("tokens").doc(token));
      });
      await batch.commit();
      console.log(`🧹 Cleaned up ${allFailedTokens.length} stale tokens.`);
    }

    res.json({
      success: true,
      alert: latestAlert,
      pushSent: true,
      stats: { success: totalSuccessCount, failure: totalFailureCount }
    });
  } catch (error) {
    console.error("Error processing alert:", error);
    res.status(500).json({ error: "Failed to process alert." });
  }
});