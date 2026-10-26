const GAME_ID = "crossword";
const $ = id => document.getElementById(id);
const fmtTime = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// ---------- Storage ----------
// Each size keeps its own puzzle in progress, so switching sizes doesn't lose work.
const saveKey = size => `nba-trivia-save:${GAME_ID}-${size}`;
const SIZE_KEY = `nba-trivia-size:${GAME_ID}`;
const BEST_KEY = `nba-trivia-best:${GAME_ID}`;

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

// ---------- State ----------
// game.fill[r][c]: the player's letter ("" if empty, null for black squares)
// game.marks[r][c]: "wrong" after a failed check, "revealed" after a reveal
let size = load(SIZE_KEY, "medium");
if (!SIZES[size]) size = "medium";
let game = null;
let sel = { r: 0, c: 0, dir: "across" };
let cellEntries = []; // [r][c] -> { across: entry index, down: entry index }

const P = () => game.puzzle;
const isOpen = (r, c) => r >= 0 && c >= 0 && r < P().n && c < P().n && P().solution[r][c] !== null;

function newGame() {
  $("building").hidden = false;
  // Let "Building your puzzle…" paint before the generator runs.
  setTimeout(() => {
    const puzzle = generate(size);
    game = {
      puzzle,
      fill: puzzle.solution.map(row => row.map(ch => (ch ? "" : null))),
      marks: puzzle.solution.map(row => row.map(() => null)),
      elapsed: 0,
      helped: false,
      solved: false,
    };
    $("building").hidden = true;
    setup();
    save();
  }, 30);
}

function loadOrCreate() {
  const saved = load(saveKey(size), null);
  if (saved && saved.puzzle && saved.puzzle.n === SIZES[size].n) {
    game = saved;
    setup();
  } else {
    newGame();
  }
}

function save() {
  if (game) store(saveKey(size), game);
}

// Index which entries cover each square, then pick a starting square.
function setup() {
  const { n, entries } = P();
  cellEntries = Array.from({ length: n }, () => Array.from({ length: n }, () => ({})));
  entries.forEach((e, i) => {
    cellsOf(e).forEach(([r, c]) => { cellEntries[r][c][e.dir] = i; });
  });
  const first = entries[0];
  sel = { r: first.r, c: first.c, dir: first.dir };
  hideConfirm();
  $("note").textContent = "";
  buildGrid();
  renderClueLists();
  render();
}

function cellsOf(e) {
  return [...e.answer].map((_, i) => (e.dir === "across" ? [e.r, e.c + i] : [e.r + i, e.c]));
}

const currentEntryIndex = () => cellEntries[sel.r][sel.c][sel.dir];
const currentEntry = () => P().entries[currentEntryIndex()];

// ---------- Rendering ----------

function buildGrid() {
  const { n, numbers } = P();
  const grid = $("grid");
  grid.style.setProperty("--n", n);
  grid.innerHTML = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.r = r;
      cell.dataset.c = c;
      if (!isOpen(r, c)) {
        cell.classList.add("block");
      } else {
        cell.setAttribute("role", "gridcell");
        if (numbers[r][c]) cell.insertAdjacentHTML("beforeend", `<span class="num">${numbers[r][c]}</span>`);
        cell.insertAdjacentHTML("beforeend", `<span class="letter"></span>`);
        cell.addEventListener("click", () => clickCell(r, c));
      }
      grid.appendChild(cell);
    }
  }
}

function renderClueLists() {
  ["across", "down"].forEach(dir => {
    const list = $(dir + "List");
    list.innerHTML = "";
    P().entries.forEach((e, i) => {
      if (e.dir !== dir) return;
      const li = document.createElement("li");
      li.dataset.i = i;
      li.innerHTML = `<b>${e.number}</b><span><span class="text"></span> <span class="len">(${e.enumeration})</span></span>`;
      li.querySelector(".text").textContent = e.clue;
      li.addEventListener("click", () => jumpTo(i));
      list.appendChild(li);
    });
  });
}

