/**
 * Which web addresses the model may fetch. A page or document the model reads can contain instructions ("now open
 * http://192.168.0.1/"), so private, local and reserved addresses are refused, however they are written.
 */

/** The host part of a URL: without scheme, user:password@, port, path or brackets, in lower case. */
export function hostOf(rawUrl: string): string | null {
  const m = rawUrl.trim().match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i);
  if (!m) return null;
  const authority = m[1].slice(m[1].lastIndexOf('@') + 1);
  if (authority.startsWith('[')) {
    const end = authority.indexOf(']');
    return end < 0 ? null : authority.slice(1, end).toLowerCase();
  }
  return authority.replace(/:\d*$/, '').replace(/\.$/, '').toLowerCase();
}

/** An IPv4 address written the way inet_aton reads it: dotted decimal, octal or hex parts, or one big number. Null if it is not one. */
function ipv4Bytes(host: string): number[] | null {
  const parts = host.split('.');
  if (parts.length > 4 || parts.some((p) => !/^(?:0x[0-9a-f]+|\d+)$/i.test(p))) return null;
  const nums = parts.map((p) => (/^0x/i.test(p) ? parseInt(p, 16) : /^0\d+$/.test(p) ? parseInt(p, 8) : parseInt(p, 10)));
  const head = nums.slice(0, -1);
  const last = nums[nums.length - 1];
  if (head.some((n) => n > 255) || last >= 256 ** (5 - nums.length) || nums.some((n) => !Number.isFinite(n))) return null;
  const bytes = [...head];
  for (let i = 5 - nums.length - 1; i >= 0; i--) bytes.push(Math.floor(last / 256 ** i) % 256);
  return bytes;
}

function blockedIpv4([a, b]: number[]): boolean {
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19));
}

function blockedIpv6(host: string): boolean {
  if (host === '::' || host === '::1' || /^f[cd]/.test(host) || /^fe[89ab]/.test(host)) return true;
  const mapped = host.match(/^(?:0:0:0:0:0:|::)ffff:(.+)$/);
  if (!mapped) return false;
  const tail = mapped[1];
  const dotted = ipv4Bytes(tail);
  if (dotted) return blockedIpv4(dotted);
  const hex = tail.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  return hex ? blockedIpv4([parseInt(hex[1], 16) >> 8, parseInt(hex[1], 16) & 255]) : true;
}

/** True when the address is local, private, reserved or a bare network name such as "router". */
export function isBlockedUrl(rawUrl: string): boolean {
  const host = hostOf(rawUrl);
  if (!host) return false;
  if (host.includes(':')) return blockedIpv6(host);
  const bytes = ipv4Bytes(host);
  if (bytes) return blockedIpv4(bytes);
  return !host.includes('.') || /\.(?:local|localhost|internal|lan|home|corp)$/.test(host);
}

/** Plain http:// to a public site becomes https://, so the request cannot be read or changed on the way. */
export const forceHttps = (url: string): string => url.replace(/^http:\/\//i, 'https://');
