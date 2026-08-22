# Log Ingestion and Query Service

A high-performance backend service for ingesting, storing, querying, aggregating, and automatically retaining structured application logs.

The service is built with **Node.js, TypeScript, Fastify, PostgreSQL, and Docker**.

The primary performance requirement is to sustain at least **15,000 logs per second** while keeping log queries and aggregation responsive during ingestion.

---

## Features

- Batch log ingestion
- Independent per-log validation
- Partial batch acceptance
- Durable PostgreSQL storage
- Cursor-based pagination
- Filtering by service, level, time range, attributes, and message text
- Time-bucketed aggregation
- Aggregation grouping by service or level
- Compact minute-level aggregation rollups
- Cross-request ingestion batching
- Daily PostgreSQL partitioning
- Automatic retention
- Parameterized SQL
- Zero-configuration Docker startup
- Automated unit and integration tests
- GitHub Actions CI
- k6 load testing

---

## Tech Stack

- Node.js 22
- TypeScript
- Fastify
- PostgreSQL 18
- `pg`
- Zod
- `node-pg-migrate`
- Vitest
- k6
- Docker
- Docker Compose

---

## Quick Start

The default setup requires only Docker and Docker Compose.

Start the complete system with:

```bash
docker compose up -d --build
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

During startup the application performs:

```text
connect to PostgreSQL
        ↓
run database migrations
        ↓
perform partition maintenance
        ↓
start listening for requests
```

The service reports healthy only after the database connection, migrations, and startup maintenance are ready.

---

# API

## GET /health

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

## POST /logs

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

Each log is validated independently, so a batch may be partially accepted:

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

The request returns HTTP `400` when all entries are invalid, the JSON is malformed, or the top-level request structure is invalid.

### Log Validation

| Field | Rules |
|---|---|
| `timestamp` | Required valid ISO 8601 timestamp; cannot be more than five minutes in the future |
| `level` | `debug`, `info`, `warn`, or `error` |
| `service` | Required non-empty string |
| `message` | Required non-empty string |
| `attributes` | Optional flat object |

Attribute values may only be strings, numbers, or booleans. Nested objects and arrays are rejected.

---

## GET /logs

Queries stored logs.

Supported parameters:

- `service`
- `level`
- `since`
- `until`
- `attr.<key>`
- `q`
- `limit`
- `cursor`

Example:

```bash
curl "http://localhost:8080/logs?service=checkout&level=error&limit=100"
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

Default page size:

```text
100
```

Maximum page size:

```text
1000
```

### Query Semantics

| Parameter | Semantics |
|---|---|
| `service` | Exact match |
| `level` | Exact match |
| `since` | Inclusive |
| `until` | Exclusive |
| `attr.<key>` | String equality |
| `q` | Case-insensitive substring search in `message` |

Invalid query parameters return HTTP `400` with an `{ "error": "..." }` response.

---

## GET /logs/aggregate

Returns log counts grouped into time buckets.

Required parameters:

- `since`
- `until`
- `bucket`

Supported buckets:

- `1m`
- `5m`
- `1h`
- `1d`

Optional filters:

- `service`
- `level`
- `attr.<key>`
- `q`

Optional grouping:

- `group_by=service`
- `group_by=level`

Example:

```bash
curl "http://localhost:8080/logs/aggregate?since=2026-08-14T10:00:00Z&until=2026-08-14T11:00:00Z&bucket=5m&service=checkout"
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

`since` is inclusive and `until` is exclusive. When `group_by` is not provided, `group` is `null`. Empty buckets may be omitted.

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

| Column | Type |
|---|---|
| `id` | `BIGINT` |
| `timestamp` | `TIMESTAMPTZ` |
| `level` | `TEXT` |
| `service` | `TEXT` |
| `message` | `TEXT` |
| `attributes` | `JSONB` |

The design uses a hybrid relational + JSONB model.

Common fields have dedicated relational columns:

- `timestamp`
- `level`
- `service`
- `message`

Dynamic application-specific metadata is stored in:

```text
attributes JSONB
```

This keeps each log represented by one row while supporting arbitrary flat attributes.

---

## Attribute Storage Strategy

Example:

```json
{
  "user_id": "42",
  "attempt": 2,
  "cached": false
}
```

Advantages:

- Flexible schema
- Simple ingestion
- One row per log
- Native PostgreSQL JSONB support

Trade-off:

- Arbitrary dynamic-attribute queries are more expensive than queries against dedicated relational columns

Attributes are therefore used for flexibility rather than as the main physical organization of the log table.

---

# Index Design

The main raw-log access pattern is:

```sql
ORDER BY timestamp DESC, id DESC
```

The main pagination/time index follows the same ordering:

```text
(timestamp DESC, id DESC)
```

This supports:

- Recent-log retrieval
- Timestamp range queries
- Cursor pagination
- Deterministic ordering

A second query index is used for service-filtered queries:

```text
(service, timestamp DESC, id DESC)
```

This was added after profiling combined filters under ingestion load. It allows PostgreSQL to restrict by service while still serving results in the API's required timestamp/id order.

Because raw logs are partitioned by timestamp, PostgreSQL can also apply partition pruning to bounded time-range queries.

The project intentionally avoids unnecessary indexes because every additional index increases ingestion write cost.

---

# Cursor Pagination

`GET /logs` uses keyset pagination instead of `OFFSET`.

Ordering is based on:

```text
timestamp DESC
id DESC
```

The next page continues after the final `(timestamp, id)` pair returned by the previous page.

Advantages:

- Predictable query cost
- Stable pagination
- No repeated large `OFFSET` scans

The cursor exposed to API clients is opaque.

---

# Partitioning

Raw logs are stored using daily PostgreSQL range partitions based on timestamp.

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

- Partition pruning
- Efficient retention
- Reduced `DELETE` overhead
- Lower table bloat

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

- Long-running `DELETE` operations
- Table bloat
- `VACUUM` pressure
- Retention-related ingestion disruption

Partition maintenance also prepares future partitions automatically.

---

# Ingestion Design

Writing every small HTTP request directly to PostgreSQL creates too many database writes at high request rates.

The final design therefore uses a bounded cross-request ingestion batcher:

```text
HTTP request A ─┐
HTTP request B ─┤
HTTP request C ─┼─→ Cross-request batcher
HTTP request D ─┤          │
       ...      ─┘          ▼
                       up to ~1000 logs
                            │
                            ▼
                     PostgreSQL write
