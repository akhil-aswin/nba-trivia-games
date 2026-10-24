const GAME_ID = "mvp-by-year";
const ROUND_SIZE = 10;

const $ = id => document.getElementById(id);
const ALL_WINNERS = [...new Set(Object.values(MVPS))];
const seasonLabel = y => `${y - 1}–${String(y).slice(-2)}`;
let round, index, score;

function start() {
  round = sample(Object.keys(MVPS).map(Number), ROUND_SIZE);
  index = 0;
  score = 0;
  $("done").classList.add("hidden");
  $("play").classList.remove("hidden");
  show();
}

function show() {
  const year = round[index];
  const answer = MVPS[year];
  // Wrong options come from other MVP winners, so every choice is plausible.
  const wrong = sample(ALL_WINNERS.filter(n => n !== answer), 3);

  $("progress").textContent = `Season ${index + 1} / ${round.length}`;
  $("score").textContent = `Score: ${score}`;
  $("question").textContent = `Who won MVP in the ${seasonLabel(year)} season?`;
  $("feedback").textContent = "";
  $("next").classList.add("hidden");

  $("options").innerHTML = "";
  for (const choice of shuffle([answer, ...wrong])) {
    const btn = document.createElement("button");
    btn.textContent = choice;
    btn.onclick = () => pick(btn, choice === answer, answer);
    $("options").appendChild(btn);
  }
}

function pick(btn, correct, answer) {
  for (const b of $("options").children) {
    b.disabled = true;
    if (b.textContent === answer) b.classList.add("correct");
  }
  if (correct) {
    score++;
    $("feedback").textContent = "Correct! 🔥";
  } else {
    btn.classList.add("wrong");
    $("feedback").textContent = `Nope. It was ${answer}.`;
  }
  $("score").textContent = `Score: ${score}`;
  $("next").textContent = index + 1 < round.length ? "Next →" : "See results";
  $("next").classList.remove("hidden");
}

function next() {
  index++;
  if (index < round.length) return show();
  $("play").classList.add("hidden");
  $("done").classList.remove("hidden");
  $("final").textContent = `${score} / ${round.length}`;
  $("best").textContent = saveBest(GAME_ID, score)
    ? "New personal best! 🎉"
    : `Your best: ${getBest(GAME_ID)} / ${round.length}`;
}

$("next").onclick = next;
$("again").onclick = start;
start();