function render() {
  const { n } = P();
  const active = currentEntryIndex();
  const activeCells = new Set(cellsOf(P().entries[active]).map(([r, c]) => r * n + c));
  $("grid").classList.toggle("solved-grid", game.solved);

  for (const cell of $("grid").children) {
    const r = +cell.dataset.r;
    const c = +cell.dataset.c;
    if (!isOpen(r, c)) continue;
    cell.querySelector(".letter").textContent = game.fill[r][c];
    cell.classList.toggle("in-word", activeCells.has(r * n + c));
    cell.classList.toggle("selected", r === sel.r && c === sel.c);
    cell.classList.toggle("wrong", game.marks[r][c] === "wrong");
    cell.classList.toggle("revealed", game.marks[r][c] === "revealed");
    cell.setAttribute("aria-label", `${game.fill[r][c] || "blank"}, row ${r + 1}, column ${c + 1}`);
  }

  // Clue lists: highlight the active clue and the one crossing the selected square.
  const crossDir = sel.dir === "across" ? "down" : "across";
  const cross = cellEntries[sel.r][sel.c][crossDir];
  document.querySelectorAll(".clues li").forEach(li => {
    const i = +li.dataset.i;
    const e = P().entries[i];
    li.classList.toggle("active", i === active);
    li.classList.toggle("cross", i === cross);
    li.classList.toggle("done", cellsOf(e).every(([r, c]) => game.fill[r][c]));
  });
  const activeLi = document.querySelector(`.clues li[data-i="${active}"]`);
  if (activeLi) activeLi.scrollIntoView({ block: "nearest" });

  const e = P().entries[active];
  $("currentClue").innerHTML = "";
  const label = document.createElement("b");
  label.textContent = `${e.number} ${e.dir === "across" ? "Across" : "Down"}`;
  $("currentClue").append(label, `${e.clue} (${e.enumeration})`);

  $("timer").textContent = fmtTime(game.elapsed);
  renderSizes();
  renderSolved();
}

