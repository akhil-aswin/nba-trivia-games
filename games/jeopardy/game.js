const GAME_ID = "jeopardy";
const BOARD_SIZE = 6;            // categories per board
const VALUES = [200, 400, 600, 800, 1000];
const MAX_PLAYERS = 6;

const $ = id => document.getElementById(id);
const fmt = n => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US");

// ---------- Storage ----------
// Single-player and multiplayer games are saved separately so a refresh doesn't wipe the scores.
// The multiplayer save also lets a Player view window pick up the host's game.
const SAVE_KEYS = { single: "nba-trivia-save:" + GAME_ID + "-single", multi: "nba-trivia-save:" + GAME_ID };
const RECENT_KEY = "nba-trivia-recent:" + GAME_ID;
const NAMES_KEY = "nba-trivia-names:" + GAME_ID;
const BEST_KEY = "nba-trivia-best:" + GAME_ID;

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
function forget(key) {
  try { localStorage.removeItem(key); } catch {}
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Answer checking (single player) ----------

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];

// Lowercases, drops accents and punctuation, turns number words into digits, and strips
// Jeopardy-style "Who is…" and a leading "the"/"a"/"an". Spaces are removed last, so
// "O'Neal", "o neal" and "ONeal" all become "oneal".
function normalize(text) {
  let s = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  s = s.replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
  s = s.replace(/^(who|what|where|when)( is| are| was| were)? /, "");
  s = s.replace(/^(the|a|an) /, "");
  s = s.split(" ").map(w => (NUMBER_WORDS.includes(w) ? String(NUMBER_WORDS.indexOf(w)) : w)).join(" ");
  return s.replace(/ /g, "");
}

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

// Exact match after normalizing, or a small typo on longer answers. Numbers must be exact.
function isCorrect(guess, answer) {
  const g = normalize(guess);
  if (!g) return false;
  return [answer, ...(ALSO_ACCEPT[answer] || [])].map(normalize).some(form => {
    if (form === g) return true;
    if (/\d/.test(form)) return false;
    const allowed = form.length >= 9 ? 2 : form.length >= 5 ? 1 : 0;
    return allowed > 0 && editDistance(form, g) <= allowed;
  });
}

// ---------- State ----------
// role: "single" (typed answers), "host" (runs a multiplayer game) or "player" (display only).
// state.board[col] = { name, clues: [{ q, a, v, used }] }
// state.open = the clue on screen: { col, row, missed: [player indexes], revealed, result }
// state.history = scoring actions, newest last, so Undo can reverse them.
let role = null;
let state = null;
const menu = { mode: "single", view: "host" };

const saveKey = () => SAVE_KEYS[role === "single" ? "single" : "multi"];

// Saves the game and, for the host, pushes it to any Player view windows.
function commit() {
  if (role === "player") return;
  store(saveKey(), state);
  if (role === "host") send({ type: "state", state });
  render();
}

// ---------- Host ↔ player screen sync ----------
// Windows on the same computer talk over a BroadcastChannel. Player views say hello every
// few seconds so the host can show whether a player screen is connected.
const channel = "BroadcastChannel" in window ? new BroadcastChannel("nba-trivia-" + GAME_ID) : null;
let lastHello = 0;
let helloTimer = null;

function send(msg) {
  try { channel && channel.postMessage(msg); } catch {}
}

if (channel) {
  channel.onmessage = e => {
    const msg = e.data || {};
    if (role === "host" && msg.type === "hello") {
      lastHello = Date.now();
      renderLink();
      send({ type: "state", state });
    }
    if (role === "player" && msg.type === "state") {
      state = msg.state;
      render();
    }
  };
}
// Fallback for browsers without BroadcastChannel: follow the host's saved game.
window.addEventListener("storage", e => {
  if (role === "player" && e.key === SAVE_KEYS.multi) {
    state = load(SAVE_KEYS.multi, null);
    render();
  }
});
setInterval(() => { if (role === "host") renderLink(); }, 3000);

function renderLink() {
  const on = Date.now() - lastHello < 8000;
  $("linkStatus").hidden = role !== "host";
  $("linkStatus").classList.toggle("on", on);
  $("linkStatus").textContent = on ? "Player screen connected" : "No player screen";
}

// ---------- Boards ----------

