const GAME_ID = "jeopardy";
const BOARD_SIZE = 6;            // categories per board
const VALUES = [200, 400, 600, 800, 1000];
const MAX_PLAYERS = 6;

const $ = id => document.getElementById(id);
const fmt = n => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US");

// ---------- Storage ----------
// The game in progress is saved so a refresh doesn't wipe the scores.
const SAVE_KEY = "nba-trivia-save:" + GAME_ID;
const RECENT_KEY = "nba-trivia-recent:" + GAME_ID;
const NAMES_KEY = "nba-trivia-names:" + GAME_ID;

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

// ---------- State ----------
// state.board[col] = { name, clues: [{ q, a, v, used }] }
// state.history = scoring actions, newest last, so Undo can reverse them.
let state = null;
let open = null; // the clue on screen: { col, row, missed: Set of player indexes }

function save() { store(SAVE_KEY, state); }

// Picks 6 categories, favouring ones that weren't on the last couple of boards.
function dealBoard() {
  const recent = new Set(load(RECENT_KEY, []));
  const fresh = shuffle(CATEGORIES.filter(c => !recent.has(c.name)));
  const stale = shuffle(CATEGORIES.filter(c => recent.has(c.name)));
  const picked = [...fresh, ...stale].slice(0, BOARD_SIZE);

  // Remember the last two boards' worth of categories.
  const keep = [...picked.map(c => c.name), ...load(RECENT_KEY, [])].slice(0, BOARD_SIZE * 2);
  store(RECENT_KEY, keep);

  return picked.map(c => ({
    name: c.name,
    clues: c.clues.map(([q, a], i) => ({ q, a, v: VALUES[i], used: false })),
  }));
}

function startGame(names) {
  state = {
    players: names.map(name => ({ name, score: 0 })),
    board: dealBoard(),
    history: [],
  };
  store(NAMES_KEY, names);
  save();
  showPlay();
}

function newBoard() {
  state.board = dealBoard();
  state.players.forEach(p => { p.score = 0; });
  state.history = [];
  save();
  showPlay();
}

const cluesLeft = () => state.board.reduce((n, c) => n + c.clues.filter(x => !x.used).length, 0);

// ---------- Setup screen ----------

function renderNameInputs(names) {
  $("nameList").innerHTML = "";
  names.forEach((name, i) => addNameRow(name, i));
  updateSetupButtons();
}

function addNameRow(name = "", i = $("nameList").children.length) {
  const row = document.createElement("div");
  row.className = "name-row";
  row.innerHTML = `<input type="text" maxlength="18" autocomplete="off" aria-label="Player ${i + 1} name">
                   <button type="button" aria-label="Remove player">✕</button>`;
  const input = row.querySelector("input");
  input.id = "player-name-" + i;
  input.value = name;
  input.placeholder = "Player " + (i + 1);
  row.querySelector("button").onclick = () => { row.remove(); updateSetupButtons(); };
  $("nameList").appendChild(row);
  updateSetupButtons();
  return input;
}

function updateSetupButtons() {
  const rows = $("nameList").children.length;
  $("addPlayer").disabled = rows >= MAX_PLAYERS;
  [...$("nameList").querySelectorAll(".name-row button")].forEach(b => { b.hidden = rows <= 1; });
  [...$("nameList").querySelectorAll("input")].forEach((inp, i) => { inp.placeholder = "Player " + (i + 1); });
}

function showSetup() {
  $("play").hidden = true;
  $("setup").hidden = false;
  $("catCount").textContent = CATEGORIES.length;
  renderNameInputs(state ? state.players.map(p => p.name) : load(NAMES_KEY, ["", "", ""]));
  $("resumeBtn").hidden = !load(SAVE_KEY, null);
  $("setupHint").textContent = "";
}

$("addPlayer").onclick = () => addNameRow().focus();

$("setupForm").onsubmit = e => {
  e.preventDefault();
  const names = [...$("nameList").querySelectorAll("input")].map((inp, i) => inp.value.trim() || "Player " + (i + 1));
  if (!names.length) {
    $("setupHint").textContent = "Add at least one player to start.";
    return;
  }
  startGame(names);
};

$("resumeBtn").onclick = () => {
  state = load(SAVE_KEY, null);
  if (state) showPlay();
};

// ---------- Board ----------

function showPlay() {
  $("setup").hidden = true;
  $("play").hidden = false;
  $("final").hidden = true;
  closeClue();
  hideConfirm();
  renderBoard();
  renderScores();
  if (cluesLeft() === 0) showFinal();
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
      btn.disabled = clue.used;
      btn.setAttribute("aria-label", `${cat.name} for $${clue.v}${clue.used ? ", done" : ""}`);
      btn.onclick = () => openClue(col, row);
      board.appendChild(btn);
    });
  });
  const left = cluesLeft();
  $("cluesLeft").textContent = `${left} clue${left === 1 ? "" : "s"} left`;
  $("undoBtn").disabled = state.history.length === 0;
}

// ---------- Scoreboard ----------

