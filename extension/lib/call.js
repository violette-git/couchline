// Copied from public/call.js by scripts/build-extension.js. Edit the original, then run npm run build:ext.
// Video and voice call over WebRTC.
// Connection pattern adapted from WatchParty's src/components/VideoChat/VideoChat.tsx
// (MIT, Copyright (c) 2020 Howard Chung): one peer connection per member, the smaller
// client id makes the offer, a failed connection is torn down and rebuilt, and a blank
// video track keeps a video channel open for someone joining without a camera.

// The camera, microphone, and speaker someone chose, remembered on this device.
const PREFS_KEY = 'callDevices';
const prefs = {
  get() { try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; } },
  set(patch) { try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...prefs.get(), ...patch })); } catch { /* private mode */ } },
};
const AUDIO = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
const VIDEO = { width: { ideal: 640 }, height: { ideal: 480 } };
const pick = (id) => (id ? { deviceId: { exact: id } } : {});

function blankVideoTrack() {
  try {
    const canvas = Object.assign(document.createElement('canvas'), { width: 320, height: 240 });
    canvas.getContext('2d').fillRect(0, 0, 320, 240);
    const track = canvas.captureStream(1).getVideoTracks()[0];
    track.enabled = false;
    return track;
  } catch {
    return null;
  }
}

export class Call {
  constructor({ socket, selfId, tilesEl }) {
    this.socket = socket;
    this.selfId = selfId;
    this.tilesEl = tilesEl;
    this.pcs = new Map();
    this.pendingIce = new Map();
    this.tiles = new Map();
    this.members = [];
    this.iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
    this.stream = null;
    this.active = false;
    this.camOn = false;
  }

