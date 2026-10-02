// Pop out the call: everyone's faces in a small floating window that stays on top while you
// switch to another app (Netflix, Hulu, Instagram) on your phone or computer.
// One other person: their video itself floats. More: their faces are drawn together into one
// picture, each with their color and name. Where the browser supports it, the floating window
// has mute, camera, and hang up buttons, and the call pops out by itself when you switch away.
import { colorOf } from './ui.js';

const supportsPip = () => (document.pictureInPictureEnabled && 'requestPictureInPicture' in HTMLVideoElement.prototype)
  || ('webkitSupportsPresentationMode' in HTMLVideoElement.prototype);

function enterPip(video) {
  if (video.requestPictureInPicture && document.pictureInPictureEnabled) return video.requestPictureInPicture();
  if (video.webkitSupportsPresentationMode?.('picture-in-picture')) {
    video.webkitSetPresentationMode('picture-in-picture');
    return Promise.resolve();
  }
  return Promise.reject(new Error('Picture in picture is not available'));
}
function exitPip() {
  if (document.pictureInPictureElement) return document.exitPictureInPicture().catch(() => {});
  for (const v of document.querySelectorAll('video')) if (v.webkitPresentationMode === 'picture-in-picture') v.webkitSetPresentationMode('inline');
  return Promise.resolve();
}

export function initPopout({ call, getRoom, onChange }) {
  let canvas = null;
  let ctx = null;
  let pipVideo = null;
  let timer = null;
  let active = false;

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  // Everyone else in the call, in tile order, with their room details.
  const faces = () => [...call.tiles.entries()]
    .filter(([id]) => id !== call.selfId)
    .map(([id, t]) => ({ id, t, m: getRoom()?.members.find((x) => x.id === id) }));

  function layout(n) {
    if (n <= 2) return { cols: n, rows: 1, w: 640 * n, h: 480 };
    if (n <= 4) return { cols: 2, rows: 2, w: 1280, h: 960 };
    return { cols: 3, rows: Math.ceil(n / 3), w: 1440, h: 480 * Math.ceil(n / 3) };
  }

  // Draws the faces into one picture, like the call tiles: video cropped to fill, a border
  // in each person's color, and their name. People on audio show as their name.
  function draw() {
    const list = faces();
    if (!list.length) return;
    const { cols, rows, w, h } = layout(list.length);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const cw = w / cols;
    const ch = h / rows;
    ctx.fillStyle = css('--screen') || '#131A31';
    ctx.fillRect(0, 0, w, h);
    list.forEach(({ t, m }, i) => {
      const x = (i % cols) * cw;
      const y = Math.floor(i / cols) * ch;
      const v = t.video;
      const audioOnly = t.el.classList.contains('audio-only') || t.el.classList.contains('cam-off') || !v.videoWidth;
      if (!audioOnly) {
        const scale = Math.max(cw / v.videoWidth, ch / v.videoHeight);
        const sw = cw / scale;
        const sh = ch / scale;
        ctx.drawImage(v, (v.videoWidth - sw) / 2, (v.videoHeight - sh) / 2, sw, sh, x, y, cw, ch);
      }
      const color = m?.color ? css(`--${m.color}`) : css('--line');
      ctx.lineWidth = 8;
      ctx.strokeStyle = color || '#3C4878';
      ctx.strokeRect(x + 4, y + 4, cw - 8, ch - 8);
      const name = m?.name || '';
      ctx.font = `700 ${audioOnly ? 44 : 30}px "Bricolage Grotesque", system-ui, sans-serif`;
      if (audioOnly) {
        ctx.fillStyle = color || '#EEF0F7';
        ctx.textAlign = 'center';
        ctx.fillText(name, x + cw / 2, y + ch / 2 + 14);
        ctx.textAlign = 'left';
      } else if (name) {
        const tw = ctx.measureText(name).width;
        ctx.fillStyle = 'rgba(19, 26, 49, 0.75)';
        ctx.beginPath();
        ctx.roundRect?.(x + 16, y + ch - 62, tw + 32, 46, 23);
        if (!ctx.roundRect) ctx.rect(x + 16, y + ch - 62, tw + 32, 46);
        ctx.fill();
        ctx.fillStyle = '#EEF0F7';
        ctx.fillText(name, x + 32, y + ch - 28);
      }
    });
  }

  async function popOut() {
    const list = faces();
    if (!list.length) return false;
    // One other person on camera: float their own video, no drawing needed.
    const single = list.length === 1 && list[0].t.video.videoWidth && !list[0].t.el.classList.contains('audio-only');
    try {
      if (single) {
        await enterPip(list[0].t.video);
      } else {
        canvas ||= document.createElement('canvas');
        ctx ||= canvas.getContext('2d');
        draw();
        if (!pipVideo) {
          pipVideo = document.createElement('video');
          pipVideo.muted = true;
          pipVideo.playsInline = true;
          pipVideo.setAttribute('playsinline', '');
          pipVideo.className = 'pip-source';
          document.body.append(pipVideo);
          pipVideo.addEventListener('leavepictureinpicture', stopped);
        }
        pipVideo.srcObject = canvas.captureStream(15);
        await pipVideo.play();
        clearInterval(timer);
        // A timer, not animation frames: those stop while you're in another app.
        timer = setInterval(draw, 1000 / 15);
        await enterPip(pipVideo);
      }
      active = true;
      for (const { t } of list) t.video.addEventListener('leavepictureinpicture', stopped, { once: true });
      onChange?.();
      return true;
    } catch (err) {
      console.warn('pop out failed', err);
      stopped();
      return false;
    }
  }

  function stopped() {
    clearInterval(timer);
    timer = null;
    active = false;
    onChange?.();
  }

  async function close() {
    await exitPip();
    stopped();
  }

  // Floating-window buttons and popping out when you switch away, where the browser has them.
  const ms = navigator.mediaSession;
  const handle = (action, fn) => { try { ms?.setActionHandler(action, fn); } catch { /* not supported */ } };
  handle('togglemicrophone', () => { call.toggleMic(); syncSession(); onChange?.(); });
  handle('togglecamera', () => { call.toggleCam(); syncSession(); onChange?.(); });
  handle('hangup', () => { close(); call.leave(); onChange?.(); });
  handle('enterpictureinpicture', () => { if (call.active) popOut(); });
  function syncSession() {
    try {
      const mic = call.stream?.getAudioTracks()[0];
      const cam = call.stream?.getVideoTracks()[0];
      ms?.setMicrophoneActive?.(!!mic?.enabled);
      ms?.setCameraActive?.(!!(call.camOn && cam?.enabled));
    } catch { /* not supported */ }
  }

  return {
    supported: supportsPip(),
    get active() { return active; },
    available: () => supportsPip() && call.active && faces().length > 0,
    toggle: () => (active ? close() : popOut()),
    syncSession,
  };
}
