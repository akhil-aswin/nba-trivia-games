const GAME_ID = "millionaire";

const CATEGORIES = {
  legends: "Legends",
  teams: "Teams & Franchises",
  finals: "Finals & Playoffs",
  records: "Records & Stats",
  draft: "Draft & Awards",
};
const TIER_NAMES = { 1: "Easy", 2: "Medium", 3: "Hard", 4: "Very Hard", 5: "Expert" };

const LADDER = [100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000, 1000000];
const SAFE_LEVELS = [4, 9]; // indexes into LADDER: $1,000 and $32,000
// How many questions each tier contributes, in order:
// Q1–5 easy, Q6–8 medium, Q9–11 hard, Q12–14 very hard, Q15 expert.
const TIER_PLAN = [[1, 5], [2, 3], [3, 3], [4, 3], [5, 1]];
const KEYS = ["A", "B", "C", "D"];

const $ = id => document.getElementById(id);
const money = n => "$" + n.toLocaleString("en-US");

QUESTIONS.forEach((q, i) => { q.id = i; });

// ---------- Storage (best score + questions already seen) ----------

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
const BEST_KEY = "nba-trivia-best:" + GAME_ID;
const SEEN_KEY = "nba-trivia-seen:" + GAME_ID;

// ---------- Helpers ----------

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const rand = (min, max) => min + Math.random() * (max - min);

// ---------- Question selection ----------

// Picks a fresh set of 15. Questions the player hasn't seen yet come first, and
// within a tier no category repeats until every category has been used.
function buildGame() {
  const seen = new Set(load(SEEN_KEY, []));
  const picks = [];

  for (const [tier, count] of TIER_PLAN) {
    const pool = QUESTIONS.filter(q => q.d === tier);
    let fresh = pool.filter(q => !seen.has(q.id));
    if (fresh.length < count) {
      // Player has seen this whole tier: start the tier over.
      pool.forEach(q => seen.delete(q.id));
      fresh = pool;
    }
    const ordered = [...shuffle(fresh), ...shuffle(pool.filter(q => !fresh.includes(q)))];

    const usedCats = new Set();
    for (let n = 0; n < count; n++) {
      if (usedCats.size === Object.keys(CATEGORIES).length) usedCats.clear();
      const prevCat = picks.length ? picks[picks.length - 1].c : null;
      const choice =
        ordered.find(q => !picks.includes(q) && !usedCats.has(q.c) && q.c !== prevCat) ||
        ordered.find(q => !picks.includes(q) && !usedCats.has(q.c)) ||
        ordered.find(q => !picks.includes(q));
      picks.push(choice);
      usedCats.add(choice.c);
    }
  }

  picks.forEach(q => seen.add(q.id));
  store(SEEN_KEY, [...seen]);
  return picks;
}

// ---------- Game state ----------

let game;

function newGame() {
  game = {
    questions: buildGame(),
    level: 0,
    lifelines: { fifty: true, audience: true, phone: true },
    options: [],
    removed: new Set(),
    selected: null,
    phase: "answering", // answering | locked | revealing | revealed | confirm-walk | over
  };
  $("intro").hidden = true;
  $("end").hidden = true;
  $("game").hidden = false;
  $("ladderToggle").hidden = false;
  renderLadder();
  showQuestion();
}

function safeWinnings() {
  const passed = SAFE_LEVELS.filter(l => l < game.level);
  return passed.length ? LADDER[passed[passed.length - 1]] : 0;
}
const currentWinnings = () => (game.level > 0 ? LADDER[game.level - 1] : 0);

// ---------- Rendering ----------

function renderLadder() {
  $("ladderList").innerHTML = LADDER.map((amt, i) => {
    const cls = [
      SAFE_LEVELS.includes(i) ? "safe" : "",
      i === LADDER.length - 1 ? "top" : "",
      i < game.level ? "passed" : "",
      i === game.level ? "current" : "",
    ].join(" ");
    return `<li class="${cls}"><span>${i + 1}</span><span class="amt">${money(amt)}</span></li>`;
  }).join("");
}

function showQuestion() {
  const q = game.questions[game.level];
  game.options = shuffle([{ text: q.a, correct: true }, ...q.w.map(text => ({ text, correct: false }))]);
  game.removed = new Set();
  game.selected = null;
  game.phase = "answering";

  $("catChip").textContent = CATEGORIES[q.c];
  $("tierChip").textContent = TIER_NAMES[q.d];
  $("tierChip").dataset.tier = q.d;
  $("playingFor").innerHTML = `Q${game.level + 1} · for <b>${money(LADDER[game.level])}</b>`;
  $("qText").textContent = q.q;
  $("helper").hidden = true;

  $("answers").innerHTML = "";
  game.options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "answer loz";
    btn.innerHTML = `<span><span class="key">${KEYS[i]}:</span><span class="txt"></span></span>`;
    btn.querySelector(".txt").textContent = opt.text;
    btn.onclick = () => select(i);
    $("answers").appendChild(btn);
  });

  renderLadder();
  renderControls();
}