// Picks 6 categories, favouring ones that weren't on the last couple of boards.
function dealBoard() {
  const recent = new Set(load(RECENT_KEY, []));
  const fresh = shuffle(CATEGORIES.filter(c => !recent.has(c.name)));
  const stale = shuffle(CATEGORIES.filter(c => recent.has(c.name)));
  const picked = [...fresh, ...stale].slice(0, BOARD_SIZE);
  store(RECENT_KEY, [...picked.map(c => c.name), ...load(RECENT_KEY, [])].slice(0, BOARD_SIZE * 2));
  return picked.map(c => ({
    name: c.name,
    clues: c.clues.map(([q, a], i) => ({ q, a, v: VALUES[i], used: false })),
  }));
}

function startGame(names) {
  state = { players: names.map(name => ({ name, score: 0 })), board: dealBoard(), history: [], open: null };
  shownScores = [];
  showPlay();
  commit();
}

function newBoard() {
  state.board = dealBoard();
  state.players.forEach(p => { p.score = 0; });
  state.history = [];
  state.open = null;
  shownScores = [];
  commit();
}

const cluesLeft = () => state.board.reduce((n, c) => n + c.clues.filter(x => !x.used).length, 0);
const openClue = () => state && state.open && state.board[state.open.col].clues[state.open.row];

// ---------- Menu ----------

function setPressed(attr, value) {
  document.querySelectorAll(`[data-${attr}]`).forEach(b => b.setAttribute("aria-pressed", String(b.dataset[attr] === value)));
}

function renderMenu() {
  setPressed("mode", menu.mode);
  setPressed("view", menu.view);
  const single = menu.mode === "single";
  const player = !single && menu.view === "player";
  $("viewPick").hidden = single;
  $("namesBlock").hidden = player;
  $("namesTitle").textContent = single ? "Your name" : "Players";
  $("addPlayer").hidden = single;
  $("startBtn").textContent = single ? "Deal the board" : player ? "Open player screen" : "Deal the board";
  $("setupHint").textContent = "";
  const saved = load(single ? SAVE_KEYS.single : SAVE_KEYS.multi, null);
  $("resumeBtn").hidden = player || !saved;
}

function renderNameInputs(names) {
  $("nameList").innerHTML = "";
  names.forEach(name => addNameRow(name));
  updateNameRows();
}

function addNameRow(name = "") {
  const i = $("nameList").children.length;
  const row = document.createElement("div");
  row.className = "name-row";
  row.innerHTML = `<input type="text" maxlength="18" autocomplete="off">
                   <button type="button" aria-label="Remove player">✕</button>`;
  const input = row.querySelector("input");
  input.id = "player-name-" + i;
  input.value = name;
  row.querySelector("button").onclick = () => { row.remove(); updateNameRows(); };
  $("nameList").appendChild(row);
  updateNameRows();
  return input;
}

function updateNameRows() {
  const rows = [...$("nameList").children];
  $("addPlayer").disabled = rows.length >= MAX_PLAYERS;
  rows.forEach((row, i) => {
    const input = row.querySelector("input");
    input.placeholder = menu.mode === "single" ? "Player" : "Player " + (i + 1);
    input.setAttribute("aria-label", menu.mode === "single" ? "Your name" : `Player ${i + 1} name`);
    row.querySelector("button").hidden = rows.length <= 1 || menu.mode === "single";
  });
}

function showMenu() {
  role = null;
  state = null;
  clearInterval(helloTimer);
  $("play").hidden = true;
  $("setup").hidden = false;
  $("catCount").textContent = CATEGORIES.length;
  const names = load(NAMES_KEY, { single: [""], multi: ["", "", ""] });
  renderNameInputs(menu.mode === "single" ? names.single : names.multi);
  renderMenu();
}

document.querySelectorAll("[data-mode]").forEach(b => {
  b.onclick = () => { menu.mode = b.dataset.mode; showMenu(); };
});
document.querySelectorAll("[data-view]").forEach(b => {
  b.onclick = () => { menu.view = b.dataset.view; renderMenu(); };
});
$("addPlayer").onclick = () => addNameRow().focus();

