# Neon Swarm

A twin-stick neon roguelite in the style of Geometry Wars. Pick one of seven very different ships, draft upgrades and mods that combine into powerful synergies, and blast through three sectors and their bosses, or survive Endless in one huge arena. Relaxed difficulty and auto-fire make it easy to pick up.

## Play

- **PushPlay (Steam Deck, Legion Go, PC):** find it in the launcher's **Discover** tab, or **Add game → GitHub → watch this repo**. Every push to `main` builds the game and publishes it to this repo's `pushplay-latest` release.
- **Browser:** serve this folder with any static web server (ES modules don't load from `file://`), e.g. `npx vite` or `python3 -m http.server`, and open `index.html`. Add `?debug` for the test hooks.

Plays with a controller, keyboard, mouse or touch (tablets included), or with a phone as the controller: **Connect a phone** on the title or pause menu shows a QR code, and the phone's browser becomes a twin-stick pad (no app). The design brief is [`DESIGN.md`](DESIGN.md).

## Test

`node --test tests/*.test.mjs` runs the tests in Playwright's Chromium: `touch.test.mjs` (touch-only play on a tablet), `screens.test.mjs` (every screen shape) and `phone.test.mjs` (a phone as the controller: the connect screen, twin sticks in play and the menu pad elsewhere, moving, aiming and bombing, and opening a banked upgrade from the pause menu) (Playwright isn't a dependency of the game; it must be installed where Node can `require` it).

## Rights

© Visual Zone Development. All rights reserved. The source is public so PushPlay can build and verify the game; that doesn't make it open source, and it may not be copied, modified or redistributed without permission. Third-party assets (fonts and similar) keep their own licences, listed in the game's credits files.
