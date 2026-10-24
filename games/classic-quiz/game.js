const GAME_ID = "classic-quiz";
const ROUND_SIZE = 10;

const $ = id => document.getElementById(id);
let round, index, score;

function start() {
  round = sample(QUESTIONS, ROUND_SIZE);
  index = 0;
  score = 0;
  $("done").classList.add("hidden");
  $("play").classList.remove("hidden");
  show();
}

function show() {
  const item = round[index];
  $("progress").textContent = `Question ${index + 1} / ${round.length}`;
  $("score").textContent = `Score: ${score}`;
  $("question").textContent = item.q;
  $("feedback").textContent = "";
  $("next").classList.add("hidden");

  $("options").innerHTML = "";
  for (const choice of shuffle([item.a, ...item.wrong])) {
    const btn = document.createElement("button");
    btn.textContent = choice;
    btn.onclick = () => answer(btn, choice === item.a);
    $("options").appendChild(btn);
  }
}

function answer(btn, correct) {
  const item = round[index];
  for (const b of $("options").children) {
    b.disabled = true;
    if (b.textContent === item.a) b.classList.add("correct");
  }
  if (correct) {
    score++;
    $("feedback").textContent = "Correct! 🔥";
  } else {
    btn.classList.add("wrong");
    $("feedback").textContent = `Nope. The answer is ${item.a}.`;
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
