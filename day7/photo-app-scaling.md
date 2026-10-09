# SnapShare: System Scaling & Architecture Plan

## 1. Assumptions & User Base

### Starting Facts
- **Registered Users**: 10,000,000 (10 million)
- **Daily Active Percentage**: 10% of registered users are active daily
- **Upload Frequency**: Each active user uploads 1 photo per day
- **Feed Browsing Frequency**: Each active user views 50 feed pages per day
- **Average Photo Size**: 2 MB per original photo
- **Thumbnail Size**: 50 KB (0.05 MB) per thumbnail
- **Traffic Pattern**: Peak traffic is estimated at 5× the daily average

### Daily Active Users (DAU) Calculation
$$\text{DAU} = 10,000,000 \times 10\% = 1,000,000 \text{ active users per day}$$

---

## 2. Capacity Estimates & Traffic Calculations

### A. Uploads Per Second (Writes)
- **Total uploads per day**:
  $$1,000,000 \text{ DAU} \times 1 \text{ upload/user/day} = 1,000,000 \text{ uploads/day}$$
- **Seconds per day**: $24 \times 60 \times 60 = 86,400 \text{ seconds}$
- **Average uploads per second**:
  $$\text{Average Uploads/s} = \frac{1,000,000}{86,400} \approx 11.57 \text{ uploads/second (}\approx 12 \text{ uploads/s)}$$
- **Peak uploads per second (5× average)**:
  $$\text{Peak Uploads/s} = 11.57 \times 5 \approx 57.87 \text{ uploads/second (}\approx 58 \text{ uploads/s)}$$

---

### B. Feed Views Per Second (Reads)
- **Total feed views per day**:
  $$1,000,000 \text{ DAU} \times 50 \text{ views/user/day} = 50,000,000 \text{ feed views/day}$$
- **Average feed views per second**:
  $$\text{Average Feed Views/s} = \frac{50,000,000}{86,400} \approx 578.70 \text{ views/second (}\approx 579 \text{ views/s)}$$
- **Peak feed views per second (5× average)**:
  $$\text{Peak Feed Views/s} = 578.70 \times 5 \approx 2,893.52 \text{ views/second (}\approx 2,894 \text{ views/s)}$$

---

### C. Photo Storage Per Year
- **Storage per photo upload**:
  - Original image: $2 \text{ MB}$
  - Thumbnail: $50 \text{ KB} = 0.05 \text{ MB}$
  - Combined storage per upload: $2 \text{ MB} + 0.05 \text{ MB} = 2.05 \text{ MB}$
- **Daily storage requirement**:
  - Originals: $1,000,000 \times 2 \text{ MB} = 2,000,000 \text{ MB} = 2,000 \text{ GB} = 2 \text{ TB/day}$
  - Thumbnails: $1,000,000 \times 0.05 \text{ MB} = 50,000 \text{ MB} = 50 \text{ GB} = 0.05 \text{ TB/day}$
  - Total per day: $2 \text{ TB} + 0.05 \text{ TB} = 2.05 \text{ TB/day}$
- **Annual storage requirement (365 days)**:
  - Originals: $2 \text{ TB/day} \times 365 = 730 \text{ TB/year}$
  - Thumbnails: $0.05 \text{ TB/day} \times 365 = 18.25 \text{ TB/year}$
  - **Total Annual Storage**: $730 \text{ TB} + 18.25 \text{ TB} = \mathbf{748.25 \text{ TB/year}}$ (approximately $\mathbf{750 \text{ TB/year}}$)

---

## 3. Read-Heavy vs. Write-Heavy Analysis

### Workload Classification
SnapShare is overwhelmingly **read-heavy**.

- **Read Operations (Feed Views)**: $50,000,000$ per day
- **Write Operations (Photo Uploads)**: $1,000,000$ per day
- **Read-to-Write Ratio**: **$50:1$**

### What This Means for System Design
1. **Aggressive Edge & In-Memory Caching**: Since 98% of user operations are feed views, the primary bottleneck is read latency. We must cache feeds in memory (Redis) and cache media files globally at edge CDN locations so that only a tiny fraction of requests hit the database or storage origin.
2. **Database Read Replicas**: The primary database cannot handle 2,894 peak queries per second alongside write locks. Separating reads via asynchronous read replicas allows queries to scale horizontally without blocking write transactions.
3. **Asynchronous Write Pipeline**: Because writes are infrequent compared to reads ($11.57$ uploads/s avg), we can prioritize user perceived upload speed by acknowledging the write immediately and delegating CPU-heavy tasks (like thumbnail creation and feed fan-out) to asynchronous background workers.
4. **Denormalized Feed Caching**: Querying followers, joined tables, and photos on the fly for 50 million feed requests per day would overwhelm relational databases; feeds should be precomputed and cached in fast key-value data structures.

