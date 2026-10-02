// Video files from people's own devices, played in sync without uploading anything.
// Each person picks their own copy, or gets it straight from someone in the room who has it,
// browser to browser over a WebRTC data channel. Setup messages go through the same relay
// the call uses, marked with "share" so the call ignores them.
// Downloaded copies are kept in the browser's private storage (OPFS) where it's available,
// so a reload doesn't mean downloading again. Only the last few are kept.

const READ_SIZE = 1024 * 1024; // read the file a megabyte at a time
const CHUNK = 64 * 1024; // and send it in 64 KB messages
const HIGH_WATER = 8 * 1024 * 1024; // pause reading while this much is waiting to send
const WRITE_SIZE = 4 * 1024 * 1024; // and save what arrives in 4 MB blocks
const KEEP = 3; // downloaded files kept on this device

const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const randomId = () => hex(crypto.getRandomValues(new Uint8Array(8)));

// Identifies a file by its size and its first and last megabyte, which is quick even for a
// movie and tells apart two different encodes of the same title.
export async function fingerprint(file) {
  const head = await file.slice(0, READ_SIZE).arrayBuffer();
  const tail = await file.slice(Math.max(0, file.size - READ_SIZE)).arrayBuffer();
  const size = new TextEncoder().encode(String(file.size));
  const all = new Uint8Array(size.length + head.byteLength + tail.byteLength);
  all.set(size, 0);
  all.set(new Uint8Array(head), size.length);
  all.set(new Uint8Array(tail), size.length + head.byteLength);
  return hex(await crypto.subtle.digest('SHA-256', all));
}

// Length in seconds, or null if this browser can't play the file.
export function probeVideo(file) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(file);
    const done = (value) => { clearTimeout(timer); URL.revokeObjectURL(url); v.removeAttribute('src'); resolve(value); };
    const timer = setTimeout(() => done(null), 15000);
    v.preload = 'metadata';
    v.muted = true;
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : 0);
    v.onerror = () => done(null);
    v.src = url;
  });
}

