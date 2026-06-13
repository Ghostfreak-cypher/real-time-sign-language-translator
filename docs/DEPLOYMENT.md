# Free Deployment Roadmap — Sign Bridge

This guide covers deploying the full stack (Next.js frontend + FastAPI backend + MongoDB) at **zero cost** using free-tier cloud services.

---

## Architecture Overview

```
Browser → Vercel (Next.js) → Railway / Render (FastAPI) → MongoDB Atlas (free tier)
```

---

## Step 1 — MongoDB Atlas (Database)

1. Sign up at [cloud.mongodb.com](https://cloud.mongodb.com) → create a **free M0 cluster** (512 MB, always free).
2. Under **Database Access**, create a user (remember the password).
3. Under **Network Access**, add `0.0.0.0/0` to allow connections from cloud hosts.
4. Click **Connect → Drivers** and copy the connection URI:
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/sign_language_translator
   ```
5. Save this URI — you will use it as `MONGO_URI` in the backend env vars.

---

## Step 2 — Backend on Railway (FastAPI)

Railway has a **$5/month free credit** (no credit card required for hobby use).

### Option A — Railway (Recommended)

1. Sign up at [railway.app](https://railway.app) with your GitHub account.
2. **New Project → Deploy from GitHub repo** → select this repo.
3. Set the **Root Directory** to `backend`.
4. Railway auto-detects Python; add a `Procfile` (already included) or set the start command:
   ```
   uvicorn app.main:app --host 0.0.0.0 --port $PORT
   ```
5. Add environment variables in Railway dashboard:
   | Key | Value |
   |-----|-------|
   | `MONGO_URI` | your Atlas URI from Step 1 |
   | `MONGO_DB` | `sign_language_translator` |
   | `MODEL_PATH` | `ml/classifier.pkl` |
   | `DEBUG` | `false` |
6. Deploy. Note the generated domain, e.g. `https://sign-bridge-backend.up.railway.app`.

> **Note on the ML model:** `classifier.pkl` is gitignored. Either:
> - Train locally and upload via Railway's volume/CLI, OR
> - The backend gracefully returns `confidence: 0` without it; the frontend `mockPredict` activates automatically.

### Option B — Render (Alternative free tier)

1. Sign up at [render.com](https://render.com).
2. **New → Web Service** → connect GitHub repo, root dir = `backend`.
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Add the same environment variables as above.
6. Select the **Free** instance type (spins down after inactivity — cold start ~30s).

---

## Step 3 — Frontend on Vercel (Next.js)

Vercel is the canonical host for Next.js and has a **generous free Hobby tier**.

1. Sign up at [vercel.com](https://vercel.com) with your GitHub account.
2. **Add New Project → Import Git Repository** → select this repo.
3. Set **Root Directory** to `frontend`.
4. Vercel auto-detects Next.js — leave Framework Preset as **Next.js**.
5. Add environment variable:
   | Key | Value |
   |-----|-------|
   | `NEXT_PUBLIC_API_URL` | your Railway/Render backend URL |
6. Click **Deploy**.

Vercel assigns a URL like `https://sign-bridge.vercel.app`.

---

## Step 4 — CORS Configuration

Once you have both URLs, update the backend `CORS_ORIGINS` to allow your Vercel domain.

In `backend/app/main.py`, the CORS middleware reads from config. Add your Vercel URL to the allowed origins either via env var or directly:

```python
# backend/app/config.py — add to Settings:
cors_origins: list[str] = ["https://sign-bridge.vercel.app", "http://localhost:3000"]
```

Redeploy the backend after this change.

---

## Step 5 — MediaPipe WASM Assets (Important)

The WASM files (`frontend/public/mediapipe-wasm/`) and the hand landmarker model (`frontend/public/models/hand_landmarker.task`) are committed to the repo.

Vercel serves them as static assets automatically — **no extra configuration needed**.

---

## Step 6 — ML Model in Production (Optional)

If you want the full RF classifier (not mock predictions) in production:

1. Train locally:
   ```powershell
   cd backend
   .venv\Scripts\activate
   python -m ml.extract_landmarks --src dataset/asl_alphabet_train --out dataset/landmarks --limit-per-class 1000
   python -m ml.train --dataset dataset/landmarks --out ml/classifier.pkl
   ```
2. Upload `classifier.pkl` to your backend host:
   - **Railway**: use the Railway CLI (`railway up`) or connect a persistent volume.
   - **Render**: use a persistent disk (free tier includes 1 GB) and upload via Render shell.
3. Set `MODEL_PATH` env var to the uploaded path.

---

## Summary Table

| Service | Purpose | Free Tier Limits |
|---------|---------|-----------------|
| [MongoDB Atlas](https://cloud.mongodb.com) | Database | 512 MB storage, shared cluster |
| [Railway](https://railway.app) | FastAPI backend | $5/month credit (~500 hrs) |
| [Render](https://render.com) | FastAPI backend (alt) | 750 hrs/month, sleeps on idle |
| [Vercel](https://vercel.com) | Next.js frontend | 100 GB bandwidth, unlimited deploys |

---

## Local Development (Quick Start)

```powershell
# 1. Backend
cd backend
cp .env.example .env          # edit MONGO_URI if needed
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 2. Frontend (separate terminal)
cd frontend
cp .env.example .env.local    # set NEXT_PUBLIC_API_URL=http://localhost:8000
npm install
npm run dev                   # http://localhost:3000
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Camera not working on deployed site | Vercel serves over HTTPS; MediaPipe requires a secure context. Should work by default. |
| Backend returns `confidence: 0` | `classifier.pkl` not found — see Step 6 or use mock predictions. |
| MongoDB connection refused | Check Atlas Network Access whitelist and credentials in env vars. |
| Render cold start (~30s) | Normal on free tier. Consider Railway for always-on. |
| CORS error in browser | Add your Vercel URL to `cors_origins` in backend config and redeploy. |
