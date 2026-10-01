// Link parsing, shared by the server (which validates and stores items) and the add form
// (which shows what a pasted link will become before it is sent).

// Kinds that play inside the video box and stay in sync on their own.
// "local" is a file on each person's own device (see public/share.js); it never has a link.
export const IN_BOX = ['youtube', 'vimeo', 'twitch', 'file', 'jellyfin', 'plex', 'local'];
// Services the Couchline browser extension can sync.
export const EXT_SERVICES = ['Netflix', 'Hulu'];

const str = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// "90", "90s", "1m30s", or "1h2m3s" to seconds.
export function parseTime(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return 0;
  let n = 0;
  if (/^\d+(\.\d+)?s?$/.test(s)) n = Number.parseFloat(s);
  else {
    const m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    if (m) n = (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0);
  }
  return Number.isFinite(n) ? Math.min(1e6, Math.max(0, n)) : 0;
}

const query = (obj) => Object.entries(obj).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
function param(url, names) {
  for (const [k, v] of url.searchParams) if (names.includes(k.toLowerCase())) return v;
  return null;
}

const TWITCH_RESERVED = new Set([
  'directory', 'videos', 'settings', 'search', 'subscriptions', 'inventory', 'wallet', 'downloads',
  'jobs', 'turbo', 'prime', 'store', 'friends', 'messages', 'login', 'signup', 'payments', 'drops',
  'following', 'moderator', 'popout', 'broadcast', 'team', 'p', 'u',
]);
const JELLYFIN_TOKEN_KEYS = ['api_key', 'apikey', 'x-emby-token', 'x-mediabrowser-token'];
const JELLYFIN_HOWTO = 'For Jellyfin, open the movie or episode, open its three dots menu, choose Copy Stream URL, and paste that link.';
const PLEX_HOWTO = 'For Plex, open the movie or episode, choose Get Info, then View XML, and paste the link of the page that opens.';
const VIDEO_EXT = /\.(mp4|m4v|webm|m3u8)$/i;