function answerButtons() { return [...$("answers").children]; }

function renderControls() {
  const c = $("controls");
  const busy = game.phase !== "answering";
  $("lifeFifty").disabled = busy || !game.lifelines.fifty;
  $("lifeAudience").disabled = busy || !game.lifelines.audience;
  $("lifePhone").disabled = busy || !game.lifelines.phone;
  $("lifeFifty").classList.toggle("used", !game.lifelines.fifty);
  $("lifeAudience").classList.toggle("used", !game.lifelines.audience);
  $("lifePhone").classList.toggle("used", !game.lifelines.phone);
  $("walkBtn").disabled = busy;

  if (game.phase === "answering") {
    c.innerHTML = `<p>Pick an answer, or press A, B, C or D.</p>`;
  } else if (game.phase === "locked") {
    c.innerHTML = `<button class="btn primary" id="finalBtn" type="button">Final answer</button>
                   <button class="btn" id="changeBtn" type="button">Change</button>`;
    $("finalBtn").onclick = reveal;
    $("changeBtn").onclick = unlock;
  } else if (game.phase === "revealing") {
    c.innerHTML = `<p>Final answer…</p>`;
  } else if (game.phase === "revealed") {
    const isLast = game.level === LADDER.length;
    c.innerHTML = isLast
      ? `<button class="btn gold" id="nextBtn" type="button">Collect $1,000,000</button>`
      : `<button class="btn gold" id="nextBtn" type="button">Next question for ${money(LADDER[game.level])}</button>`;
    $("nextBtn").onclick = isLast ? () => endGame("won") : showQuestion;
  } else if (game.phase === "confirm-walk") {
    c.innerHTML = `<p>Walk away with ${money(currentWinnings())}?</p>
                   <button class="btn gold" id="walkYes" type="button">Take the money</button>
                   <button class="btn" id="walkNo" type="button">Keep playing</button>`;
    $("walkYes").onclick = () => endGame("walked");
    $("walkNo").onclick = () => { game.phase = "answering"; setAnswersEnabled(true); renderControls(); };
  }
}

function setAnswersEnabled(on) {
  answerButtons().forEach((b, i) => { b.disabled = !on || game.removed.has(i); });
}

// ---------- Actions ----------

function select(i) {
  if (!["answering", "locked"].includes(game.phase) || game.removed.has(i)) return;
  game.selected = i;
  game.phase = "locked";
  answerButtons().forEach((b, j) => b.classList.toggle("locked", j === i));
  renderControls();
}

function unlock() {
  game.selected = null;
  game.phase = "answering";
  answerButtons().forEach(b => b.classList.remove("locked"));
  renderControls();
}

function reveal() {
  game.phase = "revealing";
  setAnswersEnabled(false);
  const btns = answerButtons();
  btns[game.selected].classList.add("suspense");
  renderControls();

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const delay = reduced ? 300 : 1200 + game.level * 120; // the tension grows up the ladder

  setTimeout(() => {
    btns[game.selected].classList.remove("suspense", "locked");
    const correctIdx = game.options.findIndex(o => o.correct);
    btns[correctIdx].classList.add("correct", "flash");

    if (game.options[game.selected].correct) {
      game.level++;
      game.phase = "revealed";
      renderLadder();
      $("playingFor").innerHTML = `You have <b>${money(currentWinnings())}</b>`;
      renderControls();
    } else {
      btns[game.selected].classList.add("wrong");
      game.phase = "over";
      $("controls").innerHTML = `<p>The answer was ${KEYS[correctIdx]}: ${game.options[correctIdx].text}</p>`;
      setTimeout(() => endGame("lost"), 2200);
    }
  }, delay);
}

function askWalk() {
  if (game.phase !== "answering") return;
  game.phase = "confirm-walk";
  setAnswersEnabled(false);
  renderControls();
}

// ---------- Lifelines ----------

function useFifty() {
  if (!game.lifelines.fifty || game.phase !== "answering") return;
  game.lifelines.fifty = false;
  const wrong = shuffle(game.options.map((o, i) => (o.correct ? -1 : i)).filter(i => i >= 0)).slice(0, 2);
  wrong.forEach(i => game.removed.add(i));
  answerButtons().forEach((b, i) => {
    if (game.removed.has(i)) { b.classList.add("removed"); b.disabled = true; }
  });
  renderControls();
}

