'use strict';
// Two sync endpoints in one process (loopback) speaking the Android protocol: pair, sync both ways, refusals.
//   node test/nearby-test.cjs
const assert = require('node:assert/strict');
const net = require('node:net');
const nearby = require('../lib/nearby.cjs');

const memory = () => { const m = new Map(); return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) }; };
// Crypto is the same primitive Android uses: iv(12) + ciphertext + tag(16), AES-256-GCM.
const key = Buffer.alloc(32, 7);
const packet = nearby.seal(key, 'héllo');
assert.equal(packet.length, 12 + Buffer.byteLength('héllo') + 16);
assert.equal(nearby.open(key, packet), 'héllo');
assert.throws(() => nearby.open(Buffer.alloc(32, 1), packet));
assert.equal(nearby.isPrivate('192.168.1.4'), true);
assert.equal(nearby.isPrivate('172.32.0.1'), false);
assert.equal(nearby.isPrivate('8.8.8.8'), false);

(async () => {
  const log = [];
  let a, b;
  a = nearby.create({ store: memory(), port: 0, address: '127.0.0.1', allowLoopback: true, onMessage: (m) => { log.push(['A', m]); void a.respond(m.requestId, `A answers: ${m.payload}`); } });
  b = nearby.create({ store: memory(), port: 0, address: '127.0.0.1', allowLoopback: true, onMessage: (m) => { log.push(['B', m]); void b.respond(m.requestId, `B answers: ${m.payload}`); } });

  const invite = await a.invitation();
  assert.match(invite, /^atlas:\/\/sync\?id=[a-f0-9]{32}&ip=127\.0\.0\.1&port=\d+&key=[A-Za-z0-9_-]{43}$/);

  // a stranger with the wrong key is refused and nothing is delivered
  const wrong = invite.replace(/key=.*/, `key=${Buffer.alloc(32, 9).toString('base64url')}`);
  await assert.rejects(b.pair(wrong, 'hi'));
  assert.equal(log.length, 0);

  // pairing with the right key
  const paired = await b.pair(invite, 'hello from B');
  assert.equal(paired.payload, 'A answers: hello from B');
  assert.equal(paired.peerId, a.ownId);
  assert.deepEqual(log[0][1].newPair, true);
  assert.equal(log[0][1].peerId, b.ownId);
  assert.deepEqual((await b.peers()).map((p) => p.id), [a.ownId]);
  assert.deepEqual((await a.peers()).map((p) => p.id), [b.ownId]);

  // the invitation works once
  const c = nearby.create({ store: memory(), port: 0, address: '127.0.0.1', allowLoopback: true, onMessage: () => {} });
  await assert.rejects(c.pair(invite, 'late'));

  // sync both ways with the stored secrets, a 3 MB payload included
  const big = 'x'.repeat(3 * 1024 * 1024);
  assert.equal((await b.sync(a.ownId, big)).payload.length, 'A answers: '.length + big.length);
  assert.equal((await a.sync(b.ownId, 'from A')).payload, 'B answers: from A');
  assert.equal(log.at(-1)[1].newPair, false);

  // a replayed frame is refused: record what a device sends through a proxy, then send the same bytes again
  const aPort = Number(/port=(\d+)/.exec(invite)[1]);
  const recorded = [];
  const proxy = net.createServer((client) => {
    const upstream = net.connect(aPort, '127.0.0.1');
    client.on('data', (d) => { recorded.push(d); upstream.write(d); });
    upstream.on('data', (d) => client.write(d));
    client.on('close', () => upstream.destroy()); upstream.on('close', () => client.destroy());
    client.on('error', () => {}); upstream.on('error', () => {});
  });
  await new Promise((r) => proxy.listen(0, '127.0.0.1', r));
  const invite2 = (await a.invitation()).replace(/port=\d+/, `port=${proxy.address().port}`);
  const d = nearby.create({ store: memory(), port: 0, address: '127.0.0.1', allowLoopback: true, onMessage: () => {} });
  await d.pair(invite2, 'first');
  const before = log.length;
  const original = Buffer.concat(recorded);
  const replay = await new Promise((resolve) => {
    const sock = net.connect(aPort, '127.0.0.1', () => sock.write(original));
    let got = 0;
    sock.on('data', (x) => { got += x.length; });
    sock.on('close', () => resolve(got));
    sock.on('error', () => resolve(got));
  });
  assert.equal(replay, 0, 'a replayed request gets no answer');
  assert.equal(log.length, before, 'and is not delivered to the app');
  proxy.close(); await d.stop();

  await a.unpair(b.ownId);
  assert.deepEqual((await a.peers()).map((x) => x.id), [d.ownId], 'only the unpaired device is gone');
  await assert.rejects(a.sync(b.ownId, 'gone'), /not been paired/);
  await a.stop(); await b.stop(); await c.stop();
  console.log('NEARBY TEST PASSED');
})().catch((e) => { console.error(e); console.log('NEARBY TEST FAILED'); process.exit(1); });