$("setupForm").onsubmit = e => {
  e.preventDefault();
  if (menu.mode === "multi" && menu.view === "player") return joinAsPlayer();
  role = menu.mode === "single" ? "single" : "host";
  const inputs = [...$("nameList").querySelectorAll("input")];
  const names = inputs.map((inp, i) => inp.value.trim() || (role === "single" ? "Player" : "Player " + (i + 1)));
  const saved = load(NAMES_KEY, { single: [""], multi: ["", "", ""] });
  saved[role === "single" ? "single" : "multi"] = inputs.map(inp => inp.value.trim());
  store(NAMES_KEY, saved);
  startGame(names);
};

$("resumeBtn").onclick = () => {
  role = menu.mode === "single" ? "single" : "host";
  state = load(saveKey(), null);
  if (!state) return showMenu();
  shownScores = state.players.map(p => p.score);
  showPlay();
  commit();
};

function joinAsPlayer() {
  role = "player";
  state = load(SAVE_KEYS.multi, null);
  shownScores = state ? state.players.map(p => p.score) : [];
  showPlay();
  render();
  send({ type: "hello" });
  helloTimer = setInterval(() => send({ type: "hello" }), 3000);
}

// ---------- Rendering ----------

function showPlay() {
  $("setup").hidden = true;
  $("play").hidden = false;
  hideConfirm();
  const labels = { single: "Single player", host: "Host view", player: "Player view" };
  $("roleBadge").textContent = labels[role];
  // The player screen is display-only.
  const controls = role !== "player";
  $("undoBtn").hidden = $("newBoardBtn").hidden = $("endBtn").hidden = !controls;
  $("leaveBtn").hidden = controls;
  renderLink();
}

function render() {
  const waiting = role === "player" && !state;
  $("waiting").hidden = !waiting;
  $("board").hidden = waiting;
  if (waiting) {
    $("clue").hidden = $("final").hidden = true;
    $("scores").innerHTML = "";
    $("cluesLeft").textContent = "";
    return;
  }
  renderBoard();
  renderClue();
  renderScores();
  renderFinal();
}

function renderBoard() {
  const board = $("board");
  board.innerHTML = "";
  state.board.forEach(cat => {
    const h = document.createElement("div");
    h.className = "cat";
    h.textContent = cat.name;
    board.appendChild(h);
  });
  VALUES.forEach((_, row) => {
    state.board.forEach((cat, col) => {
      const clue = cat.clues[row];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cell";
      btn.textContent = clue.used ? "" : "$" + clue.v;
      btn.disabled = clue.used || role === "player";
      if (role === "player" && !clue.used) btn.classList.add("view-only");
      btn.setAttribute("aria-label", `${cat.name} for $${clue.v}${clue.used ? ", done" : ""}`);
      btn.onclick = () => selectClue(col, row);
      board.appendChild(btn);
    });
  });
  const left = cluesLeft();
  $("cluesLeft").textContent = `${left} clue${left === 1 ? "" : "s"} left`;
  $("undoBtn").disabled = state.history.length === 0;
}

function renderClue() {
  const clue = openClue();
  const wasHidden = $("clue").hidden;
  $("clue").hidden = !clue;
  if (!clue) return;
  const o = state.open;
  const cat = state.board[o.col];

  $("clueCat").textContent = cat.name;
  $("clueVal").textContent = "$" + clue.v;
  $("clueText").textContent = clue.q;

  // Host sees the answer at once; everyone else only after it's revealed.
  $("hostAnswer").hidden = role !== "host";
  $("hostAnswerText").textContent = clue.a;
  $("clueAnswer").hidden = role === "host" || role === "single" || !o.revealed;
  $("clueAnswer").textContent = clue.a;

  $("hostActions").hidden = role !== "host";
  $("revealBtn").hidden = o.revealed;

  const answered = role === "single" && o.result;
  $("guessForm").hidden = role !== "single" || answered;
  $("result").hidden = !answered;
  if (answered) {
    const r = o.result;
    const v = $("verdict");
    v.className = "verdict " + (r.passed ? "pass" : r.correct ? "right" : "wrong");
    v.textContent = r.passed ? "Passed" : r.correct ? `Correct! +$${clue.v}` : `Incorrect −$${clue.v}`;
    $("yourAnswer").innerHTML = "";
    const lines = r.passed ? [["The answer: ", clue.a]] : [["You said: ", r.guess], ["The answer: ", clue.a]];
    lines.forEach(([label, text], i) => {
      if (i) $("yourAnswer").appendChild(document.createElement("br"));
      $("yourAnswer").append(label);
      const b = document.createElement("b");
      b.textContent = text;
      $("yourAnswer").appendChild(b);
    });
    $("overrideBtn").hidden = r.passed || r.correct;
  }

  $("clueHint").textContent = role === "host"
    ? "Mark each player below. ✓ adds the clue's value, ✗ subtracts it."
    : role === "single" && !answered
      ? "Capitals and punctuation don't matter. Small typos are OK."
      : "";

  if (role === "single" && !answered && wasHidden) {
    $("guess").value = "";
    $("guess").focus();
  }
}

