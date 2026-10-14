# TicketHub - Event Ticketing System Design

## 1. Requirements

### Functional Requirements
1. **Browse and Search Events**: Users can view, search, and filter upcoming events (concerts, sports, festivals) by category, artist, city, and date.
2. **View Interactive Seat Map**: Users can view real-time venue seating arrangements with exact seat availability (`available`, `held`, `sold`) and tier-based pricing.
3. **Temporary Seat Hold (Reservation)**: Authenticated users can select up to 4 available seats and place a temporary hold for a fixed duration (10 minutes) while they complete checkout. Held seats are locked and hidden from other buyers.
4. **Checkout and Payment Processing**: Users can purchase held seats by providing payment information through a secure third-party payment gateway (e.g., Stripe).
5. **View and Access Purchased Tickets**: Once payment is confirmed, an order is generated with unique digital tickets containing QR codes, seat details, and event instructions, accessible from the user account and sent via email.
6. **Automatic Expiration of Holds**: If a user fails to complete payment within the 10-minute hold window, the hold expires automatically, and the seats are released back to the general inventory.

### Non-Functional Requirements
1. **Correctness (Zero Double-Booking)**:
   - Absolute consistency at the point of sale. Under no circumstances should two different users be allocated or sold the exact same seat.
   - Financial and inventory states must remain strictly consistent (ACID transactional guarantees).
2. **Speed (Low Latency)**:
   - High-throughput read endpoints (event browsing, seat map views) must have a $p95$ latency of less than **100 ms**.
   - Transactional write endpoints (holding seats, confirming checkout) must respond within **500 ms**.
3. **Fairness (High Concurrency & Equitable Access)**:
   - During high-demand flash ticket drops, seats must be allocated fairly without bot exploitation or connection starvation for genuine users.
   - A Virtual Waiting Room (metered queuing) must ensure First-Come, First-Served (FCFS) entry.
   - Enforce rate limiting per user/IP and a hard cap of 4 tickets per user per event to prevent scalping.
4. **High Availability and Resilience**:
   - The system must target **99.99% availability** during on-sale bursts.
   - Server failures or database spikes must degrade gracefully rather than crash the platform.
5. **Security & Compliance**:
   - PCI-DSS compliance: Credit card details must never touch or be stored on TicketHub application servers (tokenized via Stripe Elements/SDK).
   - All client-server communication must be encrypted over TLS 1.3.

---

## 2. Traffic & Capacity Estimates

### System Facts & Parameters
- **Registered Users**: 2,000,000 (2 million users).
- **Normal Day Traffic**: 50,000 visitors/day, each viewing 10 pages; 5,000 tickets sold/day.
- **Big Sale Event**: 200,000 people attempt to buy 20,000 seats within the first 10 minutes (600 seconds).
- **Time Conversion Constants**: 
  - 1 day = 86,400 seconds (exact); rule-of-thumb = 100,000 seconds.
  - Big sale window = 10 minutes = 600 seconds.

---

### A. Normal Day Estimates

1. **Page Views & Read Queries (Reads)**:
   - **Total page views per day**:
     $$50,000 \text{ visitors} \times 10 \text{ pages/visitor} = 500,000 \text{ page views/day}$$
   - **Average Read Requests Per Second (RPS)**:
     - Rule of thumb ($100,000 \text{ s/day}$): $500,000 \div 100,000 = \mathbf{5 \text{ reads/second}}$
     - Exact ($86,400 \text{ s/day}$): $500,000 \div 86,400 \approx \mathbf{5.79 \text{ reads/second}}$
   - **Peak Normal Read RPS** (assuming a $3\times$ peak diurnal factor):
     $$\approx 5.79 \times 3 \approx \mathbf{17.4 \text{ reads/second}}$$

2. **Ticket Purchases (Writes)**:
   - **Total purchases per day**: $5,000 \text{ tickets/day}$.
   - **Average Write Requests Per Second (Purchases)**:
     - Exact ($86,400 \text{ s/day}$): $5,000 \div 86,400 \approx \mathbf{0.058 \text{ writes/second}}$ (1 purchase every $\approx 17.3$ seconds).
   - **Peak Normal Write RPS** (assuming a $5\times$ diurnal peak):
     $$\approx 0.058 \times 5 \approx \mathbf{0.29 \text{ writes/second}}$$

