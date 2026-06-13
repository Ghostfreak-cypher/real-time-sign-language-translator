# Architecture & Design Notes

## High-level

```
 ┌────────────┐   webcam frames    ┌────────────────────┐
 │   Webcam   │ ─────────────────▶ │  MediaPipe Hands   │
 └────────────┘                    │  (browser, CDN)    │
                                   └─────────┬──────────┘
                                             │ 21 landmarks (x,y,z)
                                             ▼
                                   ┌────────────────────┐
                                   │  useHandRecognition│
                                   │  hook (frontend)   │
                                   └─────────┬──────────┘
                                             │ 63 floats
                                             ▼
                                   ┌────────────────────┐
                                   │  POST /api/predict │
                                   │  (FastAPI)         │
                                   └─────────┬──────────┘
                                             │
                                             ▼
                                   ┌────────────────────┐
                                   │  SignClassifier    │
                                   │  (Random Forest)   │
                                   └─────────┬──────────┘
                                             │ {prediction, conf, top_k}
                                             ▼
                                   ┌────────────────────┐
                                   │  useSentenceBuilder│  ──▶ TTS (Web Speech)
                                   │  + useSpeech       │  ──▶ MongoDB history
                                   └────────────────────┘
```

## Why MediaPipe in the browser?

* **Privacy** — raw video never leaves the user's machine.
* **Latency** — no upload round-trip, just 63 floats over the wire.
* **Robustness** — MediaPipe handles lighting, skin tone, and pose variation
  better than server-side CV at this scope.

The **trained Random Forest still lives on the backend**, so the prediction
remains centralised, swappable, and easy to upgrade (e.g. swap in an LSTM
without touching the frontend).

## Why Random Forest?

* Deterministic, interpretable, near-instant inference.
* Robust to small datasets and label noise — ideal for an MVP where users can
  collect their own samples.
* Tiny payload (`< 50 MB` for the entire bundle).
* Easy to explain during a viva / project demo.

## Stability filter (frontend)

To avoid jitter we require **N identical predictions in a row** (default 3
frames) before adding a word to the sentence. A short **cooldown** (≈ 900 ms)
prevents the same word from being appended twice.

## Latency budget

| Stage                | Budget     |
| -------------------- | ---------- |
| Capture + MediaPipe  | 30–50 ms   |
| HTTP round-trip      | 5–20 ms    |
| Random Forest        | 1–5 ms     |
| TTS first audio      | 100–400 ms |
| **Total**            | **< 500 ms** |

## Offline mode

* **No backend** → frontend uses a deterministic heuristic so the UI never
  freezes. The "Model: Heuristic" pill shows this state.
* **No MongoDB** → backend transparently stores history in memory.
* **No TTS device** → backend logs the text and returns success; the
  browser's Web Speech API still works.

## Security notes

* CORS is open by default for local development. Lock down `cors_origins` in
  production via `CORS_ORIGINS=https://your-domain.com` env variable.
* No auth is included in the MVP. Add JWT middleware on `app.state` for v1.1.
