# Game Hub invite links

Static pages for the Game Hub app, served free by GitHub Pages (no server, no card).

- `join.html?g=<game>&c=<CODE>` (for example `join.html?g=ludo&c=ABC123`) shows the room code and an
  "Open in Game Hub" button. The button opens the app (link `gamehub://join/<game>/<CODE>`) straight into the room.
  If the app is not installed, the page says so.
- Games: `ludo`, `snakes`, `ttt`, `bingo`, `four`, `dots`.
- `version.json`: `build` is the newest app build. When it is higher than the build inside the app, the app shows
  "New version available", which opens `url` (the Play Store page once the app is published there).

Rooms themselves are kept in Firebase Realtime Database (project `gamehub-4f2ed`), not here.
The old Render room server was removed: Render needs a card even on its free plan.