function useAudience() {
  if (!game.lifelines.audience || game.phase !== "answering") return;
  game.lifelines.audience = false;
  const tier = game.questions[game.level].d;
  const live = game.options.map((_, i) => i).filter(i => !game.removed.has(i));
  const correctIdx = game.options.findIndex(o => o.correct);

  // The crowd gets shakier as questions get harder.
  const [lo, hi] = { 1: [55, 85], 2: [42, 70], 3: [34, 58], 4: [28, 50], 5: [22, 45] }[tier];
  const votes = Array(4).fill(0);
  votes[correctIdx] = rand(lo, hi);
  // Now and then on hard questions the crowd is fooled by one answer.
  if (tier >= 3 && Math.random() < 0.2 + (tier - 3) * 0.05 && live.length > 1) {
    const decoy = shuffle(live.filter(i => i !== correctIdx))[0];
    votes[decoy] = votes[correctIdx] + rand(2, 12);
  }
  const others = live.filter(i => votes[i] === 0);
  let left = Math.max(0, 100 - votes.reduce((s, v) => s + v, 0));
  others.forEach((i, n) => {
    votes[i] = n === others.length - 1 ? left : rand(0, left * 0.7);
    left -= votes[i];
  });
  const total = votes.reduce((s, v) => s + v, 0);
  const pct = votes.map(v => Math.round((v / total) * 100));

  showHelper(`<h3>Ask the Audience</h3>
    <div class="poll">${pct.map((p, i) => `
      <div class="col"><span class="pct">${game.removed.has(i) ? "" : p + "%"}</span>
        <div class="bar" style="height:0%" data-h="${game.removed.has(i) ? 0 : p}"></div>
        <span class="lbl">${KEYS[i]}</span></div>`).join("")}
    </div>`);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $("helper").querySelectorAll(".bar").forEach(b => { b.style.height = (b.dataset.h * 0.8) + "%"; });
  }));
  renderControls();
}

const FRIENDS = [
  "Your friend who has watched every game since 1996",
  "Your uncle, a lifelong season-ticket holder",
  "Your old high-school coach",
  "Your roommate, who never misses League Pass",
];

function usePhone() {
  if (!game.lifelines.phone || game.phase !== "answering") return;
  game.lifelines.phone = false;
  const tier = game.questions[game.level].d;
  const live = game.options.map((_, i) => i).filter(i => !game.removed.has(i));
  const correctIdx = game.options.findIndex(o => o.correct);
  const knows = Math.random() < { 1: 0.95, 2: 0.85, 3: 0.72, 4: 0.6, 5: 0.5 }[tier];
  const guess = knows ? correctIdx : shuffle(live.filter(i => i !== correctIdx))[0] ?? correctIdx;
  const sure = knows ? Math.round(rand(70, 95)) : Math.round(rand(35, 60));
  const name = FRIENDS[Math.floor(Math.random() * FRIENDS.length)];
  const line = sure >= 75
    ? `"I'm pretty sure it's ${KEYS[guess]}, ${game.options[guess].text}. I'd say ${sure}%."`
    : `"Hmm, tough one. I'm leaning ${KEYS[guess]}, ${game.options[guess].text}, but I'm only about ${sure}% sure."`;
  showHelper(`<h3>Phone a Friend</h3><p><b>${name}:</b> ${line}</p>`);
  renderControls();
}

function showHelper(html) {
  $("helper").innerHTML = html;
  $("helper").hidden = false;
}

// ---------- End of game ----------

function endGame(result) {
  const amount = result === "won" ? LADDER[LADDER.length - 1]
    : result === "walked" ? currentWinnings()
    : safeWinnings();

  const best = load(BEST_KEY, 0);
  const record = amount > best;
  if (record) store(BEST_KEY, amount);

  $("game").hidden = true;
  $("ladderToggle").hidden = true;
  $("ladder").classList.remove("open");
  $("end").hidden = false;
  $("endPrize").textContent = money(amount);

  if (result === "won") {
    $("endEyebrow").textContent = "You're a millionaire!";
    $("endText").textContent = "All 15 questions, from Easy to Expert. That's Hall of Fame knowledge.";
  } else if (result === "walked") {
    $("endEyebrow").textContent = "You walked away";
    $("endText").textContent = `You stopped at question ${game.level + 1} and banked your winnings.`;
  } else {
    $("endEyebrow").textContent = "Wrong answer";
    const q = game.questions[game.level];
    $("endText").textContent = `The answer to question ${game.level + 1} was ${q.a}. ` +
      (amount ? "Your safe haven kept you in the money." : "You leave without any winnings this time.");
  }
  $("bestEnd").textContent = record && amount > 0 ? "New personal best!" : best ? `Your best: ${money(Math.max(best, amount))}` : "";
}

function showIntroBest() {
  const best = load(BEST_KEY, 0);
  $("bestIntro").textContent = best ? `Your best: ${money(best)}` : "";
}

// ---------- Wiring ----------

$("startBtn").onclick = newGame;
$("againBtn").onclick = newGame;
$("walkBtn").onclick = askWalk;
$("lifeFifty").onclick = useFifty;
$("lifeAudience").onclick = useAudience;
$("lifePhone").onclick = usePhone;
$("ladderToggle").onclick = () => {
  const open = $("ladder").classList.toggle("open");
  $("ladderToggle").setAttribute("aria-expanded", String(open));
};

document.addEventListener("keydown", e => {
  if (!game || $("game").hidden || e.metaKey || e.ctrlKey || e.altKey) return;
  const i = KEYS.indexOf(e.key.toUpperCase());
  if (i >= 0) select(i);
  else if (e.key === "Enter" && game.phase === "locked") { e.preventDefault(); reveal(); }
});

showIntroBest();
