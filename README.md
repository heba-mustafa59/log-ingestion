# Log Ingestion and Query Service

A high-performance backend service for ingesting, storing, querying, aggregating, and automatically retaining structured application logs.

The service is built with Node.js, TypeScript, Fastify, PostgreSQL, and Docker.

The main performance requirement is to sustain at least **15,000 logs per second** while keeping log queries and aggregation responsive during ingestion.

---

# Features

- Batch log ingestion
- Independent per-log validation
- Partial batch acceptance
- Durable PostgreSQL storage
- Cursor-based pagination
- Filtering by service, level, time range, attributes, and message text
- Time-bucketed aggregation
- Aggregation grouping by service or level
- Minute-level aggregation rollups
- Cross-request ingestion batching
- Daily PostgreSQL partitioning
- Automatic retention
- Parameterized SQL
- Zero-configuration Docker startup
- Automated unit and integration tests
- GitHub Actions CI
- k6 load testing

---

# Tech Stack

- Node.js 22
- TypeScript
- Fastify
- PostgreSQL 18
- `pg`
- Zod
- node-pg-migrate
- Vitest
- k6
- Docker
- Docker Compose

---

# Quick Start

The default setup requires only Docker and Docker Compose.

Start the complete system with:

```bash
docker compose up
```

The API is exposed at:

```text
http://localhost:8080
```

Check service readiness:

```bash
curl http://localhost:8080/health
```

Expected response:

```json
{
  "status": "ok"
}
```

No `.env` file, command-line arguments, or manual database setup are required for the default configuration.

During startup the application:

```text
connects to PostgreSQL
        ↓
runs database migrations
        ↓
performs partition maintenance
        ↓
starts listening for requests
```

The application only becomes available after its database dependencies and startup work are ready.

---

# API

## `GET /health`

Reports whether the service is ready.

```bash
curl http://localhost:8080/health
```

Response:

```json
{
  "status": "ok"
}
```

---

## `POST /logs`

Ingests a batch of logs.

A batch containing a single log is valid.

Example:

```bash
curl -X POST http://localhost:8080/logs \
  -H "Content-Type: application/json" \
  -d '{
    "logs": [
      {
        "timestamp": "2026-08-14T10:00:00Z",
        "level": "info",
        "service": "checkout",
        "message": "payment processed",
        "attributes": {
          "user_id": "42",
          "retry_count": 1,
          "cached": false
        }
      }
    ]
  }'
```

Successful response:

```json
{
  "accepted": 1,
  "rejected": []
}
```

Each log is validated independently.

A batch can therefore be partially accepted:

```json
{
  "accepted": 2,
  "rejected": [
    {
      "index": 1,
      "reason": "invalid level"
    }
  ]
}
```

The request returns HTTP `400` when:

```text
all entries are invalid
the JSON is malformed
the top-level request structure is invalid
```

### Log Validation

| Field | Rules |
|---|---|
| `timestamp` | Required valid ISO 8601 timestamp; cannot be more than five minutes in the future |
| `level` | `debug`, `info`, `warn`, or `error` |
| `service` | Required non-empty string |
| `message` | Required non-empty string |
| `attributes` | Optional flat object |

Attribute values may only be:

```text
string
number
boolean
```

Nested objects and arrays are rejected.

---

# `GET /logs`

Queries stored logs.

Supported parameters:

```text
service
level
since
until
attr.<key>
q
limit
cursor
```

Example:

```bash
curl \
  "http://localhost:8080/logs?service=checkout&level=error&limit=100"
```

Example response:

```json
{
  "logs": [
    {
      "id": "42",
      "timestamp": "2026-08-14T10:00:00.000Z",
      "level": "error",
      "service": "checkout",
      "message": "payment failed",
      "attributes": {
        "region": "eu"
      }
    }
  ],
  "next_cursor": null
}
```

Logs are ordered by:

```text
timestamp DESC
id DESC
```

The `id` acts as a deterministic tie-breaker when multiple logs have the same timestamp.

Pagination uses opaque cursor-based keyset pagination.

The default page size is:

```text
100
```

The maximum page size is:

```text
1000
```

### Query Semantics

```text
service       exact match
level         exact match
since         inclusive
until         exclusive
attr.<key>    string equality
q             case-insensitive substring search in message
```