```

The final tuned configuration is:

| Setting | Value |
|---|---:|
| Target database batch size | `1000 logs` |
| Maximum batching delay | `50 ms` |
| Concurrent database batches | `1` |
| Maximum outstanding logs | `50,000` |
| Maximum outstanding requests | `2,000` |

The single database writer is intentional. PostgreSQL is capped at one CPU in the benchmark environment, and local measurements showed that increasing concurrent ingestion writers increased contention and reduced sustained throughput.

Combined batches reduce SQL execution, protocol, commit, index, and partition overhead per ingested log.

---

## Ingestion Durability

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

If a database write fails, requests belonging to that write are rejected rather than falsely acknowledged as successful.

The batcher also bounds outstanding work so an overloaded database cannot create an unlimited in-memory queue.

---

# PostgreSQL Write Strategy

Valid logs from multiple HTTP requests are combined and serialized as JSON.

PostgreSQL expands the JSON using:

```sql
jsonb_to_recordset(...)
```

This avoids generating thousands of individual SQL parameters.

The write path is:

```text
validated logs
      ↓
combined JSON parameter
      ↓
jsonb_to_recordset()
      ↓
INSERT raw logs
      ↓
UPSERT compact minute rollups
      ↓
statement completes
```

This reduces PostgreSQL protocol and query-construction overhead for large combined batches.

---

# Validation Strategy

Validation runs on every incoming log and is therefore part of the ingestion hot path.

The implementation uses lightweight field validation together with strict ISO timestamp validation.

This preserves the API contract while reducing CPU overhead compared with performing a complete object-schema parse for every log at very high throughput.

Each entry is still validated independently, allowing partial batch acceptance.

---

# Aggregation Design

The initial aggregation implementation operated directly on raw logs.

At approximately one million rows, raw aggregation became the main performance bottleneck.

Profiling showed that most of the query cost came from scanning large numbers of raw rows.

To avoid repeatedly scanning the raw dataset, the service maintains a compact minute-level rollup table:

```text
log_rollups_minute
```

Each rollup contains:

- `bucket_start`
- `service`
- `level`
- `count`

---

## Compact Minute Rollups

The final design stores one accumulated row for each:

```text
(bucket_start, service, level)
```

When new logs arrive for an existing key, the ingestion statement updates the existing count using an UPSERT.

Conceptually:

```text
10:00 checkout info 1450
10:00 checkout warn   120
10:00 billing  info   830
```

This keeps the rollup table compact and makes aggregation queries significantly cheaper.

Earlier experiments used append-only rollup deltas to avoid contention between concurrent ingestion writers. After performance tuning converged on a single database writer, that contention was no longer necessary to design around, so compact rollups became the better final strategy.

The raw logs table remains the source of truth.

---

## Rollup Query Strategy

Aggregations that only depend on dimensions represented in the rollup can use the optimized rollup path.

Supported dimensions include:

- Time
- Service
- Level

Queries containing:

- `q`
- `attr.<key>`

fall back to raw logs because arbitrary message contents and dynamic attributes cannot be pre-aggregated generically.

---

## Exact Aggregation Boundaries

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

```text
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

- Log validation
- Partial batch acceptance
- Malformed input
- Query validation
- Query filters
- Cursor pagination
- Invalid cursors
- Aggregation validation
- Aggregation queries
- Numeric aggregation counts
- Rollup behavior
- Database integration
- Cross-request batching
- Batch durability
- SQL injection cases

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

CI was verified passing after the final performance-related changes were pushed.

---

# Performance Requirements

The main required performance targets include:

- `>= 15,000 logs/sec` sustained ingestion
- No silent log loss
- No application crashes
- Queries remain usable during ingestion
- `1` aggregation request/sec during ingestion
- Aggregation `p95 < 1 second`

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
small HTTP batches causing too many database writes
        ↓
filtered queries scanning too much data
        ↓
too many concurrent ingestion writers for a 1-CPU PostgreSQL instance
```

The main optimizations were:

```text
disable production request logging
        ↓
use jsonb_to_recordset()
        ↓
optimize the validation hot path
        ↓
introduce minute-level rollups
        ↓
introduce cross-request ingestion batching
        ↓
add a service/timestamp/id query index
        ↓
tune combined database batches to ~1000 logs
        ↓
reduce maximum batching delay to 50 ms
        ↓
use one ingestion database writer
        ↓
use compact rollup UPSERTs
```

---

# Final Local Benchmark

The latest local benchmark was executed using the benchmark CLI with Docker runner mode.

Command:

```bash
npx --yes github:Ahmad-Abbas-Foothill/logs-benchmark-cli \
  --compose ./compose.yaml \
  --full \
  --seed 6122026 \
  --runner docker \
  --json benchmark-report.json \
  --generator-cpus 4
```

Latest successful local result:

| Metric | Result |
|---|---:|
| Correctness | `15.0 / 15` |
| Performance | `47.5 / 50` |
| Queries | `14.8 / 15` |
| Reliability | `20.0 / 20` |
| Total | `97.3 / 100` |
| Throughput | `14,999 logs/sec` |
| Error rate | `0.0%` |
| Request p95 | `90 ms` |
| Aggregate p95 | `9 ms` |
| Consistency | `4 / 4` |
| Machine speed | `0.34x reference` |

This is a **local benchmark result**, not an official platform score.

The benchmark tool also reports machine speed because performance points are hardware-dependent. On slower runs, the load generator itself became the limiting factor and could not schedule every requested iteration.

The final benchmark configuration therefore kept:

```text
--generator-cpus 4
```

On the same 8-CPU machine, increasing the generator to 6 CPUs caused host-level contention because the generator, application, PostgreSQL, Docker, and operating system were competing for the same CPU resources.

---

# Local Load Testing

The primary end-to-end k6 benchmark can be run with:

```bash
TARGET_LPS=15000 \
BATCH_SIZE=500 \
DURATION=60s \
SUMMARY_PATH=benchmark-summary.json \
k6 run load-tests/benchmark.js
```

To isolate only the publisher/write path:

```bash
PUBLISHER_ONLY=true \
TARGET_LPS=15000 \
BATCH_SIZE=500 \
DURATION=120s \
SUMMARY_PATH=publisher-summary.json \
k6 run load-tests/benchmark.js
```

The benchmark verifies:

- Scheduled throughput
- Request success
- Latency
- Dropped iterations
- Queries
- Aggregation
- Visibility
- Persistence consistency

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

- Flexible metadata
- One row per log
- Simple write path
- Native PostgreSQL support

Trade-off:

- Arbitrary attribute filtering is more expensive than filtering dedicated relational columns

---

## Daily Partitioning

Advantages:

- Efficient retention
- Partition pruning
- Reduced deletion overhead

Trade-off:

- Partition lifecycle management adds database complexity

---

## Compact Rollups

Advantages:

- Very fast aggregation
- Much less raw-log scanning
- Small derived aggregation dataset
- Stable aggregation during ingestion

Trade-off:

- Additional derived database state
- Additional ingestion work
- Requires maintaining consistency between raw writes and rollup updates

---

## Cross-Request Batching

Advantages:

- Far fewer PostgreSQL writes
- Better sustained throughput
- Durable acknowledgement semantics preserved

Trade-off:

- Adds bounded queueing latency
- Requires in-memory coordination
- Adds batching complexity

---

## Single Ingestion Database Writer

The final configuration intentionally uses one ingestion database batch at a time.

Advantages:

- Reduces PostgreSQL contention
- Matches the 1-CPU database constraint
- Improves sustained ingestion throughput

Trade-off:

- Less database-write parallelism
- A large or slow write can delay later queued requests

---

# Known Limitations

Aggregation requests containing:

```text
q
attr.<key>
```

use the raw-log aggregation path rather than the rollup optimization.

Their performance therefore depends more directly on raw dataset size.

The application and PostgreSQL share a fixed resource budget. Under very long end-to-end workloads, concurrent reads and aggregation reduce ingestion headroom compared with publisher-only ingestion.

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

| Area | Status |
|---|---|
| Core API | Complete |
| Database | Complete |
| Validation | Complete |
| Querying | Complete |
| Aggregation | Complete |
| Retention | Complete |
| Cross-request batching | Complete |
| Query optimization | Complete |
| Compact rollups | Complete |
| Automated tests | Complete |
| CI | Passing |
| Docker setup | Complete |
| Local performance testing | Complete |
| Final video | Pending |
| Final submission | Pending |

---

# License

This project was developed as a final backend engineering project.