export function formatSize(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

// ---------- private storage for downloaded copies ----------
const storage = {
  async dir() {
    try {
      const root = await navigator.storage.getDirectory();
      return await root.getDirectoryHandle('couchline-files', { create: true });
    } catch {
      return null;
    }
  },
  canWrite: typeof FileSystemFileHandle !== 'undefined' && 'createWritable' in FileSystemFileHandle.prototype,

  async all() {
    const dir = await this.dir();
    const out = [];
    if (!dir) return out;
    try {
      for await (const [name, handle] of dir.entries()) {
        if (!name.endsWith('.json')) continue;
        const fp = name.slice(0, -5);
        try {
          const meta = JSON.parse(await (await handle.getFile()).text());
          const data = await (await dir.getFileHandle(fp)).getFile();
          if (data.size !== meta.size) continue; // an unfinished download
          out.push({ fp, meta, file: new File([data], meta.name, { type: meta.type }) });
        } catch { /* skip a broken entry */ }
      }
    } catch { /* storage unavailable */ }
    return out;
  },

  // Returns { write(buf), finish() -> File, abort() }, on disk when possible, otherwise in memory.
  async writer(fp, meta) {
    const dir = this.canWrite ? await this.dir() : null;
    if (dir) {
      try {
        const handle = await dir.getFileHandle(fp, { create: true });
        const out = await handle.createWritable();
        return {
          write: (buf) => out.write(buf),
          async finish() {
            await out.close();
            // The description is written last, so a half-finished download is never picked up.
            const w = await (await dir.getFileHandle(`${fp}.json`, { create: true })).createWritable();
            await w.write(JSON.stringify({ ...meta, savedAt: Date.now() }));
            await w.close();
            return new File([await handle.getFile()], meta.name, { type: meta.type });
          },
          async abort() {
            try { await out.abort(); } catch { /* already closed */ }
            try { await dir.removeEntry(fp); } catch { /* nothing written */ }
          },
        };
      } catch { /* fall back to memory */ }
    }
    const parts = [];
    return {
      write: (buf) => { parts.push(buf); },
      finish: async () => new File(parts, meta.name, { type: meta.type }),
      abort: async () => { parts.length = 0; },
    };
  },

  // Keeps the newest few downloads, plus whatever is playing now.
  async prune(keepFp) {
    const dir = await this.dir();
    if (!dir) return;
    const entries = (await this.all()).sort((a, b) => (b.meta.savedAt || 0) - (a.meta.savedAt || 0));
    for (const { fp } of entries.slice(KEEP)) {
      if (fp === keepFp) continue;
      try { await dir.removeEntry(fp); await dir.removeEntry(`${fp}.json`); } catch { /* in use */ }
    }
  },
};

export class FileShare {
  constructor({ socket, onChange, onNotice }) {
    this.socket = socket;
    this.onChange = onChange || (() => {});
    this.onNotice = onNotice || (() => {});
    this.iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
    this.files = new Map(); // fingerprint -> File this device can play and share
    this.aliases = new Map(); // fingerprint -> a different file the person chose to use anyway (never shared)
    this.transfers = new Map(); // id -> { id, fp, peer, dir: 'in' | 'out', name, size, done, state, error }
    this.pcs = new Map(); // id -> RTCPeerConnection
    this.pendingIce = new Map();
  }

  // Picks up copies downloaded before a reload.
  async restore() {
    for (const { fp, file } of await storage.all()) this.files.set(fp, file);
    this.onChange();
  }

  announce() {
    this.socket.emit('local:have', { fps: [...this.files.keys()].slice(-20) });
  }

  has(fp) { return this.files.has(fp) || this.aliases.has(fp); }
  get(fp) { return this.files.get(fp) || this.aliases.get(fp) || null; }

  // A file the person picked from their device. Returns its fingerprint.
  async add(file) {
    const fp = await fingerprint(file);
    this.files.set(fp, file);
    this.announce();
    this.onChange();
    return fp;
  }
  useAnyway(fp, file) {
    this.aliases.set(fp, file);
    this.onChange();
  }

  incoming(fp) { return [...this.transfers.values()].find((t) => t.dir === 'in' && t.fp === fp && !t.error && t.state !== 'done') || null; }
  outgoing() { return [...this.transfers.values()].filter((t) => t.dir === 'out' && t.state === 'sending'); }

  send(to, share) {
    this.socket.emit('signal', { to, msg: { share: JSON.parse(JSON.stringify(share)) } });
  }

  newPc(id, peer) {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.pcs.set(id, pc);
    pc.onicecandidate = (e) => { if (e.candidate) this.send(peer, { id, ice: e.candidate }); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') this.fail(id, 'The connection between your browsers failed. A TURN relay may be needed (see the README).');
    };
    return pc;
  }

  close(id) {
    this.pcs.get(id)?.close();
    this.pcs.delete(id);
    this.pendingIce.delete(id);
  }

  fail(id, message) {
    const t = this.transfers.get(id);
    if (t && t.state !== 'done') {
      t.state = 'failed';
      t.error = message;
      t.writer?.abort();
    }
    this.close(id);
    this.onChange();
  }

  cancel(id) {
    const t = this.transfers.get(id);
    if (!t) return;
    this.send(t.peer, { id, cancel: true });
    this.fail(id, 'Cancelled.');
    this.transfers.delete(id);
    this.onChange();
  }

  // ---------- receiving ----------
  async request(peer, item) {
    const id = randomId();
    const t = { id, fp: item.fp, peer, dir: 'in', name: item.name, size: item.size, done: 0, state: 'connecting', startedAt: Date.now() };
    this.transfers.set(id, t);
    this.onChange();
    // The first connection in a tab can take the browser a few seconds to set up, so let
    // "Connecting" show before starting it.
    await new Promise((r) => setTimeout(r, 30));
    if (!this.transfers.has(id)) return id; // cancelled meanwhile
    const pc = this.newPc(id, peer);
    const dc = pc.createDataChannel('couchline-file', { ordered: true });
    dc.binaryType = 'arraybuffer';
    dc.onmessage = async (e) => {
      try {
        if (typeof e.data === 'string') {
          const m = JSON.parse(e.data);
          if (m.error) return this.fail(id, m.error);
          if (m.header) {
            t.writer = await storage.writer(item.fp, { name: m.header.name, size: m.header.size, type: m.header.type });
            t.type = m.header.type;
            t.state = 'receiving';
          } else if (m.done) {
            await this.finishReceive(t);
          }
        } else if (t.writer) {
          // Storage writes are slow one 64 KB piece at a time, so they go out in 4 MB blocks.
          (t.batch ||= []).push(e.data);
          t.batchSize = (t.batchSize || 0) + e.data.byteLength;
          if (t.batchSize >= WRITE_SIZE) this.flush(t);
          t.done += e.data.byteLength;
          const now = performance.now();
          if (!t.shownAt || now - t.shownAt > 250) { t.shownAt = now; this.onChange(); }
        }
      } catch (err) {
        this.fail(id, `Saving the file failed: ${err.message}`);
      }
    };
    dc.onclose = () => { if (t.state !== 'done' && t.state !== 'failed') this.fail(id, 'The other person stopped sending.'); };
    await pc.setLocalDescription(await pc.createOffer());
    this.send(peer, { id, fp: item.fp, offer: pc.localDescription });
    return id;
  }

  flush(t) {
    if (!t.batch?.length) return;
    const block = new Blob(t.batch);
    t.batch = [];
    t.batchSize = 0;
    t.queue = (t.queue || Promise.resolve()).then(() => t.writer.write(block));
  }

  async finishReceive(t) {
    this.flush(t);
    await t.queue;
    const file = await t.writer.finish();
    t.writer = null;
    if (file.size !== t.size || (await fingerprint(file)) !== t.fp) {
      return this.fail(t.id, 'The file arrived damaged. Try again.');
    }
    t.state = 'done';
    this.files.set(t.fp, file);
    this.close(t.id);
    this.announce();
    storage.prune(t.fp);
    this.onChange();
  }

  // ---------- sending ----------
  async serve(id, peer, fp, dc) {
    const file = this.files.get(fp);
    const t = { id, fp, peer, dir: 'out', name: file.name, size: file.size, done: 0, state: 'sending' };
    this.transfers.set(id, t);
    this.onNotice(t);
    this.onChange();
    const pc = this.pcs.get(id);
    const max = Math.min(CHUNK, pc?.sctp?.maxMessageSize || CHUNK);
    dc.bufferedAmountLowThreshold = HIGH_WATER / 2;
    const drained = () => new Promise((resolve) => { dc.onbufferedamountlow = () => { dc.onbufferedamountlow = null; resolve(); }; });
    try {
      dc.send(JSON.stringify({ header: { name: file.name, size: file.size, type: file.type } }));
      for (let off = 0; off < file.size; off += READ_SIZE) {
        if (t.state !== 'sending' || dc.readyState !== 'open') return;
        const buf = await file.slice(off, off + READ_SIZE).arrayBuffer();
        for (let i = 0; i < buf.byteLength; i += max) {
          if (dc.bufferedAmount > HIGH_WATER) await drained();
          dc.send(buf.slice(i, i + max));
        }
        t.done = Math.min(file.size, off + READ_SIZE);
        this.onChange();
      }
      dc.send(JSON.stringify({ done: true }));
      t.state = 'done';
      this.onNotice(t);
      this.onChange();
    } catch (err) {
      this.fail(id, err.message);
    }
  }

  async handleSignal({ from, msg }) {
    const s = msg?.share;
    if (!s?.id) return;
    try {
      if (s.offer) {
        if (!this.files.has(s.fp)) return this.send(from, { id: s.id, error: 'That person doesn’t have the file anymore.' });
        const pc = this.newPc(s.id, from);
        pc.ondatachannel = (e) => {
          const dc = e.channel;
          if (dc.readyState === 'open') this.serve(s.id, from, s.fp, dc);
          else dc.onopen = () => this.serve(s.id, from, s.fp, dc);
          dc.onclose = () => { const t = this.transfers.get(s.id); if (t?.state === 'sending') { t.state = 'stopped'; this.onChange(); } this.close(s.id); };
        };
        await pc.setRemoteDescription(s.offer);
        await this.flushIce(s.id, pc);
        await pc.setLocalDescription(await pc.createAnswer());
        this.send(from, { id: s.id, answer: pc.localDescription });
      } else if (s.answer) {
        const pc = this.pcs.get(s.id);
        if (!pc) return;
        await pc.setRemoteDescription(s.answer);
        await this.flushIce(s.id, pc);
      } else if (s.ice) {
        const pc = this.pcs.get(s.id);
        if (pc?.remoteDescription) await pc.addIceCandidate(s.ice);
        else this.pendingIce.set(s.id, [...(this.pendingIce.get(s.id) || []), s.ice]);
      } else if (s.error) {
        this.fail(s.id, s.error);
      } else if (s.cancel) {
        const t = this.transfers.get(s.id);
        if (t) t.state = 'stopped';
        this.close(s.id);
        this.onChange();
      }
    } catch (err) {
      console.warn('file share signal failed', err);
    }
  }

  async flushIce(id, pc) {
    for (const c of this.pendingIce.get(id) || []) {
      try { await pc.addIceCandidate(c); } catch { /* stale candidate */ }
    }
    this.pendingIce.delete(id);
  }
}