let shownScores = [];

function renderScores() {
  const wrap = $("scores");
  wrap.innerHTML = "";
  const o = state.open;
  const scoring = role === "host" && openClue();
  state.players.forEach((p, i) => {
    const pod = document.createElement("div");
    pod.className = "podium";
    if (o && o.missed.includes(i)) pod.classList.add("missed");
    // Flash a podium whose score changed since we last drew it.
    const before = shownScores[i];
    if (before !== undefined && before !== p.score) pod.classList.add(p.score > before ? "flash-up" : "flash-down");
    pod.innerHTML = `<div class="score${p.score < 0 ? " neg" : ""}">${fmt(p.score)}</div><div class="name"></div>`;
    pod.querySelector(".name").textContent = p.name;

    if (scoring) {
      const v = openClue().v;
      const marks = document.createElement("div");
      marks.className = "marks";
      marks.innerHTML = `<button type="button" class="yes">✓</button><button type="button" class="no">✗</button>`;
      const [yes, no] = marks.children;
      yes.setAttribute("aria-label", `${p.name} correct, add $${v}`);
      no.setAttribute("aria-label", `${p.name} wrong, subtract $${v}`);
      yes.disabled = no.disabled = o.missed.includes(i);
      yes.onclick = () => markCorrect(i);
      no.onclick = () => markWrong(i);
      pod.appendChild(marks);
    }
    wrap.appendChild(pod);
  });
  shownScores = state.players.map(p => p.score);
  // Keep the clue overlay from covering the podiums.
  document.documentElement.style.setProperty("--scores-h", wrap.offsetHeight + "px");
}

function renderFinal() {
  const done = cluesLeft() === 0 && !state.open;
  $("final").hidden = !done;
  if (!done) return;
  const ranked = state.players.map(p => ({ ...p })).sort((a, b) => b.score - a.score);
  if (role === "single") {
    $("winner").textContent = `${ranked[0].name}: ${fmt(ranked[0].score)}`;
  } else {
    const top = ranked.filter(p => p.score === ranked[0].score);
    $("winner").textContent = top.length > 1 ? "It's a tie!" : `${top[0].name} wins!`;
  }
  $("standings").innerHTML = "";
  if (role !== "single") {
    ranked.forEach(p => {
      const li = document.createElement("li");
      li.innerHTML = `<span></span><b>${fmt(p.score)}</b>`;
      li.firstChild.textContent = p.name;
      $("standings").appendChild(li);
    });
  }
  // Best single-player score is kept in this browser.
  if (role === "single") {
    const best = load(BEST_KEY, null);
    const score = ranked[0].score;
    if (best === null || score > best) store(BEST_KEY, score);
    $("bestNote").textContent = best === null || score > best ? "New personal best!" : `Your best: ${fmt(best)}`;
  } else {
    $("bestNote").textContent = "";
  }
  $("finalActions").hidden = role === "player";
}

// ---------- Playing a clue ----------

function selectClue(col, row) {
  if (role === "player" || state.board[col].clues[row].used || state.open) return;
  hideConfirm();
  state.open = { col, row, missed: [], revealed: false, result: null };
  commit();
  if (role === "host") $("revealBtn").focus();
}

// Retires the open clue and returns to the board.
function finishClue() {
  state.board[state.open.col].clues[state.open.row].used = true;
  state.open = null;
}

// Host scoring
function markCorrect(i) {
  const { col, row } = state.open;
  const v = openClue().v;
  state.players[i].score += v;
  state.history.push({ player: i, delta: v, col, row, closed: true });
  finishClue();
  commit();
}