Invalid query parameters return HTTP `400`.

---

# `GET /logs/aggregate`

Returns log counts grouped into time buckets.

Required parameters:

```text
since
until
bucket
```

Supported buckets:

```text
1m
5m
1h
1d
```

Optional filters:

```text
service
level
attr.<key>
q
```

Optional grouping:

```text
group_by=service
group_by=level
```

Example:

```bash
curl \
  "http://localhost:8080/logs/aggregate?since=2026-08-14T10:00:00Z&until=2026-08-14T11:00:00Z&bucket=5m&service=checkout"
```

Example response:

```json
{
  "buckets": [
    {
      "start": "2026-08-14T10:00:00.000Z",
      "group": null,
      "count": 12500
    }
  ]
}
```

Buckets are ordered by `start` ascending.

`since` is inclusive.

`until` is exclusive.

When `group_by` is not provided:

```json
"group": null
```

Empty buckets may be omitted.

---

# Architecture

```text
                           HTTP Clients
                                │
                                ▼
                            Fastify
                                │
           ┌────────────────────┼─────────────────────┐
           │                    │                     │
           ▼                    ▼                     ▼
       POST /logs           GET /logs        GET /logs/aggregate
           │                    │                     │
           ▼                    ▼                     ▼
       Validation          Query Builder        Aggregate Builder
           │                    │                     │
           ▼                    │              ┌──────┴──────┐
 Cross-request Batcher          │              │             │
           │                    │              ▼             ▼
           ▼                    │          Rollup Path    Raw Path
    Ingestion Repository        │              │             │
           └────────────────────┴──────────────┴──────┬──────┘
                                                      ▼
                                                   pg.Pool
                                                      │
                                                      ▼
                                                 PostgreSQL
```

The application separates HTTP handling from validation, batching, query construction, and persistence.

The main layers are:

```text
Routes
  ↓
Validation / Services
  ↓
Batching / Query Builders / Repositories
  ↓
pg.Pool
  ↓
PostgreSQL
```

PostgreSQL remains the source of truth for raw logs.

---

# Database Schema

Raw logs contain:

```text
id          BIGINT
timestamp   TIMESTAMPTZ
level       TEXT
service     TEXT
message     TEXT
attributes  JSONB
```

The design uses a hybrid relational + JSONB model.

Common fields have dedicated relational columns:

```text
timestamp
level
service
message
```

Dynamic application-specific metadata is stored in:

```text
attributes JSONB
```

This keeps each log represented by one row while supporting arbitrary flat attributes.

---

# Attribute Storage Strategy

Example:

```json
{
  "user_id": "42",
  "attempt": 2,
  "cached": false
}
```

Advantages:

```text
flexible schema
simple ingestion
one database row per log
native PostgreSQL JSONB support
```

Trade-off:

```text
arbitrary dynamic-attribute queries are more expensive
than queries against dedicated relational columns
```

Attributes are therefore used for flexibility rather than as the main physical organization of the log table.

---

# Index Design

The main raw-log access pattern is:

```text
ORDER BY timestamp DESC, id DESC
```

The main query index follows the same ordering:

```sql
(timestamp DESC, id DESC)
```

This supports:

```text
recent-log retrieval
timestamp range queries
cursor pagination
deterministic ordering
```

Because raw logs are partitioned by timestamp, PostgreSQL can also apply partition pruning to bounded time-range queries.

The rollup table uses a lookup index on:

```text
(bucket_start, service, level)
```

This matches its primary query pattern:

```text
time range
+
optional service filter
+
optional level filter
```

The project intentionally avoids creating unnecessary indexes because every additional index increases ingestion write cost.

---

# Cursor Pagination

`GET /logs` uses keyset pagination instead of `OFFSET`.

Ordering is based on:

```text
timestamp DESC
id DESC
```

The next page continues after the final:

```text
(timestamp, id)
```

pair returned by the previous page.

Advantages:

```text
predictable query cost
stable pagination
no need to repeatedly skip large numbers of rows
```

The cursor exposed to API clients is opaque.

---

# Partitioning

Raw logs are stored using daily PostgreSQL range partitions based on `timestamp`.

Conceptually:

```text
logs
├── logs_20260813
├── logs_20260814
├── logs_20260815
└── ...
```

Daily partitioning was chosen because both querying and retention are naturally time-oriented.

