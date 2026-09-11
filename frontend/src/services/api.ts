/**
 * Data Sentinel API service.
 * All requests go through /api prefix (proxied to FastAPI in dev, nginx in prod).
 */
import type {
  HealthResponse, IngestResponse, StatusResponse,
  ChatRequest, ChatResponse, DataHealthResponse,
  AnomaliesResponse, GraphData, SecurityStats, Dataset,
} from '@/types';

const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(errorData.detail || `Request failed: ${response.status}`);
  }

  return response.json();
}

// ─── Health ──────────────────────────────────────────────────────────────────
export const getHealth = (): Promise<HealthResponse> =>
  request<HealthResponse>('/health');

// ─── Ingest ──────────────────────────────────────────────────────────────────
export async function ingestCSV(file: File): Promise<IngestResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${BASE}/ingest`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(err.detail || `Upload failed: ${response.status}`);
  }

  return response.json();
}

export const getStatus = (jobId: string): Promise<StatusResponse> =>
  request<StatusResponse>(`/status?job_id=${encodeURIComponent(jobId)}`);

// ─── Chat ─────────────────────────────────────────────────────────────────────
export const chat = (req: ChatRequest): Promise<ChatResponse> =>
  request<ChatResponse>('/chat', {
    method: 'POST',
    body: JSON.stringify(req),
  });

// ─── Analytics ────────────────────────────────────────────────────────────────
export const getDatasets = (): Promise<{ datasets: Dataset[] }> =>
  request<{ datasets: Dataset[] }>('/analytics/datasets');

export const getDataHealth = (datasetId = 'latest'): Promise<DataHealthResponse> =>
  request<DataHealthResponse>(`/analytics/health/${datasetId}`);

export const getAnomalies = (datasetId = 'latest'): Promise<AnomaliesResponse> =>
  request<AnomaliesResponse>(`/analytics/anomalies/${datasetId}`);

export const getGraphData = (datasetId = 'latest', limit = 150): Promise<GraphData> =>
  request<GraphData>(`/analytics/graph/${datasetId}?limit=${limit}`);

export const getCrossRelationships = (): Promise<{ relationships: import('@/types').CrossRelationship[] }> =>
  request<{ relationships: import('@/types').CrossRelationship[] }>('/analytics/cross-relationships');

// ─── Security ─────────────────────────────────────────────────────────────────
export const getSecurityStats = (): Promise<SecurityStats> =>
  request<SecurityStats>('/security/stats');

