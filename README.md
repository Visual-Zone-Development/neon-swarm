# Neon Swarm

A twin-stick neon roguelite in the style of Geometry Wars. Pick one of seven very different ships, draft upgrades and mods that combine into powerful synergies, and blast through three sectors and their bosses, or survive Endless in one huge arena. Relaxed difficulty and auto-fire make it easy to pick up.

## Play

- **PushPlay (Steam Deck, Legion Go, PC):** find it in the launcher's **Discover** tab.
- **Browser:** `npm run setup`, then `npm run dev` (http://localhost:5173).

| Command | |
|---|---|
| `npm run dev` | Play locally with live reload |
| `npm run check` | Headless play test + art render (run before pushing) |

## Releasing

The code lives in this **private** repo; players get the game from the **public** release repo [`Visual-Zone-Development/neon-swarm`](https://github.com/Visual-Zone-Development/neon-swarm), which PushPlay's Discover tab lists.

- **Pushes** run the check (and update this repo's own private build), but never reach players.
- **To release:** bump `version` in `pushplay.json`, add a Changelog line to `DESIGN.md`, push, then **Actions → Release to PushPlay → Run workflow**. It builds and checks the game and, only if that passes, publishes it to `Visual-Zone-Development/neon-swarm`'s `pushplay-latest` release. Or from a terminal: `gh workflow run release.yml`.
- It needs the `RELEASE_TOKEN` secret (a fine-grained token with *Contents: read and write* on `Visual-Zone-Development/neon-swarm`). Never commit code or files to the release repo by hand: it only holds a README and the release.

Plays with a controller, keyboard, mouse or touch. Agents: rules are in [`AGENTS.md`](AGENTS.md); the design brief is [`DESIGN.md`](DESIGN.md).
