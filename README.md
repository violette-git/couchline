# Couchline

Watch together from two places, on computers and phones (and a TV browser if you have one).

| Source | How it works |
| --- | --- |
| YouTube | Fully synced. Play, pause, and seeking are shared, and the app keeps both screens within about half a second. |
| Vimeo | Fully synced, inside the video box. Speed nudges and hidden controls only work on videos whose owner pays for Vimeo; other videos catch up by seeking. |
| Twitch | Past broadcasts (twitch.tv/videos/...) are fully synced. Live channels share play and pause; seeking is off because live has no shared timeline. Clips aren't supported. Twitch's own buttons stay usable, and pressing them moves the whole room. |
| Video links | Direct .mp4, .webm, and .m3u8 (HLS) links play in the video box, fully synced. |
| Jellyfin and Plex | Stream links play in the video box, fully synced. See "Jellyfin and Plex links" below before sharing one. |
| Video files on your device | Pick a file and it plays from your device, fully synced. Nothing is uploaded. Everyone else picks their own copy, or gets it straight from someone who has it, browser to browser. Downloaded copies are kept in the browser (the last 3) so a reload doesn't download again. |
| Instagram reels | Shown in the room. A shared countdown tells you both when to tap play. |
| Netflix and Hulu | On computers with the Couchline extension (in `extension/`), play, pause, and seek are synced automatically, and when the episode rolls on, the room rolls on too. Without it, each of you watches on your own account and a shared countdown tells you when to press play. The Shows tab keeps your place in a series. |

## Adding things without copying links

- **Paste button:** copies are one tap. Coming back to Couchline with a link copied, it offers "Add the link you copied?" (where the browser already allows reading the clipboard).
- **Links in chat:** paste a link in the chat and everyone gets Add to Up next and Play now on it.
- **Phones:** on Android, add Couchline to the home screen, then Share from Instagram, YouTube, or any app and pick Couchline. On iPhone, make a Shortcut that receives URLs from the Share Sheet and opens `https://your-couchline/share?url=` followed by the Shortcut Input (the room menu has the address and these steps). Shares go to the last room you were in.
- **Computers:** the extension puts a Couchline button on YouTube, Vimeo, Twitch, and Instagram (Play now, or Add to Up next), adds "Add to Couchline" and "Play now on Couchline" to the right-click menu on any link, and adds the current page from the toolbar popup.
- **Shows:** type a show name and pick it from the search (with its poster), then pick the episode from the list. Show search by TVmaze.
- **YouTube search:** type words instead of a link to search YouTube, once the server has a `YOUTUBE_API_KEY` (below).
- **QR code:** the room menu shows one, for joining from a phone or TV browser.

### Turn on YouTube search

1. Go to https://console.cloud.google.com, make a project, and enable "YouTube Data API v3".
2. Under Credentials, create an API key. Restrict it to the YouTube Data API v3.
3. `heroku config:set YOUTUBE_API_KEY=your-key`

The free quota allows about 100 searches a day; results are cached for 10 minutes.

## Together

- **Chat:** a Chat tab with a box right under the video, typing indicators, and an unread count. Messages float over the video when the chat isn't open, and in full screen. A message sent mid-video has an "at 12:03" link that takes everyone back there.
- **Point:** press and hold on the video to ping that spot on everyone's screen, in your color.
- **Moments:** the star button marks a moment on everyone's timeline. Tap a mark to go there; right click to remove it.
- **Ready check:** everyone taps I'm ready, and when the last person does, the countdown starts by itself.
- **Rate it together:** when something you watched ends, you each rate it; the scores reveal at the same time and go into the Watched tab.
- **Played:** everything that was on stays at the bottom of Up next, newest first, with Play again and Add back. Files from your device too.
- **Jinx:** send the same reaction at the same moment and it bursts.
- **Stepped away:** the roster shows who has switched away from Couchline. Turn on "Pause when someone steps away" in the room menu to pause after 8 seconds.
- **Instagram follow:** on a computer with the extension, tap Share my scrolling on Instagram, and as you move from reel to reel, the room sees the same one in Couchline (on any device). Phones can't run extensions, so from a phone, share reels one at a time with the share sheet.
- **Your camera:** your own picture is mirrored like a mirror (only on your screen). Turn it off under Camera and mic.

Up next has three ways to add something (paste a link, pick a file, type a show), and every source is listed under the link box with how to get its link.

The room code is in the top bar: tap it to copy the code or link, join another room, or leave. The empty room shows the code big, and the home page has a box to type one (or paste a whole room link).

Also included: a built-in video call (with the call below the video, half and half, or floating over it, a full screen view that keeps faces on screen, tap a face to enlarge it, and a choice of camera, microphone, and speaker, switchable mid-call), reactions, a shared "Up next" list, auto-pause when someone drops off, a pause while either person is buffering, phone-sleep prevention during playback, and a remote mode (use a phone as the remote while a TV browser plays the video).

