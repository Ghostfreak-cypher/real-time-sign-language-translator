import axios, { type AxiosInstance } from "axios";
import type { HistoryItem, PredictionResponse, SequencePredictionResponse } from "@/types";

// The browser ALWAYS talks to the app's own origin using relative paths
// (e.g. "/api/predict", "/health"). Next.js rewrites (see next.config.js)
// proxy those server-side to the real backend (BACKEND_URL on Vercel, or
// http://localhost:8000 in dev). This means:
//   - No CORS: requests are same-origin in the browser; the Vercel↔Render hop
//     is server-to-server.
//   - No build-time coupling: the backend URL is NOT baked into the client
//     bundle, so changing backends never requires a frontend rebuild.
// Deliberately NOT using NEXT_PUBLIC_API_URL here — setting it to an absolute
// cross-origin URL was the cause of the "Offline / Heuristic" CORS failures.
const API_BASE = "";

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 8000,
  headers: { "Content-Type": "application/json" },
});

export async function checkHealth(): Promise<{
  status: string;
  model_loaded: boolean;
  database: string;
  version: string;
}> {
  const { data } = await api.get("/health");
  return data;
}

export async function predict(
  landmarks: number[],
): Promise<PredictionResponse> {
  const { data } = await api.post<PredictionResponse>("/api/predict", {
    landmarks,
    handedness: "Right",
    num_hands: 1,
  });
  return data;
}

export async function predictSequence(
  sequence: number[][],
): Promise<SequencePredictionResponse> {
  const { data } = await api.post<SequencePredictionResponse>(
    "/api/predict/sequence",
    { sequence },
  );
  return data;
}

export async function fetchHistory(q?: string): Promise<HistoryItem[]> {
  const { data } = await api.get<HistoryItem[]>("/api/history", {
    params: { q },
  });
  return data;
}

export async function pushHistory(payload: {
  text: string;
  confidence: number;
  prediction: string;
}): Promise<HistoryItem> {
  const { data } = await api.post<HistoryItem>("/api/history", payload);
  return data;
}

export async function deleteHistory(id: string): Promise<void> {
  await api.delete(`/api/history/${id}`);
}

export async function speak(text: string): Promise<void> {
  await api.post("/api/speak", { text });
}
