// =============================================================================
// Day 4: Live Character Counter and Dark Mode
// =============================================================================

// DOM Elements
const noteText = document.getElementById("note-text");
const charCount = document.getElementById("char-count");
const wordCount = document.getElementById("word-count");
const clearBtn = document.getElementById("clear-btn");
const themeToggle = document.getElementById("theme-toggle");

// Storage Keys
const DRAFT_KEY = "draft";
const THEME_KEY = "theme";

/**
 * Updates character count, word count, and threshold warning classes.
 */
function updateCounts() {
  const text = noteText.value;
  const chars = text.length;
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;

  // Update text representations
  charCount.textContent = `${chars} / 200 characters`;
  wordCount.textContent = `${words} words`;

  // Update counter warning/over classes:
  // - warning: orange text when over 180 characters (and <= 200)
  // - over: red, bold text when over 200 characters
  if (chars > 200) {
    charCount.classList.remove("warning");
    charCount.classList.add("over");
  } else if (chars > 180) {
    charCount.classList.add("warning");
    charCount.classList.remove("over");
  } else {
    charCount.classList.remove("warning");
    charCount.classList.remove("over");
  }
}

/**
 * Clears the textarea, resets counters, and removes the saved draft.
 */
function clearNote() {
  noteText.value = "";
  localStorage.removeItem(DRAFT_KEY);
  localStorage.removeItem("note_draft");
  updateCounts();
  noteText.focus();
}

/**
 * Toggles the dark theme class on <body>, updates button label, and persists choice.
 */
function toggleTheme() {
  document.body.classList.toggle("dark");
  const isDark = document.body.classList.contains("dark");
  themeToggle.textContent = isDark ? "Light mode" : "Dark mode";
  localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
}

// -----------------------------------------------------------------------------
// Event Listeners
// -----------------------------------------------------------------------------

// On every input event, update counters and persist draft
noteText.addEventListener("input", () => {
  updateCounts();
  localStorage.setItem(DRAFT_KEY, noteText.value);
  localStorage.setItem("note_draft", noteText.value);
});

// Clear button resets everything
clearBtn.addEventListener("click", clearNote);

// Pressing Escape inside the textarea clears everything
noteText.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    clearNote();
  }
});

// Theme button toggles dark mode
themeToggle.addEventListener("click", toggleTheme);

// -----------------------------------------------------------------------------
// Initialization (Page Load)
// -----------------------------------------------------------------------------

function init() {
  // Restore theme from localStorage
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme === "dark") {
    document.body.classList.add("dark");
    themeToggle.textContent = "Light mode";
  } else {
    document.body.classList.remove("dark");
    themeToggle.textContent = "Dark mode";
  }

  // Restore draft from localStorage
  const savedDraft = localStorage.getItem(DRAFT_KEY) ?? localStorage.getItem("note_draft");
  if (savedDraft !== null) {
    noteText.value = savedDraft;
  }

  // Initial calculation of counters and warning states
  updateCounts();
}

// Run initialization
init();
