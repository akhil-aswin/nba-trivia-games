# NBA Trivia Games

A collection of browser-based NBA trivia games. It's plain HTML, CSS and JavaScript with no build step, so the folder can be hosted as-is on GitHub Pages, Netlify or any static host.

## Games

| Game | Folder | Description |
| --- | --- | --- |
| Classic Quiz | `games/classic-quiz/` | 10 random multiple-choice questions on NBA history |
| Higher or Lower | `games/higher-lower/` | Guess whether the next player scored more career points |
| MVP by Year | `games/mvp-by-year/` | Name the regular-season MVP for a given season |

## Running locally

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Structure

```
index.html          Hub page listing every game
shared/styles.css   Shared look and feel
shared/utils.js     Shared helpers (shuffle, best-score storage)
games/<game-id>/    One folder per game (index.html + data + game.js)
```

## Adding a game

1. Create `games/<game-id>/index.html` (copy an existing game as a starting point).
2. Add an entry to the `GAMES` list in the root `index.html`.

Best scores are saved in each player's browser (localStorage).