3. **Normal Read-to-Write Ratio**:
   $$500,000 \text{ reads} : 5,000 \text{ writes} = \mathbf{100 : 1} \text{ (Extremely read-heavy)}$$

---

### B. "Big Sale" Peak Estimates (10-Minute Concert Rush)

When a blockbuster concert opens, 200,000 users arrive simultaneously. The 20,000 seats sell out completely within 10 minutes ($600 \text{ seconds}$).

1. **Read Requests & Seat Map Polling (Reads)**:
   - During the rush, all 200,000 users actively search, reload event listings, inspect the seat map, and refresh seat availability.
   - If each user generates an average of 25 HTTP read requests (initial page loads, polling seat statuses every 10 seconds, inspecting seat categories) over the 10 minutes:
     $$\text{Total Big Sale Reads} = 200,000 \text{ users} \times 25 \text{ requests} = 5,000,000 \text{ read requests in } 600 \text{ s}$$
   - **Average Big Sale Read RPS**:
     $$5,000,000 \div 600 \approx \mathbf{8,333 \text{ reads/second}}$$
   - **Peak Big Sale Read RPS** (in the opening 60-second surge, multiplier $\approx 1.8\times$):
     $$8,333 \times 1.8 \approx \mathbf{15,000 \text{ to } 20,000 \text{ reads/second}}$$

2. **Seat Holds & Purchase Attempts (Writes)**:
   - **Seat Hold Attempts**: All 200,000 users attempt to hold seats. Users who fail on their first try click multiple seats. Assuming an average of 2 hold attempts per user:
     $$\text{Total Hold Attempts} = 200,000 \times 2 = 400,000 \text{ hold attempts in } 600 \text{ s}$$
   - **Average Hold Attempt Writes/s**:
     $$400,000 \div 600 \approx \mathbf{667 \text{ writes/second}}$$
   - **Peak Hold Attempt Writes/s** (opening rush when doors unlock):
     $$\mathbf{1,500 \text{ to } 2,500 \text{ hold attempts/second}}$$
   - **Successful Orders / Tickets Sold**:
     - 20,000 total seats sold in 600 seconds:
       $$20,000 \div 600 \approx \mathbf{33.33 \text{ confirmed orders/second}}$$
     - If the bulk of checkouts finish within the first 5 minutes ($300 \text{ s}$):
       $$20,000 \div 300 \approx \mathbf{66.7 \text{ confirmed orders/second}}$$

---

### C. Traffic Comparison & Engineering Implications

| Metric | Normal Day | Big Sale Peak (10 min) | Spike Factor |
| :--- | :--- | :--- | :--- |
| **Active Users** | 50,000 / day | 200,000 concurrent | **4x total daily users in 10 minutes** |
| **Average Read Traffic** | ~5.8 RPS | ~8,333 RPS | **~1,436x increase** |
| **Peak Read Traffic** | ~17.4 RPS | ~15,000 – 20,000 RPS | **~1,000x increase** |
| **Average Write Traffic**| ~0.058 RPS | ~667 RPS (holds) | **~11,500x increase** |
| **Peak Write Traffic** | ~0.29 RPS | ~2,000 RPS | **~6,800x increase** |
| **Demand-to-Supply Ratio**| N/A (plenty of seats)| 200,000 buyers for 20,000 seats | **10 buyers per seat (90% rejection)** |

#### Key Takeaways for System Design:
1. **Catastrophic Lock Contention on Writes**: If 2,000 concurrent write requests per second attempt to execute `SELECT ... FOR UPDATE` directly on a relational database table for a finite set of 20,000 rows, database connection pools will exhaust, locks will queue, and the database will crash from deadlock cascades. Write operations must be governed by an in-memory distributed locking layer (Redis) and gated by a virtual queue.
2. **Read Amplification**: Delivering 15,000+ seat map queries directly to the relational primary would saturate CPU instantly. Seat map snapshots must be served from edge CDNs and in-memory caches (Redis) with lightweight delta-updates.
3. **Queueing Necessity**: Because 90% of buyers cannot obtain seats, allowing all 200,000 users to freely bombard the backend API serves no purpose. A **Virtual Waiting Room** must meter the admission rate to match backend transactional capacity.