---

## 4. Why Photos Must Not Be Stored Inside the Database

Photos should **never** be stored as binary blobs (`BLOB`) inside a relational database for the following reasons:

1. **Memory & Buffer Pool Contamination**: Databases rely on keeping active indexes and frequently queried data pages in RAM (buffer pool). Multi-megabyte photo files displace critical indexes and metadata from memory, causing severe cache thrashing and dropping query performance across the entire application.
2. **Prohibitive Storage Cost**: Relational database storage is provisioned on high-performance, high-IOPS block storage (e.g., AWS EBS io2 or provisioned SSDs), which costs significantly more per gigabyte than distributed object storage. Storing ~750 TB of binary data annually on database disks would be economically unsustainable.
3. **Slow Backups, Replication, and Restores**: Backups, point-in-time recovery, and cluster replication streams slow to a crawl when transferring hundreds of terabytes of binary payloads, increasing downtime risk and replication lag.
4. **Connection Pool & Bandwidth Saturation**: Streaming a 2 MB file through a database connection holds that connection open for hundreds of milliseconds, exhausting database connection pools and saturating server network interfaces.

### Where Photos Go Instead
Photos and thumbnails belong in dedicated **Distributed Object Storage** (such as Amazon S3, Google Cloud Storage, or MinIO). The relational database only stores lightweight metadata (e.g., `photo_id`, `user_id`, `upload_timestamp`, `object_key`, `thumbnail_url`, and dimensions). Object storage provides virtually unlimited scalability, $99.999999999\%$ durability, built-in tiering (e.g., archival storage for old photos), and direct integration with Content Delivery Networks.

---

## 5. System Architecture Diagram

```
                             [ Users / Mobile Clients ]
                                     |         |
                  Media Requests (GET)         API Requests (Upload/Feed)
                                     |         |
                                     v         v
                              +-------------+
                              |     CDN     |
                              +-------------+
                                     |
                                     v
                           +-------------------+
                           |   Load Balancer   |
                           +-------------------+
                                     |
                     +---------------+---------------+
                     |                               |
                     v                               v
           +--------------------+          +--------------------+
           |  App Server #1     |          |  App Server #N     |
           +--------------------+          +--------------------+
             |        |       |              |        |       |
             |        |       +-------+------+        |       |
             |        |               |               |       |
      Upload |   Feed | Reads         | Read/Write    |       |
             |        v               v               |       |
             |   +-------------+  +-------------+     |       |
             |   | Read Replica|  | In-Memory   |     |       |
             |   |  Database   |  | Cache(Redis)|     |       |
             |   +-------------+  +-------------+     |       |
             |          ^                             |       |
             |          | Replication                 |       |
             |          |                             |       |
             |   +-------------+                      |       |
             |   |   Primary   |<---------------------+       |
             |   |  Database   |                              |
             |   +-------------+                              |
             |                                                |
             +-----------------------+                        |
             |                       |                        |
             v                       v                        |
     +---------------+       +---------------+                |
     | Object Storage|       | Message Queue |<---------------+
     | (Photos &     |       |  (RabbitMQ /  |
     |  Thumbnails)  |       |   AWS SQS)    |
     +---------------+       +---------------+
             ^                       |
             | Reads Original        | Consumes Job
             | Writes Thumbnail      v
             |               +---------------+
             +---------------|   Thumbnail   |
                             |    Worker     |
                             +---------------+
```

---

## 6. Component Explanations (One Sentence Each)

