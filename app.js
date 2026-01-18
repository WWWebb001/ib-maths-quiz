// app.js

const QUESTIONS_URL = "./questions.json";

// localStorage keys
const LS_STATS = "ibmaths_quiz_stats_v1";
const LS_PROFILE = "ibmaths_quiz_profile_v1";

// DOM
const topicSelect = document.getElementById("topicSelect");
const modeSelect = document.getElementById("modeSelect");
const difficultySelect = document.getElementById("difficultySelect");
const countSelect = document.getElementById("countSelect");

const btnStart = document.getElementById("btnStart");
const btnSkip = document.getElementById("btnSkip");
const btnEnd = document.getElementById("btnEnd");
const btnNext = document.getElementById("btnNext");

const quizCard = document.getElementById("quizCard");
const resultsCard = document.getElementById("resultsCard");

const questionTitle = document.getElementById("questionTitle");
const questionText = document.getElementById("questionText");
const optionsGrid = document.getElementById("optionsGrid");
const feedback = document.getElementById("feedback");
const resultBadge = document.getElementById("resultBadge");
const explain = document.getElementById("explain");

const qCounter = document.getElementById("qCounter");
const qMeta = document.getElementById("qMeta");
const progressFill = document.getElementById("progressFill");

const statStreak = document.getElementById("statStreak");
const statXP = document.getElementById("statXP");
const statAccuracy = document.getElementById("statAccuracy");
const statAnswered = document.getElementById("statAnswered");

const resultsSummary = document.getElementById("resultsSummary");
const resScore = document.getElementById("resScore");
const resAccuracy = document.getElementById("resAccuracy");
const resXP = document.getElementById("resXP");
const reviewList = document.getElementById("reviewList");

const btnBackHome = document.getElementById("btnBackHome");
const btnRetryWrong = document.getElementById("btnRetryWrong");

const btnResetStats = document.getElementById("btnResetStats");
const btnExportStats = document.getElementById("btnExportStats");
const btnImportStats = document.getElementById("btnImportStats");

// State
let allQuestions = [];
let session = {
  deck: [],
  index: 0,
  correct: 0,
  wrong: 0,
  skipped: 0,
  xpEarned: 0,
  wrongIds: []
};
let currentQuestion = null;
let locked = false;

// Stats schema (per question)
function defaultQStat() {
  return { attempts: 0, correct: 0, wrong: 0, lastSeen: null, lastCorrect: null };
}

// Profile schema (overall)
function defaultProfile() {
  return {
    xp: 0,
    streak: 0,
    totalAnswered: 0,
    totalCorrect: 0
  };
}

