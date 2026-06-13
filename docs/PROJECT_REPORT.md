# Sign Bridge — Real-Time Sign Language Translator

**Team Project Report**

| # | Team Member |
|---|-------------|
| 1 | Zainab |
| 2 | Vajeeha |
| 3 | Yash Vishwakarma |
| 4 | Aanuman |
| 5 | Vansh Goel |

---

## 1. Abstract

Sign Bridge is a real-time sign language translation dashboard. A user signs in front of their webcam; the browser extracts hand landmarks using Google MediaPipe, a machine-learning classifier on the backend recognizes the gesture, and the frontend composes the recognized signs into sentences that can be spoken aloud (text-to-speech) and saved to a history database. End-to-end latency is under half a second, making conversation-speed translation possible.

The system bridges the communication gap between sign language users and non-signers using only commodity hardware — a laptop with a webcam.

---

## 2. The Core Idea: Landmarks, Not Pixels

The single most important design decision in this project is that **we never classify images — we classify hand geometry.**

A naive approach would send webcam frames to a server and run a convolutional neural network (CNN) on the pixels. That approach is heavy (megabytes per frame), slow, privacy-invasive, and fragile — a CNN trained on one background, lighting condition, or skin tone often fails on another.

Instead, our pipeline works like this:

1. **MediaPipe Hand Landmarker** (a pre-trained Google model running *inside the browser* via WebAssembly) detects the hand in each video frame and outputs **21 3D landmarks** — one point per joint of the hand (wrist, knuckles, fingertips, etc.).
2. Each landmark has an `(x, y, z)` coordinate, so one hand becomes a flat vector of **21 × 3 = 63 floating-point numbers**.
3. Only these 63 numbers travel over the network to our backend. The raw video never leaves the user's machine.
4. Our own classifier then answers a much simpler question than "what is in this image?" — it answers **"what shape is this hand in?"** given 63 clean geometric coordinates.

This division of labor is the heart of the architecture: *MediaPipe solves the hard computer-vision problem (finding the hand in messy real-world video), so our ML model only has to solve an easy geometry problem (mapping a hand pose to a label).* The benefits:

- **Privacy** — only coordinates leave the browser, never video.
- **Speed** — 63 floats ≈ 250 bytes per request instead of a full image.
- **Robustness** — lighting, background, camera quality, and skin tone are already absorbed by MediaPipe; our model never sees them.
- **Tiny training data requirement** — a classical ML model on 63 features needs hundreds of samples per class, not the tens of thousands a CNN would need.

---

## 3. System Architecture

```
┌──────────┐  video frames   ┌─────────────────────┐
│  Webcam   │ ───────────────▶│ MediaPipe Hand      │   (runs in the browser,
└──────────┘                 │ Landmarker (WASM)   │    WASM + model served
                             └──────────┬──────────┘    locally from /public)
                                        │ 21 landmarks × (x,y,z)
                                        ▼
                             ┌─────────────────────┐
                             │ useHandRecognition  │  React hook: RAF detect
                             │ (frontend hook)     │  loop + stability filter
                             └──────────┬──────────┘
                                        │ 63 floats, throttled every ~120 ms
                                        ▼
                             ┌─────────────────────┐
                             │ POST /api/predict   │  FastAPI backend
                             │  → normalize        │  (wrist-centred, scale-
                             │  → Random Forest    │   invariant preprocessing)
                             └──────────┬──────────┘
                                        │ { prediction, confidence, top_k }
                                        ▼
                             ┌─────────────────────┐
                             │ useSentenceBuilder  │ ──▶ Text-to-Speech
                             │ + useSpeech (hooks) │ ──▶ MongoDB history
                             └─────────────────────┘
```

**Latency budget** (why it feels real-time):

| Stage | Time |
|---|---|
| MediaPipe detection (per frame, in-browser) | 30–50 ms |
| HTTP round-trip (63 floats, localhost/LAN) | 5–20 ms |
| Random Forest inference | 1–5 ms |
| **Total per prediction** | **< 100 ms** (TTS audio adds 100–400 ms) |

---

## 4. The ML Model (Core of the Project)

### 4.1 Feature representation

Every training sample and every live prediction is the same thing: a **63-float vector** = 21 hand landmarks × `[x, y, z]`, in MediaPipe's fixed landmark order (index 0 = wrist, 9 = middle-finger knuckle, 8 = index fingertip, and so on). This uniformity is what lets one model serve data coming from three different sources — Kaggle dataset images, our own webcam-collected samples, and the live browser feed.

### 4.2 Geometric normalization — the key preprocessing insight

Raw MediaPipe coordinates are normalized to the image frame: they encode **where** the hand is on screen and **how big** it appears (camera distance). Neither of those has anything to do with which sign is being made — and worse, they differ systematically between training images (hands cropped, centred, large) and live video (hand anywhere, any size). Training on raw coordinates therefore gives a model that scores well on the test set but fails on live video. This is the classic **train/serve distribution shift** problem.

Our fix lives in one module, `backend/app/utils/landmarks.py::normalize_landmarks`, and does two things:

