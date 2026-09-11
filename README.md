# DATA-SENTINEL
## Self-Observing. Self-Verifying. Graph-Powered.

> **Data Sentinel** transforms dynamic CSV data into a live, queryable graph while continuously observing the ingestion pipeline and verifying every answer against actual Neo4j evidence.

---

## 1. Problem & Operational Challenge
Organizations continuously receive ad-hoc CSV exports from CRMs, ticketing systems, payment providers, and partner tools. Traditionally, extracting business intelligence requires manual spreadsheet wrangling, error-prone database migrations, or opaque LLM interfaces that hallucinate numbers.

## 2. Our Solution
Data Sentinel is an automated data operations platform implementing a decoupled streaming and graph verification architecture:
$$\text{CSV} \longrightarrow \text{FastAPI Ingest} \longrightarrow \text{Kafka Topic: } \texttt{csv-rows} \longrightarrow \text{Loader Consumer} \longrightarrow \text{Neo4j Graph} \longrightarrow \text{Verified Chat}$$

The user does not need to declare a rigid schema beforehand or manually write database queries. The platform automatically converts tabular data into property graph models and validates all natural-language query answers against database evidence.

---

## 3. Core Features & Innovations

1. **Live Telemetry Engine**: Bridges backend streaming state with the 3D pipeline visualization, reporting live counters: `ROWS READ`, `MESSAGES IN KAFKA`, `ROWS PROCESSED`, `NODES COMMITTED`, and `FAILED / DLQ` along with real-time throughput ($r/s$) and duration ($ms$).
2. **Sentinel Verification Firewall**: A 6-stage verification engine (`QUESTION RECEIVED` &rarr; `INTENT DETECTED` &rarr; `CYPHER GENERATED` &rarr; `NEO4J EXECUTED` &rarr; `EVIDENCE FOUND` &rarr; `ANSWER VERIFIED`). Unsupported queries are strictly intercepted with `grounded: false`—guaranteeing zero fabricated answers.
3. **Relationship Intelligence**: Scans uploaded datasets to discover shared identifier keys (`customer_id`, `order_id`, `account_id`) and surfaces factual match proofs with direct graph exploration.
4. **Deterministic Idempotency**: Automatically computes a deterministic SHA-256 dataset hash from raw file bytes. Combined with composite node key `MERGE` on `(dataset_id, row_index)`, uploading the exact same CSV twice creates zero duplicate rows.
5. **Data Health & Anomaly Detection**: Computes a normalized data health score ($0-100$) and surfaces IQR numerical outliers, missing-value spikes, and dominant-category skews ($Z > 2.5$).
6. **Defense-in-Depth Security**: Non-root containers (UID 1001), pinned production images, sliding-window rate limiting (120 req/min), truthful socket health checks, and zero plaintext credentials.

---

## 4. Architecture & Technology Stack

| Tier | Component | Technology Stack | Purpose |
|---|---|---|---|
| **Frontend** | `sentinel_ui` | React 18, TypeScript, Vite, React Three Fiber, Three.js | Interactive 3D telemetry, chat, graph visualization |
| **Gateway** | `sentinel_api` | FastAPI, Python 3.11-slim, Pydantic v2 | CSV validation, SHA-256 identity, Kafka publisher |
| **Conveyor** | `sentinel_kafka` | Apache Kafka 3.7.0 (KRaft mode) | Decoupled pub/sub buffer topic `csv-rows` |
| **Loader** | `sentinel_loader` | Python 3.11-slim, confluent-kafka, neo4j driver | Consumes Kafka messages, executes atomic `MERGE` |
| **Graph DB** | `sentinel_neo4j` | Neo4j 5.20 Community Edition | Primary graph system of record |

---

## 5. Quick Start (Local Setup)

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (for local UI development)
- Python 3.11+ (for local test runner)

### Running the Application

```bash
# 1. Clone repository
git clone https://github.com/Anguharikarthick17/DATA-SENTINEL.git
cd DATA-SENTINEL

# 2. Configure environment
cp .env.example .env
# Edit .env and set your NEO4J_PASSWORD

# 3. Start all services using Docker Compose
docker compose down -v
docker compose up --build

# 4. Access interfaces:
# - Web UI:       http://localhost:3000 (or http://localhost:80 in production)
# - FastAPI Docs: http://localhost:8000/docs
# - Neo4j Studio: http://localhost:7474
```

---

## 6. API Specification

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Probes active Kafka and Neo4j connectivity |
| `/ingest` | POST | Accepts CSV file upload (`multipart/form-data`) |
| `/status?job_id=...` | GET | Live telemetry, loaded rows, failed rows, throughput |
| `/chat` | POST | Grounded natural language query with 6-stage verification |
| `/analytics/datasets` | GET | Lists all uploaded datasets and loaded row counts |
| `/analytics/cross-relationships` | GET | Surfaces discovered shared entity linkages |
| `/analytics/health/{id}` | GET | Data health score, column quality breakdown |
| `/analytics/anomalies/{id}` | GET | IQR numeric outliers and categorical distribution skews |
| `/analytics/graph/{id}` | GET | Graph node and relationship payload for visualization |
| `/security/stats` | GET | Rate limiting metrics, latency percentiles, request audit |

---

## 7. Example Chatbot Queries

After uploading `data/demo.csv`, test these questions in the chat:

```text
1. "How many rows are in the dataset?"
   -> Grounded count from Neo4j (e.g., 100 rows)

2. "How many rows belong to Billing?"
   -> Filtered count (e.g., 47 rows, evaluated before generic count)

3. "How many customers are from Chennai?"
   -> Specific city location filter (e.g., 12 rows)

4. "Show customers from Chennai."
   -> Record retrieval returning individual matching rows

5. "Who was the Prime Minister of the UK in 1985?"
   -> Sentinel Anti-Hallucination Firewall blocks with grounded: false
      "I don't have that information in the uploaded data."
```

---

## 8. Automated GitHub Synchronization

Data Sentinel includes an automatic developer synchronization utility:

```bash
# Start background auto-sync watcher with 20-second debounce
./scripts/auto-push.sh
```

---

## 9. License & Engineering Submission
Built and verified for the Data Sentinel technical submission.  
*Self-Observing. Self-Verifying. Graph-Powered.*
