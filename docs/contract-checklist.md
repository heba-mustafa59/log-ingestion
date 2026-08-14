# Contract Checklist

This checklist tracks all required behavior of the Log Ingestion and Query Service.

A requirement is marked complete only when it has been implemented and verified.

---

# 1. Required Endpoints

- [x] `GET /health`
- [x] `POST /logs`
- [x] `GET /logs`
- [x] `GET /logs/aggregate`

---

# 2. Infrastructure

- [x] Application listens on port `8080` inside the application container
- [x] Application listens on `0.0.0.0`
- [x] Application is exposed as `localhost:8080`
- [x] PostgreSQL is the source of truth for reads and writes
- [x] Complete system starts with `docker compose up`
- [x] Default setup requires no `.env` file
- [x] Default setup requires no command-line arguments
- [x] Default setup requires no manual setup
- [x] Database migrations run automatically on startup

## Resource Limits

- [x] Application works within `0.5 CPU`
- [x] Application works within `256 MB RAM`
- [x] PostgreSQL works within `1 CPU`
- [x] PostgreSQL works within `1 GB RAM`

---

# 3. Health Endpoint

## `GET /health`

- [x] Endpoint exists at exactly `GET /health`
- [x] Returns HTTP `200` when the service is ready
- [x] Database connection is established before reporting healthy
- [x] Database migrations are applied before reporting healthy
- [x] Service is ready to accept logs before reporting healthy

---

# 4. Log Ingestion

## `POST /logs`

### Request Structure

- [x] Endpoint exists at exactly `POST /logs`
- [x] Request body contains a top-level `logs` array
- [x] Endpoint always accepts a batch
- [x] A batch containing one log is valid

### Timestamp Validation

- [x] `timestamp` is required
- [x] `timestamp` must be a valid ISO 8601 timestamp
- [x] `timestamp` must not be more than five minutes in the future

### Level Validation

- [x] `level` is required
- [x] `level=debug` is accepted
- [x] `level=info` is accepted
- [x] `level=warn` is accepted
- [x] `level=error` is accepted
- [x] Unsupported levels are rejected

### Service Validation

- [x] `service` is required
- [x] `service` must be a string
- [x] `service` must not be empty

### Message Validation

- [x] `message` is required
- [x] `message` must be a string
- [x] `message` must not be empty

### Attributes Validation

- [x] `attributes` is optional
- [x] `attributes` must be an object when provided
- [x] Attributes must be flat
- [x] String attribute values are accepted
- [x] Number attribute values are accepted
- [x] Boolean attribute values are accepted
- [x] Nested objects are rejected
- [x] Arrays are rejected

### Batch Behavior

- [x] Each log entry is validated independently
- [x] Invalid entries do not cause valid entries to fail
- [x] Valid entries are stored
- [x] Invalid entries are rejected
- [x] Rejected entries include their original array index
- [x] Rejected entries include a rejection reason

### Response Behavior

- [x] HTTP `200` is returned when at least one entry is accepted
- [x] HTTP `400` is returned when all entries are rejected
- [x] HTTP `400` is returned for malformed JSON
- [x] HTTP `400` is returned when the top-level request structure is invalid
- [x] Response contains an `accepted` count
- [x] Response contains a `rejected` array
- [x] Response structure matches the required contract

### Durability

- [x] A successful response is returned only for logs durably accepted
- [x] The service never returns `200` for a batch it has not durably accepted

---

# 5. Log Querying

## `GET /logs`

### Filters

- [x] All query filters are optional
- [x] Filters may be freely combined

### `service`

- [x] Supports exact service-name matching

### `level`

- [x] Supports exact level matching
- [x] Unsupported levels return HTTP `400`

### `since`

- [x] Supports an inclusive start timestamp
- [x] Invalid timestamps return HTTP `400`

### `until`

- [x] Supports an exclusive end timestamp
- [x] Invalid timestamps return HTTP `400`
- [x] Invalid time ranges return HTTP `400`

### `attr.<key>`

- [x] Supports arbitrary attribute keys
- [x] Attribute equality is compared as strings

### `q`

- [x] Searches the `message`
- [x] Uses case-insensitive substring matching

### `limit`

