// Helpers shared by every game.

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sample(arr, n) {
  return shuffle(arr).slice(0, n);
}

// Best scores live in the player's browser only.
function getBest(gameId) {
  try {
    return Number(localStorage.getItem("nba-trivia-best:" + gameId)) || 0;
  } catch {
    return 0;
  }
}

// Saves the score if it beats the previous best. Returns true on a new record.
function saveBest(gameId, score) {
  if (score <= getBest(gameId)) return false;
  try {
    localStorage.setItem("nba-trivia-best:" + gameId, String(score));
  } catch {}
  return true;
}
