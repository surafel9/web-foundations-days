# SnapShare - Scaling Plan

## Assumptions

- **Registered Users**: 10,000,000 (10 million registered users).
- **Daily Active Users (DAU)**: 10% active daily = 1,000,000 DAU ($10,000,000 \times 10\% = 1,000,000$).
- **Daily User Activity**: Each active user uploads 1 photo and views 50 feed pages per day.
- **Media File Sizes**: Original photo: 2 MB. Thumbnail: 50 KB (0.05 MB).
- **Time Convention**: 1 day ≈ 100,000 seconds (rule of thumb; exact = 86,400 seconds).
- **Peak Traffic Multiplier**: Peak traffic is estimated at 5× average traffic.

---

## Estimates

### 1. Uploads Per Second (Writes)
- **Total uploads per day**: 
  $$1,000,000 \text{ DAU} \times 1 \text{ upload/day} = 1,000,000 \text{ uploads/day}$$
- **Average uploads per second**:
  - Rule of thumb ($100,000 \text{ s/day}$): $1,000,000 \div 100,000 \approx \mathbf{10 \text{ uploads/second}}$
  - Exact ($86,400 \text{ s/day}$): $1,000,000 \div 86,400 \approx \mathbf{11.57 \text{ uploads/second}}$ ($\approx 12\text{ uploads/s}$)
- **Peak uploads per second (5× average)**:
  - Rule of thumb: $10 \times 5 = \mathbf{50 \text{ uploads/second}}$
  - Exact: $11.57 \times 5 \approx \mathbf{57.87 \text{ uploads/second}}$ ($\approx 58\text{ uploads/s}$)

### 2. Feed Views Per Second (Reads)
- **Total feed views per day**:
  $$1,000,000 \text{ DAU} \times 50 \text{ feed pages/day} = 50,000,000 \text{ feed views/day}$$
- **Average feed views per second**:
  - Rule of thumb ($100,000 \text{ s/day}$): $50,000,000 \div 100,000 \approx \mathbf{500 \text{ feed views/second}}$
  - Exact ($86,400 \text{ s/day}$): $50,000,000 \div 86,400 \approx \mathbf{578.70 \text{ feed views/second}}$ ($\approx 579\text{ views/s}$)
- **Peak feed views per second (5× average)**:
  - Rule of thumb: $500 \times 5 = \mathbf{2,500 \text{ feed views/second}}$
  - Exact: $578.70 \times 5 \approx \mathbf{2,893.52 \text{ feed views/second}}$ ($\approx 2,894\text{ views/s}$)

### 3. Photo Storage Per Year
- **Storage per photo upload**:
  - Original image: $2\text{ MB}$
  - Thumbnail: $50\text{ KB} = 0.05\text{ MB}$
  - Combined storage per upload: $2\text{ MB} + 0.05\text{ MB} = 2.05\text{ MB}$
- **Daily storage requirement**:
  - $1,000,000 \text{ photos/day} \times 2.05\text{ MB} = 2,050,000\text{ MB} \approx \mathbf{2.05 \text{ TB/day}}$ (approximately $\mathbf{2 \text{ TB/day}}$)
  - Originals: $1,000,000 \times 2\text{ MB} = 2\text{ TB/day}$
  - Thumbnails: $1,000,000 \times 0.05\text{ MB} = 0.05\text{ TB/day}$
- **Annual storage requirement (365 days)**:
  - Rule of thumb: $2 \text{ TB/day} \times 365 \approx \mathbf{730 \text{ to } 750 \text{ TB/year}}$
  - Exact: $2.05 \text{ TB/day} \times 365 = \mathbf{748.25 \text{ TB/year}}$ (approximately $\mathbf{750 \text{ TB/year}}$: $730\text{ TB}$ originals + $18.25\text{ TB}$ thumbnails)

---

## Read-heavy or write-heavy?

SnapShare is **very read-heavy**:
- **50 feed views for every 1 upload** ($50,000,000$ daily reads vs. $1,000,000$ daily writes), giving a **$50:1$ read-to-write ratio**.

### What this means for system design:
1. **Optimize and cheapen reads**: Because 98% of requests are reads, the primary operational focus is read latency. We use edge CDNs for photo and thumbnail delivery, in-memory caches (Redis) for precomputed user feeds, and database read replicas to absorb feed query volume.
2. **Asynchronous, reliable writes**: Writes are low volume (10–12 uploads/s average, 50–58 peak). Upload requests should prioritize reliability and fast user acknowledgement rather than instantaneous background processing; computationally heavy work like thumbnail generation must run asynchronously in background workers.

---

## Where do the photos go?

Photos must **NOT** be stored in the database. Storing ~750 TB/year of binary files (`BLOB` columns) inside a relational database cripples performance, scalability, and stability for four reasons:

1. **Buffer Pool & Memory Thrashing**: Databases cache active indexing trees and hot data pages in RAM (buffer pool). Multi-megabyte photo files displace critical indexes and rows from memory, resulting in severe cache thrashing and degraded query performance.
2. **Prohibitive Storage Costs**: Relational database storage runs on high-performance, high-IOPS provisioned block storage (e.g., AWS EBS io2 SSDs), costing up to $10\times$ more per gigabyte than object storage. Storing hundreds of terabytes of media files here is economically unsustainable.
3. **Database Connection Starvation**: Streaming a 2 MB binary payload across a database connection holds that connection open for hundreds of milliseconds, quickly exhausting database connection pools and starving critical transactional queries.
4. **Paralyzed Backups & Replication**: Backups, point-in-time recovery, and cluster replication streams slow to a crawl when transferring hundreds of terabytes of binary payloads, drastically increasing replication lag and recovery time objectives (RTO).

