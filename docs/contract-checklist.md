# Contract Checklist

This checklist tracks all required behavior of the Log Ingestion and Query Service.

A requirement should only be marked complete when it has been:

- Understood
- Implemented
- Tested
- Documented where appropriate

---

# 1. Required Endpoints

- [ ] `GET /health`
- [ ] `POST /logs`
- [ ] `GET /logs`
- [ ] `GET /logs/aggregate`

---

# 2. Infrastructure

- [ ] Application listens on port `8080` inside the application container
- [ ] Application listens on `0.0.0.0`
- [ ] Application is exposed as `localhost:8080`
- [ ] PostgreSQL is the source of truth for reads and writes
- [ ] Complete system starts with `docker compose up`
- [ ] Default setup requires no `.env` file
- [ ] Default setup requires no command-line arguments
- [ ] Default setup requires no manual setup
- [ ] Database migrations run automatically on startup

## Resource Limits

- [ ] Application works within `0.5 CPU`
- [ ] Application works within `256 MB RAM`
- [ ] PostgreSQL works within `1 CPU`
- [ ] PostgreSQL works within `1 GB RAM`

---

# 3. Health Endpoint

## `GET /health`

- [ ] Endpoint exists at exactly `GET /health`
- [ ] Returns HTTP `200` when the service is ready
- [ ] Database connection is established before reporting healthy
- [ ] Database migrations are applied before reporting healthy
- [ ] Service is ready to accept logs before reporting healthy

---

# 4. Log Ingestion

## `POST /logs`
- [x] Endpoint exists at exactly `POST /logs`
- [x] Request body contains a top-level `logs` array
- [x] Endpoint always accepts a batch
- [x] A batch containing one log is valid
### Request Structure

- [ ] Endpoint exists at exactly `POST /logs`
- [ ] Request body contains a top-level `logs` array
- [ ] Endpoint always accepts a batch
- [ ] A batch containing one log is valid

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

- [ ] Each log entry is validated independently
- [ ] Invalid entries do not cause valid entries to fail
- [ ] Valid entries are stored
- [ ] Invalid entries are rejected
- [ ] Rejected entries include their original array index
- [ ] Rejected entries include a rejection reason

### Response Behavior

- [ ] HTTP `200` is returned when at least one entry is accepted
- [ ] HTTP `400` is returned when all entries are rejected
- [ ] HTTP `400` is returned for malformed JSON
- [ ] HTTP `400` is returned when the top-level request structure is invalid
- [ ] Response contains an `accepted` count
- [ ] Response contains a `rejected` array
- [ ] Response structure matches the required contract

### Durability

- [ ] A successful response is returned only for logs durably accepted
- [ ] The service never returns `200` for a batch it has not durably accepted

---

# 5. Log Querying

## `GET /logs`

### Filters

- [ ] All query filters are optional
- [ ] Filters may be freely combined

### `service`

- [ ] Supports exact service-name matching

### `level`

- [ ] Supports exact level matching
- [ ] Unsupported levels return HTTP `400`

### `since`

- [ ] Supports an inclusive start timestamp
- [ ] Invalid timestamps return HTTP `400`

### `until`

- [ ] Supports an exclusive end timestamp
- [ ] Invalid timestamps return HTTP `400`
- [ ] Invalid time ranges return HTTP `400`

### `attr.<key>`

- [ ] Supports arbitrary attribute keys
- [ ] Attribute equality is compared as strings

### `q`

- [ ] Searches the `message`
- [ ] Uses case-insensitive substring matching

### `limit`

- [ ] Default limit is `100`
- [ ] Maximum limit is `1000`
- [ ] Non-numeric limits return HTTP `400`
- [ ] Limits outside the supported range return HTTP `400`

### `cursor`

- [ ] Supports cursor-based pagination
- [ ] Cursor is opaque to clients
- [ ] Invalid cursors return HTTP `400`
- [ ] Malformed cursors return HTTP `400`

### Sorting

- [ ] Results are sorted by timestamp descending
- [ ] Ordering remains deterministic when timestamps are equal

### Response

- [ ] Response contains a `logs` array
- [ ] Every returned log contains a unique `id`
- [ ] Response contains `next_cursor`
- [ ] `next_cursor` can be passed back unchanged
- [ ] `next_cursor` is `null` when no more results exist

### Errors

- [ ] Invalid query parameters return HTTP `400`
- [ ] Invalid query responses use `{ "error": "<description>" }`

---

# 6. Aggregation

## `GET /logs/aggregate`

### Shared Filters

- [ ] Supports `service`
- [ ] Supports `level`
- [ ] Supports `attr.<key>`
- [ ] Supports `q`

### Time Range

- [ ] `since` is required
- [ ] `since` is inclusive
- [ ] `until` is required
- [ ] `until` is exclusive
- [ ] Invalid ranges return HTTP `400`

### Bucket

- [ ] `bucket` is required
- [ ] Supports `1m`
- [ ] Supports `5m`
- [ ] Supports `1h`
- [ ] Supports `1d`
- [ ] Unsupported buckets return HTTP `400`

### Grouping

- [ ] `group_by` is optional
- [ ] Supports `group_by=service`
- [ ] Supports `group_by=level`
- [ ] Unsupported `group_by` values return HTTP `400`
- [ ] `group` is `null` when `group_by` is not provided

### Response

- [ ] Returns one row per bucket/group combination
- [ ] Results are ordered by bucket start ascending
- [ ] Empty buckets may be omitted
- [ ] Each result contains `start`
- [ ] Each result contains `group`
- [ ] Each result contains `count`
- [ ] Invalid parameters return HTTP `400`
- [ ] Errors use `{ "error": "<description>" }`

---

# 7. Retention

