# Cricket Backend — Deployment Guide

Lightweight Node.js backend. Runs on the free tier of Railway or Render.
No Docker needed. No database needed. ~$0/month to start.

---

## Step 1 — Local Setup & Test

```bash
# Enter the backend folder
cd cricket_backend

# Install dependencies
npm install

# Copy the example env file and add your RapidAPI key
cp .env.example .env
# Edit .env → set RAPIDAPI_KEY=your_actual_key

# Run locally
npm run dev

# Test it
curl http://localhost:3000/health
curl http://localhost:3000/api/live
```

You should see JSON data from CricBuzz in your terminal.

---

## Step 2 — Deploy to Railway (Recommended — Easiest)

Railway gives you a free always-on server with a public HTTPS URL.

1. Go to https://railway.app and sign up (free)
2. Click **New Project → Deploy from GitHub repo**
3. Connect your GitHub account and push the `cricket_backend/` folder as its own repo (or a monorepo — Railway lets you set the root directory)
4. Set the **Root Directory** to `cricket_backend` in Railway settings
5. Railway auto-detects Node.js and runs `npm start`
6. Go to **Variables** tab → Add:
   - `RAPIDAPI_KEY` = your RapidAPI key
   - `PORT` = 3000 (Railway sets this automatically too)
7. Click **Deploy**

Railway generates a public URL like: `https://cricket-backend-production.up.railway.app`

Your WebSocket URL will be: `wss://cricket-backend-production.up.railway.app/ws`

---

## Step 3 — Deploy to Render (Alternative — Also Free)

1. Go to https://render.com and sign up
2. New → **Web Service** → Connect your GitHub repo
3. Set **Root Directory** to `cricket_backend`
4. Build command: `npm install`
5. Start command: `npm start`
6. Environment Variables → Add `RAPIDAPI_KEY`
7. Deploy

Render free tier spins down after 15 minutes of inactivity. Use Railway for always-on.

---

## Step 4 — Configure Flutter App

After deploying, set the backend URL in the Flutter app.

**Option A — Build-time (recommended):**
```bash
# Android
flutter build apk --dart-define=BACKEND_URL=https://your-server.railway.app

# iOS
flutter build ios --dart-define=BACKEND_URL=https://your-server.railway.app
```

**Option B — Edit the default directly in `backend_service.dart`:**
```dart
static const String baseUrl = String.fromEnvironment(
  'BACKEND_URL',
  defaultValue: 'https://your-server.railway.app',  // ← change this
);
```

---

## Cost Breakdown

| Service           | Free Tier                    | Paid if needed        |
|-------------------|------------------------------|-----------------------|
| Railway           | $5 free credit/month (always-on) | $0.000231/vCPU-sec |
| Render            | Free (sleeps after 15 min)   | $7/month for always-on |
| RapidAPI CricBuzz | 100 req/day free             | $10/month for 10K/day |

**Our server uses ~3 API calls/minute = ~4,320 calls/day.**
You'll need at least the basic paid RapidAPI plan for production.

---

## Monitoring

Visit `https://your-server.railway.app/health` anytime to see:
- Server uptime
- Number of active WebSocket connections
- Cache state for all data types and their TTLs

---

## Scaling (when you outgrow the free tier)

The server handles ~10,000 concurrent WebSocket connections on a single Node.js process. You won't need to scale for a long time.

When you do:
1. Add Redis (`REDIS_URL` env var is already supported in `.env.example`)
2. Replace `src/cache.js` with the Redis implementation (same interface)
3. Run multiple server instances behind a load balancer
4. Use Redis pub/sub for cross-instance WebSocket broadcasting

---

## Security Checklist

- [x] API key stored in environment variable, never in code
- [x] `.env` is in `.gitignore`
- [x] Flutter app never receives the API key
- [ ] (Optional) Add rate limiting per IP: `npm install @fastify/rate-limit`
- [ ] (Optional) Add API key auth for Flutter clients (header-based)
