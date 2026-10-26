# NBA Trivia Games

A collection of browser-based NBA trivia games. It's plain HTML, CSS and JavaScript with no build step, so the folder can be hosted as-is on GitHub Pages, Netlify or any static host.

## Games

| Game | Folder | Description |
| --- | --- | --- |
| NBA Who Wants to Be a Millionaire | `games/millionaire/` | 15-question money ladder with lifelines, drawn from a 200-question bank in five difficulty tiers |
| NBA Jeopardy! | `games/jeopardy/` | 6 random categories from 34. Single player with typed answers, or multiplayer with a host view and a player view |

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
