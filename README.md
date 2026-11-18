# Game Hub room server

Always-on room server for the Game Hub app (v3). Runs on Render's free plan.

- Build command: `npm install`
- Start command: `npm start`
- Health check: open `/health` in a browser; it says "Game Hub room server is running".
- Invite links: `/j/<game>/<CODE>` (for example `/j/ludo/ABC123`) shows a page with an "Open in Game Hub" button.

What it does: phones connect over a WebSocket at `/ws`. The server relays room messages, remembers the latest
game state, and picks one connected phone as the room leader (it runs the rules and the turn timer). If the leader
goes quiet for 12 seconds, another player's phone takes over, so the game keeps going when the host leaves.
