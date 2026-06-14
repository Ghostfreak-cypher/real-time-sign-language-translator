import axios, { type AxiosInstance } from "axios";
import type { HistoryItem, PredictionResponse, SequencePredictionResponse } from "@/types";

// In development set NEXT_PUBLIC_API_URL=http://localhost:8000 in .env.local.
// In production set NEXT_PUBLIC_API_URL= (empty string) so all requests are
// relative and routed through Next.js rewrites — no CORS required.
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
