# CLAUDE.md

The canonical instructions for this repository live in **[AGENTS.md](./AGENTS.md)**. Read it before
editing; it covers the hard invariants, the verification ladder, this machine's gotchas, and the
collaboration protocol for multiple agents.

This file is deliberately only a pointer: duplicating the rules here would let the two copies drift.
If you need to change how agents work in this repo, change `AGENTS.md`.

Quick orientation:

- `ARCHITECTURE.md` — internals + ADR log · `README.md` — setup, env, deploy
- `agents/tasks.md` — claim your work here first · `agents/log/` — leave a handoff entry when done
- Always: `npm run typecheck`. Choose more from the verification ladder in `AGENTS.md` §7.