## Run it on your computer

```
npm install
npm start
```

Open http://localhost:3000. To test with a phone on the same Wi-Fi, use your computer's local IP. Note that phones only allow the camera and mic on **https**, so the call needs a real deploy (below) or a tunnel such as `npx localtunnel --port 3000`.

`npm test` checks link parsing, house rules (including no em dashes), the extension's packaged files, and runs fake viewers against the server for the web app, the new sources, and the extension.

## Deploy to Heroku

```
heroku create couchline-yourname
git init && git add . && git commit -m "Couchline"
git push heroku main
heroku config:set TWITCH_PARENT=couchline-yourname.herokuapp.com
```

The `Procfile` is included. Any Node host works (Render, Railway, Fly). One server instance is expected; see "Limits".

## Twitch setup

Twitch only plays inside sites it's told about, through a "parent" setting that must match the address bar's domain. Set `TWITCH_PARENT` to the domain people open Couchline on, with no `https://` and no port. List several with commas (for example `couch.example.com,localhost`). It defaults to `localhost`. If it's wrong, the video box says so instead of showing a blank player.

## Jellyfin and Plex links

Couchline plays these through the browser, so the link needs a sign-in token in it:

- **Jellyfin:** open the movie or episode, open its three dots menu, choose Copy Stream URL, and paste that.
- **Plex:** open the movie or episode, choose Get Info, then View XML, and paste the link of the page that opens.

**A token in a shared link gives everyone in the room your access.** Anyone in the room can copy it out of the page and use your account until the token is revoked. A Plex token is especially broad: it works like your Plex password for every server on your account. Couchline shows this warning when you paste the link and again after you add it, and every viewer's browser keeps the link in its saved copy of the room.

Safer options:

- **Jellyfin:** make a separate user that can only see the library you want to share, sign in as that user, and copy the link from there. Sign that session out afterward (Dashboard, then Devices) to revoke the token.
- **Plex:** switch to a Plex managed user that can only see that library before copying the link, and remove that user later. Better still, share the library with the other person in Plex so they use their own account.

Also: browsers block http links on an https site, so a Jellyfin or Plex server reached at `http://192.168...` won't play on a deployed Couchline. Use the server's https address (Plex gives every server one on `plex.direct`).

## The Netflix and Hulu extension

Chrome and Edge on computers, Manifest V3. See [extension/README.md](extension/README.md) to install it. In short:

1. Load `extension/` as an unpacked extension.
2. Put a Netflix or Hulu link in the room's Up next. Its Open button carries the room code, so the extension's sidebar opens ready to join.
3. Everyone watching joins from the sidebar. When every viewer is on the extension, the room says so and play, pause, and seek are shared. A Couchline tab you keep open just for the queue counts as a viewer unless you tap "Use this tab as a remote".

After editing `public/call.js`, `public/sync.js`, or `public/styles.css`, run `npm run build:ext` to refresh the copies the extension ships with (`npm test` fails if you forget).

## Make the call reliable (TURN)

Calls connect directly when they can. On cell data or strict Wi-Fi, a relay server (TURN) is often required, especially iPhone on cellular calling Android. Get credentials from a TURN provider (Metered, Cloudflare Calls, or Twilio, several have free tiers) and set:

```
heroku config:set TURN_URLS=turn:host:3478,turns:host:5349 TURN_USERNAME=... TURN_CREDENTIAL=...
```

## Tips for the two of you

- Wear headphones. Without them, the call mic picks up the show.
- iPhone: the first video in a room may ask you to tap the video once. After that it syncs on its own.
- Add to home screen (Share, then Add to Home Screen on iPhone; menu, then Install on Android) so it opens like an app.
- Netflix and Hulu without the extension: open the episode on your own device, pause at the start, then tap Start together.

## Limits (on purpose, for now)

- Netflix and Hulu sync needs the extension on a computer. Phones and TVs get the countdown.
- Rooms live in server memory. If the server restarts, the next person to rejoin restores the queue and shows from their browser's saved copy. Playback position is not restored.
- Anyone with the room link can join. Room codes are hard to guess, but there's no password yet.
- YouTube and Twitch ads play separately for each person. The app catches the ad-watcher back up afterward.
- One server instance only. Running several would need Redis for shared room state.

## Credits

The player interface, YouTube wrapper, catch-up rule, and call connection pattern are adapted from [WatchParty](https://github.com/howardchung/watchparty) by Howard Chung (MIT). HLS playback uses [hls.js](https://github.com/video-dev/hls.js) (Apache 2.0). See NOTICE.md.