---

## 3. API Design

The API follows RESTful principles, uses JSON over HTTPS, and requires standard authentication tokens (`Authorization: Bearer <JWT>`) for protected actions.

### 1. Browse Events
Retrieve a paginated list of upcoming events with optional filtering.

* **Method & Path**: `GET /api/v1/events`
* **Authentication**: Public
* **Query Parameters**:
  * `query` (string, optional): Search keyword (e.g., `"Coldplay"`).
  * `category` (string, optional): Event type (e.g., `"concert"`, `"sports"`).
  * `city` (string, optional): Location filter.
  * `page` (integer, default: 1): Page number.
  * `limit` (integer, default: 20): Results per page.
* **Success Response (`200 OK`)**:
  ```json
  {
    "page": 1,
    "limit": 20,
    "total_events": 142,
    "data": [
      {
        "id": "evt_9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
        "title": "Coldplay: Music of the Spheres Tour",
        "category": "concert",
        "venue_name": "National Stadium",
        "city": "Addis Ababa",
        "event_date": "2026-11-20T19:00:00Z",
        "status": "on_sale",
        "total_seats": 20000,
        "available_seats": 14200,
        "min_price_cents": 5000
      }
    ]
  }
  ```
* **Error Codes**: `400 Bad Request` (invalid query params).

---

### 2. View Seat Map & Availability
Retrieve the complete seat layout and real-time status of each seat for an event.

* **Method & Path**: `GET /api/v1/events/{eventId}/seats`
* **Authentication**: Public
* **Path Parameters**: `eventId` (UUID)
* **Query Parameters**: `section` (string, optional, e.g., `"VIP-A"`)
* **Success Response (`200 OK`)**:
  ```json
  {
    "event_id": "evt_9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "venue_name": "National Stadium",
    "last_updated": "2026-10-14T17:30:00Z",
    "seats": [
      {
        "id": "seat_101a",
        "section": "VIP-A",
        "row": "1",
        "seat_number": "12",
        "price_cents": 15000,
        "status": "available"
      },
      {
        "id": "seat_101b",
        "section": "VIP-A",
        "row": "1",
        "seat_number": "13",
        "price_cents": 15000,
        "status": "held"
      },
      {
        "id": "seat_101c",
        "section": "VIP-A",
        "row": "1",
        "seat_number": "14",
        "price_cents": 15000,
        "status": "sold"
      }
    ]
  }
  ```
* **Error Codes**: `404 Not Found` (event does not exist).

---

### 3. Hold Selected Seats (Temporary Reservation)
Place a temporary 10-minute hold on selected seats for the authenticated user.

* **Method & Path**: `POST /api/v1/events/{eventId}/holds`
* **Authentication**: Required (`Bearer <token>`)
* **Path Parameters**: `eventId` (UUID)
* **Request Body**:
  ```json
  {
    "seat_ids": ["seat_101a", "seat_102a"]
  }
  ```
* **Success Response (`201 Created`)**:
  ```json
  {
    "hold_id": "hold_7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "event_id": "evt_9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "user_id": "usr_4f3a2b1c",
    "held_seats": ["seat_101a", "seat_102a"],
    "total_price_cents": 30000,
    "held_at": "2026-10-14T17:35:00Z",
    "expires_at": "2026-10-14T17:45:00Z",
    "remaining_seconds": 600
  }
  ```
* **Error Codes**:
  * `400 Bad Request` (user requested > 4 seats or invalid seat IDs).
  * `401 Unauthorized` (missing/invalid token).
  * `409 Conflict` (one or more requested seats are already held or sold by another user).
  * `429 Too Many Requests` (user rate limit exceeded).

---

### 4. Create Order & Pay (Confirm Purchase)
Execute payment and convert held seats into confirmed ticket orders.

