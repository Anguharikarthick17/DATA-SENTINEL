// API response types for Data Sentinel

export interface HealthResponse {
  status: string;
  kafka_connected: boolean;
  neo4j_connected: boolean;
}

export interface IngestResponse {
  job_id: string;
  rows_received: number;
  status: string;
}

export interface StatusResponse {
  job_id: string;
  status: 'queued' | 'loading' | 'complete' | 'failed';
  rows_total: number;
  rows_loaded: number;
  rows_failed: number;
  filename?: string;
  dataset_id?: string;
  rows_read?: number;
  messages_published?: number;
  duration_ms?: number;
  throughput_rows_sec?: number;
}

export interface ChatRequest {
  question: string;
  dataset_id?: string;
}

export interface VerificationStep {
  step: string;
  label: string;
  detail: string;
  status: 'ok' | 'warning' | 'blocked' | 'VERIFIED' | 'BLOCKED' | string;
}

export interface ChatResponse {
  answer: string;
  cypher: string;
  result: unknown[];
  grounded: boolean;
  verification_status?: 'VERIFIED' | 'NO_EVIDENCE' | 'UNSUPPORTED' | 'NO_DATASET';
  intent?: string;
  evidence?: string;
  verification_steps?: VerificationStep[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  response?: ChatResponse;
  loading?: boolean;
}


export interface ColumnHealthInfo {
  name: string;
  missing_count: number;
  missing_pct: number;
  unique_count: number;
  sample_values: string[];
}

export interface DataHealthResponse {
  dataset_id: string;
  score: number;
  total_rows: number;
  missing_value_count: number;
  missing_value_pct: number;
  duplicate_risk_count: number;
  schema_consistency: number;
  anomaly_count: number;
  columns: ColumnHealthInfo[];
  explanation: string[];
}

export interface AnomalyItem {
  id: string;
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  evidence: string;
  affected_count: number;
  column?: string;
  value?: string;
  cypher?: string;
}

export interface AnomaliesResponse {
  dataset_id: string;
  anomalies: AnomalyItem[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface GraphLink {
  source: string;
  target: string;
  relationship: string;
}

export interface GraphData {
  dataset_id: string;
  nodes: GraphNode[];
  links: GraphLink[];
  total_nodes: number;
  total_links: number;
}

export interface SecurityEvent {
  timestamp: string;
  endpoint: string;
  event_type: string;
  severity: string;
  status_code: number;
  message: string;
  ip?: string;
}

export interface SecurityStats {
  security_score: number;
  requests_per_minute: number;
  blocked_requests: number;
  rate_limit_events: number;
  invalid_uploads: number;
  suspicious_requests: number;
  api_errors: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  error_rate: number;
  events: SecurityEvent[];
}

export interface Dataset {
  id: string;
  filename: string;
  uploaded_at: string;
  row_count: number;
  job_id: string;
  loaded_count: number;
}

export interface CrossRelationship {
  id: string;
  source_dataset_id: string;
  source_filename: string;
  target_dataset_id: string;
  target_filename: string;
  shared_column: string;
  match_count: number;
  basis: string;
}