- **CDN**: Caches and serves photo files and thumbnails from geographically distributed edge servers closest to users to minimize latency and offload origin traffic.
- **Load Balancer**: Distributes incoming HTTP and API requests evenly across healthy application servers to eliminate single points of failure and prevent server overload.
- **App Servers**: Execute core application logic, enforce authentication, and coordinate reads and writes across databases, caches, and storage.
- **Cache**: Stores frequently requested data like precomputed user feeds and session profiles in fast in-memory storage to prevent repeated database queries.
- **Primary Database**: Serves as the authoritative source of truth that safely processes all metadata write transactions with strict ACID guarantees.
- **Read Replica**: Offloads read queries from the primary database by handling feed fetches, follower checks, and profile lookups asynchronously.
- **Object Storage**: Delivers cheap, highly durable, and horizontally scalable storage for unstructured binary files like original photos and thumbnails.
- **Message Queue**: Decouples photo uploading from image processing by buffering thumbnail generation tasks for asynchronous consumption.
- **Thumbnail Worker**: Consumes tasks from the queue, downloads original photos, and resizes them into thumbnails in the background without blocking users.

---

## 7. Step-by-Step Photo Upload Flow

1. **Client Request**: The user client initiates a `POST /api/v1/photos` request with the photo image payload and metadata (caption, location) directed through the Load Balancer.
2. **Traffic Distribution**: The Load Balancer forwards the request to an available, healthy App Server instance.
3. **Authentication & Validation**: The App Server authenticates the user, validates image headers and format, and generates a unique `photo_id`.
4. **Original Image Storage**: The App Server streams the 2 MB original photo binary directly to Object Storage and receives a storage object URL/key.
5. **Metadata Persistence**: The App Server inserts a new metadata record into the **Primary Database** containing `photo_id`, `user_id`, `created_at`, `status = 'processing'`, and the original object storage URL.
6. **Task Enqueueing**: The App Server publishes an asynchronous thumbnail creation task (`{ photo_id, user_id, original_url }`) to the **Message Queue**.
7. **Immediate User Response**: The App Server returns an immediate `201 Created` response with the photo metadata and processing status to the user client so the user does not wait.
8. **Worker Consumption**: A background **Thumbnail Worker** pulls the message off the Message Queue.
9. **Image Processing**: The worker fetches the original image from Object Storage, resizes it into a 50 KB thumbnail, and uploads the thumbnail back to Object Storage.
10. **State & Feed Update**: The worker updates the photo row in the **Primary Database** with the new `thumbnail_url` and `status = 'ready'`, then updates or invalidates the author's followers' feed caches in the **In-Memory Cache**.

---

## 8. Architectural Trade-offs

### Trade-off 1: Feed Generation — Fan-out on Write (Push) vs. Fan-out on Read (Pull)
- **Fan-out on Write (Push)**: When a user uploads a photo, a background process writes the photo ID directly into the precomputed feed cache of every follower.
  - *Pros*: Feed reads are blazing fast $O(1)$ cache lookups, which is ideal for SnapShare's $50:1$ read-heavy workload.
  - *Cons*: Users with millions of followers (celebrities) cause "write amplification" spikes, requiring thousands or millions of cache writes per single upload.
- **Decision/Compromise**: Adopt a **Hybrid approach**. Use Fan-out on Write for standard users (pushing updates to their followers' cached feed lists) and Fan-out on Read for high-follower accounts (dynamically merging their recent uploads into a user's feed upon request).

### Trade-off 2: Thumbnail Processing — Synchronous vs. Asynchronous Generation
- **Synchronous Generation**: The App Server resizes the image before completing the HTTP response.
  - *Pros*: The thumbnail is immediately available, eliminating intermediate "processing" states on client apps and simplifying client UI logic.
  - *Cons*: Resizing consumes heavy CPU cycles and memory on App Servers, spikes HTTP request latency from ~100 ms to several seconds, ties up web server threads, and risks dropping connections under peak upload traffic ($58$ uploads/s).
- **Decision/Compromise**: Adopt **Asynchronous Generation via Message Queue**. By decoupling resizing into background workers, the client receives an instantaneous success response, the web layer remains lightweight and resilient, and worker concurrency can be scaled independently during upload spikes.

### Trade-off 3: Data Consistency — Strong Consistency vs. Eventual Consistency
- **Strong Consistency**: Guarantees that reads immediately reflect the latest writes across all database replicas and caches.
  - *Pros*: Users never see stale feeds or missing posts right after refreshing.
  - *Cons*: Requires distributed locking or forcing all reads to the primary database, severely throttling throughput and introducing latency.
- **Decision/Compromise**: Adopt **Eventual Consistency** for feeds and read replicas. A replication lag of a few hundred milliseconds or a delayed cache update is entirely acceptable in a photo-sharing social feed, unlocking massive horizontal read scalability and high availability.
