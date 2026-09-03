# Wizard Chess

A small 3D chess prototype where a person and an AI agent share the same board. Play by clicking the stone pieces, learn with a guided lesson, or let an agent use WebMCP tools to coach and play.

Built for the [OpenAI WebMCP Challenge](https://openai.com/webmcp-challenge/) on [Devpost](https://webmcp.devpost.com/).

## Run locally

You need Node.js 20.19 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. For a production check:

```bash
npm run build
npm run preview
```

The app is a static SPA and can be deployed to Vercel with the default Vite settings.

## What works

- A Three.js chessboard with orbit controls and click-to-move
- Legal chess moves powered by `chess.js`
- Learn and Ranked entry modes
- A pawn movement lesson
- A lightweight local opponent with Apprentice, Duelist, and Master settings
- Eight WebMCP tools connected to the same game state as the visual board
- A local prototype leaderboard stored in the browser

## Test WebMCP

Deploy the site and open it in ChatGPT's in-app browser, which supports WebMCP. You can then ask the agent to inspect the position, start the pawn lesson, make a move, or begin a ranked game.

For Chrome testing, open `chrome://flags/#enable-webmcp-testing`, enable the flag, and restart Chrome. When WebMCP is unavailable, the app shows a message and remains fully playable through the UI.

The complete WebMCP surface has 18 tools covering lessons, every legal move, full game state, explanations, difficulty, playing either color, pause/resume, undo, resignation, agreed draws, saved games, custom FEN positions, camera views, and the local leaderboard.

Every meaningful action is available through these tools, so a player can use voice with the browser agent to start lessons, inspect the position, change difficulty, start games, and play moves without typing or manually operating the board.

Tools: `list_lessons`, `start_lesson`, `make_move`, `get_game_state`, `explain_last_move`, `set_difficulty`, `get_leaderboard`, `set_game_paused`, `undo_last_turn`, `resign_game`, `offer_draw`, `save_game`, `list_saved_games`, `load_saved_game`, `delete_saved_game`, `load_custom_position`, `set_camera_view`, and `start_ranked_game`.

## Roadmap, not in this version

- fal.ai MiniMax H3 cinematic piece-versus-piece clips for captures
- Highly detailed, film-accurate wizard chess models

These ideas are intentionally deferred so the current prototype stays fast and deployable.

## License

[MIT](LICENSE)
