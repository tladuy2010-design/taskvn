const buckets = new Map();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const headers = securityHeaders(env);

    if (request.method === 'OPTIONS') {
      return new Response('', { status: 204, headers });
    }

    // Cloudflare absorbs volumetric DDoS at the edge. This application-layer
    // limiter is an additional best-effort guard for API abuse.
    if (url.pathname.startsWith('/api/')) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      if (!allow(ip)) return json({ ok: false, error: 'RATE_LIMITED' }, 429, headers);
    }

    try {
      if (url.pathname.startsWith('/api/')) {
        const response = await api(request, env, url);
        for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
        return response;
      }

      // Serve the entire TASKVN frontend from the same Cloudflare Worker.
      return env.ASSETS.fetch(request);
    } catch (e) {
      return json({ ok: false, error: 'SERVER_ERROR' }, 500, headers);
    }
  }
};

function allow(ip) {
  const now = Date.now();
  const old = buckets.get(ip);
  if (!old || now - old.start >= WINDOW_MS) {
    buckets.set(ip, { start: now, count: 1 });
    return true;
  }
  old.count += 1;
  return old.count <= MAX_REQUESTS;
}

async function api(request, env, url) {
  if (url.pathname === '/api/health') return json({ ok: true, service: 'TASKVN', edge: 'cloudflare' });

  if (url.pathname === '/api/verify-destination') {
    if (request.method !== 'POST') return json({ status: 'error' }, 405);
    const { claim_id } = await safeJson(request);
    if (!claim_id || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
      return json({ status: 'invalid' }, 400);

    const c = await supabaseGet(env, `task_claims?select=id,status,risk_score&id=eq.${encodeURIComponent(claim_id)}&limit=1`);
    const claim = c?.[0];
    if (!claim) return json({ status: 'invalid', message: 'Không tìm thấy claim' }, 404);
    if (claim.status === 'paid') return json({ status: 'paid' });
    if (claim.status === 'manual_review') return json({ status: 'manual_review' });
    if (claim.status === 'verified') {
      const paid = await supabaseRpc(env, 'pay_verified_claim_now', { p_claim_id: claim.id });
      return json({ status: paid === true ? 'paid' : 'manual_review' });
    }
    return json({ status: 'pending', message: 'Chưa nhận được xác nhận từ nguồn nhiệm vụ.' });
  }

  if (url.pathname === '/api/payment/create') {
    if (request.method !== 'POST') return json({ error: 'POST required' }, 405);
    const body = await safeJson(request);
    const amount = Number(body?.amount);
    if (!Number.isInteger(amount) || amount < 10000 || amount > 50000000)
      return json({ error: 'Số tiền không hợp lệ' }, 400);
    return json({ ok: true, payment_id: 'PAY-' + crypto.randomUUID(), status: 'pending' });
  }

  if (url.pathname === '/api/card/orders') {
    if (request.method !== 'POST') return json({ error: 'POST required' }, 405);
    const body = await safeJson(request);
    const type = String(body?.card_type || '');
    const amount = Number(body?.amount);
    const types = ['viettel', 'vinaphone', 'mobifone', 'garena'];
    const values = [10000, 20000, 50000, 100000, 200000, 500000];
    if (!types.includes(type) || !values.includes(amount)) return json({ error: 'Loại/mệnh giá không hợp lệ' }, 400);
    return json({ ok: true, order_id: 'CARD-' + crypto.randomUUID(), status: 'pending' });
  }

  return json({ ok: false, error: 'NOT_FOUND' }, 404);
}

async function safeJson(request) {
  try { return await request.json(); } catch { return {}; }
}

async function supabaseGet(env, path) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
  });
  if (!r.ok) throw new Error('db');
  return r.json();
}

async function supabaseRpc(env, fn, body) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error('rpc');
  return r.json();
}

function securityHeaders(env) {
  const origin = env.ALLOWED_ORIGIN || '*';
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'Content-Type,Authorization,X-TaskVN-Signature',
    'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co https://*.firebaseio.com https://*.googleapis.com https://www.gstatic.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'cache-control': 'no-store'
  };
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers }
  });
}