* **Method & Path**: `POST /api/v1/orders`
* **Authentication**: Required (`Bearer <token>`)
* **Request Headers**: `Idempotency-Key: 7b89d4e5-9452-4f32-8419-123456789abc`
* **Request Body**:
  ```json
  {
    "hold_id": "hold_7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "payment_method_token": "pm_tok_1N3k4F2eZvKYlo2C",
    "currency": "usd"
  }
  ```
* **Success Response (`201 Created`)**:
  ```json
  {
    "order_id": "ord_88f912e1-45a7-4c32-b8ec-f0129845ad33",
    "order_number": "TH-20261014-9981",
    "event_id": "evt_9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "status": "confirmed",
    "total_amount_cents": 30000,
    "payment_reference": "ch_3N4A12B2eZvKYlo2C01984",
    "created_at": "2026-10-14T17:38:22Z",
    "tickets": [
      {
        "ticket_id": "tkt_01a",
        "seat_id": "seat_101a",
        "section": "VIP-A",
        "row": "1",
        "seat_number": "12",
        "qr_code_url": "https://cdn.tickethub.com/qr/tkt_01a.png"
      },
      {
        "ticket_id": "tkt_02a",
        "seat_id": "seat_102a",
        "section": "VIP-A",
        "row": "1",
        "seat_number": "13",
        "qr_code_url": "https://cdn.tickethub.com/qr/tkt_02a.png"
      }
    ]
  }
  ```
* **Error Codes**:
  * `400 Bad Request` (missing payment token or invalid hold ID).
  * `402 Payment Required` (payment card declined by gateway).
  * `410 Gone` (hold has expired before checkout was finalized).
  * `409 Conflict` (order already processed with this idempotency key).

---

### 5. View Order / Tickets
Retrieve details of a confirmed order and view issued tickets.

* **Method & Path**: `GET /api/v1/orders/{orderId}`
* **Authentication**: Required (`Bearer <token>`)
* **Path Parameters**: `orderId` (UUID)
* **Success Response (`200 OK`)**:
  ```json
  {
    "order_id": "ord_88f912e1-45a7-4c32-b8ec-f0129845ad33",
    "order_number": "TH-20261014-9981",
    "event_title": "Coldplay: Music of the Spheres Tour",
    "venue_name": "National Stadium",
    "event_date": "2026-11-20T19:00:00Z",
    "status": "confirmed",
    "total_paid_cents": 30000,
    "tickets": [
      {
        "ticket_code": "TH-TKT-9981-01",
        "seat": "VIP-A, Row 1, Seat 12",
        "attendee_name": "Abebe Bikila",
        "barcode_value": "9812739182371982",
        "qr_url": "https://cdn.tickethub.com/qr/tkt_01a.png"
      }
    ]
  }
  ```
* **Error Codes**:
  * `401 Unauthorized` (not logged in).
  * `403 Forbidden` (user does not own this order).
  * `404 Not Found` (order not found).

---

## 4. Data Model

The relational database schema is designed for strict referential integrity, normalized data storage, and zero double-booking through constraint enforcement.

### Entity Relationship Diagram (ERD)

```
  ┌────────────────┐               ┌────────────────┐
  │     users      │               │     events     │
  ├────────────────┤               ├────────────────┤
  │ id (PK)        │1             1│ id (PK)        │
  │ email (UNIQUE) │───┐       ┌───│ title          │
  │ name           │   │       │   │ venue_name     │
  │ password_hash  │   │       │   │ event_date     │
  └────────────────┘   │       │   │ total_seats    │
                       │       │   └────────────────┘
                       │       │           │ 1
                       │N     N│           │
                     ┌───────────┐         │
                     │  orders   │         │
                     ├───────────┤         │
                     │ id (PK)   │         │
                     │ user_id   │         │
                     │ event_id  │         │
                     │ amount    │         │
                     │ status    │         │
                     └───────────┘         │
                           │ 1             │
                           │               │
                           │ N             │ N
                     ┌───────────┐   1   ┌───────────────────────┐
                     │  tickets  │───────│         seats         │
                     ├───────────┤(UNIQUE│───────────────────────┤
                     │ id (PK)   │ seat) │ id (PK)               │
                     │ order_id  │       │ event_id (FK)         │
                     │ seat_id   │       │ section, row, number  │
                     │ qr_code   │       │ status (avail/held/so)│
                     └───────────┘       │ held_by_user_id (FK)  │
                                         │ held_until            │
                                         │ version               │
                                         └───────────────────────┘
```

