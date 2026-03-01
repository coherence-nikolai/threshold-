const intro = document.getElementById("intro");
const ui = document.getElementById("ui");
const questionEl = document.getElementById("question");
const nextBtn = document.getElementById("next");
const fieldSelector = document.getElementById("field-selector");
const languageToggle = document.getElementById("language-toggle");

let depth = parseInt(localStorage.getItem("depth")) || 0;
let currentField = "self";
let currentLang = navigator.language.startsWith("es") ? "es" : "en";

setTimeout(() => {
  intro.style.display = "none";
  ui.style.display = "flex";
  showQuestion();
}, 6000);

function showQuestion() {
  const pool = QUESTION_DATA[currentLang][currentField];
  questionEl.textContent = pool[Math.floor(Math.random() * pool.length)];
  depth += 1;
  localStorage.setItem("depth", depth);

  if (depth > 5) {
    fieldSelector.style.display = "none";
  }
}

nextBtn.addEventListener("click", () => {
  showQuestion();
});

fieldSelector.addEventListener("click", (e) => {
  if (e.target.dataset.field) {
    currentField = e.target.dataset.field;
    showQuestion();
  }
});

languageToggle.addEventListener("click", () => {
  currentLang = currentLang === "en" ? "es" : "en";
  showQuestion();
});
