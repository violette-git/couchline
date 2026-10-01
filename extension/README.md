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

## Known limits

- Netflix's player API is undocumented. If Netflix changes it, play and pause fall back to the video element and seeking stops (never risking the M7375 crash), and the extension needs an update.
- Hulu plays ads in a separate video. During an ad, the room isn't controlled; afterwards the sync loop catches up.
- Netflix plays the next episode on its own. The room's Up next doesn't follow that; use Skip in Couchline.
- Fullscreen: the sidebar moves into the fullscreen element so it stays visible. On browsers without `moveBefore` (Chrome before 133), that reloads the sidebar, which rejoins by itself; the call reconnects.
- The Couchline address must be https, or `http://localhost` while developing.
