# Log Ingestion and Query Service

A high-performance log ingestion, querying, aggregation, and retention service built with TypeScript, Fastify, PostgreSQL, and Docker.

The service is designed to sustain high-volume log ingestion while keeping recent logs queryable and supporting time-based aggregations under concurrent load.

## Features

- Batch log ingestion with per-entry validation
- Partial batch acceptance
- PostgreSQL-backed durable storage
- Cursor-based pagination
- Filtering by service, level, time range, attributes, and message text
- Time-bucketed aggregation
- Aggregation grouping by service or level
- Minute-level aggregation rollups
- Daily PostgreSQL partitioning
- Automatic retention
- Parameterized SQL
- Zero-configuration Docker startup
- Automated tests
- GitHub Actions CI
- k6 performance testing

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
- Docker / Docker Compose

---

# Quick Start

Only Docker and Docker Compose are required.

Start the complete system:

```bash
docker compose up --build
```

The API becomes available at:

```text
http://localhost:8080
```

Check readiness:

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

The application connects to PostgreSQL, applies migrations and database maintenance, and only then starts accepting requests.

---

# API

## `GET /health`

Reports whether the application is ready.

```bash
curl http://localhost:8080/health
```

Response:

```json
{
  "status": "ok"
}
```

The service only reports healthy after its database dependency and startup work are ready.

---

## `POST /logs`

Ingests a batch of logs.

A batch containing one log is valid.

Example:

