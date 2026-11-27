# Krillion Unlimited

A standalone, pixel-ocean trivia game inspired by [Krillion](https://krillion.io/). Find a less obvious answer to dive deeper. Play with unlimited guesses, retries, replays, and fresh dives.

**[Play Krillion Unlimited](https://vlad-klymenko.github.io/krillion-for-david/)**

## Play

Select **Begin Descent** to enter the ocean. Each dive contains up to seven prompts. Type an answer and press **Dive** or Enter. A correct answer earns 10–100 points, with each point worth 10 metres. Try another answer as often as you like: only your **highest** score for each prompt counts, so retries never double-count points or replace a better answer with a worse one. Wrong guesses have no penalty.

Open **Dive Settings** to choose a question pack or toggle the timer. The default is untimed. The optional 25-second timer can be toggled at any time; every retry gets a fresh timer. You can skip a prompt, explore its answer bank, replay the same dive, or shuffle a fresh one. Category dives contain fewer than seven prompts when that category has a smaller question pool.

Personal best and timer preference are saved in this browser's local storage, when available. No account, tracking, API key, or backend is required.

## Run locally

Use Node.js 22+ for checks and Python 3 for the preview server. There are no packages to install.

```sh
npm start
```

Open <http://127.0.0.1:4173>. ES modules need an HTTP server; opening `index.html` directly from the filesystem is unsupported.

```sh
npm run check
```

## GitHub Pages

The site is served directly from the repository's `main` branch, at `/` (root). `.nojekyll` disables Jekyll processing. All assets use relative paths, so the game works under a project Pages URL. Push an update to `main` to rebuild the Pages site.

## Questions and scoring

`data/questions.js` holds 42 original, source-linked prompts, 739 answers, and 502 aliases across 12 categories. Prompts state their scope; some use complete finite sets and others explicitly use selected lists. All matching is local. Capitalization, accents, spaces, punctuation, explicit aliases, and an optional leading “the” are handled. Arbitrary misspellings are not guessed.

Rarity scores are **curated estimates**, not measured player frequencies. This is an independent fan game with original code and artwork; it does not use the original game's answer bank, assets, paid packs, accounts, or services.

## Files

- `index.html`, `styles.css`, `app.js`: accessible, responsive game interface.
- `engine.js`: answer matching, seeded question selection, scoring tiers, and depth.
- `data/questions.js`: prompts, canonical answers, aliases, estimated rarity points, and sources.
- `tests/`: dependency-free Node test suite.
- `assets/`: original SVG krill and favicon.

Code and original artwork are available under the MIT license. Linked factual sources retain their respective rights.

The locally hosted VT323 font is by The VT323 Project Authors and is distributed under the SIL Open Font License 1.1, included in `assets/VT323-OFL.txt`. The boat and krill are original pixel-style SVG artwork.