---

### Detailed Table Specifications

#### 1. `users` Table
Stores registered customer accounts and profile data.
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    phone_number VARCHAR(30),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
```

#### 2. `events` Table
Stores details of scheduled shows, concerts, and stadium venues.
```sql
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    venue_name VARCHAR(200) NOT NULL,
    city VARCHAR(100) NOT NULL,
    event_date TIMESTAMP WITH TIME ZONE NOT NULL,
    total_seats INTEGER NOT NULL CHECK (total_seats > 0),
    status VARCHAR(50) NOT NULL DEFAULT 'upcoming', -- upcoming, on_sale, sold_out, completed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_events_date_status ON events(event_date, status);
CREATE INDEX idx_events_city ON events(city);
```

#### 3. `seats` Table
Represents each physical seat for an event, tracking price and hold status.
```sql
CREATE TABLE seats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    section VARCHAR(50) NOT NULL,
    row_number VARCHAR(20) NOT NULL,
    seat_number VARCHAR(20) NOT NULL,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'available', -- 'available', 'held', 'sold'
    held_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    held_until TIMESTAMP WITH TIME ZONE,
    version INTEGER NOT NULL DEFAULT 0, -- For Optimistic Concurrency Control (OCC)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Prevents duplicate physical seats from being created for the same event
    CONSTRAINT uq_event_section_row_seat UNIQUE (event_id, section, row_number, seat_number)
);

-- Crucial indexes for ultra-fast queries
CREATE INDEX idx_seats_event_status ON seats(event_id, status);
CREATE INDEX idx_seats_held_until ON seats(held_until) WHERE status = 'held';
```

#### 4. `orders` Table
Records finalized purchase transactions, payment statuses, and financial totals.
```sql
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(50) NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    total_amount_cents INTEGER NOT NULL CHECK (total_amount_cents >= 0),
    payment_status VARCHAR(30) NOT NULL DEFAULT 'pending', -- pending, completed, failed, refunded
    payment_provider_ref VARCHAR(255), -- e.g., Stripe Charge/PaymentIntent ID
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_event ON orders(event_id);
```

#### 5. `tickets` (Join / Fulfill Table)
Represents the issued admission ticket linking confirmed orders to seats.
```sql
CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    seat_id UUID NOT NULL REFERENCES seats(id) ON DELETE RESTRICT,
    ticket_code VARCHAR(100) NOT NULL UNIQUE,
    qr_code_url VARCHAR(500) NOT NULL,
    price_cents INTEGER NOT NULL,
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Absolute database constraint: A seat can ONLY EVER be issued to one ticket!
    CONSTRAINT uq_ticket_seat_unique UNIQUE (seat_id)
);

CREATE INDEX idx_tickets_order ON tickets(order_id);
```

### Table Relationships Explained
1. **`users` to `orders` ($1 : N$)**: One user can place multiple ticket orders over time. Each order belongs to exactly one user.
2. **`events` to `seats` ($1 : N$)**: One event has 20,000 distinct physical seat rows. Each seat belongs to exactly one event.
3. **`orders` to `tickets` ($1 : N$)**: A single checkout order can contain multiple tickets (up to 4 seats).
4. **`seats` to `tickets` ($1 : 1$)**: Enforced by the `UNIQUE(seat_id)` constraint on the `tickets` table. Even under the most severe software bugs, this database-level unique constraint prevents a seat from physically having two tickets generated for it.

---

## 5. Preventing Double-Booking

### The Double-Booking Concurrency Hazard
During the big sale, 200,000 users compete for 20,000 seats. If User A and User B simultaneously click "Reserve" on Seat `B-12` at timestamp `10:00:00.000`:
- **Naive approach**: Both threads run `SELECT status FROM seats WHERE id = B-12`. Both observe `available`. Both run `UPDATE seats SET status = sold`. User A and User B both believe they purchased the seat, producing an illegal double-booking.

### TicketHub Concurrency Architecture
TicketHub prevents double-booking using a **three-tier defense**:
1. **Tier 1 (In-Memory Pre-Reservation in Redis)**: Absorbs 99% of race contention before touching the disk.
2. **Tier 2 (Relational Atomic SQL with Optimistic/Pessimistic Locking)**: Guarantees strict transactional isolation at the database layer.
3. **Tier 3 (Database Storage Engine Unique Constraints)**: Physical impossibility of duplicate tickets.

---

### Step-by-Step Prevention Mechanism

#### 1. In-Memory Distributed Lock & Reservation (Redis)
When a user attempts to hold a seat, the application server does not immediately issue an expensive SQL query. Instead, it executes an atomic Lua script in Redis Cluster:

```lua
-- KEYS[1]: "event:101:seat:B12:hold"
-- ARGV[1]: user_id
-- ARGV[2]: ttl_seconds (600)
if redis.call("EXISTS", KEYS[1]) == 1 then
    return 0 -- Seat already held or locked