### Where photos go instead:
Photo files and thumbnails go into **Distributed Object Storage** (such as Amazon S3, Google Cloud Storage, or MinIO), which is specifically architected for cheap, highly available, and durable ($99.999999999\%$) storage of unstructured binary objects.

The relational database stores only lightweight structured metadata:
- `photo_id`, `user_id`, `caption`, `created_at`, `original_photo_url`, `thumbnail_url`, and `status`.

---

## Architecture

```
    Mobile app / browser
       │   photo files and thumbnails
       ├──────────────────────────────> CDN ──> Object storage
       │   API calls (HTTPS, JSON)              (photo files)
       v                                             ^
    Load balancer                                    │ uploads
       │                                             │
       ├──> App server 1 ──┐                         │
       ├──> App server 2 ──┼──> Cache (Redis): feeds │
       └──> App server 3 ──┘                         │
               │      │                              │
               │      └──> Queue ──> Thumbnail worker┘
               v
    Primary DB ──replicates──> Read replicas
    (metadata)                 (feed queries)
```

### Detailed Component Interaction Flow:
- **Client Read Path**: Clients request images and thumbnails directly from the **CDN**, which caches media from **Object Storage**. Feeds are requested via API calls through the **Load Balancer** to **App Servers**, which fetch precomputed timelines from the **In-Memory Cache (Redis)** or fall back to **Read Replicas**.
- **Client Write Path**: Clients upload photos and metadata via API calls through the **Load Balancer** to **App Servers**.
- **Storage Tier Interface**: The **App Server** streams the original photo directly to **Object Storage** and records metadata in the **Primary DB**.
- **Queue & Worker Interaction**: The **App Server** publishes a lightweight thumbnail job to the **Message Queue**. A decoupled **Thumbnail Worker** pulls the job asynchronously, downloads the original from **Object Storage**, generates the 50 KB thumbnail, writes it back to **Object Storage**, updates the **Primary DB** with the thumbnail URL, and invalidates follower feed caches.

---

## Components

- **CDN**: Serves photos and thumbnails from edge servers near users, so images load fast and our servers are not overloaded by 2,500 peak feed views per second.
- **Object storage**: Provides cheap, highly durable, and horizontally scalable storage for hundreds of terabytes of unstructured photo and thumbnail files.
- **Load balancer**: Spreads incoming API traffic evenly across healthy app servers and seamlessly routes around failed instances.
- **App servers (stateless)**: Handle API requests, enforce user authentication, and execute business logic; additional servers can be added horizontally as traffic grows.
- **Cache (Redis)**: Keeps each user's prepared feed in memory for instantaneous $O(1)$ scrolling and fast feed retrieval.
- **Primary database**: Serves as the authoritative source of truth that safely processes user data, social relationships, and photo metadata write transactions with ACID guarantees.
- **Read replicas**: Handle the heavy feed read queries by asynchronously replicating data from the primary, protecting the primary database from read spikes.
- **Queue + thumbnail worker**: Creates thumbnails in the background asynchronously so the client's upload request finishes quickly without blocking the user.

---

## Upload flow

1. The mobile app or browser sends the photo binary and metadata to an app server through the load balancer via `POST /api/v1/photos`.
2. The app server authenticates the user's session token and validates the image format, headers, and file size.
3. The app server saves the original 2 MB photo file directly to object storage (e.g., S3) and obtains the storage URL/key.
4. The app server inserts a metadata row for the photo into the primary database with fields `photo_id`, `user_id`, `created_at`, `status = 'processing'`, and the original photo URL.
5. The app server adds an asynchronous processing job (e.g., `{"photo_id": "123", "original_url": "..."}`) to the message queue.
6. The app server immediately replies `201 Created` with the photo metadata to the user, providing a fast, non-blocking upload experience.
7. A background thumbnail worker pulls the job from the message queue, fetches the original image from object storage, resizes it into a 50 KB thumbnail, saves the thumbnail file back to object storage, and updates the photo's row in the primary database with the `thumbnail_url` and `status = 'ready'`.
8. The worker invalidates or updates the followers' cached feeds in Redis so the new photo appears on their feed on their next refresh.

---

## Trade-offs

1. **Speed vs. Freshness (Eventual Consistency vs. Immediate Feed Freshness)**:
   - Feeds are served directly from the Redis cache and database read replicas to handle 2,500+ peak views/second.
   - *Trade-off*: When a user posts a photo, it may take several seconds for cache invalidation and database replication to propagate across all followers.
   - *Verdict*: This eventual consistency is completely acceptable for a photo-sharing social network and massively reduces database CPU and query load.

2. **Simplicity vs. Speed of Upload (Asynchronous Worker Queues vs. Synchronous Processing)**:
   - Thumbnails are generated asynchronously via a message queue and background workers.
   - *Trade-off*: Adds architectural complexity (queue infrastructure, dead-letter queues, worker monitoring) and causes a brief window where the uploaded photo has no thumbnail yet (the client app temporarily displays a placeholder or original image).
   - *Verdict*: This trade-off is critical; synchronous processing would freeze HTTP worker threads for seconds per 2 MB image, exhausting connection pools and causing timeouts during peak upload bursts of 50+ uploads/second.

3. **Infrastructure Cost vs. Operational Complexity (CDN & Object Storage vs. Dedicated Disks)**:
   - Storing media in distributed object storage and caching through a global CDN incurs per-gigabyte and egress network fees.
   - *Trade-off*: Introduces third-party cloud service dependencies and usage-based costs.
   - *Verdict*: This is drastically cheaper, more secure, and more reliable than purchasing, maintaining, backing up, and serving ~750 TB of media annually from proprietary server hard drives.
