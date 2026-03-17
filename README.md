# 🌊 Flood Alert App (Vercel + Firebase)

A real-time **Flash Flood Early Warning System** — push notifications via Firebase Cloud Messaging + live in-app updates via **Cloud Firestore**, triggered by your n8n workflow.

This application is built with a **Serverless** architecture to be hosted on Vercel (Frontend) and Firebase Cloud Functions (Backend).

---

## Architecture

```
n8n HTTP Request Node
        │  POST /receiveAlert (Firebase Function)
        ▼
 Firebase Cloud Functions
   ├─ Saves alert to Cloud Firestore
   └─ Sends FCM push via firebase-admin
        │
        ▼
  Browser / Mobile (Hosted on Vercel)
   ├─ Native OS notification (FCM, even when tab closed)
   └─ In-app UI update (Firestore onSnapshot Listener)
```

---

## 🛠️ Deployment Instructions

### 1. Set Up Firebase Firestore
1. Go to [Firebase Console](https://console.firebase.google.com/).
2. Click **Firestore Database** in the left menu.
3. Click **Create Database** (Start in **Test Mode**).
4. Upgrade your project plan to **Blaze** (Pay as you go) — Google requires this to deploy Cloud Functions (though it is practically free for small apps).

### 2. Deploy Cloud Functions (Backend)
1. In your terminal, log in to Firebase:
   ```bash
   npm install -g firebase-tools
   firebase login
   ```
2. Deploy the functions:
   ```bash
   cd functions
   npm install
   firebase deploy --only functions
   ```
3. **Copy the Function URLs**: Once deployed, the terminal will give you the URLs for `registerDevice` and `receiveAlert`.

### 3. Update Vercel Frontend Variables
1. Open `public/main.js`.
2. Locate `const BACKEND_URL = "YOUR_CLOUDFUNCTIONS_URL_HERE";` (around line 36).
3. Paste the URL **base** from Firebase. For example: `https://us-central1-floodalertweb.cloudfunctions.net/`.

### 4. Deploy to Vercel
1. Push your entire repository to GitHub.
2. Log in to [Vercel](https://vercel.com/) and click **Add New Project**.
3. Import your GitHub repository.
4. Leave all settings exactly as default. Vercel will automatically read `vercel.json` and deploy `public/` as a static site.
5. Click **Deploy**.

---

## 🔗 Connecting n8n
In your n8n workflow, add an **HTTP Request** node configured as:

| Setting       | Value                                          |
|---------------|------------------------------------------------|
| Method        | `POST`                                         |
| URL           | `https://YOUR_FUNCTION_URL/receiveAlert`       |
| Body Type     | `JSON`                                         |
| Content-Type  | `application/json`                             |

**JSON Body to send from n8n:**
```json
{
  "alert_type":   "Flash Flood",
  "risk_level":   "CRITICAL",
  "message":      "River overflowing near Negombo lagoon",
  "instructions": "Evacuate to higher ground immediately. Avoid all roads near the lagoon.",
  "timestamp":    "{{ $now }}",
  "area":         "Negombo"
}
```

> 💡 `risk_level` must be one of: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`
