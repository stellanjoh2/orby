/**
 * Vercel serverless: POST JSON { category, severity, message, honeypot?, turnstileToken? }
 * Email subject line is short: "Orby Issue - Moderate - Rendering" (severity + category labels).
 *
 * CORS: If orby.studio (or another origin) gets preflight errors on preview URLs,
 * open Vercel → Project → Settings → Deployment Protection → OPTIONS Allowlist
 * and add path `/api` (or `/api/bug-report`). Protection can block OPTIONS before
 * this handler runs, which yields "No Access-Control-Allow-Origin" in the browser.
 *
 * Env (Vercel → Settings → Environment Variables):
 *   RESEND_API_KEY       — from resend.com
 *   BUG_REPORT_TO        — recipient inbox (e.g. orby-admin@proton.me); must match Vercel env in production
 *   RESEND_FROM          — e.g. "Orby <onboarding@resend.dev>" (test) or a verified domain sender
 *   BUG_REPORT_ALLOWED_ORIGINS — optional, comma list (e.g. https://orby.studio,http://localhost:3000).
 *                                If unset, only the request Origin that matches /^https?:\\/\\// is echoed (permissive).
 *
 * Abuse protection (recommended for production):
 *   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN — from upstash.com; per-IP sliding windows: 1 req/min, 4 req/h.
 *   TURNSTILE_SECRET_KEY — Cloudflare Turnstile secret; requires site key in built HTML (orby-turnstile-site-key meta).
 *                          When set, turnstileToken is required and verified. When unset, captcha is skipped.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const RESEND_URL = 'https://api.resend.com/emails';
const TURNSTILE_VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const CATEGORIES = new Set([
  'crash',
  'rendering',
  'loaded-mesh-materials',
  'ui',
  'export',
  'performance',
  'other',
]);

/** Serious → low; must match bug modal option values */
const SEVERITIES = new Set(['blocker', 'major', 'moderate', 'minor', 'cosmetic']);

/** Must match bug modal category values → short inbox labels */
const CATEGORY_LABELS = {
  crash: 'Crash',
  rendering: 'Rendering',
  'loaded-mesh-materials': 'Mesh / materials',
  ui: 'UI',
  export: 'Export',
  performance: 'Performance',
  other: 'Other',
};

/** Must match bug modal severity values */
const SEVERITY_LABELS = {
  blocker: 'Blocker',
  major: 'Major',
  moderate: 'Moderate',
  minor: 'Minor',
  cosmetic: 'Low',
};

/** Matches client BugReportController (`MIN_BUG_MESSAGE_*` + word split) */
const MIN_BUG_MESSAGE_CHARS = 50;
const MIN_BUG_MESSAGE_WORDS = 10;

function isValidBugReportMessageBody(message) {
  if (typeof message !== 'string') return false;
  const t = message.trim();
  if (t.length < MIN_BUG_MESSAGE_CHARS) return false;
  const words = t.split(/\s+/).filter(Boolean).length;
  return words >= MIN_BUG_MESSAGE_WORDS;
}

/** @type {{ hourly: import('@upstash/ratelimit').Ratelimit; burst: import('@upstash/ratelimit').Ratelimit } | null | false} */
let ratelimitPair;

function getRateLimiters() {
  if (ratelimitPair === false) return null;
  if (ratelimitPair) return ratelimitPair;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url?.trim() || !token?.trim()) {
    ratelimitPair = false;
    return null;
  }
  const redis = new Redis({ url: url.trim(), token: token.trim() });
  ratelimitPair = {
    hourly: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(4, '1 h'),
      prefix: 'orby-bug:h',
    }),
    burst: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(1, '1 m'),
      prefix: 'orby-bug:m',
    }),
  };
  return ratelimitPair;
}

