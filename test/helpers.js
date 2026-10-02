// Starts a Couchline server on its own port and makes fake viewers that talk to it.
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

export async function startServer(port, env = {}) {
  const srv = spawn('node', ['server.js'], { env: { ...process.env, ...env, PORT: port }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => srv.stdout.once('data', r));
  process.on('uncaughtException', (e) => { console.error(e); srv.kill(); process.exit(1); });
  return srv;
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function client(port, name, roomId, extra = {}) {
  const s = io(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true });
  s.last = null; s.toasts = []; s.signals = [];
  s.on('state', (st) => { s.last = st; });
  s.on('toast', (t) => s.toasts.push(t.text));
  s.on('signal', (d) => s.signals.push(d));
  s.joined = new Promise((res) => s.on('connect', () => s.emit('join', { roomId, clientId: name.toLowerCase(), name, ...extra }, res)));
  s.ask = (ev, data) => new Promise((res) => s.emit(ev, data, res));
  return s;
}

export function checker() {
  let pass = 0;
  return {
    ok(label) { pass++; console.log('ok  ', label); },
    get count() { return pass; },
  };
}