// Turns whatever someone pasted into one of:
//   a media descriptor ({ kind, ... }),
//   { error } when the link is recognized but can't be used as is,
//   or null when it isn't something Couchline knows.
export function parseMedia(raw) {
  const input = str(raw, 500);
  if (!input) return null;
  let url = null;
  if (!/\s/.test(input)) {
    try { url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`); } catch { url = null; }
  }
  if (url && !/^https?:$/.test(url.protocol)) url = null;
  const host = url ? url.hostname.toLowerCase().replace(/^(www\.|m\.)/, '') : '';
  const segs = url ? url.pathname.split('/').filter(Boolean) : [];

  if (url && (host === 'youtu.be' || host.endsWith('youtube.com'))) {
    let videoId = host === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v');
    if (!videoId) {
      const m = url.pathname.match(/^\/(shorts|live|embed)\/([\w-]{6,})/);
      if (m) videoId = m[2];
    }
    videoId = (videoId || '').split('/')[0];
    if (/^[\w-]{6,20}$/.test(videoId)) {
      return { kind: 'youtube', videoId, url: `https://www.youtube.com/watch?v=${videoId}`, start: parseTime(url.searchParams.get('t')) };
    }
    return null;
  }

  if (url && (host === 'vimeo.com' || host === 'player.vimeo.com')) {
    // vimeo.com/ID, vimeo.com/ID/HASH (unlisted), player.vimeo.com/video/ID?h=HASH,
    // vimeo.com/channels/NAME/ID, vimeo.com/showcase/ID/video/ID
    const after = segs.findIndex((s) => s === 'video' || s === 'videos');
    let i = after >= 0 && /^\d+$/.test(segs[after + 1] || '') ? after + 1 : segs.findIndex((s) => /^\d{5,12}$/.test(s));
    if (i < 0) return { error: 'That Vimeo link doesn’t point to one video.' };
    const videoId = segs[i];
    let hash = url.searchParams.get('h');
    if (!hash && /^[0-9a-f]{6,20}$/i.test(segs[i + 1] || '')) hash = segs[i + 1];
    hash = /^[0-9a-f]{6,20}$/i.test(hash || '') ? hash.toLowerCase() : null;
    const t = (url.hash.match(/t=([\d.hms]+)/i) || [])[1];
    return { kind: 'vimeo', videoId, hash, url: `https://vimeo.com/${videoId}${hash ? `/${hash}` : ''}`, start: parseTime(t) };
  }

  if (url && (host === 'twitch.tv' || host === 'player.twitch.tv' || host === 'clips.twitch.tv')) {
    if (host === 'clips.twitch.tv' || segs[1] === 'clip') {
      return { error: 'Twitch clips can’t be synced. Paste a Twitch video or channel link instead.' };
    }
    let videoId = null;
    let channel = null;
    if (host === 'player.twitch.tv') {
      videoId = (url.searchParams.get('video') || '').replace(/^v/, '') || null;
      channel = url.searchParams.get('channel');
    } else if (segs[0] === 'videos') {
      videoId = segs[1] || null;
    } else if (segs.length === 1 && !TWITCH_RESERVED.has(segs[0].toLowerCase())) {
      channel = segs[0];
    }
    if (videoId && /^\d{5,15}$/.test(videoId)) {
      return { kind: 'twitch', live: false, videoId, url: `https://www.twitch.tv/videos/${videoId}`, start: parseTime(url.searchParams.get('t')) };
    }
    if (channel && /^\w{3,25}$/.test(channel)) {
      channel = channel.toLowerCase();
      return { kind: 'twitch', live: true, channel, url: `https://www.twitch.tv/${channel}`, start: 0 };
    }
    return { error: 'That Twitch link isn’t a video or a channel.' };
  }

  if (url && host.endsWith('instagram.com')) {
    const m = url.pathname.match(/^\/(reels?|p|tv)\/([\w-]{5,})/);
    if (!m) return null;
    const igType = m[1] === 'p' ? 'p' : 'reel';
    return { kind: 'instagram', igType, code: m[2], url: `https://www.instagram.com/${igType}/${m[2]}/` };
  }
  if (url && (host.endsWith('netflix.com') || host.endsWith('hulu.com'))) {
    return { kind: 'stream', service: host.endsWith('netflix.com') ? 'Netflix' : 'Hulu', url: url.href };
  }

  // Plex: a server address on port 32400 or *.plex.direct, the plex.tv web app, or any link carrying a Plex token.
  const plexToken = url && param(url, ['x-plex-token']);
  if (url && (plexToken || host === 'app.plex.tv' || host.endsWith('.plex.direct') || url.port === '32400')) {
    const meta = url.pathname.match(/^(.*?)\/library\/metadata\/(\d+)\/?$/);
    const part = url.pathname.match(/^(.*?)\/library\/parts\/\d+\/\d+\/[^/]+$/);
    if (!plexToken || !(meta || part)) return { error: PLEX_HOWTO };
    const http = url.protocol === 'http:';
    if (part) return { kind: 'plex', url: url.href, src: url.href, format: 'file', tokenInLink: true, http };
    const src = `${url.origin}${meta[1]}/video/:/transcode/universal/start.m3u8?${query({
      path: `/library/metadata/${meta[2]}`, mediaIndex: 0, partIndex: 0, protocol: 'hls', fastSeek: 1,
      directPlay: 0, directStream: 1, videoQuality: 100, 'X-Plex-Product': 'Couchline', 'X-Plex-Platform': 'Chrome',
      'X-Plex-Token': plexToken,
    })}`;
    return { kind: 'plex', url: url.href, src, format: 'hls', tokenInLink: true, http };
  }

  // Jellyfin: a stream or download link (/Videos/ID/... or /Items/ID/...), or a web app details page.
  const jfPath = url && url.pathname.match(/^(.*?)\/(?:Videos|Items)\/([0-9a-f]{32}|[0-9a-f-]{36})(?:\/[^?]*)?$/i);
  const jfPage = url && /\/web\/?(index\.html)?$/i.test(url.pathname) && /details\?(.*&)?id=[0-9a-f]/i.test(url.hash);
  if (jfPath || jfPage) {
    const token = param(url, JELLYFIN_TOKEN_KEYS);
    if (jfPage || !token) return { error: JELLYFIN_HOWTO };
    const [, prefix, itemId] = jfPath;
    // HLS lets Jellyfin convert files browsers can't play (MKV, HEVC, surround audio).
    const src = `${url.origin}${prefix}/Videos/${itemId}/master.m3u8?${query({
      MediaSourceId: itemId.replace(/-/g, ''), api_key: token, VideoCodec: 'h264', AudioCodec: 'aac,mp3',
      TranscodingMaxAudioChannels: 2, SegmentContainer: 'ts', BreakOnNonKeyFrames: 'True',
    })}`;
    return { kind: 'jellyfin', itemId, url: url.href, src, format: 'hls', tokenInLink: true, http: url.protocol === 'http:' };
  }

  const ext = url && (url.pathname.match(VIDEO_EXT) || [])[1];
  if (ext) {
    let name = segs.at(-1) || '';
    try { name = decodeURIComponent(name); } catch { /* keep as is */ }
    return {
      kind: 'file', url: url.href, format: ext.toLowerCase() === 'm3u8' ? 'hls' : ext.toLowerCase(),
      title: str(name.replace(VIDEO_EXT, '').replace(/[._]+/g, ' '), 140) || null, http: url.protocol === 'http:',
    };
  }

  if (url && input.includes('.')) return null; // some other website we can't sync
  return { kind: 'stream', title: input.slice(0, 120) }; // typed a show or movie name
}

// Warnings to show before or after sharing a link. "secure" is true when the page is on https.
export function mediaWarnings(m, { secure = false } = {}) {
  const out = [];
  if (m?.tokenInLink && m.kind === 'jellyfin') {
    out.push('This link contains your Jellyfin sign-in token. Anyone in this room can copy it and use your Jellyfin account until you sign out of that session. Safer: make a separate Jellyfin user that can only see this library, sign in as that user, and copy the link from there.');
  }
  if (m?.tokenInLink && m.kind === 'plex') {
    out.push('This link contains your Plex token, which works like your Plex password: anyone in this room could use it to reach your account and every server on it. Safer: switch to a Plex managed user that can only see this library before copying the link, and remove that user later.');
  }
  if (secure && m?.http && IN_BOX.includes(m.kind)) {
    out.push('This link starts with http, so browsers block it on an https site. Use your server’s https address.');
  }
  return out;
}