function corsHeaders(origin, req) {
  const allow =
    process.env.BUG_REPORT_ALLOWED_ORIGINS?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ?? null;
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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': allowHeaders,
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function clampStr(s, max) {
  if (typeof s !== 'string') return '';
  const t = s.trim().slice(0, max);
  return t.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

/** Best-effort parse of Resend JSON error body for operator-visible detail */
function parseResendErrorDetail(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  try {
    const j = JSON.parse(raw);
    if (typeof j.message === 'string') return j.message.slice(0, 500);
    if (typeof j.error === 'string') return j.error.slice(0, 500);
    if (j.error && typeof j.error.message === 'string') return j.error.message.slice(0, 500);
    const first = Array.isArray(j.errors) ? j.errors[0] : null;
    if (first && typeof first.message === 'string') return first.message.slice(0, 500);
  } catch {
    /* ignore */
  }
  return raw.trim().slice(0, 500);
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

/**
 * @param {string} token
 * @param {string} secret
 * @param {string} ip
 */
async function verifyTurnstile(token, secret, ip) {
  const body = new URLSearchParams();
  body.set('secret', secret);
  body.set('response', token);
  if (ip && ip !== 'unknown') body.set('remoteip', ip);

  let res;
  try {
    res = await fetch(TURNSTILE_VERIFY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return false;
  }
  if (!res.ok) return false;
  const data = await res.json().catch(() => null);
  return data?.success === true;
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  const headers = corsHeaders(origin, req);
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  const method = String(req.method || '').toUpperCase();
  if (method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.RESEND_API_KEY?.trim();
  const to = process.env.BUG_REPORT_TO?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!key || !to || !from) {
    return res.status(503).json({ error: 'Issue reporting is not configured' });
  }

  const ip = clientIp(req);
  const limiters = getRateLimiters();
  if (limiters) {
    try {
      const [h, b] = await Promise.all([limiters.hourly.limit(ip), limiters.burst.limit(ip)]);
      const hit = !h.success ? h : !b.success ? b : null;
      if (hit) {
        const retryAfter = Math.max(1, Math.ceil((hit.reset - Date.now()) / 1000));
        res.setHeader('Retry-After', String(retryAfter));
        return res.status(429).json({
          error: 'Too many reports from this network. Try again later.',
          retryAfter,
        });
      }
    } catch (e) {
      console.error('bug-report rate limit error (fail open)', e);
    }
  }

  let body =
    typeof req.body === 'object' && req.body !== null && !Array.isArray(req.body)
      ? req.body
      : {};
  if (typeof req.body === 'string' && req.body.trim() !== '') {
    try {
      const parsed = JSON.parse(req.body);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed;
    } catch {
      /* ignore */
    }
  }
  if (body.honeypot) {
    return res.status(204).end();
  }

  const category = clampStr(body.category, 40);
  const severity = clampStr(body.severity, 24);
  const message = clampStr(body.message, 8000);

  if (!CATEGORIES.has(category) || !SEVERITIES.has(severity) || !isValidBugReportMessageBody(message)) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const catLabel = CATEGORY_LABELS[category] ?? category;
  const sevLabel = SEVERITY_LABELS[severity] ?? severity;

  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (turnstileSecret) {
    const token = typeof body.turnstileToken === 'string' ? body.turnstileToken.trim() : '';
    if (!token) {
      return res.status(400).json({ error: 'Security check required', code: 'turnstile_required' });
    }
    const ok = await verifyTurnstile(token, turnstileSecret, ip);
    if (!ok) {
      return res.status(400).json({ error: 'Security check failed', code: 'turnstile_failed' });
    }
  }

  const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : '';
  const text = [
    `Severity: ${sevLabel}`,
    `Category: ${catLabel}`,
    '',
    message,
    '',
    '---',
    `User-Agent: ${ua}`,
    `Time: ${new Date().toISOString()}`,
  ].join('\n');

  const emailSubject = `Orby Issue - ${sevLabel} - ${catLabel}`;

  let resendRes;
  try {
    resendRes = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: emailSubject,
        text,
      }),
    });
  } catch (e) {
    console.error('Resend fetch error', e);
    return res.status(502).json({ error: 'Email send failed', detail: 'Could not reach email provider.' });
  }

  if (!resendRes.ok) {
    const errText = await resendRes.text().catch(() => '');
    console.error('Resend error', resendRes.status, errText);
    const parsed = parseResendErrorDetail(errText);
    const detail = parsed || `Resend HTTP ${resendRes.status} (see Vercel logs for body)`;
    return res.status(502).json({
      error: 'Email send failed',
      detail,
    });
  }

  return res.status(200).json({ ok: true });
}