  async start() {
    const { camera, mic } = prefs.get();
    const audio = { ...AUDIO, ...pick(mic) };
    const tries = [
      { audio, video: camera ? { ...VIDEO, ...pick(camera) } : { ...VIDEO, facingMode: 'user' } },
      // The remembered devices may be unplugged, so fall back to the defaults.
      { audio: AUDIO, video: { ...VIDEO, facingMode: 'user' } },
      { audio: AUDIO, video: false },
    ];
    this.stream = null;
    for (const constraints of tries) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch { /* try the next, simpler request */ }
    }
    if (!this.stream) return false;
    this.camOn = this.stream.getVideoTracks().length > 0;
    if (!this.camOn) {
      const blank = blankVideoTrack();
      if (blank) this.stream.addTrack(blank);
    }
    this.active = true;
    const self = this.tile(this.selfId);
    self.video.muted = true;
    self.video.srcObject = this.stream;
    this.applyMirror();
    this.socket.emit('call:state', { inCall: true });
    this.sync(this.members);
    return true;
  }

  leave() {
    this.active = false;
    for (const id of [...this.pcs.keys()]) this.drop(id);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    for (const id of [...this.tiles.keys()]) this.removeTile(id);
    this.socket.emit('call:state', { inCall: false });
  }

  // Cameras, microphones, and speakers on this device. Names only show once the
  // browser has allowed the camera or mic.
  async listDevices() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const of = (kind) => all.filter((d) => d.kind === kind && d.deviceId);
      return {
        cameras: of('videoinput'), mics: of('audioinput'),
        speakers: 'setSinkId' in HTMLMediaElement.prototype ? of('audiooutput') : [],
        chosen: { ...prefs.get(), camera: this.trackDevice('video') || prefs.get().camera, mic: this.trackDevice('audio') || prefs.get().mic },
      };
    } catch {
      return { cameras: [], mics: [], speakers: [], chosen: prefs.get() };
    }
  }

  trackDevice(kind) {
    const t = kind === 'video' ? this.stream?.getVideoTracks()[0] : this.stream?.getAudioTracks()[0];
    return t?.getSettings?.().deviceId || null;
  }

  // Switches camera, mic, or speaker in the middle of a call without reconnecting:
  // the new track replaces the old one on every connection.
  async useDevice(kind, deviceId) {
    if (kind === 'speaker') {
      prefs.set({ speaker: deviceId });
      for (const [id, t] of this.tiles) if (id !== this.selfId) t.video.setSinkId?.(deviceId).catch(() => {});
      return true;
    }
    prefs.set(kind === 'camera' ? { camera: deviceId } : { mic: deviceId });
    if (!this.active || !this.stream) return true; // used when the call starts
    const video = kind === 'camera';
    let fresh;
    try {
      fresh = await navigator.mediaDevices.getUserMedia(video ? { video: { ...VIDEO, ...pick(deviceId) } } : { audio: { ...AUDIO, ...pick(deviceId) } });
    } catch {
      return false;
    }
    const track = video ? fresh.getVideoTracks()[0] : fresh.getAudioTracks()[0];
    const old = video ? this.stream.getVideoTracks()[0] : this.stream.getAudioTracks()[0];
    // Keep mute and camera-off as they were. A blank stand-in track means the camera was off for lack of one.
    track.enabled = old ? old.enabled || (video && !this.camOn) : true;
    for (const pc of this.pcs.values()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === track.kind);
      if (sender) await sender.replaceTrack(track).catch(() => {});
    }
    if (old) { this.stream.removeTrack(old); old.stop(); }
    this.stream.addTrack(track);
    if (video) {
      this.camOn = true;
      const self = this.tile(this.selfId);
      self.el.classList.toggle('cam-off', !track.enabled);
      self.video.srcObject = this.stream;
      this.applyMirror();
    }
    return true;
  }

  // Your own picture shows mirrored, like a mirror, so moving right moves right. Only on your
  // screen: everyone else sees you the right way round. Rear cameras aren't mirrored.
  get mirror() { return prefs.get().mirror !== false; }
  setMirror(on) {
    prefs.set({ mirror: !!on });
    this.applyMirror();
  }
  applyMirror() {
    const t = this.tiles.get(this.selfId);
    if (!t) return;
    const facing = this.stream?.getVideoTracks()[0]?.getSettings?.().facingMode;
    t.el.classList.toggle('mirror', this.mirror && facing !== 'environment');
  }

  toggleMic() {
    const t = this.stream?.getAudioTracks()[0];
    if (!t) return false;
    t.enabled = !t.enabled;
    return t.enabled;
  }

  toggleCam() {
    const t = this.stream?.getVideoTracks()[0];
    if (!t || !this.camOn) return false;
    t.enabled = !t.enabled;
    this.tile(this.selfId).el.classList.toggle('cam-off', !t.enabled);
    return t.enabled;
  }

  // Called with every room state update.
  sync(members) {
    this.members = members;
    const others = members.filter((m) => m.id !== this.selfId && m.inCall);
    for (const id of [...this.pcs.keys()]) {
      if (!this.active || !others.some((m) => m.id === id)) this.drop(id);
    }
    if (!this.active) return;
    for (const m of others) if (!this.pcs.has(m.id)) this.connect(m.id);
    for (const m of members) {
      const t = this.tiles.get(m.id);
      if (!t) continue;
      t.label.textContent = m.id === this.selfId ? `${m.name} (you)` : m.name;
      t.el.dataset.color = m.color;
    }
  }

  connect(id) {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.pcs.set(id, pc);
    this.stream.getTracks().forEach((track) => pc.addTrack(track, this.stream));
    pc.onicecandidate = (e) => { if (e.candidate) this.send(id, { ice: e.candidate }); };
    pc.ontrack = (e) => {
      const t = this.tile(id);
      if (t.video.srcObject !== e.streams[0]) {
        t.video.srcObject = e.streams[0];
        const { speaker } = prefs.get();
        if (speaker) t.video.setSinkId?.(speaker).catch(() => {});
        t.video.play?.().catch(() => {});
      }
    };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        this.drop(id);
        this.sync(this.members);
      }
    };
    if (this.selfId < id) {
      pc.onnegotiationneeded = async () => {
        try {
          await pc.setLocalDescription(await pc.createOffer());
          this.send(id, { sdp: pc.localDescription });
        } catch (err) {
          console.warn('offer failed', err);
        }
      };
    }
    return pc;
  }

  drop(id) {
    this.pcs.get(id)?.close();
    this.pcs.delete(id);
    this.pendingIce.delete(id);
    this.removeTile(id);
  }

  async handleSignal({ from, msg }) {
    if (!this.active || !msg) return;
    let pc = this.pcs.get(from);
    // A stale connection gets replaced before handling a fresh offer (as WatchParty does).
    if (pc && msg.sdp?.type === 'offer' && ['failed', 'closed'].includes(pc.connectionState)) {
      this.drop(from);
      pc = null;
    }
    if (!pc) pc = this.connect(from);
    try {
      if (msg.ice) {
        if (pc.remoteDescription) await pc.addIceCandidate(msg.ice);
        else this.pendingIce.set(from, [...(this.pendingIce.get(from) || []), msg.ice]);
      } else if (msg.sdp?.type === 'offer') {
        await pc.setRemoteDescription(msg.sdp);
        await this.flushIce(from, pc);
        await pc.setLocalDescription(await pc.createAnswer());
        this.send(from, { sdp: pc.localDescription });
      } else if (msg.sdp?.type === 'answer') {
        await pc.setRemoteDescription(msg.sdp);
        await this.flushIce(from, pc);
      }
    } catch (err) {
      console.warn('signal failed', err);
    }
  }

  async flushIce(id, pc) {
    for (const c of this.pendingIce.get(id) || []) {
      try { await pc.addIceCandidate(c); } catch { /* stale candidate */ }
    }
    this.pendingIce.delete(id);
  }

  send(to, msg) {
    this.socket.emit('signal', { to, msg: JSON.parse(JSON.stringify(msg)) });
  }

  tile(id) {
    let t = this.tiles.get(id);
    if (t) return t;
    const el = document.createElement('figure');
    el.className = 'tile';
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    const label = document.createElement('figcaption');
    const m = this.members.find((x) => x.id === id);
    label.textContent = m ? (id === this.selfId ? `${m.name} (you)` : m.name) : '';
    if (m) el.dataset.color = m.color;
    el.append(video, label);
    if (id === this.selfId) this.tilesEl.prepend(el);
    else this.tilesEl.append(el);
    t = { el, video, label };
    this.tiles.set(id, t);
    return t;
  }

  removeTile(id) {
    const t = this.tiles.get(id);
    if (!t) return;
    t.video.srcObject = null;
    t.el.remove();
    this.tiles.delete(id);
  }
}