function loadStats() {
  try {
    const raw = localStorage.getItem(LS_STATS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function saveStats(stats) {
  localStorage.setItem(LS_STATS, JSON.stringify(stats));
}

function loadProfile() {
  try {
    const raw = localStorage.getItem(LS_PROFILE);
    return raw ? JSON.parse(raw) : defaultProfile();
  } catch {
    return defaultProfile();
  }
}
function saveProfile(profile) {
  localStorage.setItem(LS_PROFILE, JSON.stringify(profile));
}

function formatPct(n) {
  if (!isFinite(n)) return "-";
  return `${Math.round(n)}%`;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function nowISO() {
  return new Date().toISOString();
}

function calcXP(q, isCorrect) {
  // XP design (simple but motivating)
  // - correct gives more XP than wrong
  // - higher difficulty gives more XP
  const base = q.difficulty * 10; // 10,20,30,40
  return isCorrect ? (base + 5) : 2;
}

function updateDashboardUI() {
  const profile = loadProfile();
  statStreak.textContent = profile.streak ?? 0;
  statXP.textContent = profile.xp ?? 0;

  const answered = profile.totalAnswered ?? 0;
  const correct = profile.totalCorrect ?? 0;
  const acc = answered > 0 ? (correct / answered) * 100 : NaN;

  statAccuracy.textContent = answered > 0 ? formatPct(acc) : "-";
  statAnswered.textContent = answered;
}

function renderMath() {
  // Refresh MathJax after inserting content
  if (window.MathJax && window.MathJax.typesetPromise) {
    window.MathJax.typesetPromise();
  }
}

function buildTopicDropdown(questions) {
  const topics = Array.from(new Set(questions.map(q => q.topic))).sort();
  // Clear and re-add
  topicSelect.innerHTML = `<option value="all" selected>All topics</option>`;
  for (const t of topics) {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    topicSelect.appendChild(opt);
  }
}

function filterQuestions() {
  const mode = modeSelect.value;
  const topic = topicSelect.value;
  const difficulty = difficultySelect.value;

  const stats = loadStats();

  let filtered = allQuestions.filter(q => {
    // topic
    if (topic !== "all" && q.topic !== topic) return false;

    // difficulty
    if (difficulty !== "all" && String(q.difficulty) !== String(difficulty)) return false;

    // mode
    if (mode === "paper1" && q.paper !== "paper1" && q.paper !== "both") return false;
    if (mode === "paper2" && q.paper !== "paper2" && q.paper !== "both") return false;

    if (mode === "reviewWrong") {
      // only include questions you've previously got wrong more than correct
      const s = stats[q.id] || defaultQStat();
      if (s.wrong <= 0) return false;
      if (s.correct >= s.wrong) return false;
    }

    return true;
  });

  // If reviewWrong gives nothing, fall back to mixed
  if (mode === "reviewWrong" && filtered.length === 0) {
    filtered = allQuestions;
  }

  return filtered;
}

function startQuiz() {
  const count = Number(countSelect.value);
  const pool = filterQuestions();

  // Make a deck: shuffle, take count
  const deck = shuffle(pool).slice(0, Math.min(count, pool.length));

  session = {
    deck,
    index: 0,
    correct: 0,
    wrong: 0,
    skipped: 0,
    xpEarned: 0,
    wrongIds: []
  };

  resultsCard.hidden = true;
  quizCard.hidden = false;

  showQuestion();
}

function showQuestion() {
  locked = false;
  feedback.hidden = true;
  optionsGrid.innerHTML = "";
  explain.textContent = "";

  if (session.index >= session.deck.length) {
    endQuiz();
    return;
  }

  currentQuestion = session.deck[session.index];

  // UI text
  qCounter.textContent = `Q ${session.index + 1} / ${session.deck.length}`;
  qMeta.textContent = `${currentQuestion.topic} • Difficulty ${currentQuestion.difficulty} • ${currentQuestion.paper.toUpperCase()}`;

  const progress = ((session.index) / session.deck.length) * 100;
  progressFill.style.width = `${progress}%`;

  questionTitle.textContent = `Question ${session.index + 1}`;
  questionText.innerHTML = `<div>${currentQuestion.question}</div>`;

  // Options
  const letters = ["A", "B", "C", "D"];
  currentQuestion.options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.className = "optionBtn";
    btn.innerHTML = `
      <div class="optionTag">${letters[i]}</div>
      <div class="optionText">${opt}</div>
    `;
    btn.addEventListener("click", () => chooseAnswer(i, btn));
    optionsGrid.appendChild(btn);
  });

  renderMath();
}

function chooseAnswer(selectedIndex, selectedBtn) {
  if (locked) return;
  locked = true;

  const isCorrect = selectedIndex === currentQuestion.answerIndex;

  // Mark buttons
  const buttons = [...document.querySelectorAll(".optionBtn")];
  buttons.forEach((b, i) => {
    if (i === currentQuestion.answerIndex) b.classList.add("correct");
    if (i === selectedIndex && !isCorrect) b.classList.add("wrong");
    b.disabled = true;
  });

  // Update session
  if (isCorrect) {
    session.correct += 1;
    resultBadge.textContent = "Correct ✅";
    resultBadge.style.borderColor = "rgba(53,241,165,0.55)";
  } else {
    session.wrong += 1;
    session.wrongIds.push(currentQuestion.id);
    resultBadge.textContent = "Incorrect ❌";
    resultBadge.style.borderColor = "rgba(255,77,109,0.55)";
  }

  // XP + stats persistence
  const gained = calcXP(currentQuestion, isCorrect);
  session.xpEarned += gained;
  persistAttempt(currentQuestion.id, isCorrect, gained);

  explain.innerHTML = currentQuestion.explanation
    ? `Explanation: ${currentQuestion.explanation} <br><br><span class="muted">XP: +${gained}</span>`
    : `<span class="muted">XP: +${gained}</span>`;

  feedback.hidden = false;
  renderMath();
}

function persistAttempt(qid, isCorrect, gainedXP) {
  const stats = loadStats();
  const profile = loadProfile();

  // per-question
  const s = stats[qid] || defaultQStat();
  s.attempts += 1;
  if (isCorrect) s.correct += 1;
  else s.wrong += 1;
  s.lastSeen = nowISO();
  s.lastCorrect = isCorrect ? nowISO() : s.lastCorrect;
  stats[qid] = s;
  saveStats(stats);

  // overall profile
  profile.xp = (profile.xp ?? 0) + gainedXP;
  profile.totalAnswered = (profile.totalAnswered ?? 0) + 1;
  if (isCorrect) {
    profile.totalCorrect = (profile.totalCorrect ?? 0) + 1;
    profile.streak = (profile.streak ?? 0) + 1;
  } else {
    profile.streak = 0;
  }
  saveProfile(profile);

  updateDashboardUI();
}

function skipQuestion() {
  if (!currentQuestion) return;
  if (locked) return;

  session.skipped += 1;
  session.index += 1;
  showQuestion();
}

function nextQuestion() {
  if (!currentQuestion) return;
  session.index += 1;
  showQuestion();
}

function endQuiz() {
  quizCard.hidden = true;
  resultsCard.hidden = false;

  const totalAnsweredThisQuiz = session.correct + session.wrong;
  const total = session.deck.length;

  const acc = totalAnsweredThisQuiz > 0 ? (session.correct / totalAnsweredThisQuiz) * 100 : 0;

  resScore.textContent = `${session.correct}/${total}`;
  resAccuracy.textContent = `${Math.round(acc)}%`;
  resXP.textContent = `${session.xpEarned}`;

  resultsSummary.textContent =
    `You answered ${totalAnsweredThisQuiz} out of ${total} questions (skipped ${session.skipped}).`;

  // Review list (incorrect)
  reviewList.innerHTML = "";
  if (session.wrongIds.length > 0) {
    const wrongQs = allQuestions.filter(q => session.wrongIds.includes(q.id));
    wrongQs.forEach(q => {
      const letters = ["A","B","C","D"];
      const correctLetter = letters[q.answerIndex];

      const div = document.createElement("div");
      div.className = "reviewItem";
      div.innerHTML = `
        <div class="small">${q.topic} • Difficulty ${q.difficulty}</div>
        <div class="q">${q.question}</div>
        <div class="a">Correct answer: ${correctLetter}</div>
        <div class="small">${q.explanation || ""}</div>
      `;
      reviewList.appendChild(div);
    });
  } else {
    const div = document.createElement("div");
    div.className = "reviewItem";
    div.innerHTML = `<div class="q">Perfect run. No incorrect answers. Absolute menace.</div>`;
    reviewList.appendChild(div);
  }

  renderMath();
}

function backHome() {
  resultsCard.hidden = true;
  quizCard.hidden = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function retryIncorrect() {
  // Force mode to reviewWrong and start
  modeSelect.value = "reviewWrong";
  startQuiz();
}

function resetStats() {
  localStorage.removeItem(LS_STATS);
  localStorage.removeItem(LS_PROFILE);
  updateDashboardUI();
  alert("Stats reset. Fresh start.");
}

async function exportStats() {
  const blob = {
    stats: loadStats(),
    profile: loadProfile()
  };
  await navigator.clipboard.writeText(JSON.stringify(blob, null, 2));
  alert("Export copied to clipboard.");
}

async function importStats() {
  const text = await navigator.clipboard.readText();
  if (!text) {
    alert("Clipboard is empty.");
    return;
  }
  try {
    const data = JSON.parse(text);
    if (data.stats) saveStats(data.stats);
    if (data.profile) saveProfile(data.profile);
    updateDashboardUI();
    alert("Import complete.");
  } catch {
    alert("Import failed. Clipboard didn't contain valid JSON.");
  }
}

async function init() {
  updateDashboardUI();

  const res = await fetch(QUESTIONS_URL);
  allQuestions = await res.json();

  buildTopicDropdown(allQuestions);
  updateDashboardUI();
}

// Event listeners
btnStart.addEventListener("click", startQuiz);
btnSkip.addEventListener("click", skipQuestion);
btnNext.addEventListener("click", nextQuestion);
btnEnd.addEventListener("click", endQuiz);

btnBackHome.addEventListener("click", backHome);
btnRetryWrong.addEventListener("click", retryIncorrect);

btnResetStats.addEventListener("click", resetStats);
btnExportStats.addEventListener("click", exportStats);
btnImportStats.addEventListener("click", importStats);

init();