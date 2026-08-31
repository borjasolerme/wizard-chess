MANDATORY: Follow coding-workflow. Smallest coherent change. Reuse existing patterns. Tests only if they pay off. No over-engineering.

You are starting a NEW public GitHub repo for Borja Soler (gh user borjasolerme) for the OpenAI WebMCP Challenge.

# Product: Wizard Chess (working title)
Interactive 3D wizard-chess inspired by Harry Potter (life-sized stone pieces, gothic hall) PLUS WebMCP so a human AND ChatGPT can play/learn together.

Two modes:
1. Tutorials / learning path to Master (beginner → tactics → endgame → master)
2. Play vs AI: leaderboard, each new game the AI is a bit stronger, starting easy

Tech NOW:
- Vite + TypeScript + Three.js 3D board (simple geometric/stone-like pieces is OK for v1; not photoreal)
- chess.js for rules, stockfish.wasm or similar for AI difficulty levels
- WebMCP imperative API: navigator.modelContext.registerTool
- Deployable static/SPA (Vercel)

Tech LATER (do NOT implement now, only mention in README):
- fal.ai MiniMax H3 for cinematic piece-vs-piece fight clips when a capture happens
- Highly detailed HP-accurate models

# WebMCP tools the site MUST register (minimum)
- list_lessons
- start_lesson
- make_move (uci or from/to)
- get_position (fen, side to move, legal moves, evaluation if cheap)
- explain_last_move
- set_difficulty
- get_leaderboard
- start_ranked_game
Human still plays by clicking pieces. Agent uses tools. Same board updates.

# This Codex run — two outputs

## A) Docs in /workspace/wizard-chess-hackathon/
Write these files (markdown, plain, easy language):
1. WEBMCP.md — explain WebMCP to a smart non-specialist:
   - Not the same as MCP servers
   - Website exposes tools in the BROWSER via navigator.modelContext.registerTool
   - Human uses UI, agent calls tools, user stays in the loop
   - How we test: ChatGPT in-app browser, or chrome://flags/#enable-webmcp-testing
   - Embed the sketches: assets/webmcp-one-picture.png and assets/wizard-chess-two-modes.png
2. HACKATHON.md — facts only from the challenge:
   - https://webmcp.devpost.com/ and https://openai.com/webmcp-challenge/
   - Deadline: Sep 3, 2026 1:00pm PT (22:00 Europe/Rome)
   - Top 10: $3000 cash, ChatGPT Pro 1yr, Codex Micro, swag, extra credits
   - Submit: live URL, <3min YouTube with audio, public OSS repo with LICENSE visible, text explaining WebMCP fit
   - Judging: WebMCP Leverage, Execution, Potential Impact, Creativity & Ambition
   - Test in ChatGPT in-app browser
3. PROGRESS.md — status board:
   - Idea locked
   - Sketches done
   - Repo scaffold (this run)
   - WebMCP tools, 3D board, tutorials, ranked AI, deploy, demo video — not done
   - fal/minimax explicitly later
4. WHY_WEBMCP.md — why chess+tutor+AI is a strong WebMCP use case (agent coaches while you look at 3D pieces; agent can play a line without clicking 64 squares)

## B) App repo
Create a public GitHub repo under borjasolerme, MIT license, name `wizard-chess` (or wizardchess if taken).
Scaffold a working Vite TS app:
- 3D chessboard with Three.js (orbit camera, click-to-move)
- Two mode entry: Learn / Ranked
- Stub tutorials (at least 1 lesson: how a pawn moves)
- AI opponent with at least 3 difficulty levels (even if stockfish depth)
- Register the WebMCP tools if navigator.modelContext exists; no-op message if not
- README with how to run, how to test WebMCP, challenge links
- Push to GitHub, print the repo URL

Do not add fal, do not scrape, do not over-design UI. Gothic dark board is enough.

Report: repo URL, files written under /workspace/wizard-chess-hackathon, what still needs doing before Sep 3.
