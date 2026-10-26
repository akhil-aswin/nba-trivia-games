// Builds a crossword from TERMS. Words are placed one at a time so each new word crosses
// at least one letter already on the grid, following normal crossword rules: no two words
// run side by side, and every run of letters is a real answer. Many random layouts are
// tried and the densest one wins.

const SIZES = {
  small: { n: 5, label: "Small", tries: 1500, ms: 350 },
  medium: { n: 8, label: "Medium", tries: 900, ms: 600 },
  large: { n: 12, label: "Large", tries: 500, ms: 900 },
};

const toAnswer = display => display.toUpperCase().normalize("NFD").replace(/[^A-Z]/g, "");

// Word lengths for multi-word answers, e.g. "Alley-oop" -> "5-3", "Fast break" -> "5,5".
function enumeration(display) {
  const parts = display.normalize("NFD").replace(/[^A-Za-z \-]/g, "").split(/([ \-])/);
  let out = "";
  for (const p of parts) {
    if (p === " ") out += ",";
    else if (p === "-") out += "-";
    else if (p) out += p.length;
  }
  return out;
}

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Returns the number of crossings if the word fits at (r, c) going dir, or -1 if it doesn't.
function fit(grid, n, word, r, c, dir) {
  const dr = dir === "down" ? 1 : 0;
  const dc = dir === "across" ? 1 : 0;
  const endR = r + dr * (word.length - 1);
  const endC = c + dc * (word.length - 1);
  if (r < 0 || c < 0 || endR >= n || endC >= n) return -1;
  const at = (rr, cc) => (rr >= 0 && cc >= 0 && rr < n && cc < n ? grid[rr][cc] : null);
  // The squares just before and after the word must be empty.
  if (at(r - dr, c - dc) || at(endR + dr, endC + dc)) return -1;

  let crossings = 0;
  for (let i = 0; i < word.length; i++) {
    const rr = r + dr * i;
    const cc = c + dc * i;
    const cell = grid[rr][cc];
    if (cell) {
      if (cell.letter !== word[i] || cell[dir] !== undefined) return -1;
      crossings++;
    } else if (at(rr + dc, cc + dr) || at(rr - dc, cc - dr)) {
      // A new letter can't sit beside another letter, or it would spell a non-word.
      return -1;
    }
  }
  return crossings;
}

function place(grid, word, r, c, dir, index) {
  const dr = dir === "down" ? 1 : 0;
  const dc = dir === "across" ? 1 : 0;
  for (let i = 0; i < word.length; i++) {
    const rr = r + dr * i;
    const cc = c + dc * i;
    grid[rr][cc] = grid[rr][cc] || { letter: word[i] };
    grid[rr][cc][dir] = index;
  }
}

// One random layout attempt.
function attempt(n, pool) {
  const grid = Array.from({ length: n }, () => Array(n).fill(null));
  const placed = [];
  const order = shuffled(pool);

  // Open with one of the longer words, across, somewhere on the grid.
  const long = order.filter(t => t.answer.length >= Math.max(3, n - 2));
  const first = (long.length ? long : order)[Math.floor(Math.random() * Math.min(6, (long.length ? long : order).length))];
  const r0 = Math.floor(Math.random() * n);
  const c0 = Math.floor(Math.random() * (n - first.answer.length + 1));
  place(grid, first.answer, r0, c0, "across", 0);
  placed.push({ term: first, r: r0, c: c0, dir: "across" });
  const used = new Set([first.answer]);

  let added = true;
  while (added) {
    added = false;
    for (const term of order) {
      if (used.has(term.answer)) continue;
      const w = term.answer;
      let best = null;
      // Try every way this word could cross a letter already on the grid.
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const cell = grid[r][c];
          if (!cell) continue;
          for (let i = 0; i < w.length; i++) {
            if (w[i] !== cell.letter) continue;
            for (const dir of ["across", "down"]) {
              const sr = dir === "down" ? r - i : r;
              const sc = dir === "across" ? c - i : c;
              const x = fit(grid, n, w, sr, sc, dir);
              if (x > 0 && (!best || x > best.x || (x === best.x && Math.random() < 0.5))) best = { r: sr, c: sc, dir, x };
            }
          }
        }
      }
      if (best) {
        place(grid, w, best.r, best.c, best.dir, placed.length);
        placed.push({ term, r: best.r, c: best.c, dir: best.dir });
        used.add(w);
        added = true;
      }
    }
  }

  let filled = 0;
  let crossed = 0;
  for (const row of grid) for (const cell of row) {
    if (!cell) continue;
    filled++;
    if (cell.across !== undefined && cell.down !== undefined) crossed++;
  }
  // Favour full, well-connected grids with plenty of answers.
  const score = filled * 3 + crossed * 4 + placed.length * 2;
  return { grid, placed, score };
}

// Builds the best puzzle found within the size's time budget.
function generate(sizeKey) {
  const { n, tries, ms } = SIZES[sizeKey];
  const pool = TERMS
    .map(([display, ...clues]) => ({ display, clues, answer: toAnswer(display) }))
    .filter(t => t.answer.length >= 3 && t.answer.length <= n);

  const start = Date.now();
  let best = null;
  for (let i = 0; i < tries && Date.now() - start < ms; i++) {
    const a = attempt(n, pool);
    if (!best || a.score > best.score) best = a;
  }
  return toPuzzle(n, best);
}

// Numbers the squares and turns the layout into the puzzle the game uses.
function toPuzzle(n, { grid, placed }) {
  const starts = new Map();
  placed.forEach(p => starts.set(p.r * n + p.c, null));
  const numbered = [...starts.keys()].sort((a, b) => a - b);
  numbered.forEach((key, i) => starts.set(key, i + 1));

  const entries = placed.map(p => ({
    number: starts.get(p.r * n + p.c),
    dir: p.dir,
    r: p.r,
    c: p.c,
    answer: p.term.answer,
    display: p.term.display,
    enumeration: enumeration(p.term.display),
    clue: p.term.clues[Math.floor(Math.random() * p.term.clues.length)],
  }));
  entries.sort((a, b) => (a.dir === b.dir ? a.number - b.number : a.dir === "across" ? -1 : 1));

  const solution = grid.map(row => row.map(cell => (cell ? cell.letter : null)));
  const numbers = grid.map((row, r) => row.map((_, c) => starts.get(r * n + c) || null));
  return { n, solution, numbers, entries };
}

if (typeof module !== "undefined") module.exports = { generate, SIZES, enumeration, toAnswer };
