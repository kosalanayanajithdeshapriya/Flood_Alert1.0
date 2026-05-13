# 🌊 Flood Alert App (Vercel + Firebase)
<img width="1093" height="899" alt="image" src="https://github.com/user-attachments/assets/184d75b7-ef74-4d12-a38a-32a2ecc38d2f" />

A real-time **Flash Flood Early Warning System** — push notifications via Firebase Cloud Messaging + live in-app updates via **Cloud Firestore**, triggered by your n8n workflow.

This application is built with a **Serverless** architecture to be hosted on Vercel (Frontend) and Firebase Cloud Functions (Backend).

---

## Architecture

#circuit Diagrame
![WhatsApp Image 2026-03-20 at 10 26 08 AM](https://github.com/user-attachments/assets/a31e7af8-abe5-4ede-afad-0e18eed4272d)


The **0.3m distance from the floor to the sensor** is chosen for three specific practical reasons:

***

## 1. 🟤 Avoid the Silt Layer

```
         WATER SURFACE
         ══════════════════════════

              [YF-S201 Sensor] ← 0.3m above floor
         ──────────────────────────  ← 0.3m mark
         ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  ← Silt/mud/debris layer
         ▓▓▓▓ RIVER FLOOR ▓▓▓▓▓▓▓▓▓
```

River floors accumulate **mud, sand, silt, and debris** over time. If the sensor is placed directly at floor level:
- Mud enters the pipe and **jams the turbine permanently**
- Debris blocks the pipe inlet completely
- No readings are possible at all

At 0.3m, the sensor sits **above the silt layer** but still deep enough to be always submerged.

***

## 2. 💧 Always Stay Submerged

The Kelaniya River's **dry season depth is 1.5 – 2.5 metres**. At 0.3m above the floor: [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/73715436/60c305c3-32e6-4b5c-b270-c54c497462bd/FlashGuard_Report-1.docx)

```
   Normal water depth = 1.5m minimum
   Sensor position    = 0.3m above floor

   Water above sensor = 1.5 - 0.3 = 1.2m of water
                                     always covering it
```

The sensor stays **fully underwater at all times** — even during the driest season — so it never loses contact with the water and always gives readings.

***

## 3. 🌊 Best Flow Velocity Zone

River water velocity is **not uniform** from top to bottom:

```
   SURFACE     → Slow (wind friction, surface turbulence)
   ─────────────────────────────────────────
   MID DEPTH   → Fastest flow zone
   ─────────────────────────────────────────
   0.3m ABOVE  → Good strong flow, accurate readings ✅
   FLOOR
   ─────────────────────────────────────────
   FLOOR       → Very slow (friction with river bed)
```

At 0.3m the sensor captures **representative, strong flow velocity** — not the slow boundary layer right at the floor, and not the turbulent surface layer.

***


> 0.3m is chosen because it is **above the silt that clogs the turbine**, **below the minimum dry-season water level so it is always submerged**, and **in the zone of good measurable flow velocity** — making it the optimal position for accurate and reliable readings year-round. ✅
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
<img width="1499" height="699" alt="image" src="https://github.com/user-attachments/assets/3fd4157a-b764-48d7-9df8-4b2976876cc6" />


In your n8n workflow, add an **HTTP Request** node configured as:

| Setting       | Value                                                              |
|---------------|--------------------------------------------------------------------|
| Method        | `POST`                                                             |
| URL           | `https://us-central1-floodalertweb.cloudfunctions.net/receiveAlert`|
| Body Type     | `JSON`                                                             |
| Content-Type  | `application/json`                                                 |

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