- [x] Default limit is `100`
- [x] Maximum limit is `1000`
- [x] Non-numeric limits return HTTP `400`
- [x] Limits outside the supported range return HTTP `400`

### `cursor`

- [x] Supports cursor-based pagination
- [x] Cursor is opaque to clients
- [x] Invalid cursors return HTTP `400`
- [x] Malformed cursors return HTTP `400`

### Sorting

- [x] Results are sorted by timestamp descending
- [x] Ordering remains deterministic when timestamps are equal

### Response

- [x] Response contains a `logs` array
- [x] Every returned log contains a unique `id`
- [x] Response contains `next_cursor`
- [x] `next_cursor` can be passed back unchanged
- [x] `next_cursor` is `null` when no more results exist

### Errors

- [x] Invalid query parameters return HTTP `400`
- [x] Invalid query responses use `{ "error": "<description>" }`

---

# 6. Aggregation

## `GET /logs/aggregate`

### Shared Filters

- [x] Supports `service`
- [x] Supports `level`
- [x] Supports `attr.<key>`
- [x] Supports `q`

### Time Range

- [x] `since` is required
- [x] `since` is inclusive
- [x] `until` is required
- [x] `until` is exclusive
- [x] Invalid ranges return HTTP `400`

### Bucket

- [x] `bucket` is required
- [x] Supports `1m`
- [x] Supports `5m`
- [x] Supports `1h`
- [x] Supports `1d`
- [x] Unsupported buckets return HTTP `400`

### Grouping

- [x] `group_by` is optional
- [x] Supports `group_by=service`
- [x] Supports `group_by=level`
- [x] Unsupported `group_by` values return HTTP `400`
- [x] `group` is `null` when `group_by` is not provided

### Response

- [x] Returns one row per bucket/group combination
- [x] Results are ordered by bucket start ascending
- [x] Empty buckets may be omitted
- [x] Each result contains `start`
- [x] Each result contains `group`
- [x] Each result contains `count`
- [x] Invalid parameters return HTTP `400`
- [x] Errors use `{ "error": "<description>" }`

---

# 7. Retention

- [x] Retention duration is configurable
- [x] Expired logs are deleted automatically
- [x] Retention strategy is documented
- [x] Expired-data deletion avoids long-running row deletes where possible
- [x] Retention avoids excessive table bloat through partition dropping
- [x] Retention is designed to avoid significant ingestion disruption
- [x] Retention is designed to avoid significant query disruption

---

# 8. Security

- [x] SQL queries use parameterized values
- [x] Dynamic query construction is safe
- [x] User input is never directly concatenated into SQL
- [x] Attribute filters cannot produce SQL injection
- [x] Sorting/filter construction cannot produce SQL injection

---

# 9. Reliability

- [x] Malformed input is handled without application crashes
- [x] Validation failures return appropriate HTTP errors
- [x] Invalid cursors are handled safely
- [x] Invalid query ranges are handled safely
- [x] Empty query results are handled correctly
- [x] Sustained ingestion does not crash the application
- [x] Accepted logs are not silently dropped

---

# 10. Performance

## Ingestion

- [x] Sustains at least `15,000 logs/second`
- [x] Avoids dropped requests during the final sustained local ingestion test
- [x] Avoids application crashes during sustained ingestion

## Dataset

- [x] Handles approximately `1,000,000` stored logs
- [ ] Performance tested using a dataset distributed across approximately one month

## Queries

- [x] Main aggregation query is under `1 second p95`
- [x] Queries remain performant while ingestion is active
- [x] Newly ingested data is queryable within `20 seconds`
- [x] Supports `1 aggregation request/second` during ingestion testing

## Performance Testing

- [x] Local load testing is performed before submission
- [ ] Official load generator result completed
- [x] Performance bottlenecks are identified
- [x] Optimizations are based on measurements

### Final Local Concurrent Result

```text
Duration:                 60 seconds
Target ingestion:         18,000 logs/sec
Accepted logs:            1,081,500
Measured ingestion rate:  ~18,008 logs/sec

GET /logs rate:           2 requests/sec
Aggregation rate:         1 request/sec

Ingestion errors:         0%
Query errors:             0%
Aggregation errors:       0%
HTTP failures:            0%

GET /logs p95:            ~13.56 ms
Aggregation p95:          ~12.41 ms