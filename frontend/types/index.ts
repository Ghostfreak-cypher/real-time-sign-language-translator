export type PredictionTopK = {
  label: string;
  confidence: number;
};

export type PredictionResponse = {
  prediction: string;
  confidence: number;
  top_k?: PredictionTopK[];
  latency_ms?: number;
};

export type HistoryItem = {
  _id?: string;
  text: string;
  prediction: string;
  confidence: number;
  timestamp: string;
};
