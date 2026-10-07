-- ============================================================
-- Day 6 Assignment: A School Database
-- SQLite compatible database schema, seed data, and queries
-- ============================================================

-- Enable foreign key support in SQLite
PRAGMA foreign_keys = ON;

-- Cleanup existing tables if they exist to allow clean reruns
DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;

-- ============================================================
-- 1. CREATE TABLE STATEMENTS
-- ============================================================

-- Students table: Stores unique student identification, names, and emails
CREATE TABLE students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE
);

-- Courses table: Stores course information including title and code
CREATE TABLE courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL
);

-- Enrolments table: Join table representing student course enrollments
-- Includes grade and a UNIQUE constraint preventing duplicate enrollments
CREATE TABLE enrolments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    grade TEXT,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    UNIQUE (student_id, course_id)
);

-- ============================================================
-- 2. INSERT SAMPLE DATA
-- ============================================================

-- Insert students (at least 3; adding 4 to demonstrate students with no enrolments)
INSERT INTO students (name, email) VALUES
    ('Alice Smith', 'alice.smith@example.edu'),
    ('Bob Johnson', 'bob.johnson@example.edu'),
    ('Charlie Davis', 'charlie.davis@example.edu'),
    ('Diana Prince', 'diana.prince@example.edu');

-- Insert courses (at least 3; adding 4)
INSERT INTO courses (code, title) VALUES
    ('CS101', 'Introduction to Programming'),
    ('CS102', 'Web Foundations'),
    ('CS103', 'Database Systems'),
    ('CS104', 'Computer Networks');

-- Insert enrolments (at least 5; adding 6 records)
INSERT INTO enrolments (student_id, course_id, grade) VALUES
    (1, 1, 'A'),   -- Alice enrolled in CS101
    (1, 2, 'A-'),  -- Alice enrolled in CS102
    (1, 3, 'B+'),  -- Alice enrolled in CS103
    (2, 1, 'B'),   -- Bob enrolled in CS101
    (2, 2, 'B+'),  -- Bob enrolled in CS102
    (3, 3, 'A');   -- Charlie enrolled in CS103
    -- Note: Diana Prince (id=4) has no enrolments; CS104 has 0 enrolments

-- ============================================================
-- 3. FIVE QUERIES
-- ============================================================

-- Query 1: All courses for one student (by name)
SELECT 
    students.name AS student_name,
    courses.code AS course_code,
    courses.title AS course_title,
    enrolments.grade
FROM students
JOIN enrolments ON students.id = enrolments.student_id
JOIN courses ON enrolments.course_id = courses.id
WHERE students.name = 'Alice Smith';

-- Query 2: All students on one course (by course title)
SELECT 
    courses.title AS course_title,
    students.name AS student_name,
    students.email AS student_email,
    enrolments.grade
FROM courses
JOIN enrolments ON courses.id = enrolments.course_id
JOIN students ON enrolments.student_id = students.id
WHERE courses.title = 'Web Foundations';

-- Query 3: The number of students per course
SELECT 
    courses.id AS course_id,
    courses.code AS course_code,
    courses.title AS course_title,
    COUNT(enrolments.student_id) AS student_count
FROM courses
LEFT JOIN enrolments ON courses.id = enrolments.course_id
GROUP BY courses.id, courses.code, courses.title
ORDER BY student_count DESC, courses.title ASC;

-- Query 4: Students who have no enrolments
SELECT 
    students.id AS student_id,
    students.name AS student_name,
    students.email AS student_email
FROM students
LEFT JOIN enrolments ON students.id = enrolments.student_id
WHERE enrolments.id IS NULL;

-- Query 5: Update of one enrolment's grade (and verify the updated record)
UPDATE enrolments
SET grade = 'A+'
WHERE student_id = (SELECT id FROM students WHERE name = 'Alice Smith')
  AND course_id = (SELECT id FROM courses WHERE code = 'CS103');

-- Verify the update
SELECT 
    students.name AS student_name,
    courses.code AS course_code,
    courses.title AS course_title,
    enrolments.grade AS updated_grade
FROM enrolments
JOIN students ON enrolments.student_id = students.id
JOIN courses ON enrolments.course_id = courses.id
WHERE students.name = 'Alice Smith' AND courses.code = 'CS103';