function renderScores(flash) {
  const wrap = $("scores");
  wrap.innerHTML = "";
  state.players.forEach((p, i) => {
    const pod = document.createElement("div");
    pod.className = "podium";
    if (open && open.missed.has(i)) pod.classList.add("missed");
    if (flash && flash.player === i) pod.classList.add(flash.delta > 0 ? "flash-up" : "flash-down");
    pod.innerHTML = `<div class="score${p.score < 0 ? " neg" : ""}">${fmt(p.score)}</div>
                     <div class="name"></div>`;
    pod.querySelector(".name").textContent = p.name;

    if (open) {
      const marks = document.createElement("div");
      marks.className = "marks";
      const v = state.board[open.col].clues[open.row].v;
      marks.innerHTML = `<button type="button" class="yes" aria-label="${p.name} correct, add $${v}">✓</button>
                         <button type="button" class="no" aria-label="${p.name} wrong, subtract $${v}">✗</button>`;
      const [yes, no] = marks.children;
      yes.disabled = no.disabled = open.missed.has(i);
      yes.onclick = () => markCorrect(i);
      no.onclick = () => markWrong(i);
      pod.appendChild(marks);
    }
    wrap.appendChild(pod);
  });
  // Keep the clue overlay from covering the podiums.
  document.documentElement.style.setProperty("--scores-h", wrap.offsetHeight + "px");
}

// ---------- Clues ----------

function openClue(col, row) {
  const cat = state.board[col];
  const clue = cat.clues[row];
  if (clue.used) return;
  open = { col, row, missed: new Set() };
  hideConfirm();
  $("clueCat").textContent = cat.name;
  $("clueVal").textContent = "$" + clue.v;
  $("clueText").textContent = clue.q;
  $("clueAnswer").textContent = clue.a;
  $("clueAnswer").hidden = true;
  $("revealBtn").hidden = false;
  $("clue").hidden = false;
  renderScores();
  $("revealBtn").focus();
}

function revealAnswer() {
  $("clueAnswer").hidden = false;
  $("revealBtn").hidden = true;
}

function closeClue() {
  open = null;
  $("clue").hidden = true;
}

// Retires the open clue and returns to the board.
function finishClue() {
  state.board[open.col].clues[open.row].used = true;
  closeClue();
  save();
  renderBoard();
  renderScores();
  if (cluesLeft() === 0) showFinal();
}

function markCorrect(i) {
  const clue = state.board[open.col].clues[open.row];
  state.players[i].score += clue.v;
  state.history.push({ player: i, delta: clue.v, col: open.col, row: open.row, closed: true });
  const flash = { player: i, delta: clue.v };
  finishClue();
  renderScores(flash);
}

function markWrong(i) {
  const clue = state.board[open.col].clues[open.row];
  state.players[i].score -= clue.v;
  state.history.push({ player: i, delta: -clue.v, col: open.col, row: open.row, closed: false });
  open.missed.add(i);
  save();
  // Everyone has missed: show the answer so the host can read it out.
  if (open.missed.size === state.players.length) revealAnswer();
  $("undoBtn").disabled = false;
  renderScores({ player: i, delta: -clue.v });
}

function noOne() {
  // Logged with no score change so Undo can put the clue back.
  state.history.push({ player: null, delta: 0, col: open.col, row: open.row, closed: true });
  finishClue();
}

function undo() {
  const last = state.history.pop();
  if (!last) return;
  if (last.player !== null) state.players[last.player].score -= last.delta;
  if (last.closed) state.board[last.col].clues[last.row].used = false;
  if (open && open.col === last.col && open.row === last.row && last.player !== null) {
    open.missed.delete(last.player);
  }
  save();
  renderBoard();
  renderScores(last.player !== null ? { player: last.player, delta: -last.delta } : null);
  // Undoing a final clue brings the board back.
  $("final").hidden = true;
}

// ---------- End of game ----------

function showFinal() {
  const ranked = state.players.map((p, i) => ({ ...p, i })).sort((a, b) => b.score - a.score);
  const top = ranked[0].score;
  const winners = ranked.filter(p => p.score === top);
  $("winner").textContent = winners.length > 1
    ? "It's a tie!"
    : `${winners[0].name} wins!`;
  $("standings").innerHTML = "";
  ranked.forEach(p => {
    const li = document.createElement("li");
    li.innerHTML = `<span></span><b>${fmt(p.score)}</b>`;
    li.firstChild.textContent = p.name;
    $("standings").appendChild(li);
  });
  $("final").hidden = false;
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

$("revealBtn").onclick = revealAnswer;
$("noOneBtn").onclick = noOne;
$("cancelBtn").onclick = () => {
  // Putting a clue back also reverses any wrong answers already marked on it.
  while (open.missed.size) {
    const idx = state.history.findLastIndex(h => h.col === open.col && h.row === open.row && !h.closed);
    if (idx < 0) break;
    const [h] = state.history.splice(idx, 1);
    state.players[h.player].score -= h.delta;
    open.missed.delete(h.player);
  }
  closeClue();
  save();
  renderBoard();
  renderScores();
};
$("undoBtn").onclick = undo;
$("newBoardBtn").onclick = () => askConfirm("Deal a new board? Scores reset to $0.", newBoard);
$("endBtn").onclick = () => askConfirm("End this game and go back to player setup?", () => {
  forget(SAVE_KEY);
  showSetup();
});
$("againBtn").onclick = newBoard;
$("changePlayersBtn").onclick = () => { forget(SAVE_KEY); showSetup(); };

document.addEventListener("keydown", e => {
  if (!open) return;
  if (e.key === " " && !$("revealBtn").hidden && document.activeElement.tagName !== "BUTTON") {
    e.preventDefault();
    revealAnswer();
  }
  if (e.key === "Escape") $("cancelBtn").click();
});
window.addEventListener("resize", () => {
  document.documentElement.style.setProperty("--scores-h", $("scores").offsetHeight + "px");
});

showSetup();