```bash
curl -X POST http://localhost:8080/logs \
  -H "Content-Type: application/json" \
  -d '{
    "logs": [
      {
        "timestamp": "2026-08-13T12:00:00Z",
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

Validation is performed independently for every entry.

A batch may therefore be partially accepted:

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

The request returns `400` when:

- all entries are invalid
- the JSON is malformed
- the top-level request structure is invalid

## Log Validation

| Field | Rules |
|---|---|
| `timestamp` | Required ISO 8601 timestamp, at most five minutes in the future |
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

## `GET /logs`

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

Response:

```json
{
  "logs": [
    {
      "id": "42",
      "timestamp": "2026-08-13T12:00:00.000Z",
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

The `id` acts as a deterministic tie-breaker for logs with the same timestamp.

Pagination uses an opaque cursor and keyset pagination.

The default page size is `100` and the maximum is `1000`.

### Query Semantics

```text
service       exact match
level         exact match
since         inclusive
until         exclusive
attr.<key>    string equality
q             case-insensitive message substring
```

Invalid query parameters return HTTP `400`.

---

## `GET /logs/aggregate`

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
  "http://localhost:8080/logs/aggregate?since=2026-08-13T10:00:00Z&until=2026-08-13T11:00:00Z&bucket=5m&service=checkout"
```

Example response:

```json
{
  "buckets": [
    {
      "start": "2026-08-13T10:00:00.000Z",
      "group": null,
      "count": "12500"
    }
  ]
}
```

Buckets are ordered by `start` ascending.

`since` is inclusive and `until` is exclusive.

When `group_by` is not supplied, `group` is `null`.

Empty buckets may be omitted.

---

# Architecture

```text
                         HTTP Clients
                              │
                              ▼
                          Fastify
                              │
          ┌───────────────────┼────────────────────┐
          ▼                   ▼                    ▼
      POST /logs          GET /logs       GET /logs/aggregate
          │                   │                    │
          ▼                   ▼                    ▼
      Validation          Query Builder      Aggregate Builder
          │                   │                    │
          ▼                   │             ┌──────┴──────┐
   Ingestion Repository       │             ▼             ▼
          │                   │          Rollups        Raw Logs
          └───────────────────┴──────────────┬─────────────┘
                                             ▼
                                           pg.Pool
                                             │
                                             ▼
                                         PostgreSQL
```

The code is separated into:

```text
Routes
  ↓
Validation / Services
  ↓
Query Builders / Repositories
  ↓
pg.Pool
  ↓
PostgreSQL
```

HTTP handlers remain focused on HTTP concerns while query construction and persistence are handled separately.

Raw PostgreSQL logs remain the source of truth.

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

Frequently used fields have dedicated relational columns:

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

This keeps each log represented by a single row while still supporting arbitrary flat attributes.

---

# Attribute Storage Strategy

Example attributes:

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
one row per log
native PostgreSQL JSONB support
```

Trade-off:

```text
arbitrary attribute filtering is more expensive than filtering
dedicated relational columns
```

For this reason, attributes are used for flexibility rather than as the primary physical organization of the table.

---

# Index Design

The main raw-log query pattern is:

```text
ORDER BY timestamp DESC, id DESC
```

The primary query index therefore follows the same ordering:

```sql
(timestamp DESC, id DESC)
```

This index supports:

- recent-log retrieval
- deterministic ordering
- cursor-based pagination
- timestamp range queries

The `id` column acts as a tie-breaker when several logs have identical timestamps.

Because the raw log table is partitioned by `timestamp`, PostgreSQL can also use partition pruning for bounded time-range queries.

The aggregation rollup table uses a primary key based on:

```text
(bucket_start, service, level)
```

This matches the rollup access pattern:

```text
time range
+
optional service
+
optional level
```

No large collection of speculative indexes is created because every extra index increases ingestion write cost.

The index strategy therefore prioritizes the required query patterns while keeping the ingestion hot path inexpensive.

---

# Cursor Pagination

`GET /logs` uses keyset pagination rather than `OFFSET`.

Ordering:

```text
timestamp DESC
id DESC
```

Conceptually, the next page continues after the final:

```text
(timestamp, id)
```

pair from the previous page.

Advantages over large offsets:

```text
stable pagination
predictable query cost
no need to repeatedly skip large numbers of rows
```

The cursor exposed to clients is opaque.

---

# Partitioning

Raw logs are stored in daily PostgreSQL range partitions using `timestamp`.

Conceptually:

```text
logs
├── logs_20260812
├── logs_20260813
├── logs_20260814
└── ...
```

Partitioning was chosen because the workload is naturally time-oriented.

Advantages:

```text
partition pruning for time-range queries
efficient retention
reduced DELETE overhead
less table bloat
```

---

# Retention

Retention duration is configurable through:

```text
RETENTION_DAYS
```

The default value is:

```text
30 days
```

Old daily partitions can be removed instead of deleting millions of expired rows individually.

This avoids the table bloat and vacuum pressure associated with large continuous `DELETE` operations.

Partition maintenance also prepares future daily partitions automatically.

---

# Ingestion Design

Each HTTP request contains a batch of logs.

The ingestion path is:

```text
HTTP batch
    ↓
per-entry validation
    ↓
valid / rejected split
    ↓
JSON serialization
    ↓
jsonb_to_recordset()
    ↓
raw log INSERT
    ↓
minute rollup update
    ↓
PostgreSQL commit
    ↓
HTTP response
```

Valid logs are passed to PostgreSQL as a JSON parameter and expanded with:

```sql
jsonb_to_recordset(...)
```

This replaced a large dynamically generated multi-row `VALUES` statement.

The approach greatly reduces the number of PostgreSQL parameters required for large batches.

The HTTP success response is sent only after PostgreSQL successfully completes the write.

---

# Validation Strategy

Validation runs on every incoming log, making it part of the ingestion hot path.

The implementation uses:

```text
lightweight field validation
+
strict ISO timestamp validation
```

This preserves the required contract while reducing CPU overhead compared with performing a complete object-schema parse for every log at high ingestion rates.

Each log is validated independently, allowing partial batch acceptance.

---

# Aggregation Design

Initially, aggregation queries operated directly on raw logs.

At approximately one million rows, `EXPLAIN ANALYZE` showed that the expensive part of the query was scanning and aggregating large numbers of raw rows.

To remove that bottleneck, the service maintains:

```text
log_rollups_minute
```

The rollup stores:

```text
bucket_start
service
level
count
```

Counts are maintained by minute, service, and level.

During ingestion, raw logs and their minute rollups are updated as part of the same database statement.

---

# Rollup Query Strategy

An aggregation that only depends on dimensions represented in the rollup can use the optimized path.

Supported rollup dimensions include:

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

## Exact Time Boundaries

Rollups represent complete minutes.

For a query such as:

```text
since = 10:00:37
until = 11:00:22
```

the service uses:

```text
raw logs     10:00:37 → 10:01:00

rollups      10:01:00 → 11:00:00

raw logs     11:00:00 → 11:00:22
```

This provides fast aggregation while preserving:

```text
since inclusive
until exclusive
```

semantics exactly.

---

# SQL Injection Protection

All user-controlled values are passed using PostgreSQL parameters.

Conceptually:

```sql
$1
$2
$3
```

User values are never directly interpolated into SQL text.

Dynamic choices such as:

```text
group_by=service
group_by=level
```

are mapped only to predefined application-controlled SQL expressions.

Attribute filters and text-search values are parameterized as well.

---

# Resource Limits

The Docker environment uses the project resource limits.

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

These limits are defined in `compose.yaml`.

---

# Testing

The project uses Vitest for automated testing.

Coverage includes:

```text
log validation
partial batch acceptance
malformed input
query validation
query filters
cursor pagination
invalid cursors
aggregation validation
aggregation query construction
rollup aggregation
database integration
SQL literal/injection cases
```

Run:

```bash
npm test
```

Type-check:

```bash
npm run typecheck
```

Build:

```bash
npm run build
```

---

# Continuous Integration

GitHub Actions is used for CI.

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
database migrations
    ↓
tests
```

The CI environment uses PostgreSQL for database-backed tests.

---

# Performance Testing

Performance testing is performed with k6 against the Dockerized application under the configured resource limits.

The main goals were:

```text
>= 15,000 logs/sec
no dropped accepted logs
queries remain responsive during ingestion
1 aggregation request/sec during ingestion
aggregation p95 < 1 second
```

---

# Performance Optimization Process

The initial implementation exposed several measurable bottlenecks.

The optimization path was:

```text
Initial implementation
        ↓
Disable request logging in production
        ↓
Replace large VALUES parameter lists
with jsonb_to_recordset()
        ↓
Reduce validation hot-path overhead
        ↓
Tune ingestion batch sizes
        ↓
Measure concurrent queries
        ↓
Identify raw aggregation scan bottleneck
        ↓
Introduce minute rollups
```

Optimizations were introduced only after load tests identified an actual bottleneck.

---

# Local Performance Results

## Final Concurrent Workload

The final local concurrent test ran for:

```text
60 seconds
```

with:

```text
18,000 logs/sec target ingestion
2 GET /logs requests/sec
1 GET /logs/aggregate request/sec
```

Results:

| Metric | Result |
|---|---:|
| Accepted logs | 1,081,500 |
| Measured ingestion rate | ~18,008 logs/sec |
| Ingestion errors | 0% |
| Query errors | 0% |
| Aggregation errors | 0% |
| HTTP failures | 0% |
| `GET /logs` p95 | ~13.56 ms |
| Aggregation p95 | ~12.41 ms |

The required aggregation target is:

```text
p95 < 1 second
```

The measured local result was approximately:

```text
12.41 ms p95
```

while ingestion and querying were active.

---

# Ingestion-Only Experiments

Higher ingestion rates were also tested to find the local saturation point.

The service successfully completed an ingestion-only test at a scheduled input rate of:

```text
27,000 logs/sec
```

without HTTP errors or dropped iterations, although latency increased as the system approached saturation.

A test targeting:

```text
30,000 logs/sec
```

accepted the scheduled logs but accumulated substantial latency and backlog.

For that reason, `30,000 logs/sec` is not reported as sustained throughput.

The primary performance result is the more representative concurrent workload:

```text
~18,000 logs/sec
+
2 queries/sec
+
1 aggregation/sec
```

---

# Dataset

The final concurrent test inserted:

```text
1,081,500 logs
```

during its 60-second run.

Additional tests were also performed around the million-row dataset size to investigate query and aggregation behavior.

Performance results depend on the host machine and Docker environment.

---

# Aggregation Optimization Result

Before rollups, concurrent raw aggregation became the main bottleneck.

During a heavy concurrent test, aggregation p95 reached approximately:

```text
37 seconds
```

An `EXPLAIN ANALYZE` of the raw aggregation showed that most of the cost came from scanning hundreds of thousands of raw rows.

After introducing minute rollups, a representative rollup aggregation plan completed in approximately:

```text
0.475 ms execution time
```

The final full concurrent HTTP benchmark measured:

```text
~12.41 ms aggregation p95
```

This includes the complete API request path rather than only PostgreSQL execution.

---

# Load Testing

Ingestion benchmark:

```bash
BATCH_SIZE=1500 \
RATE=12 \
DURATION=30s \
k6 run load-tests/ingestion.js
```

Concurrent system benchmark:

```bash
BATCH_SIZE=1500 \
INGESTION_RATE=12 \
DURATION=60s \
k6 run load-tests/system.js
```

With:

```text
BATCH_SIZE = 1500
INGESTION_RATE = 12 requests/sec
```

the target ingestion rate is:

```text
1500 × 12 = 18,000 logs/sec
```

Before repeated local benchmark runs, test data can be cleared with:

```bash
docker compose exec db \
  psql -U postgres -d log_ingestion \
  -c "TRUNCATE TABLE logs, log_rollups_minute RESTART IDENTITY;"
```

---

# Official Load Generator

The repository has been submitted to the official project load generator.

```text
Status: Pending
```

The official result will be added when the submitted benchmark completes.

---

# Performance Trade-offs

## JSONB Attributes

Advantage:

```text
flexibility without requiring a separate schema for every attribute
```

Trade-off:

```text
arbitrary dynamic-attribute queries may require raw-log scanning
```

## Daily Partitions

Advantage:

```text
efficient time pruning and retention
```

Trade-off:

```text
partition lifecycle management adds database complexity
```

## Aggregation Rollups

Advantage:

```text
dramatically reduces aggregation work for supported dimensions
```

Trade-off:

```text
adds derived database state and additional work to ingestion
```

## Large Batches

Advantage:

```text
fewer HTTP, database, and transaction overheads per log
```

Trade-off:

```text
larger individual requests and higher latency near saturation
```

---

# Known Limitations

Aggregation requests containing:

```text
q
attr.<key>
```

use the raw-log path rather than the minute rollup optimization.

Their performance therefore depends more directly on dataset size.

The current architecture uses:

```text
single application instance
single PostgreSQL instance
```

Horizontal application scaling, distributed storage, queues, replication, and external caches are intentionally outside the required core project scope.

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

Start only PostgreSQL for local development:

```bash
docker compose up -d db
```

Start the application in development mode:

```bash
npm run dev
```

Run migrations manually if required during local development:

```bash
npm run migrate
```

The development PostgreSQL container is exposed locally on:

```text
localhost:5433
```

---

# Optional Features

No optional features are enabled.

The project intentionally focuses on the required core API and performance targets.

---

# Final Status

```text
Core implementation       Complete
Automated tests           Complete
Local performance testing Complete
Docker setup              Complete
Documentation             Complete
Official benchmark        Pending
Demo/video                Pending
Final submission          Pending
```

---

# License

This project was developed as a final backend engineering project.