else
    redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[2])
    return 1 -- Successfully acquired 10-minute hold
end
```
- Because Redis is single-threaded per shard and executes Lua scripts atomically, exactly **one** of the 200,000 users succeeds in claiming the lock for Seat `B-12`.
- All other concurrent attempts fail instantly in memory (< 2 ms) with HTTP `409 Conflict`, entirely shielding the relational database from thousands of competing lock requests.

#### 2. Relational Transactional Atomic Hold (SQL Layer)
Upon winning the Redis hold, the app server records the reservation in PostgreSQL inside an atomic transaction:

```sql
BEGIN TRANSACTION;

UPDATE seats
SET status = 'held',
    held_by_user_id = :user_id,
    held_until = NOW() + INTERVAL '10 minutes',
    version = version + 1,
    updated_at = NOW()
WHERE id = :seat_id
  AND (status = 'available' OR (status = 'held' AND held_until < NOW()));

-- Application checks SQL rows affected:
-- If rows_affected == 1:
COMMIT; -- Hold confirmed!
-- If rows_affected == 0:
ROLLBACK; -- Someone else held it; return 409 Conflict.
```
- The conditional `WHERE (status = 'available' OR (status = 'held' AND held_until < NOW()))` guarantees that even if an expired hold lingered, only one thread can transition the seat to `held`.
- PostgreSQL executes row-level write locks (`XLock`) on updated rows, serializing concurrent writes without table-wide locking.

#### 3. Checkout Finalization & Unique Constraints (Purchase Layer)
When User A completes credit card payment, the order and tickets are created within an ACID transaction:

```sql
BEGIN TRANSACTION;

-- 1. Verify seat is still held by THIS user and has not timed out
SELECT id, price_cents 
FROM seats 
WHERE id = :seat_id 
  AND status = 'held' 
  AND held_by_user_id = :user_id 
  AND held_until > NOW()
FOR UPDATE; -- Locks the row until transaction commits

-- 2. Update seat status to sold
UPDATE seats 
SET status = 'sold', 
    held_until = NULL 
WHERE id = :seat_id;

-- 3. Insert Order
INSERT INTO orders (id, order_number, user_id, event_id, total_amount_cents, payment_status, idempotency_key)
VALUES (:order_id, :order_number, :user_id, :event_id, :total_price, 'completed', :idempotency_key);

-- 4. Insert Ticket with Unique Constraint
INSERT INTO tickets (id, order_id, seat_id, ticket_code, qr_code_url, price_cents)
VALUES (:ticket_id, :order_id, :seat_id, :code, :qr_url, :price);