- [ ] Retention duration is configurable
- [ ] Expired logs are deleted automatically
- [ ] Retention strategy is documented
- [ ] Expired-data deletion avoids long-running locks where possible
- [ ] Retention does not cause excessive table bloat
- [ ] Retention does not significantly disrupt ingestion
- [ ] Retention does not significantly disrupt queries

---

# 8. Security

- [ ] SQL queries use parameterized values
- [ ] Dynamic query construction is safe
- [ ] User input is never directly concatenated into SQL
- [ ] Attribute filters cannot produce SQL injection
- [ ] Sorting/filter construction cannot produce SQL injection

---

# 9. Reliability

- [ ] Malformed input is handled without application crashes
- [ ] Validation failures return appropriate HTTP errors
- [ ] Invalid cursors are handled safely
- [ ] Invalid query ranges are handled safely
- [ ] Empty query results are handled correctly
- [ ] Sustained ingestion does not crash the application
- [ ] Accepted logs are not silently dropped

---

# 10. Performance

## Ingestion

- [ ] Sustains at least `15,000 logs/second`
- [ ] Avoids dropped requests during sustained ingestion
- [ ] Avoids application crashes during sustained ingestion

## Dataset

- [ ] Handles approximately `1,000,000` stored logs
- [ ] Performance is tested using approximately one month of data

## Queries

- [ ] Main aggregation query is under `1 second p95`
- [ ] Queries remain performant while ingestion is active
- [ ] Newly ingested data is queryable within `20 seconds`
- [ ] Supports `1 aggregation request/second` during ingestion testing

## Performance Testing

- [ ] Local load testing is performed before submission
- [ ] Official load generator is tested
- [ ] Performance bottlenecks are identified
- [ ] Optimizations are based on measurements

---

# 11. Architecture and Code Quality

- [ ] Database schema design is clearly justified
- [ ] Attribute storage strategy is clearly justified
- [ ] Indexes match actual query patterns
- [ ] Data flow is clearly structured
- [ ] Project structure is maintainable
- [ ] TypeScript types are clear and useful
- [ ] HTTP handlers remain focused
- [ ] Query-building logic is separated from HTTP handlers
- [ ] Persistence/database logic is separated from HTTP handlers
- [ ] Important abstractions are understandable and maintainable

---

# 12. Docker

- [ ] Application has a Docker setup
- [ ] PostgreSQL has a Docker setup
- [ ] `docker compose up` starts the complete system
- [ ] Port `8080` is exposed correctly
- [ ] PostgreSQL starts correctly
- [ ] Application can reach PostgreSQL
- [ ] Migrations are applied automatically
- [ ] First-run setup works without manual intervention
- [ ] Container resource limits match the project constraints

---

# 13. Testing

- [ ] Core validation rules have automated tests
- [ ] Partial batch success has automated tests
- [ ] Query filters have automated tests
- [ ] Pagination has automated tests
- [ ] Invalid cursors have automated tests
- [ ] Aggregation has automated tests
- [ ] Invalid aggregation parameters have automated tests
- [ ] Malformed input has automated tests
- [ ] Important database behavior has integration tests
- [ ] Required API contract has smoke tests

---

# 14. CI

- [ ] CI pipeline builds the project
- [ ] CI pipeline runs automated tests
- [ ] CI pipeline validates the required API contract
- [ ] Core smoke test runs with authentication disabled
- [ ] All four required endpoints are reachable without credentials
- [ ] CI pipeline passes before final submission

---

# 15. README

README includes:

- [ ] Project overview
- [ ] Setup instructions
- [ ] Usage instructions
- [ ] API documentation
- [ ] Database schema design
- [ ] Index design
- [ ] Attribute storage strategy
- [ ] Retention strategy
- [ ] Load-test methodology
- [ ] Test environment
- [ ] Dataset size
- [ ] Batch size
- [ ] Measured ingestion rate
- [ ] Query rate
- [ ] Query latency percentiles
- [ ] Resource usage
- [ ] Bottlenecks discovered
- [ ] Optimizations applied
- [ ] Measured performance results
- [ ] Known limitations
- [ ] Optional features, if any
- [ ] Default state of every optional feature
- [ ] Configuration variables for optional features
- [ ] Confirmation that plain `docker compose up` starts the core service

---

# 16. GitHub and Submission

- [ ] Project is stored in a GitHub repository
- [ ] Repository is public for official load-generator testing
- [ ] Commit history is clean and readable
- [ ] Incremental progress is visible in the commit history
- [ ] Official load generator can access the repository
- [ ] Final project is submitted through the required submission form

---

# 17. Demo

Be prepared to:

- [ ] Explain the architecture
- [ ] Explain major technical decisions
- [ ] Explain major trade-offs
- [ ] Explain the database schema
- [ ] Justify indexes
- [ ] Explain the attribute storage strategy
- [ ] Trace the ingestion code path
- [ ] Trace the query code path
- [ ] Run `EXPLAIN` on important queries
- [ ] Run `EXPLAIN ANALYZE` on important queries
- [ ] Explain performance bottlenecks
- [ ] Diagnose a problem live
- [ ] Modify or extend a feature live

---

# 18. Five-Minute Video

- [ ] Video is approximately five minutes
- [ ] Video explains the project architecture
- [ ] Video explains key technical decisions
- [ ] Video includes a live demonstration of the working project

---

# 19. Optional Features

Optional features are not started until the required core is complete.

If an optional feature is implemented:

- [ ] It is additive and does not break the required API
- [ ] It does not rename required endpoints
- [ ] It does not alter required response types or structures
- [ ] It does not introduce required parameters or headers
- [ ] It does not cause previously valid core requests to fail
- [ ] It is disabled by default if it cannot preserve the core contract
- [ ] It is documented in the README
