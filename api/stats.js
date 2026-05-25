/**
 * Vercel serverless: anonymous aggregate counters (page visits + assets loaded).
 *
 * GET  → { pageViews, assetsLoaded, topFormats, configured }
 * POST → { event: "page_view" | "asset_loaded", format?: string }
 *
 * Env (same Upstash as bug-report when available):
 *   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const REDIS_PAGE_KEY = 'orby:stats:page_views';
const REDIS_ASSET_KEY = 'orby:stats:assets_loaded';
const REDIS_FORMATS_KEY = 'orby:stats:formats';

const EVENTS = new Set(['page_view', 'asset_loaded']);

const ALLOWED_FORMATS = new Set([
  'glb',
  'gltf',
  'obj',
  'fbx',
  'stl',
  'usd',
  'usdz',
  'svg',
  'orby',
  'other',
]);

/** @type {import('@upstash/ratelimit').Ratelimit | null | false} */
let ratelimit;

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function getRatelimit() {
  if (ratelimit === false) return null;
  if (ratelimit) return ratelimit;
  const redis = getRedis();
  if (!redis) {
    ratelimit = false;
    return null;
  }
  ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(120, '1 m'),
    prefix: 'orby-stats:m',
  });
  return ratelimit;
}

function corsHeaders(origin, req) {
  const allow =
    process.env.ORBY_STATS_ALLOWED_ORIGINS?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ??
    process.env.BUG_REPORT_ALLOWED_ORIGINS?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ??
    null;
  let allowOrigin = '*';
  if (allow?.length) {
    allowOrigin = allow.includes(origin || '') ? origin : allow[0];
  } else if (origin && /^https?:\/\//i.test(origin)) {
    allowOrigin = origin;
  }
  const requested = req.headers['access-control-request-headers'];
  const allowHeaders =
    typeof requested === 'string' && requested.trim() !== ''
      ? requested
      : 'Content-Type';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': allowHeaders,
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim() !== '') {
    return xff.split(',')[0].trim();
  }
  const rip = req.headers['x-real-ip'];
  if (typeof rip === 'string' && rip.trim() !== '') return rip.trim();
  return 'unknown';
}

function parseBody(req) {
  let raw = req.body;
  if (Buffer.isBuffer(raw)) {
    raw = raw.toString('utf8');
  }
  let body =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : {};
  if (typeof raw === 'string' && raw.trim() !== '') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed;
    } catch {
      /* ignore */
    }
  }
  return body;
}

function normalizeFormat(value) {
  if (typeof value !== 'string') return null;
  const format = value.trim().toLowerCase().slice(0, 12);
  if (!format || !ALLOWED_FORMATS.has(format)) return null;
  return format;
}

function topFormatsFromHash(formatsHash) {
  if (!formatsHash || typeof formatsHash !== 'object') return [];
  return Object.entries(formatsHash)
    .map(([format, count]) => ({
      format,
      count: Number(count) || 0,
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.format.localeCompare(b.format))
    .slice(0, 5);
}

async function readCounts(redis) {
  const [pageViews, assetsLoaded, formatsHash] = await Promise.all([
    redis.get(REDIS_PAGE_KEY),
    redis.get(REDIS_ASSET_KEY),
    redis.hgetall(REDIS_FORMATS_KEY),
  ]);
  return {
    pageViews: Number(pageViews) || 0,
    assetsLoaded: Number(assetsLoaded) || 0,
    topFormats: topFormatsFromHash(formatsHash),
  };
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  const headers = corsHeaders(origin, req);
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  const method = String(req.method || '').toUpperCase();
  if (method === 'OPTIONS') {
    return res.status(204).end();
  }

  const redis = getRedis();
  if (!redis) {
    if (method === 'GET') {
      return res.status(200).json({
        pageViews: null,
        assetsLoaded: null,
        topFormats: [],
        configured: false,
      });
    }
    return res.status(204).end();
  }

  if (method === 'GET') {
    try {
      const counts = await readCounts(redis);
      return res.status(200).json({ ...counts, configured: true });
    } catch (e) {
      console.error('stats read error', e);
      return res.status(503).json({ error: 'Statistics unavailable' });
    }
  }

  if (method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = clientIp(req);
  const limiter = getRatelimit();
  if (limiter) {
    try {
      const hit = await limiter.limit(ip);
      if (!hit.success) {
        const retryAfter = Math.max(1, Math.ceil((hit.reset - Date.now()) / 1000));
        res.setHeader('Retry-After', String(retryAfter));
        return res.status(429).json({ error: 'Too many requests' });
      }
    } catch (e) {
      console.error('stats rate limit error (fail open)', e);
    }
  }

  const body = parseBody(req);
  if (body.honeypot) {
    return res.status(204).end();
  }

  const event = typeof body.event === 'string' ? body.event.trim() : '';
  if (!EVENTS.has(event)) {
    return res.status(400).json({ error: 'Invalid event' });
  }

  try {
    if (event === 'page_view') {
      await redis.incr(REDIS_PAGE_KEY);
      return res.status(204).end();
    }

    await redis.incr(REDIS_ASSET_KEY);
    const format = normalizeFormat(body.format);
    if (format) {
      await redis.hincrby(REDIS_FORMATS_KEY, format, 1);
    }
    return res.status(204).end();
  } catch (e) {
    console.error('stats incr error', e);
    return res.status(503).json({ error: 'Statistics unavailable' });
  }
}
