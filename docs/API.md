# API Documentation

Base URL: `http://localhost:8000`

All endpoints return JSON. Errors follow FastAPI's standard format:
`{ "detail": "..." }` with appropriate HTTP status codes.

---

## `GET /`

Liveness banner.

```json
{
  "name": "Real-Time Sign Language Translator",
  "version": "v1",
  "status": "ok",
  "docs": "/docs"
}
```

---

## `GET /health`

Returns service status.

```json
{
  "status": "ok",
  "model_loaded": true,
  "database": "connected",
  "version": "v1"
}
```

| Field          | Type     | Notes                                   |
| -------------- | -------- | --------------------------------------- |
| `status`       | `string` | always `ok` if the process is alive     |
| `model_loaded` | `bool`   | `true` when `ml/classifier.pkl` exists  |
| `database`     | `string` | `connected` or `offline`                |
| `version`      | `string` | API version                             |

---

## `POST /api/predict`

Classify a single hand's landmarks.

### Request body

```json
{
  "landmarks": [0.12, 0.34, 0.01, "..."],
  "handedness": "Right",
  "num_hands": 1
}
```

`landmarks` must be a flat array of **exactly 63 floats** (`21 * 3`).

### Response 200

```json
{
  "prediction": "Hello",
  "confidence": 0.97,
  "top_k": [
    { "label": "Hello", "confidence": 0.97 },
    { "label": "Thank You", "confidence": 0.02 },
    { "label": "Yes", "confidence": 0.01 }
  ],
  "latency_ms": 4.83
}
```

### Error responses

| Status | Reason                                |
| ------ | ------------------------------------- |
| 422    | `landmarks` length is not 63          |

---

## `GET /api/history`

List history entries, newest first.

### Query parameters

| Name   | Type   | Default | Description                          |
| ------ | ------ | ------- | ------------------------------------ |
| `q`    | string | —       | Case-insensitive substring filter    |
| `limit`| int    | 100     | Max items (1–500)                    |

### Response 200

```json
[
  {
    "text": "Hello How Are You",
    "timestamp": "2025-01-01T12:00:00Z",
    "confidence": 0.94,
    "prediction": "You"
  }
]
```

---

## `POST /api/history`

Save a new translation record.

### Request body

```json
{
  "text": "Hello How Are You",
  "confidence": 0.94,
  "prediction": "You"
}
```

### Response 201

Same shape as a single item in the `GET /api/history` list.

---

## `DELETE /api/history/{id}`

Remove a record. Returns **204 No Content** on success or **404** when not found.

---

## `POST /api/speak`

Speak text through the backend's `pyttsx3` engine.

### Request body

```json
{
  "text": "Hello world",
  "rate": 175,
  "volume": 1.0
}
```

### Response 200

```json
{ "spoken": "Hello world", "ok": true }
```

> ℹ️ On hosted environments without an audio device, the backend logs the text
> and returns success. The frontend's Web Speech API is the primary TTS path
> during demos.

---

## Curl examples

```bash
# Predict
curl -X POST http://localhost:8000/api/predict \
  -H "Content-Type: application/json" \
  -d '{"landmarks":['"$(python -c 'print(",".join(["0"]*63))')"']}'

# Save
curl -X POST http://localhost:8000/api/history \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello","confidence":0.92,"prediction":"Hello"}'

# Speak
curl -X POST http://localhost:8000/api/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world"}'
```
