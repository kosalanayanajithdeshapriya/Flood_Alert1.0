// ============================================================
//  Firebase Cloud Functions - Flood Alert App Backend
// ============================================================

const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();

/**
 * HTTP POST /registerDevice
 * Receives FCM token from the Vercel frontend and saves it to Firestore.
 * Body: { token: "FCM_TOKEN_STRING" }
 */
exports.registerDevice = onRequest({ cors: true }, (req, res) => {
  return cors(req, res, async () => {
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
});

// ─── Constants & API Keys ──────────────────────────────────
// ⚠️ WARNING: In production, use Firebase Secrets or environment variables!
const WEATHER_API_KEY = "bc2641ed7eb2c4764c409d838400382b";
const GEMINI_API_KEY = "AIzaSyCnzKu7lqGgTMsjeKO_Eudn-GbKkH5HKfw";

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
 * AI Chatbot powered by Gemini Flash 2.0.
 * Supports weather queries via function calling (manual implementation for simplicity).
 */
exports.chat = onRequest({ cors: true }, (req, res) => {
  return cors(req, res, async () => {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Invalid request: 'messages' should be an array." });
    }

    try {
      if (GEMINI_API_KEY === "YOUR_GEMINI_API_KEY") {
        return res.json({ 
          response: "The AI Chatbot is almost ready! Please set your GEMINI_API_KEY in the backend to start chatting. You can get one for free at https://aistudio.google.com/" 
        });
      }

      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.0-flash",
        systemInstruction: "You are a helpful assistant for the Flood Alert App. You provide real-time weather news and details. Be concise, professional, and empathetic, especially when discussing flood risks."
      });

      // Simple implementation: check if user is asking for weather
      const lastMessage = messages[messages.length - 1].content.toLowerCase();
      let contextAddition = "";

      if (lastMessage.includes("weather") || lastMessage.includes("temperature") || lastMessage.includes("condition")) {
          // Attempt to extract city - if not found, assume default or ask
          const cityMatch = lastMessage.match(/(?:in|for|at)\s+([a-zA-Z\s,]+)/i);
          const city = cityMatch ? cityMatch[1].trim() : "Negombo"; // Default to Negombo as seen in frontend
          
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
});

/**
 * HTTP POST /receiveAlert
 * Called by the n8n HTTP Request node.
 * Validates the payload, writes it to Firestore to trigger frontend realtime listeners,
 * and sends out an FCM push notification to all stored tokens.
 */
exports.receiveAlert = onRequest({ cors: true }, (req, res) => {
  return cors(req, res, async () => {
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
    risk_level: (risk_level || "LOW").toUpperCase(),
    message: message || "No details available.",
    instructions: instructions || "Stay calm and follow local authority guidance.",
    timestamp: timestamp || new Date().toISOString(),
    area: area || "Unknown area",
    sensor_data: sensor_data || null,
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
});
