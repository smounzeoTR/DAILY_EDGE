/* global maestro, output */
// Maestro (GraalJS) has no crypto: TOTP (RFC 6238, SHA-1, 30 s, 6 digits) in plain JavaScript,
// from the secret copied from the screen (copyTextFrom id "totp-secret").
function base32ToBytes(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = input.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = alphabet.indexOf(clean[i]);
    if (idx < 0) throw new Error('Invalid base32 secret');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return out;
}

function sha1(bytes) {
  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const msg = bytes.slice();
  const bitLen = bytes.length * 8;
  msg.push(0x80);
  while (msg.length % 64 !== 56) msg.push(0);
  for (let i = 7; i >= 0; i--) msg.push(i >= 4 ? 0 : (bitLen >>> (i * 8)) & 0xff);
  const rotl = (x, n) => (x << n) | (x >>> (32 - n));
  for (let off = 0; off < msg.length; off += 64) {
    const w = new Array(80);
    for (let i = 0; i < 16; i++) {
      w[i] =
        (msg[off + 4 * i] << 24) |
        (msg[off + 4 * i + 1] << 16) |
        (msg[off + 4 * i + 2] << 8) |
        msg[off + 4 * i + 3];
    }
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let [a, b, c, d, e] = h;
    for (let i = 0; i < 80; i++) {
      let f;
      let k;
      if (i < 20) [f, k] = [(b & c) | (~b & d), 0x5a827999];
      else if (i < 40) [f, k] = [b ^ c ^ d, 0x6ed9eba1];
      else if (i < 60) [f, k] = [(b & c) | (b & d) | (c & d), 0x8f1bbcdc];
      else [f, k] = [b ^ c ^ d, 0xca62c1d6];
      const temp = (rotl(a, 5) + f + e + k + w[i]) | 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }
    h[0] = (h[0] + a) | 0;
    h[1] = (h[1] + b) | 0;
    h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0;
  }
  const out = [];
  for (const x of h) out.push((x >>> 24) & 0xff, (x >>> 16) & 0xff, (x >>> 8) & 0xff, x & 0xff);
  return out;
}

function hmacSha1(key, message) {
  let k = key.length > 64 ? sha1(key) : key.slice();
  while (k.length < 64) k.push(0);
  const inner = sha1(k.map((b) => b ^ 0x36).concat(message));
  return sha1(k.map((b) => b ^ 0x5c).concat(inner));
}

function totp(secret, now) {
  let counter = Math.floor(now / 1000 / 30);
  const msg = [];
  for (let i = 7; i >= 0; i--) {
    msg[i] = counter & 0xff;
    counter = Math.floor(counter / 256);
  }
  const hash = hmacSha1(base32ToBytes(secret), msg);
  const offset = hash[19] & 0x0f;
  const code =
    (((hash[offset] & 0x7f) << 24) |
      (hash[offset + 1] << 16) |
      (hash[offset + 2] << 8) |
      hash[offset + 3]) %
    1000000;
  return String(code).padStart(6, '0');
}

// Self-check against the RFC 6238 test vector (SHA-1, T = 59 s -> 94287082 -> 287082)
if (totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59000) !== '287082') {
  throw new Error('TOTP self-check failed');
}
output.totp = totp(maestro.copiedText, Date.now());