COMMIT;
```
- **The Ultimate Safety Guard**: Because `tickets(seat_id)` has a database `UNIQUE` constraint, if any bug or race condition ever bypassed application logic, the database engine itself raises an error code `23505 (unique_violation)` and aborts the transaction. Double-booking is mathematically impossible.

#### 4. Automatic Hold Expiration
Held seats that are abandoned must not stay locked forever:
- **Redis TTL**: The Redis key expires automatically after 600 seconds.
- **Scheduled Hold Reaper Worker**: A lightweight background worker runs every 10 seconds:
  ```sql
  UPDATE seats
  SET status = 'available',
      held_by_user_id = NULL,
      held_until = NULL,
      version = version + 1
  WHERE status = 'held' AND held_until < NOW();
  ```
  This immediately recycles abandoned seats back into the available pool for waiting fans.

---

## 6. Architecture

```
                                 200,000 Users
                        (Web Browsers / Mobile Apps)
                                     │
                                     ▼
                ┌─────────────────────────────────────────┐
                │        Cloudflare Edge Network          │
                │  - Edge CDN: Static assets & venue map  │
                │  - Virtual Waiting Room (Queue-it)      │
                │  - DDoS Protection & WAF                │
                └─────────────────────────────────────────┘
                                     │ (Metered admission ~500 users/s)
                                     ▼
                ┌─────────────────────────────────────────┐
                │          AWS ALB (Load Balancer)        │
                │  - Round-robin / Least connections      │
                │  - SSL Termination                      │
                └─────────────────────────────────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         ▼                           ▼                           ▼
  ┌──────────────┐            ┌──────────────┐            ┌──────────────┐
  │App Server 1  │            │App Server 2  │            │App Server N  │
  │(Stateless)   │            │(Stateless)   │            │(Auto-scaled) │
  └──────────────┘            └──────────────┘            └──────────────┘
         │                           │                           │
         ├───────────────────────────┴───────────────────────────┤
         │                                                       │
         ▼                                                       ▼
  ┌───────────────────────────────────┐           ┌─────────────────────────────┐
  │      Redis In-Memory Cluster      │           │    Stripe Payment Gateway   │
  │ - Distributed Hold Locks (Lua)    │           │ (Offloaded tokenized charge)│
  │ - Cached Seat Map Bitmaps         │           └─────────────────────────────┘
  │ - User Session & Rate Limiting    │                          ▲
  └───────────────────────────────────┘                          │
         │                                                       │
         ├───────────────────────────────────────────────────────┘
         │
         ├───> [RabbitMQ / Kafka Queue] ───> [Background Workers]
         │        - Order confirmed events     - Hold Reaper (10s sweep)
         │        - Ticket PDF & QR generator  - Email & Push notifications
         │
         ▼
  ┌───────────────────────────────────┐
  │       PgBouncer Connection Pool   │
  └───────────────────────────────────┘
         │
         ├────────────────────────────────────────┐
         ▼                                        ▼
  ┌────────────────────────┐           ┌────────────────────────┐
  │   Primary PostgreSQL   │ ──Repl──> │ PostgreSQL Read Replica│
  │ (ACID Holds & Orders)  │           │ (Catalog & Seat Map)   │
  └────────────────────────┘           └────────────────────────┘
