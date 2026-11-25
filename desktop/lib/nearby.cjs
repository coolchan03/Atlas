'use strict';
// Offline device sync for the Windows app: the same encrypted local-network protocol the Android app speaks
// (android/.../atlasdevice/AtlasNearbySyncModule.kt + SyncCrypto.kt), so a PC and a phone on the same Wi-Fi sync with each
// other. Wire format, kept identical on purpose:
//   frame   = 4-byte big-endian length + UTF-8 JSON  { version: 1, source, port, issued (ms), nonce, payload }
//   payload = base64url (no padding) of  iv(12) + AES-256-GCM(secret, plain) + tag(16)
//   secret  = 32 random bytes from the pairing invitation  atlas://sync?id=<device>&ip=<ip>&port=<port>&key=<base64url secret>
// Not a cloud service: peers must be on a private network address, and without the pairing secret nothing is read or sent.
const net = require('node:net');
const os = require('node:os');
const crypto = require('node:crypto');

const PORT = 47839; // stable, so paired devices reconnect after a restart without a new QR code
const MAX_PACKET = 48 * 1024 * 1024;
const IO_TIMEOUT = 120000;
const ID_RE = /^[a-zA-Z0-9_-]{8,128}$/;

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const unb64 = (text) => Buffer.from(text, 'base64url');

function seal(secret, plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secret, iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]);
}
function open(secret, packet) {
  if (packet.length < 12 + 1 + 16) throw new Error('Invalid encrypted peer packet');
  const decipher = crypto.createDecipheriv('aes-256-gcm', secret, packet.subarray(0, 12));
  decipher.setAuthTag(packet.subarray(packet.length - 16));
  return Buffer.concat([decipher.update(packet.subarray(12, packet.length - 16)), decipher.final()]).toString('utf8');
}
const isPrivate = (ip) => {
  const p = String(ip).split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  return p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || (p[0] === 169 && p[1] === 254);
};
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal && isPrivate(a.address)) out.push(a.address);
  }
  return [...new Set(out)];
}

/** Reads one length-prefixed JSON frame. */
function readFrame(socket) {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    let need = -1;
    const done = (fn, v) => { socket.off('data', onData); socket.off('error', onErr); socket.off('close', onClose); fn(v); };
    const onErr = (e) => done(reject, e);
    const onClose = () => done(reject, new Error('The other device closed the connection'));
    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (need < 0 && buf.length >= 4) {
        need = buf.readInt32BE(0);
        if (need < 1 || need > MAX_PACKET) return done(reject, new Error('Invalid sync transfer size'));
      }
      if (need >= 0 && buf.length >= 4 + need) {
        try { done(resolve, JSON.parse(buf.subarray(4, 4 + need).toString('utf8'))); } catch (e) { done(reject, e); }
      }
    };
    socket.on('data', onData); socket.on('error', onErr); socket.on('close', onClose);
  });
}
function writeFrame(socket, data) {
  if (data.length < 1 || data.length > MAX_PACKET) throw new Error('Sync transfer exceeds the 48 MB safety limit');
  const head = Buffer.alloc(4);
  head.writeInt32BE(data.length);
  return new Promise((resolve, reject) => socket.write(Buffer.concat([head, data]), (e) => (e ? reject(e) : resolve())));
}

/**
 * One device's sync endpoint. `store` keeps what must survive a restart ({ get(key), set(key, value) } of strings), `onMessage`
 * receives each request that arrives (the app answers it through respond()). Options for tests: port, address, allowLoopback.
 */
