'use strict';

const dns = require('node:dns').promises;
const net = require('node:net');

const USER_AGENT =
  'SEOAuditBot/1.0 (+https://github.com/yourname/seo-audit-tool; educational audit tool)';
const TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 15000);
const MAX_BYTES = Number(process.env.FETCH_MAX_BYTES || 5 * 1024 * 1024);

class FetchError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'FetchError';
    this.code = code;
  }
}

/**
 * Anything that accepts a user-supplied URL and fetches it server-side is an
 * SSRF hole unless the resolved address is checked. We block loopback, link
 * local, private and reserved ranges so nobody can point this tool at
 * 169.254.169.254 (cloud metadata) or a service on the deploy host.
 */
function isBlockedAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  const ip = address.toLowerCase();
  if (ip === '::' || ip === '::1') return true;
  if (ip.startsWith('fe80') || ip.startsWith('fc') || ip.startsWith('fd')) return true;
  if (ip.startsWith('::ffff:')) return isBlockedAddress(ip.slice(7));
  return false;
}

/** Normalises user input into a URL we are willing to request. */
function normaliseUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new FetchError('Enter a URL to audit.', 'EMPTY');

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  let url;
  try {
    url = new URL(withScheme);
  } catch {
    throw new FetchError('That does not look like a valid URL.', 'INVALID_URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new FetchError('Only http and https URLs can be audited.', 'BAD_PROTOCOL');
  }
  if (!url.hostname.includes('.')) {
    throw new FetchError('Enter a full domain, for example example.com.', 'BAD_HOST');
  }
  url.hash = '';
  return url;
}

async function assertPublicHost(hostname) {
  let records;
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch {
    throw new FetchError(`Could not resolve ${hostname}. Check the spelling.`, 'DNS');
  }
  if (!records.length) {
    throw new FetchError(`Could not resolve ${hostname}.`, 'DNS');
  }
  if (records.some((r) => isBlockedAddress(r.address))) {
    throw new FetchError('That host resolves to a private address and cannot be audited.', 'BLOCKED');
  }
}

/** Reads the body but stops once MAX_BYTES is reached, so one huge page cannot OOM the process. */
async function readCapped(response) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const buf = Buffer.from(await response.arrayBuffer());
    return { buffer: buf.subarray(0, MAX_BYTES), truncated: buf.length > MAX_BYTES };
  }
  const chunks = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      chunks.push(Buffer.from(value).subarray(0, value.length - (total - MAX_BYTES)));
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(Buffer.from(value));
  }
  return { buffer: Buffer.concat(chunks), truncated };
}

/**
 * Fetches a page and returns the html plus the timing/transport facts the
 * audit checks need.
 */
async function fetchPage(input) {
  const url = normaliseUrl(input);
  await assertPublicHost(url.hostname);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = process.hrtime.bigint();

  let response;
  try {
    response = await fetch(url.href, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new FetchError(`No response within ${TIMEOUT_MS / 1000}s. The server may be slow or blocking bots.`, 'TIMEOUT');
    }
    throw new FetchError(`Could not reach ${url.hostname}: ${err.message}`, 'NETWORK');
  }

  const ttfbMs = Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6);
  const contentType = response.headers.get('content-type') || '';

  let buffer = Buffer.alloc(0);
  let truncated = false;
  try {
    ({ buffer, truncated } = await readCapped(response));
  } finally {
    clearTimeout(timer);
  }

  const totalMs = Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6);

  if (!contentType.includes('html') && buffer.length) {
    throw new FetchError(`That URL returned ${contentType.split(';')[0] || 'a non-HTML file'}. Point the audit at an HTML page.`, 'NOT_HTML');
  }

  return {
    requestedUrl: url.href,
    finalUrl: response.url || url.href,
    statusCode: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    html: buffer.toString('utf8'),
    pageBytes: buffer.length,
    truncated,
    ttfbMs,
    totalMs
  };
}

/** Best-effort plain-text fetch used for robots.txt and sitemap.xml. */
async function fetchText(href, { timeout = 8000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(href, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT }
    });
    const text = res.ok ? (await res.text()).slice(0, 200_000) : '';
    return { ok: res.ok, status: res.status, text };
  } catch {
    return { ok: false, status: 0, text: '' };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchPage, fetchText, normaliseUrl, FetchError, USER_AGENT };
