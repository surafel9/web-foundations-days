# School Database Design

## 1. Table Explanations

- **`students`**: Represents individual learners enrolled in the school. Each record stores unique identification information (`id` as primary key), the student's full name (`name` with `NOT NULL`), and their contact email address (`email` with `NOT NULL UNIQUE` to guarantee every student has a distinct identifier).
- **`courses`**: Represents academic courses offered by the institution. Each record holds a unique surrogate key (`id` as primary key), a distinct course code (`code` such as `'CS101'` with `NOT NULL UNIQUE`), and the descriptive course title (`title` with `NOT NULL`).
- **`enrolments`**: Acts as an associative junction (join) table connecting students to the courses they take. In addition to surrogate identity (`id`), it holds foreign keys `student_id` (referencing `students(id)`) and `course_id` (referencing `courses(id)`), the evaluation outcome (`grade`), and a composite unique constraint `UNIQUE (student_id, course_id)` preventing a student from enrolling in the same course multiple times.

---

## 2. Relationships

- **Many-to-Many ($M:N$)**: The conceptual relationship between **students** and **courses** is many-to-many. A single student can register for multiple courses, and conversely, a single course can be attended by multiple students.
- **One-to-Many ($1:N$)**: In a relational model, the many-to-many relationship is decomposed into two one-to-many relationships through the `enrolments` table:
  - One student has many enrolments ($1 : N$ between `students` and `enrolments`).
  - One course has many enrolments ($1 : N$ between `courses` and `enrolments`).
- **Why a Join Table is Needed**: Relational database management systems (RDBMS) require atomic values in columns (First Normal Form) and cannot directly store lists/arrays of foreign keys without causing data redundancy, update anomalies, and query inefficiency. A join table solves this by:
  1. Normalizing the schema so neither table needs repeating columns (e.g., `course_1`, `course_2`) or delimited strings.
  2. Enabling relationship-specific attributes—such as `grade`, enrollment date, or completion status—to be stored cleanly at the point of intersection.
  3. Enforcing relational integrity via foreign key constraints with cascade rules and preventing duplicate enrollments with composite unique constraints.

---

## 3. Recommended Index

**Index Definition**:
```sql
CREATE INDEX idx_enrolments_course_id ON enrolments(course_id);
```

**Reason**:
In SQLite and most relational databases, defining `UNIQUE (student_id, course_id)` automatically creates a composite B-tree index where `student_id` is the leading column. This composite index efficiently accelerates queries filtering or joining by `student_id`, but it cannot be used efficiently by the query optimizer when querying or joining purely by `course_id` (e.g., finding all students enrolled in a specific course, or calculating student counts per course with `GROUP BY course_id`). Adding an index on `enrolments(course_id)` allows the database engine to perform rapid index seeks instead of full table scans during joins and aggregations on course rosters.

---

## 4. SQL vs. NoSQL Selection

For a school administration and grading database, **SQL (Relational Database)** is the clearly superior choice over NoSQL. Academic systems prioritize data consistency, structural integrity, and transactional guarantees (ACID)—for instance, ensuring that enrollment limits are respected, grade assignments are reliable, duplicate registrations are strictly prohibited, and student deletions do not leave orphaned enrollments. Furthermore, school workloads heavily feature relational reporting across entities, such as computing GPA, filtering course rosters, generating transcripts, and identifying unenrolled students; these operations rely on joins, aggregations, and constraints that SQL provides natively out of the box. Storing this information in a NoSQL document or key-value store would either duplicate course and student information across documents (introducing risks of stale, conflicting data upon updates) or force manual multi-document join logic into the application layer without transactional safety.
