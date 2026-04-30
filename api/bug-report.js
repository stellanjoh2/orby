/**
 * Vercel serverless: POST JSON { subject, category, message, honeypot? }
 *
 * Env (Vercel → Settings → Environment Variables):
 *   RESEND_API_KEY       — from resend.com
 *   BUG_REPORT_TO        — your private inbox
 *   RESEND_FROM          — e.g. "Orby <onboarding@resend.dev>" (test) or a verified domain sender
 *   BUG_REPORT_ALLOWED_ORIGINS — optional, comma list (e.g. https://orby.studio,http://localhost:3000).
 *                                If unset, only the request Origin that matches /^https?:\\/\\// is echoed (permissive).
 */

const RESEND_URL = 'https://api.resend.com/emails';
const CATEGORIES = new Set([
  'crash',
  'rendering',
  'ui',
  'export',
  'performance',
  'other',
]);

function corsHeaders(origin) {
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
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function clampStr(s, max) {
  if (typeof s !== 'string') return '';
  const t = s.trim().slice(0, max);
  return t.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  const headers = corsHeaders(origin);
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.RESEND_API_KEY;
  const to = process.env.BUG_REPORT_TO;
  const from = process.env.RESEND_FROM;
  if (!key || !to || !from) {
    return res.status(503).json({ error: 'Bug reporting is not configured' });
  }

  const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
  if (body.honeypot) {
    return res.status(204).end();
  }

  const subject = clampStr(body.subject, 180);
  const category = clampStr(body.category, 40);
  const message = clampStr(body.message, 8000);

  if (!subject || !CATEGORIES.has(category) || message.length < 8) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : '';
  const text = [
    `Category: ${category}`,
    '',
    message,
    '',
    '---',
    `User-Agent: ${ua}`,
    `Time: ${new Date().toISOString()}`,
  ].join('\n');

  const emailSubject = `[Orby bug] ${category} — ${subject}`;

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
  } catch {
    return res.status(502).json({ error: 'Email send failed' });
  }

  if (!resendRes.ok) {
    const errText = await resendRes.text().catch(() => '');
    console.error('Resend error', resendRes.status, errText);
    return res.status(502).json({ error: 'Email send failed' });
  }

  return res.status(200).json({ ok: true });
}
