Couchline includes code adapted from WatchParty (https://github.com/howardchung/watchparty):
- public/players/player.js: the shared player interface every source implements (from src/components/App/Player.ts)
- public/players/youtube.js: YouTube player wrapper (from src/components/App/YouTube.ts)
- public/sync.js: playback-rate catch-up rule (from src/components/App/App.tsx)
- public/call.js: WebRTC call connection pattern (from src/components/VideoChat/VideoChat.tsx)
- server.js: signaling relay keyed by client id (from server/room.ts)
- extension/lib/sync.js and extension/lib/call.js: unchanged copies of public/sync.js and public/call.js, packaged into the browser extension

WatchParty license:

MIT License

Copyright (c) 2020 Howard Chung

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Third-party libraries served or packaged by Couchline keep their own licenses:
- hls.js (Apache License 2.0), served from node_modules at /vendor/hls/
- Socket.IO client (MIT), packaged as extension/lib/socket.io.min.js
- qrcode-generator by Kazuhiko Arase (MIT), served from node_modules at /vendor/qrcode/

Show search uses the TVmaze API (https://www.tvmaze.com/api). TVmaze data is licensed
CC BY-SA 4.0; Couchline credits TVmaze next to the show search.