1. **Translation invariance** — subtract the wrist coordinate from all 21 points, so the wrist becomes the origin. Now position in the frame is irrelevant.
2. **Scale invariance** — divide all points by the distance from the wrist to the middle-finger knuckle (landmark 9). This distance is a stable proxy for hand size because it does not change when the fingers move (unlike, say, the hand's bounding box, which collapses when you make a fist).

After this transform, the model sees only the **shape** of the hand — exactly the information that defines a sign.

Critically, the *same function* is applied in two places: by `ml/train.py` when loading the dataset, and by the `SignClassifier` service on every live request. The trained model bundle is stamped with a version tag (`preprocess: "wrist_mcp_v1"`) so the serving layer knows to apply the identical transform. Single source of truth ⇒ training and inference can never drift apart.

### 4.3 Data augmentation

Training data (clean still images) differs from live video in predictable ways, so the training split is augmented (training split only — never the test set, which would leak):

- **Mirroring** — flip the x-axis of every sample. On wrist-centred vectors this converts a right hand into a left hand, so the model works for both hands even if the dataset only contains one.
- **Jitter** — small random in-plane rotation (±12°) plus Gaussian noise on every coordinate. This simulates camera roll and the frame-to-frame landmark "wobble" of live video that clean stills don't have.

Each of these doubles the training split, so training sees 3× the original samples.

### 4.4 The classifier: Random Forest

The model is a scikit-learn **`RandomForestClassifier`** (300 trees, balanced class weights). A random forest is an ensemble of decision trees, each trained on a random subset of the data and features; the forest predicts by majority vote, and the fraction of trees voting for the winner gives a natural **confidence score** (`predict_proba`).

Why a Random Forest instead of a neural network?

- **It fits the problem.** With only 63 well-engineered geometric features, the decision boundary between hand poses is simple enough that trees capture it; deep learning's advantage (learning features from raw data) is unnecessary because MediaPipe already did the feature extraction.
- **Small-data friendly.** It trains well on a few hundred samples per class and is robust to label noise — ideal when team members collect their own samples.
- **Fast and deterministic.** Inference is 1–5 ms on CPU, no GPU needed, and the same input always gives the same output (important for the frontend's stability filter).
- **Interpretable & explainable** — easy to defend in a viva: feature importances show which joints matter for which sign.

The trained artifact is a joblib bundle: `{"model": <RandomForest>, "labels": [...], "preprocess": "wrist_mcp_v1"}` saved as `backend/ml/classifier.pkl`, along with a `classifier.metrics.json` recording test accuracy.

### 4.5 Training pipeline (end to end)

```
Kaggle ASL Alphabet images          Your own webcam samples
        │                                   │
        ▼                                   ▼
ml/extract_landmarks.py             ml/collect_data.py
(runs HandLandmarker on each        (records live landmark
 image → 63-float .npy files)        samples per gesture)
        └──────────────┬────────────────────┘
                       ▼
            dataset/landmarks/<label>/*.npy     ← RAW coordinates on disk
                       ▼
                  ml/train.py
        1. load all .npy samples
        2. normalize_batch()         (wrist-centred, scale-invariant)
        3. train/test split (80/20, stratified)
        4. augment train split      (mirror + jitter)
        5. fit RandomForest(300 trees, balanced)
        6. report accuracy + per-class precision/recall
        7. save ml/classifier.pkl bundle
```

A subtle but important point: **both training extraction and the live browser use the exact same MediaPipe `.task` model file** (`hand_landmarker.task`). If training landmarks came from a different detector version than live landmarks, their coordinate distributions could differ — another silent accuracy killer we designed out.

### 4.6 Serving and graceful degradation

At serve time, `SignClassifier.predict` validates the 63-float input, applies `normalize_landmarks`, runs `predict_proba`, and returns the top label, its confidence, the top-3 candidates, and the inference latency. If the `.pkl` file is missing, the service doesn't crash — it returns zero-confidence predictions, and the frontend transparently switches to a built-in heuristic (see §6).

---

## 5. Backend (FastAPI + MongoDB)

The backend is a **FastAPI** application (`backend/app/`) with a clean service-oriented layout:

| Layer | Files | Role |
|---|---|---|
| Entrypoint | `app/main.py` | App creation, CORS, lifespan, router registration |
| Routes | `app/routes/{predict,history,speech}.py` | Thin HTTP handlers |
| Services | `app/services/{classifier,history_service,speech}.py` | All business logic |
| Schemas | `app/models/schemas.py` | Pydantic request/response validation |
| Config | `app/config.py` | Settings from `.env` via pydantic-settings |

**Service singleton pattern.** Heavy resources (the ML model, the MongoDB client, the TTS engine) are created **once** in the FastAPI *lifespan* handler and attached to `app.state`. Routes retrieve them via `request.app.state.<service>` and never instantiate them — so the model is loaded once at startup, not per request.

**API endpoints:**

| Endpoint | Purpose |
|---|---|
| `POST /api/predict` | 63 landmarks in → `{prediction, confidence, top_k, latency_ms}` out |
| `GET /api/history` | List saved translations (search + limit) |
| `POST /api/history` / `DELETE /api/history/{id}` | Save / delete a translation |
| `POST /api/speak` | Server-side TTS fallback (pyttsx3) |
| `GET /health` | Model-loaded + database status |

**Persistence.** History is stored in **MongoDB** via the async Motor driver. If MongoDB is unreachable, `HistoryService` falls back to an in-memory store — the app keeps working, just without durable history.

**Validation.** Pydantic schemas enforce, for example, that `landmarks` is exactly 63 floats — malformed requests are rejected with a 422 before they reach the model.

---

## 6. Frontend (Next.js + React)

The frontend is a **Next.js (App Router) + TypeScript + Tailwind** dashboard. The logic lives in three custom React hooks; components are mostly presentation.

```
page.tsx
 ├── useHandRecognition → WebcamPanel  (webcam + landmark overlay canvas)
 ├── useHandRecognition → SignDisplay  (current prediction + confidence)
 ├── useSentenceBuilder → SentenceBar  (composed sentence, save/speak/clear)
 ├── useSentenceBuilder → HistoryList  (saved translations)
 └── useSpeech          → SentenceBar  (mute toggle)
```

**`useHandRecognition`** — the engine of the app:
- Initializes MediaPipe's `HandLandmarker` (Tasks API, `@mediapipe/tasks-vision`) as a **module-level singleton**. WASM files and the `.task` model are served locally from `/public` — no CDN, works offline.
- A `requestAnimationFrame` loop calls `detectForVideo` on each new video frame and flattens the first hand's 21 landmarks into the 63-float vector.
- A **throttled interval (~120 ms)** sends the latest vector to `POST /api/predict` — so detection runs at full frame rate (~30 fps) but the network sees only ~8 requests/second.
- **Stability filter:** a prediction is only *committed* after the backend returns the **same label 3 times in a row** above a confidence threshold (0.6). This removes the flicker of transitional hand poses; unstable predictions are shown dimmed (at half confidence) so the user gets immediate feedback.
- **Offline fallback:** if the backend is unreachable, a deterministic heuristic (`mockPredict`, a finger-counting rule using tip-vs-knuckle distances from the wrist) keeps the UI alive — the demo never freezes.

**`useSentenceBuilder`** — consumes committed predictions, deduplicates with a cooldown (so holding a sign doesn't repeat the word), and manages the sentence buffer plus history save/load/delete via the API.

**`useSpeech`** — wraps the browser's **Web Speech API** for instant text-to-speech; the backend pyttsx3 endpoint is the fallback.

---

## 7. Resilience: Every Layer Degrades Gracefully

A deliberate theme across the stack — no single missing dependency kills the demo:

| Missing piece | Behavior |
|---|---|
| `classifier.pkl` not trained yet | Backend returns zero-confidence; frontend shows heuristic mode |
| Backend down | Frontend switches to in-browser `mockPredict` heuristic |
| MongoDB down | Backend stores history in memory |
| No audio device on server | `/api/speak` logs and returns success; browser TTS still works |

---

## 8. Technology Stack

| Area | Technology |
|---|---|
| Hand detection | MediaPipe Hand Landmarker (Tasks API, WASM in browser / Python for dataset extraction) |
| ML model | scikit-learn Random Forest (300 trees), joblib bundle |
| Backend | Python, FastAPI, Pydantic, Uvicorn |
| Database | MongoDB (Motor async driver), in-memory fallback |
| Frontend | Next.js, React, TypeScript, Tailwind CSS, react-webcam |
| Text-to-speech | Web Speech API (browser), pyttsx3 (server fallback) |
| Dataset | Kaggle ASL Alphabet (images → landmarks) + custom webcam-collected samples |

---

## 9. How to Run

```powershell
# Backend
cd backend
.venv\Scripts\activate
uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm run dev        # http://localhost:3000
```

Training a model from the Kaggle ASL Alphabet dataset (run from `backend/`):

```powershell
python -m ml.extract_landmarks --src dataset/asl_alphabet_train/asl_alphabet_train --out dataset/landmarks --limit-per-class 1000
python -m ml.train --dataset dataset/landmarks --out ml/classifier.pkl
# Optional: record custom gestures not in public datasets
python -m ml.collect_data --gesture Hello --samples 200
```

---

## 10. Limitations & Future Work

- **Static signs only.** The model classifies single-frame hand *poses*; dynamic signs that involve motion (e.g. full ASL "J"/"Z" traces) need a temporal model — a natural upgrade is an LSTM/Transformer over a sliding window of landmark vectors. Because the classifier lives behind one API endpoint, it can be swapped without touching the frontend.
- **Single hand.** Two-handed signs would extend the feature vector to 126 floats.
- **Word-level output.** Sentence composition is concatenation; grammar-aware translation (sign order → spoken-language order) is future work.
- **No authentication** yet; history is global. JWT middleware is the planned v1.1 addition.