Advantages include:

```text
partition pruning
efficient retention
reduced DELETE overhead
lower table bloat
```

---

# Retention

Retention duration is configurable through:

```text
RETENTION_DAYS
```

The default value is:

```text
30
```

Expired daily partitions can be dropped instead of deleting millions of individual rows.

This reduces:

```text
long-running DELETE operations
table bloat
VACUUM pressure
retention-related ingestion disruption
```

Partition maintenance also prepares future partitions automatically.

---

# Ingestion Design

The original ingestion implementation wrote each HTTP request directly to PostgreSQL.

That performs well when HTTP requests contain large batches, but the official load generator sends many small requests at a very high request rate.

A representative official-style workload is approximately:

```text
33 logs/request
×
455 requests/sec
≈
15,015 logs/sec
```

Sending every small HTTP request to PostgreSQL independently creates hundreds of database writes per second.

To reduce that overhead, the final design uses a bounded cross-request ingestion batcher.

```text
HTTP request A ─┐
HTTP request B ─┤
HTTP request C ─┼─→ Cross-request batcher
HTTP request D ─┤          │
       ...      ─┘          ▼
                       ~1000 logs
                            │
                            ▼
                      PostgreSQL write
```

The current tuning uses:

```text
Target database batch size:      1000 logs
Concurrent database batches:     2
Short tail delay for batching
Bounded outstanding queue
```

This allows hundreds of small HTTP requests to be coalesced into far fewer PostgreSQL writes.

---

# Ingestion Durability

Cross-request batching does not change durability semantics.

An HTTP request waits for the database batch containing its logs to complete.

```text
HTTP request
     ↓
validation
     ↓
batch queue
     ↓
combined PostgreSQL write
     ↓
database success
     ↓
request Promise resolves
     ↓
HTTP 200
```

The service does not return `200` before PostgreSQL successfully accepts the corresponding logs.

If a database write fails, requests belonging to that write are not falsely acknowledged as successful.

The batcher also bounds outstanding work so an overloaded database cannot create an unlimited in-memory queue.

---

# PostgreSQL Write Strategy

Valid logs from multiple HTTP requests are combined and serialized as JSON.

PostgreSQL expands the JSON using:

```sql
jsonb_to_recordset(...)
```

This avoids generating thousands of individual SQL parameters.

The general write path is:

```text
validated logs
      ↓
JSON parameter
      ↓
jsonb_to_recordset()
      ↓
INSERT raw logs
      ↓
append rollup deltas
      ↓
statement completes
```

This significantly reduces PostgreSQL protocol and query-construction overhead for large combined batches.

---

# Validation Strategy

Validation runs on every incoming log and is therefore part of the ingestion hot path.

The implementation uses:

```text
lightweight field validation
+
strict ISO timestamp validation
```

This preserves the API contract while reducing CPU overhead compared with performing a complete object-schema parse for every log at very high throughput.

Each entry is still validated independently, allowing partial batch acceptance.

---

# Aggregation Design

The initial aggregation implementation operated directly on raw logs.

At approximately one million rows, raw aggregation became the main performance bottleneck.

An `EXPLAIN ANALYZE` showed that most of the query cost came from scanning hundreds of thousands of raw rows.

To avoid repeatedly scanning the full raw dataset, the service maintains a minute-level rollup table:

```text
log_rollups_minute
```

Each rollup delta contains:

```text
bucket_start
service
level
count
```

---

# Append-Only Rollups

The first rollup implementation used one row for each:

```text
(bucket_start, service, level)
```

and updated that row using:

```sql
ON CONFLICT DO UPDATE
```

Under concurrent ingestion, multiple database writers can attempt to update the same current-minute rollup row.

The final implementation instead stores append-only rollup deltas.

Example:

```text
10:00 checkout info 450
10:00 checkout info 520
10:00 checkout info 480
```

Aggregation combines these rows using:

```sql
SUM(count)
```

This avoids requiring every concurrent ingestion batch to update the same rollup row.

The rollup table therefore contains derived data, while the raw `logs` table remains the source of truth.

---

# Rollup Query Strategy

Aggregations that only depend on dimensions represented in the rollup can use the optimized rollup path.

Supported dimensions include:

```text
time
service
level
```

Queries containing:

```text
q
attr.<key>
```