function renderSizes() {
  document.querySelectorAll("[data-size]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.size === size)));
}

function renderSolved() {
  $("solved").hidden = !game.solved;
  if (!game.solved) return;
  const best = load(BEST_KEY, {})[size];
  $("solvedTitle").textContent = game.helped ? "Puzzle complete" : "Solved!";
  $("solvedText").textContent = game.helped
    ? `Finished in ${fmtTime(game.elapsed)} with some reveals.`
    : `${SIZES[size].label} puzzle in ${fmtTime(game.elapsed)}.` + (best ? ` Your best: ${fmtTime(best)}.` : "");
}

// ---------- Selection and movement ----------

function focusKeyboard() {
  $("kbd").focus({ preventScroll: true });
}

function clickCell(r, c) {
  if (game.solved) return;
  const entries = cellEntries[r][c];
  if (r === sel.r && c === sel.c) {
    // Second click on the same square switches direction, if there is one.
    const other = sel.dir === "across" ? "down" : "across";
    if (entries[other] !== undefined) sel.dir = other;
  } else {
    sel.r = r;
    sel.c = c;
    if (entries[sel.dir] === undefined) sel.dir = entries.across !== undefined ? "across" : "down";
  }
  render();
  focusKeyboard();
}

function jumpTo(i) {
  if (game.solved) return;
  const e = P().entries[i];
  const cells = cellsOf(e);
  const [r, c] = cells.find(([r, c]) => !game.fill[r][c]) || cells[0];
  sel = { r, c, dir: e.dir };
  render();
  focusKeyboard();
}

// Next or previous clue in reading order: all Across, then all Down.
function stepClue(delta) {
  const count = P().entries.length;
  jumpTo((currentEntryIndex() + delta + count) % count);
}

function moveWithinWord(step) {
  const e = currentEntry();
  const cells = cellsOf(e);
  const idx = cells.findIndex(([r, c]) => r === sel.r && c === sel.c);
  const next = cells[idx + step];
  if (next) [sel.r, sel.c] = next;
}

// Arrow keys: move to the next open square in that direction, switching direction first.
function arrow(dr, dc) {
  const dir = dc ? "across" : "down";
  if (sel.dir !== dir && cellEntries[sel.r][sel.c][dir] !== undefined) {
    sel.dir = dir;
    return render();
  }
  let r = sel.r + dr;
  let c = sel.c + dc;
  while (r >= 0 && c >= 0 && r < P().n && c < P().n) {
    if (isOpen(r, c)) {
      sel.r = r;
      sel.c = c;
      if (cellEntries[r][c][sel.dir] === undefined) sel.dir = sel.dir === "across" ? "down" : "across";
      break;
    }
    r += dr;
    c += dc;
  }
  render();
}

// ---------- Typing ----------

function typeLetter(ch) {
  if (game.solved) return;
  game.fill[sel.r][sel.c] = ch;
  if (game.marks[sel.r][sel.c] === "wrong") game.marks[sel.r][sel.c] = null;
  moveWithinWord(1);
  afterChange();
}

function backspace() {
  if (game.solved) return;
  if (game.fill[sel.r][sel.c] && game.marks[sel.r][sel.c] !== "revealed") {
    game.fill[sel.r][sel.c] = "";
    game.marks[sel.r][sel.c] = null;
  } else {
    moveWithinWord(-1);
    if (game.marks[sel.r][sel.c] !== "revealed") {
      game.fill[sel.r][sel.c] = "";
      game.marks[sel.r][sel.c] = null;
    }
  }
  afterChange();
}

function afterChange() {
  checkSolved();
  save();
  render();
}

function checkSolved() {
  const { solution } = P();
  const allFilled = game.fill.every(row => row.every(ch => ch === null || ch !== ""));
  if (!allFilled) {
    $("note").textContent = "";
    return;
  }
  const correct = game.fill.every((row, r) => row.every((ch, c) => ch === null || ch === solution[r][c]));
  if (correct) {
    game.solved = true;
    if (!game.helped) {
      const bests = load(BEST_KEY, {});
      if (!bests[size] || game.elapsed < bests[size]) {
        bests[size] = game.elapsed;
        store(BEST_KEY, bests);
      }
    }
    $("note").textContent = "";
    $("kbd").blur();
  } else {
    $("note").textContent = "Every square is filled, but something's not right yet. Try Check → Puzzle.";
  }
}

// ---------- Check and reveal ----------

function scopeCells(scope) {
  if (scope === "cell") return [[sel.r, sel.c]];
  if (scope === "word") return cellsOf(currentEntry());
  const all = [];
  P().solution.forEach((row, r) => row.forEach((ch, c) => { if (ch) all.push([r, c]); }));
  return all;
}

function check(scope) {
  let wrong = 0;
  scopeCells(scope).forEach(([r, c]) => {
    const ch = game.fill[r][c];
    if (ch && ch !== P().solution[r][c]) {
      game.marks[r][c] = "wrong";
      wrong++;
    }
  });
  $("note").textContent = wrong ? `${wrong} square${wrong === 1 ? "" : "s"} marked wrong.` : "No mistakes so far.";
  save();
  render();
  focusKeyboard();
}

function reveal(scope) {
  scopeCells(scope).forEach(([r, c]) => {
    if (game.fill[r][c] === P().solution[r][c] && game.marks[r][c] !== "wrong") return;
    game.fill[r][c] = P().solution[r][c];
    game.marks[r][c] = "revealed";
  });
  game.helped = true;
  afterChange();
  if (!game.solved) focusKeyboard();
}

function clearAll() {
  game.fill = P().solution.map(row => row.map(ch => (ch ? "" : null)));
  game.marks = P().solution.map(row => row.map(() => null));
  game.solved = false;
  $("note").textContent = "";
  save();
  render();
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

const inProgress = () => game && !game.solved && game.fill.some(row => row.some(ch => ch));

// ---------- Wiring ----------

$("kbd").addEventListener("keydown", e => {
  if (!game || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (/^[a-z]$/i.test(k)) {
    e.preventDefault();
    typeLetter(k.toUpperCase());
  } else if (k === "Backspace" || k === "Delete") {
    e.preventDefault();
    backspace();
  } else if (k === "ArrowLeft") { e.preventDefault(); arrow(0, -1); }
  else if (k === "ArrowRight") { e.preventDefault(); arrow(0, 1); }
  else if (k === "ArrowUp") { e.preventDefault(); arrow(-1, 0); }
  else if (k === "ArrowDown") { e.preventDefault(); arrow(1, 0); }
  else if (k === "Tab" || k === "Enter") { e.preventDefault(); stepClue(e.shiftKey ? -1 : 1); }
  else if (k === " ") {
    e.preventDefault();
    clickCell(sel.r, sel.c);
  }
});
// Phone keyboards often skip keydown letters and send input events instead.
$("kbd").addEventListener("input", () => {
  const v = $("kbd").value;
  $("kbd").value = "";
  const ch = v.slice(-1).toUpperCase();
  if (/^[A-Z]$/.test(ch)) typeLetter(ch);
});
$("kbd").addEventListener("beforeinput", e => {
  if (e.inputType === "deleteContentBackward") {
    e.preventDefault();
    backspace();
  }
});

$("prevClue").onclick = () => stepClue(-1);
$("nextClue").onclick = () => stepClue(1);
document.querySelectorAll("[data-act]").forEach(b => {
  b.onclick = () => {
    if (!game || game.solved) return;
    if (b.dataset.act === "check") check(b.dataset.scope);
    else if (b.dataset.scope === "all") askConfirm("Reveal the whole puzzle?", () => reveal("all"));
    else reveal(b.dataset.scope);
  };
});
$("clearBtn").onclick = () => askConfirm("Clear every letter? The timer keeps running.", clearAll);
$("newBtn").onclick = () => (inProgress() ? askConfirm("Start a new puzzle? This one will be lost.", newGame) : newGame());
$("againBtn").onclick = newGame;
document.querySelectorAll("[data-size]").forEach(b => {
  b.onclick = () => {
    if (b.dataset.size === size) return;
    save();
    size = b.dataset.size;
    store(SIZE_KEY, size);
    hideConfirm();
    loadOrCreate();
  };
});

// The timer runs while the page is visible and the puzzle isn't solved.
setInterval(() => {
  if (!game || game.solved || document.hidden || !$("building").hidden) return;
  game.elapsed++;
  $("timer").textContent = fmtTime(game.elapsed);
  if (game.elapsed % 5 === 0) save();
}, 1000);

loadOrCreate();