function markWrong(i) {
  const { col, row } = state.open;
  const v = openClue().v;
  state.players[i].score -= v;
  state.history.push({ player: i, delta: -v, col, row, closed: false });
  state.open.missed.push(i);
  // Everyone has missed: show the answer on the player screen.
  if (state.open.missed.length === state.players.length) state.open.revealed = true;
  commit();
}

function noOne() {
  const { col, row } = state.open;
  // Logged with no score change so Undo can put the clue back.
  state.history.push({ player: null, delta: 0, col, row, closed: true });
  finishClue();
  commit();
}

function putBack() {
  // Putting a clue back also reverses any wrong answers already marked on it.
  const { col, row } = state.open;
  state.history = state.history.filter(h => {
    if (h.col === col && h.row === row && !h.closed) {
      state.players[h.player].score -= h.delta;
      return false;
    }
    return true;
  });
  state.open = null;
  commit();
}

// Single-player answering
function submitGuess(guess) {
  const clue = openClue();
  const { col, row } = state.open;
  const correct = isCorrect(guess, clue.a);
  const delta = correct ? clue.v : -clue.v;
  state.players[0].score += delta;
  state.history.push({ player: 0, delta, col, row, closed: true });
  clue.used = true;
  state.open.result = { guess, correct, passed: false };
  commit();
  $("backBtn").focus();
}

function pass() {
  const { col, row } = state.open;
  state.history.push({ player: null, delta: 0, col, row, closed: true });
  openClue().used = true;
  state.open.result = { passed: true };
  commit();
  $("backBtn").focus();
}

// For when the checker marks a right answer wrong: undo the penalty and award the points.
function override() {
  const clue = openClue();
  const last = state.history[state.history.length - 1];
  state.players[0].score += clue.v * 2;
  last.delta += clue.v * 2;
  state.open.result.correct = true;
  commit();
}

function backToBoard() {
  state.open = null;
  commit();
}

function undo() {
  const last = state.history.pop();
  if (!last) return;
  if (last.player !== null) state.players[last.player].score -= last.delta;
  if (last.closed) state.board[last.col].clues[last.row].used = false;
  const o = state.open;
  if (o && o.col === last.col && o.row === last.row) {
    if (last.player !== null) o.missed = o.missed.filter(p => p !== last.player);
    if (role === "single") state.open = null;
  }
  commit();
}

// ---------- In-page confirmations ----------

let pending = null;
function askConfirm(text, action) {
  pending = action;
  $("confirmText").textContent = text;
  $("confirmBar").hidden = false;
}
function hideConfirm() {
  pending = null;
  $("confirmBar").hidden = true;
}
$("confirmYes").onclick = () => { const fn = pending; hideConfirm(); fn && fn(); };
$("confirmNo").onclick = hideConfirm;

// ---------- Wiring ----------

$("revealBtn").onclick = () => { state.open.revealed = true; commit(); };
$("noOneBtn").onclick = noOne;
$("cancelBtn").onclick = putBack;
$("guessForm").onsubmit = e => {
  e.preventDefault();
  const guess = $("guess").value.trim();
  if (!guess) return $("guess").focus();
  submitGuess(guess);
};
$("passBtn").onclick = pass;
$("overrideBtn").onclick = override;
$("backBtn").onclick = backToBoard;
$("undoBtn").onclick = undo;
$("newBoardBtn").onclick = () => askConfirm("Deal a new board? Scores reset to $0.", newBoard);
$("endBtn").onclick = () => askConfirm("End this game and go back to the menu?", () => {
  forget(saveKey());
  if (role === "host") send({ type: "state", state: null });
  showMenu();
});
$("leaveBtn").onclick = showMenu;
$("againBtn").onclick = newBoard;
$("menuBtn").onclick = () => {
  forget(saveKey());
  if (role === "host") send({ type: "state", state: null });
  showMenu();
};

document.addEventListener("keydown", e => {
  if (!state || !state.open || role !== "host") return;
  if (e.key === " " && document.activeElement.tagName !== "BUTTON") {
    e.preventDefault();
    state.open.revealed = true;
    commit();
  }
  if (e.key === "Escape") putBack();
});
window.addEventListener("resize", () => {
  document.documentElement.style.setProperty("--scores-h", $("scores").offsetHeight + "px");
});

showMenu();