function create({ store, onMessage, port = PORT, address, allowLoopback = false }) {
  const observed = new Map();
  const awaiting = new Map();
  let server = null;
  let pairingSecret = null;
  let pairingUntil = 0;

  const ownId = (() => {
    let id = store.get('nearby.deviceId');
    if (!id) { id = crypto.randomUUID().replace(/-/g, ''); store.set('nearby.deviceId', id); }
    return id;
  })();
  const peerIds = () => { try { return JSON.parse(store.get('nearby.peers') || '[]'); } catch { return []; } };
  const saveIds = (ids) => store.set('nearby.peers', JSON.stringify([...new Set(ids)]));
  const peerRecord = (id) => {
    if (!ID_RE.test(id)) throw new Error('Invalid peer ID');
    const raw = store.get(`nearby.peer.${id}`);
    if (!raw) throw new Error('Device has not been paired');
    return JSON.parse(raw);
  };
  const peerStore = (id, host, p, secret) => {
    store.set(`nearby.peer.${id}`, JSON.stringify({ id, host, port: p, secret: b64(secret) }));
    saveIds([...peerIds(), id]);
  };
  const localOk = (host) => isPrivate(host) || (allowLoopback && (host === '127.0.0.1' || host === 'localhost'));

  const envelope = (data, secret) => Buffer.from(JSON.stringify({
    version: 1, source: ownId, port: server ? server.address().port : 0, issued: Date.now(), nonce: crypto.randomUUID(), payload: b64(seal(secret, data)),
  }), 'utf8');
  function check(frame) {
    if (frame.version !== 1) throw new Error('Unsupported sync protocol');
    const issued = Number(frame.issued);
    if (!Number.isFinite(issued) || Math.abs(Date.now() - issued) >= 5 * 60 * 1000) throw new Error('Sync message has expired; check device clocks');
    if (typeof frame.nonce !== 'string' || frame.nonce.length < 10 || frame.nonce.length > 100) throw new Error('Invalid sync message ID');
    if (typeof frame.source !== 'string' || !ID_RE.test(frame.source)) throw new Error('Invalid sender');
    const key = `${frame.source}:${frame.nonce}`;
    if (observed.has(key)) throw new Error('Repeated sync request refused');
    observed.set(key, issued);
    if (observed.size > 2048) for (const [k, v] of observed) if (v < Date.now() - 300000) observed.delete(k);
  }

  async function handle(socket) {
    socket.setTimeout(IO_TIMEOUT, () => socket.destroy());
    try {
      const frame = await readFrame(socket);
      check(frame);
      const source = frame.source;
      let old = null;
      try { old = peerRecord(source); } catch { old = null; }
      const inviting = !old;
      let secret;
      if (inviting) {
        if (Date.now() >= pairingUntil) throw new Error('Pairing invitation expired');
        if (!pairingSecret) throw new Error('Pairing is not enabled');
        secret = pairingSecret;
      } else secret = unb64(old.secret);
      const body = open(secret, unb64(frame.payload));
      const requestId = crypto.randomUUID();
      const answer = new Promise((resolve, reject) => {
        const timer = setTimeout(() => { awaiting.delete(requestId); reject(new Error('Atlas did not respond to sync')); }, 105000);
        awaiting.set(requestId, (text) => { clearTimeout(timer); awaiting.delete(requestId); resolve(text); });
      });
      onMessage({ requestId, peerId: source, payload: body, newPair: inviting });
      const response = await answer;
      await writeFrame(socket, envelope(response, secret));
      const peerPort = Number(frame.port);
      const host = String(socket.remoteAddress || '').replace(/^::ffff:/, '');
      if (inviting) {
        if (!(peerPort >= 1 && peerPort <= 65535)) throw new Error('Invalid peer listening port');
        peerStore(source, host, peerPort, secret);
        pairingSecret = null;
      } else if (peerPort >= 1 && peerPort <= 65535) peerStore(source, host, peerPort, secret);
    } catch { /* a refused or broken request just closes; nothing about it is sent back */ } finally { socket.end(); }
  }

  function ensureServer() {
    if (server && server.listening) return Promise.resolve(server.address().port);
    return new Promise((resolve, reject) => {
      const s = net.createServer((socket) => void handle(socket));
      s.once('error', reject);
      s.listen(port, '0.0.0.0', () => { server = s; s.off('error', reject); resolve(s.address().port); });
    });
  }
  async function exchange(host, p, secret, body, expected) {
    if (!localOk(host) || !(p >= 1 && p <= 65535)) throw new Error('Peer must be on a local network');
    const socket = net.connect({ host, port: p });
    socket.setTimeout(IO_TIMEOUT, () => socket.destroy(new Error('The other device did not answer')));
    try {
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Could not reach the other device. Check that Atlas is open on it and both are on the same network.')), 8000);
        socket.once('connect', () => { clearTimeout(t); resolve(); });
        socket.once('error', (e) => { clearTimeout(t); reject(e); });
      });
      await writeFrame(socket, envelope(body, secret));
      const response = await readFrame(socket);
      check(response);
      if (response.source !== expected) throw new Error('Wrong sync device replied');
      return open(secret, unb64(response.payload));
    } finally { socket.destroy(); }
  }

  return {
    ownId,
    async start() {
      const p = await ensureServer();
      return { deviceId: ownId, port: p, address: address || lanAddresses()[0] || '' };
    },
    async stop() {
      await new Promise((resolve) => (server ? server.close(() => resolve()) : resolve()));
      server = null; pairingSecret = null;
      return true;
    },
    async invitation() {
      const p = await ensureServer();
      const ip = address || lanAddresses()[0];
      if (!ip) throw new Error('Connect the devices to the same local Wi-Fi or hotspot');
      const key = crypto.randomBytes(32);
      pairingSecret = key;
      pairingUntil = Date.now() + 10 * 60 * 1000;
      return `atlas://sync?id=${ownId}&ip=${ip}&port=${p}&key=${b64(key)}`;
    },
    async pair(uriText, payload) {
      const uri = new URL(uriText);
      if (uri.protocol !== 'atlas:' || uri.hostname !== 'sync') throw new Error('Not an Atlas pairing invitation');
      const id = uri.searchParams.get('id');
      if (!id) throw new Error('Missing paired device');
      const ip = uri.searchParams.get('ip') || '';
      const p = Number(uri.searchParams.get('port')) || 0;
      const secret = unb64(uri.searchParams.get('key') || '');
      if (id === ownId || !ID_RE.test(id)) throw new Error('Invalid peer ID');
      if (secret.length !== 32) throw new Error('Invalid pairing key');
      await ensureServer(); // the other device connects back to this one to sync later
      const result = await exchange(ip, p, secret, payload, id);
      peerStore(id, ip, p, secret);
      return { peerId: id, payload: result, transport: 'wifi' };
    },
    async sync(peerId, payload) {
      const peer = peerRecord(peerId);
      const text = await exchange(peer.host, peer.port, unb64(peer.secret), payload, peerId);
      return { peerId, payload: text, transport: 'wifi' };
    },
    async respond(requestId, payload) {
      const answer = awaiting.get(requestId);
      if (!answer) throw new Error('Sync request expired');
      answer(payload);
      return true;
    },
    async peers() {
      const out = [];
      for (const id of peerIds()) { try { const r = peerRecord(id); out.push({ id: r.id, address: r.host }); } catch { /* revoked */ } }
      return out;
    },
    async unpair(id) {
      store.set(`nearby.peer.${id}`, '');
      saveIds(peerIds().filter((x) => x !== id));
      return true;
    },
  };
}

module.exports = { create, seal, open, isPrivate, lanAddresses, PORT };
