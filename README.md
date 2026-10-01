# Couchline

Watch together from two places, on computers and phones (and a TV browser if you have one).

| Source | How it works |
| --- | --- |
| YouTube | Fully synced. Play, pause, and seeking are shared, and the app keeps both screens within about half a second. |
| Instagram reels | Shown in the room. A shared countdown tells you both when to tap play. |
| Netflix and Hulu | Each of you watches on your own account and screen. A shared countdown tells you both when to press play, and the Shows tab keeps your place in a series. |

Also included: a built-in video call, reactions, a shared "Up next" list, auto-pause when someone drops off, a pause while either person is buffering, phone-sleep prevention during playback, and a remote mode (use a phone as the remote while a TV browser plays the video).

## Run it on your computer

```
npm install
npm start
```

Open http://localhost:3000. To test with a phone on the same Wi-Fi, use your computer's local IP. Note that phones only allow the camera and mic on **https**, so the call needs a real deploy (below) or a tunnel such as `npx localtunnel --port 3000`.

`npm test` runs a two-viewer check of the server.

## Deploy to Heroku

```
heroku create couchline-yourname
git init && git add . && git commit -m "Couchline"
git push heroku main
```

The `Procfile` is included. Any Node host works (Render, Railway, Fly). One server instance is expected; see "Limits".

## Make the call reliable (TURN)

Calls connect directly when they can. On cell data or strict Wi-Fi, a relay server (TURN) is often required, especially iPhone on cellular calling Android. Get credentials from a TURN provider (Metered, Cloudflare Calls, or Twilio, several have free tiers) and set:

```
heroku config:set TURN_URLS=turn:host:3478,turns:host:5349 TURN_USERNAME=... TURN_CREDENTIAL=...
```

## Tips for the two of you

- Wear headphones. Without them, the call mic picks up the show.
- iPhone: the first YouTube video in a room may ask you to tap the video once. After that it syncs on its own.
- Add to home screen (Share, then Add to Home Screen on iPhone; menu, then Install on Android) so it opens like an app.
- Netflix and Hulu: open the episode on your own device, pause at the start, then tap Start together.

## Limits (on purpose, for now)

- Netflix and Hulu can't be controlled by any website, so their sync is a countdown, not automatic. A desktop browser extension could automate this later.
- Rooms live in server memory. If the server restarts, the next person to rejoin restores the queue and shows from their browser's saved copy. Playback position is not restored.
- Anyone with the room link can join. Room codes are hard to guess, but there's no password yet.
- YouTube ads play separately for each person. The app catches the ad-watcher back up afterward. YouTube Premium avoids this.
- One server instance only. Running several would need Redis for shared room state.

## Credits

The YouTube wrapper, catch-up rule, and call connection pattern are adapted from [WatchParty](https://github.com/howardchung/watchparty) by Howard Chung (MIT). See NOTICE.md.
