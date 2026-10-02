# Couchline for Netflix and Hulu

A Chrome and Edge extension (Manifest V3) that syncs Netflix and Hulu on computers with a Couchline room, with the room's video call and reactions in a sidebar beside the show.

## Install (unpacked)

1. In the repo, run `npm install` and `npm run build:ext` (the copies are already committed, so this only matters after changing the web app's shared files).
2. Chrome: open `chrome://extensions`. Edge: open `edge://extensions`.
3. Turn on Developer mode, choose Load unpacked, and pick this `extension` folder.

Chrome and Edge 111 or newer.

## Use it

1. In Couchline, add a Netflix or Hulu link to Up next. Its Open button adds the room to the link (`#couchline=ROOM&server=...`), so the sidebar opens with the room filled in. You still press Join.
2. Or open any Netflix or Hulu video and click the Couchline tab on the right edge of the page (or the toolbar button). Enter the Couchline address, the room code (or paste the whole room link), and your name.
3. When every viewer in the room is on the extension, on the same service as the room's current item, the sidebar says "Synced". Use Netflix's or Hulu's own controls: play, pause, and seek reach everyone. Nobody is moved until someone presses play, so press play from the spot you want everyone to start at, or use "Bring everyone to my spot". Start together counts everyone in, starting from the starter's spot if nobody has pressed play yet.
4. If someone joins without the extension (for example from a phone), the room goes back to the shared countdown until they leave or set their tab as a remote.

## How it works

- `content/bridge.js` runs on netflix.com and hulu.com in the extension's isolated world. It finds the video, applies the room's play, pause, and seek, nudges speed to stay within about half a second (the same rules as the web app, from `lib/sync.js`), and reports what you do with the site's own controls. It hosts the sidebar in a frame inside a closed shadow root.
- `content/netflix-page.js` runs in Netflix's own page world, where Netflix's player API lives. Netflix stops playback with error M7375 if anything sets `video.currentTime`, so every Netflix seek goes through that API instead. Hulu is driven through its video element.
- `sidebar/` is an extension page. It joins the room on the Couchline server as its own seat (tagged "extension" in the web app's roster), runs the call with the web app's `call.js`, and sends reactions, which float over the video.
- `lib/` holds copies of `public/call.js`, `public/sync.js`, `public/styles.css`, and the Socket.IO client, made by `scripts/build-extension.js`, because Manifest V3 doesn't allow loading code from elsewhere.

## Everywhere else

- **Couchline button** on YouTube, Vimeo, Twitch, TikTok, and Instagram: Play now or Add to Up next, for whatever you're looking at. It goes to the room you last joined (or the one set in the toolbar popup).
- **Right-click menu:** "Add to Couchline" and "Play now on Couchline" on any link or page. A check mark (or "!") on the toolbar button says how it went.
- **Instagram and TikTok, Share my scrolling:** as you move through reels or videos, everyone in the room sees the same one in Couchline. On TikTok, open a video so the address bar shows it (the For You feed doesn't change the address). Stop sharing from the same button; it also stops if you close the tab, and after 30 minutes without moving.
- **Sidebar chat** on Netflix and Hulu, with messages floating over the video while the sidebar is closed, and **Watch this together** to put the title you're on in front of everyone.

These use the Couchline server's HTTP API (`/api/drop`, `/api/follow`). The room code is the only key, the same as joining by link.

## Known limits

- Netflix's player API is undocumented. If Netflix changes it, play and pause fall back to the video element and seeking stops (never risking the M7375 crash), and the extension needs an update.
- Hulu plays ads in a separate video. During an ad, the room isn't controlled; afterwards the sync loop catches up.
- When Netflix or Hulu rolls on to the next episode (or someone opens another title) while synced, the room moves on too: to the next item in Up next, or, if Up next is empty, to the new episode, still playing in sync. An episode put on from the Shows tab moves that show on one episode.
- Fullscreen: the sidebar moves into the fullscreen element so it stays visible. On browsers without `moveBefore` (Chrome before 133), that reloads the sidebar, which rejoins by itself; the call reconnects.
- The Couchline address must be https, or `http://localhost` while developing.
