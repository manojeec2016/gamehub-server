# Game Hub invite links

Static pages for the Game Hub app, served free by GitHub Pages (no server, no card).

- `join.html?g=<game>&c=<CODE>` (for example `join.html?g=ludo&c=ABC123`) shows the room code and an
  "Open in Game Hub" button. The button opens the app (link `gamehub://join/<game>/<CODE>`) straight into the room.
  If the app is not installed, the page says so.
- Games: `ludo`, `snakes`, `ttt`, `bingo`.

Rooms themselves are kept in Firebase Realtime Database (project `gamehub-4f2ed`), not here.
The old Render room server was removed: Render needs a card even on its free plan.
