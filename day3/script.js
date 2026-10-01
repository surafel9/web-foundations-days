// ── Starting data ─────────────────────────────────────────────────────────────
let notes = [
  { id: 1, text: "Buy milk and bread",               category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment",      category: "study"    },
  { id: 3, text: "Email the project report to Grace",category: "work"     },
  { id: 4, text: "Revise JavaScript arrays",         category: "study"    },
  { id: 5, text: "Call mum",                         category: "personal" },
];

// ── 1. searchNotes(word) ──────────────────────────────────────────────────────
// Returns an array of notes whose text contains `word` (case-insensitive).
function searchNotes(word) {
  return notes.filter(note =>
    note.text.toLowerCase().includes(word.toLowerCase())
  );
}

// Tests
console.log(searchNotes("day"));      // Expected: [{ id: 2, text: "Finish the Day 3 assignment", category: "study" }]
console.log(searchNotes("xyz"));      // Expected: []  (no match)

// ── 2. longestNote() ─────────────────────────────────────────────────────────
// Returns the note object with the most characters, or null if notes is empty.
function longestNote() {
  if (notes.length === 0) return null;
  return notes.reduce((longest, note) =>
    note.text.length > longest.text.length ? note : longest
  );
}

// Tests
console.log(longestNote());           // Expected: { id: 3, text: "Email the project report to Grace", category: "work" }
const savedNotes = notes;
notes = [];
console.log(longestNote());           // Expected: null  (empty array)
notes = savedNotes;

// ── 3. countByCategory() ─────────────────────────────────────────────────────
// Returns an object counting notes per category.
function countByCategory() {
  const counts = {};
  for (const note of notes) {
    counts[note.category] = (counts[note.category] || 0) + 1;
  }
  return counts;
}

// Tests
console.log(countByCategory());       // Expected: { personal: 2, work: 1, study: 2 }

// ── 4. getSummary() ──────────────────────────────────────────────────────────
// Returns a human-readable sentence summarising the notes by category.
function getSummary() {
  const total  = notes.length;
  const counts = countByCategory();
  const label  = total === 1 ? "note" : "notes";
  const parts  = Object.entries(counts)
    .map(([cat, n]) => `${n} ${cat}`)
    .join(", ");
  return `${total} ${label}: ${parts}.`;
}

// Tests
console.log(getSummary());            // Expected: "5 notes: 2 personal, 1 work, 2 study."
const savedNotes2 = notes;
notes = [{ id: 99, text: "Solo note", category: "work" }];
console.log(getSummary());            // Expected: "1 note: 1 work."
notes = savedNotes2;

// ── 5. isDuplicate(text) ─────────────────────────────────────────────────────
// Returns true if a note with the same text already exists (trim + lowercase).
function isDuplicate(text) {
  const normalised = text.trim().toLowerCase();
  return notes.some(note => note.text.trim().toLowerCase() === normalised);
}

// Tests
console.log(isDuplicate("Call mum")); // Expected: true  (exact match)
console.log(isDuplicate("  CALL MUM  ")); // Expected: true  (case + spaces)
console.log(isDuplicate("Call dad")); // Expected: false  (no match)

// ── 6. addNote(text, category) ───────────────────────────────────────────────
// Adds a note only if:
//   - text is 1–200 characters
//   - text is not a duplicate
//   - category is one of: personal, work, study
// Returns true when added, false otherwise (and logs the reason).
function addNote(text, category) {
  const VALID_CATEGORIES = ["personal", "work", "study"];
  const trimmedText = text.trim();

  if (trimmedText.length < 1 || trimmedText.length > 200) {
    console.log(`addNote failed: text must be 1–200 characters (got ${trimmedText.length}).`);
    return false;
  }
  if (!VALID_CATEGORIES.includes(category)) {
    console.log(`addNote failed: "${category}" is not a valid category. Use personal, work, or study.`);
    return false;
  }
  if (isDuplicate(trimmedText)) {
    console.log(`addNote failed: a note with this text already exists.`);
    return false;
  }

  const newId = notes.length > 0 ? Math.max(...notes.map(n => n.id)) + 1 : 1;
  notes.push({ id: newId, text: trimmedText, category });
  return true;
}

// Tests
console.log(addNote("Read Chapter 5", "study"));    // Expected: true  (valid new note)
console.log(addNote("Call mum", "personal"));        // Expected: false (duplicate)
console.log(addNote("", "personal"));                // Expected: false (too short)
console.log(addNote("A".repeat(201), "work"));       // Expected: false (too long)
console.log(addNote("Team stand-up meeting", "fun"));// Expected: false (invalid category)
console.log(notes);                                  // Expected: 6 notes (original 5 + "Read Chapter 5")