fall back to raw logs because arbitrary message contents and dynamic attributes cannot be pre-aggregated generically.

---

# Exact Aggregation Boundaries

Rollups represent complete minutes.

For example:

```text
since = 10:00:37
until = 11:00:22
```

the query can use:

```text
raw logs     10:00:37 → 10:01:00

rollups      10:01:00 → 11:00:00

raw logs     11:00:00 → 11:00:22
```

This preserves the required semantics:

```text
since inclusive
until exclusive
```

while still using rollups for the majority of the range.

---

# SQL Injection Protection

All user-controlled values are passed through PostgreSQL parameters.

Conceptually:

```sql
$1
$2
$3
```

User values are not directly interpolated into SQL text.

Dynamic options such as:

```text
group_by=service
group_by=level
```

are mapped only to predefined application-controlled SQL expressions.

Attribute filters and message-search values are parameterized as well.

---

# Resource Limits

The Docker environment applies the required resource limits.

Application:

```text
CPU: 0.5
RAM: 256 MB
```

PostgreSQL:

```text
CPU: 1
RAM: 1 GB
```

The limits are defined in:

```text
compose.yaml
```

---

# Testing

The project uses Vitest for automated testing.

The test suite covers areas including:

```text
log validation
partial batch acceptance
malformed input
query validation
query filters
cursor pagination
invalid cursors
aggregation validation
aggregation queries
numeric aggregation counts
rollup behavior
database integration
cross-request batching
batch durability
SQL injection cases
```

Run all tests:

```bash
npm test
```

Run TypeScript validation:

```bash
npm run typecheck
```

Build:

```bash
npm run build
```

---

# Continuous Integration

GitHub Actions runs automated validation for repository changes.

The pipeline performs:

```text
checkout
    ↓
Node.js setup
    ↓
npm ci
    ↓
typecheck
    ↓
build
    ↓
PostgreSQL migrations
    ↓
automated tests
```

The final CI workflow was verified successfully before the latest official benchmark submission.

---

# Performance Requirements

The main required performance targets include:

```text
>= 15,000 logs/sec sustained ingestion
no silent log loss
no application crashes
queries remain usable during ingestion
1 aggregation request/sec during ingestion
aggregation p95 < 1 second
```

---

# Performance Investigation

Performance work was driven by measurements rather than assumptions.

Major bottlenecks discovered during development included:

```text
production HTTP logging overhead
        ↓
large PostgreSQL parameter lists
        ↓
per-log validation overhead
        ↓
raw aggregation scans
        ↓
small-batch/high-request-rate database overhead
```

The main optimizations were:

```text
disable production request logging
        ↓
use jsonb_to_recordset()
        ↓
optimize validation hot path
        ↓
introduce minute rollups
        ↓
introduce cross-request ingestion batching
        ↓
tune combined DB batches for official-style traffic
```

---

# Official-Style Local Benchmark

The final local benchmark was configured to closely reproduce the shape of the official load-generator workload.

Configuration:

```text
Duration:                 120 seconds

HTTP batch size:          33 logs/request
Ingestion request rate:   455 requests/sec

Target ingestion rate:    15,015 logs/sec

GET /logs rate:           2 requests/sec
Aggregation rate:         1 request/sec
```

Final results:

| Metric | Result |
|---|---:|
| Accepted logs | 1,801,800 |
| Scheduled ingestion rate | 15,015 logs/sec |
| Dropped iterations | 0 |
| Ingestion errors | 0% |
| Query errors | 0% |
| Aggregation errors | 0% |
| HTTP failures | 0% |
| Ingestion p95 | ~133.35 ms |
| `GET /logs` p95 | ~82.87 ms |
| Aggregation p95 | ~82.14 ms |

Every scheduled ingestion request completed successfully during the two-minute test.

The complete scheduled log count was:

```text
15,015 logs/sec
×
120 seconds
=
1,801,800 logs
```

All `1,801,800` logs were accepted.

---

# Aggregation Optimization Result

Before rollups, aggregation became the main bottleneck during concurrent ingestion.

A previous concurrent test produced aggregation p95 latency of approximately:

```text
37 seconds
```

Profiling showed that raw aggregation was scanning hundreds of thousands of raw rows.

After introducing minute-level aggregation rollups, a representative PostgreSQL rollup query executed in approximately:

```text
0.475 ms
```

The final complete HTTP benchmark measured:

```text
Aggregation p95 ≈ 82.14 ms
```

while approximately `15,000 logs/sec` were being ingested concurrently.

---

# Official Load Generator

An initial official benchmark exposed an important difference between the original local benchmark and the official workload.

The original local test used relatively large HTTP batches.

The official grader instead generated a much higher HTTP request rate using small batches.

That caused PostgreSQL to receive too many small writes.

This finding motivated the cross-request ingestion batcher used in the final implementation.

A new official benchmark has been submitted using the optimized implementation.

```text
Status: Pending
```

The final official benchmark result will be added when the current submission completes.

---

# Local Load Testing

The project includes k6 scenarios for ingestion and official-style concurrent testing.

Example ingestion test:

```bash
BATCH_SIZE=33 \
RATE=455 \
DURATION=10s \
k6 run load-tests/ingestion.js
```

Official-style concurrent test:

```bash
BATCH_SIZE=33 \
REQUEST_RATE=455 \
DURATION=120s \
k6 run load-tests/LG-same.js
```

The concurrent scenario runs:

```text
455 POST requests/sec
2 GET /logs requests/sec
1 aggregation request/sec
```

---

# Cleaning Local Benchmark Data

Repeated performance tests can generate millions of rows.

Local benchmark data can be cleared with:

```bash
docker compose exec db \
  psql -U postgres -d log_ingestion \
  -c "TRUNCATE TABLE logs, log_rollups_minute RESTART IDENTITY;"
```

---

# Design Trade-offs

## JSONB Attributes

Advantages:

```text
flexible metadata
one row per log
simple write path
native PostgreSQL support
```

Trade-off:

```text
arbitrary attribute filtering is more expensive
than filtering dedicated relational columns
```

## Daily Partitioning

Advantages:

```text
efficient retention
partition pruning
reduced deletion overhead
```

Trade-off:

```text
partition lifecycle management adds database complexity
```

## Rollups

Advantages:

```text
very fast aggregation
less raw-log scanning
more stable aggregation during ingestion
```

Trade-off:

```text
additional derived database state
additional ingestion writes
```

## Cross-Request Batching

Advantages:

```text
far fewer PostgreSQL writes
handles high HTTP request rates efficiently
preserves durable acknowledgement semantics
```

Trade-off:

```text
adds short queueing latency
requires bounded in-memory coordination
adds batching complexity
```

## Multiple Database Batch Writers

The final configuration allows two combined ingestion batches to execute concurrently.

This provides a balance between:

```text
database throughput
request latency
query availability
PostgreSQL contention
```

---

# Known Limitations

Aggregation requests containing:

```text
q
attr.<key>
```

use the raw-log aggregation path rather than the rollup optimization.

Their performance therefore depends more directly on raw dataset size.

The current architecture uses:

```text
one application instance
one PostgreSQL instance
```

Horizontal application scaling, distributed databases, message queues, replication, and external caches are intentionally outside the required core project scope.

---

# Project Structure

```text
.
├── .github/
│   └── workflows/
├── docs/
├── load-tests/
├── migrations/
├── src/
│   ├── config/
│   ├── database/
│   ├── logs/
│   ├── routes/
│   ├── app.ts
│   └── server.ts
├── test/
├── compose.yaml
├── Dockerfile
├── package.json
├── tsconfig.json
└── README.md
```

---

# Development

Install dependencies:

```bash
npm ci
```

Start PostgreSQL:

```bash
docker compose up -d db
```

Start the application in development mode:

```bash
npm run dev
```

Run database migrations manually during development if required:

```bash
npm run migrate
```

The development PostgreSQL container is exposed at:

```text
localhost:5433
```

---

# Optional Features

No optional features are currently enabled.

The project intentionally focuses on the required core API, reliability, retention, and performance requirements.

---

# Current Project Status

```text
Core API                   Complete
Database                   Complete
Validation                 Complete
Querying                    Complete
Aggregation                 Complete
Retention                   Complete
Cross-request batching      Complete
Automated tests             Complete
CI                          Passing
Docker setup                Complete
Local performance testing   Complete
Official benchmark          Pending
Final video                 Pending
Final submission            Pending
```

---

# License

This project was developed as a final backend engineering project.