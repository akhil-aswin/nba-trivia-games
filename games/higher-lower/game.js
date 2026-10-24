const GAME_ID = "higher-lower";

const $ = id => document.getElementById(id);
const fmt = n => n.toLocaleString("en-US");
let deck, a, b, streak;

function start() {
  deck = shuffle(PLAYERS);
  a = deck.pop();
  streak = 0;
  $("again").classList.add("hidden");
  $("choices").classList.remove("hidden");
  nextPair();
}

function nextPair() {
  if (deck.length === 0) deck = shuffle(PLAYERS.filter(p => p !== a));
  b = deck.pop();
  $("nameA").textContent = a.name;
  $("ptsA").textContent = fmt(a.pts);
  $("nameB").textContent = b.name;
  $("ptsB").textContent = "?";
  $("streak").textContent = streak;
  $("best").textContent = `Best: ${getBest(GAME_ID)}`;
  $("feedback").textContent = "";
  $("next").classList.add("hidden");
  $("higher").disabled = $("lower").disabled = false;
}

function guess(higher) {
  $("higher").disabled = $("lower").disabled = true;
  $("ptsB").textContent = fmt(b.pts);
  const correct = higher ? b.pts >= a.pts : b.pts <= a.pts;

  if (correct) {
    streak++;
    $("streak").textContent = streak;
    $("feedback").textContent = "Correct! 🔥";
    $("next").classList.remove("hidden");
  } else {
    const record = saveBest(GAME_ID, streak);
    $("feedback").textContent = `Wrong! Final streak: ${streak}.` + (record ? " New personal best! 🎉" : "");
    $("best").textContent = `Best: ${getBest(GAME_ID)}`;
    $("choices").classList.add("hidden");
    $("again").classList.remove("hidden");
  }
}

$("higher").onclick = () => guess(true);
$("lower").onclick = () => guess(false);
$("next").onclick = () => { a = b; nextPair(); };
$("again").onclick = start;
start();