```

---

### Component Explanations & How It Survives the Big Sale

1. **Virtual Waiting Room (Queue-it / Cloudflare Waiting Room)**:
   - **How it survives**: When 200,000 people hit the site simultaneously, routing all of them directly to application servers would crash the cluster. The waiting room intercepts users at the network edge, presents a countdown screen with their queue position, and admits only a metered rate (e.g., 500 users/second) with cryptographically signed admission tokens.
2. **Edge CDN (Cloudflare)**:
   - **How it survives**: Serves static HTML/JS/CSS assets and base venue seating geometries directly from edge caches. None of these static requests ever touch our backend servers, absorbing ~80% of total HTTP bandwidth.
3. **Stateless Application Servers (Node.js / Go Cluster)**:
   - **How it survives**: Containerized app servers deployed across AWS ECS/EKS behind an Application Load Balancer. They store zero local session state, allowing them to horizontally auto-scale from 5 instances to 60+ instances within minutes as CPU thresholds exceed 65%.
4. **Redis In-Memory Cluster**:
   - **How it survives**: Redis handles over 100,000 operations per second in memory with sub-millisecond response times. It executes the distributed hold locks via Lua scripts and provides fast caching of seat maps. This ensures 99% of rejected hold attempts never reach PostgreSQL.
5. **PgBouncer (Connection Pooler)**:
   - **How it survives**: Relational databases struggle with thousands of active client connections. PgBouncer sits between the auto-scaling application servers and PostgreSQL, multiplexing thousands of incoming application connections into a stable pool of 100 dedicated server connections, preventing database connection starvation.
6. **Primary PostgreSQL Database**:
   - **How it survives**: Handles strictly write transactions (seat holds, completed orders, ticket insertions). Because the Virtual Waiting Room meters user entry and Redis absorbs contending hold rejections, the primary DB only needs to process ~50–100 actual write transactions per second—well within the capability of modern provisioned SSD database instances.
7. **PostgreSQL Read Replicas**:
   - **How it survives**: All non-transactional read traffic (event browsing, order history review) is routed to read replicas via asynchronous replication, ensuring read queries never consume primary CPU.
8. **Message Queue & Asynchronous Workers (RabbitMQ / Kafka)**:
   - **How it survives**: Slow, non-critical background jobs (generating high-resolution PDF tickets, generating QR image files, and dispatching confirmation emails via SendGrid) are pushed onto a message queue. Decoupled worker processes consume these tasks at their own pace, keeping user checkout response times under 300 ms.

---

## 7. Trade-offs

### Trade-off 1: In-Memory Redis Locking vs. Direct Database Pessimistic Locking
* **Option A (Direct Database Pessimistic Locking)**: Execute `SELECT ... FOR UPDATE` directly on the `seats` table for every hold request.
  * *Pros*: Utterly simple architecture; single source of truth; zero risk of distributed state divergence between cache and database.
  * *Cons*: Catastrophic bottleneck under 2,000 hold requests/second. Competing row-level locks on the same table cause severe lock contention, thread queueing, connection exhaustion, and transaction timeouts.
* **Option B (TicketHub Choice: In-Memory Redis Reservation + DB Optimistic Write)**:
  * *Pros*: Redis handles 100k+ ops/sec with < 2 ms latency in RAM. Rejects 90% of competing users instantly without putting any I/O load on the database.
  * *Cons*: Adds distributed systems complexity. Requires maintaining consistency between Redis lock keys and PostgreSQL rows, handling network partitions, and ensuring expired Redis keys trigger database updates.
  * *Verdict*: Essential. A relational database cannot survive 200,000 concurrent users competing for 20,000 rows without an in-memory gating layer.

---

### Trade-off 2: First-Come, First-Served (FCFS) with Virtual Queue vs. Lottery / Ballot Allocation
* **Option A (TicketHub Choice: FCFS with Virtual Waiting Room)**:
  * *Pros*: Provides instant user satisfaction; fans who arrive early and queue are immediately rewarded; fits standard concert sale expectations.
  * *Cons*: Creates extreme traffic spikes at the precise on-sale second (e.g., 10:00 AM); users with superior internet bandwidth or closer proximity to edge servers gain a slight millisecond latency advantage.
* **Option B (Randomized Ballot / Lottery System)**:
  * *Pros*: Completely flattens the traffic spike. Users can register over a 48-hour window without any server stress. 20,000 winners are selected randomly via an offline batch job.
  * *Cons*: Eliminates the real-time excitement of live event sales; delays gratification by days; disliked by loyal fans who prefer queuing.
  * *Verdict*: TicketHub adopts the FCFS Virtual Queue model to maintain live e-commerce expectations while mitigating the technical burst via the edge waiting room.

---

### Trade-off 3: Strong Consistency (Primary DB) vs. Eventual Consistency (Read Replicas & Cache) for Seat Maps
* **Option A (Strong Consistency for Seat Map Reads)**:
  * *Pros*: Seat maps always display the absolute, 100% up-to-the-millisecond status of every seat.
  * *Cons*: Routing 15,000+ seat map requests per second to the Primary database would instantly saturate primary CPU and crash the transactional checkout pipeline.
* **Option B (TicketHub Choice: Eventual Consistency via Edge CDN & Read Replicas)**:
  * *Pros*: Seat maps are cached and served from replicas and edge caches with sub-100 ms latency, scaling to hundreds of thousands of requests effortlessly.
  * *Cons*: Introduces a slight 1–2 second propagation delay. A user might occasionally click a seat that was held by someone else a second prior, resulting in an error message ("Seat was just claimed").
  * *Verdict*: Perfectly acceptable. Users expect that popular seats may be claimed rapidly, and the write boundary firmly catches and rejects stale selections gracefully with HTTP `409 Conflict`.
