# Neon Swarm

A twin-stick neon roguelite in the style of Geometry Wars. Pick one of seven very different ships, draft upgrades and mods that combine into powerful synergies, and blast through three sectors and their bosses, or survive Endless in one huge arena. Relaxed difficulty and auto-fire make it easy to pick up.

## Play

- **PushPlay (Steam Deck, Legion Go, PC):** find it in the launcher's **Discover** tab, or **Add game → GitHub → watch this repo**. Every push to `main` builds the game and publishes it to this repo's `pushplay-latest` release.
- **Browser:** `npm run setup`, then `npm run dev` (http://localhost:5173).

| Command | |
|---|---|
| `npm run dev` | Play locally with live reload |
| `npm run check` | Headless play test + art render (run before pushing) |

Plays with a controller, keyboard, mouse or touch. Agents: rules are in [`AGENTS.md`](AGENTS.md); the design brief is [`DESIGN.md`](DESIGN.md).

## Rights

© Visual Zone Development. All rights reserved. The source is public so PushPlay can build and verify the game; that doesn't make it open source, and it may not be copied, modified or redistributed without permission. Third-party assets (fonts and similar) keep their own licences, listed in the game's credits files.
