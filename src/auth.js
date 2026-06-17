const SESSION_COOKIE = 'odogram_session';
const STATE_COOKIE = 'odogram_oauth_state';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const ID_PATTERN = /^[\p{L}\p{N}_-]{2,64}$/u;

export { ID_PATTERN, SESSION_COOKIE };

export function parseCookies(request) {
  const header = request.headers.get('Cookie') || '';
  const cookies = {};
  for (const part of header.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (!rawKey) continue;
    cookies[rawKey] = decodeURIComponent(rest.join('='));
  }
  return cookies;
}

function toBase64Url(bytes) {
  const bin = String.fromCharCode(...bytes);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const bin = atob(padded + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function importKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function signPayload(payload, secret) {
  const key = await importKey(secret);
  const data = new TextEncoder().encode(payload);
  const sig = await crypto.subtle.sign('HMAC', key, data);
  return toBase64Url(new Uint8Array(sig));
}

async function verifyPayload(payload, signature, secret) {
  const key = await importKey(secret);
  const data = new TextEncoder().encode(payload);
  const sigBytes = fromBase64Url(signature);
  return crypto.subtle.verify('HMAC', key, sigBytes, data);
}

function cookieFlags(request) {
  const secure = new URL(request.url).protocol === 'https:';
  return secure ? 'Path=/; HttpOnly; Secure; SameSite=Lax' : 'Path=/; HttpOnly; SameSite=Lax';
}

function sessionKey(sessionId) {
  return `session:${sessionId}`;
}

function randomSessionId() {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function parseSessionCookie(raw) {
  const dot = raw.lastIndexOf('.');
  if (dot === -1) return null;
  return { sessionId: raw.slice(0, dot), sig: raw.slice(dot + 1) };
}

export async function createSessionCookie(session, env, request) {
  const secret = env.SESSION_SECRET;
  if (!secret || !env.SESSIONS) {
    throw new Error('Session storage not configured');
  }

  const sessionId = randomSessionId();
  const exp = Date.now() + SESSION_MAX_AGE * 1000;
  await env.SESSIONS.put(
    sessionKey(sessionId),
    JSON.stringify({
      username: session.username,
      token: session.token,
      avatar: session.avatar || '',
      exp,
    }),
    { expirationTtl: SESSION_MAX_AGE },
  );

  const sig = await signPayload(sessionId, secret);
  const value = `${sessionId}.${sig}`;
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; ${cookieFlags(request)}; Max-Age=${SESSION_MAX_AGE}`;
}

export async function getSession(request, env) {
  const cookies = parseCookies(request);
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return null;

  const secret = env.SESSION_SECRET;
  if (!secret || !env.SESSIONS) return null;

  const parsed = parseSessionCookie(raw);
  if (!parsed) return null;

  const valid = await verifyPayload(parsed.sessionId, parsed.sig, secret);
  if (!valid) return null;

  const data = await env.SESSIONS.get(sessionKey(parsed.sessionId));
  if (!data) return null;

  try {
    const session = JSON.parse(data);
    if (!session.username || !session.token || !session.exp) return null;
    if (Date.now() > session.exp) {
      await env.SESSIONS.delete(sessionKey(parsed.sessionId));
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function clearSessionCookie(request) {
  return `${SESSION_COOKIE}=; ${cookieFlags(request)}; Max-Age=0`;
}

async function deleteSessionFromCookie(raw, env) {
  if (!raw || !env.SESSIONS) return;
  const parsed = parseSessionCookie(raw);
  if (!parsed) return;
  await env.SESSIONS.delete(sessionKey(parsed.sessionId));
}

function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return toBase64Url(bytes);
}

function getOrigin(request, env) {
  const configured = env.APP_URL?.trim().replace(/\/$/, '');
  if (configured) return configured;
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export function handleLogin(request, env) {
  const clientId = env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return new Response('GITHUB_CLIENT_ID not configured', { status: 500 });
  }

  const state = randomState();
  const redirectUri = `${getOrigin(request, env)}/auth/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'public_repo',
    state,
  });

  const headers = new Headers({
    Location: `https://github.com/login/oauth/authorize?${params}`,
  });
  const flags = cookieFlags(request);
  headers.append(
    'Set-Cookie',
    `${STATE_COOKIE}=${encodeURIComponent(state)}; ${flags}; Max-Age=600`,
  );
  return new Response(null, { status: 302, headers });
}

export async function handleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookies = parseCookies(request);
  const savedState = cookies[STATE_COOKIE];

  const headers = new Headers({ Location: '/' });
  headers.append('Set-Cookie', `${STATE_COOKIE}=; ${cookieFlags(request)}; Max-Age=0`);

  if (!code || !state || !savedState || state !== savedState) {
    headers.set('Location', '/?error=oauth_state');
    return new Response(null, { status: 302, headers });
  }

  const clientId = env.GITHUB_CLIENT_ID;
  const clientSecret = env.GITHUB_CLIENT_SECRET;
  const sessionSecret = env.SESSION_SECRET;
  if (!clientId || !clientSecret || !sessionSecret) {
    headers.set('Location', '/?error=oauth_config');
    return new Response(null, { status: 302, headers });
  }

  const redirectUri = `${getOrigin(request, env)}/auth/callback`;
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    headers.set('Location', '/?error=oauth_token');
    return new Response(null, { status: 302, headers });
  }

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    headers.set('Location', '/?error=oauth_token');
    return new Response(null, { status: 302, headers });
  }

  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'odogram',
    },
  });

  if (!userRes.ok) {
    headers.set('Location', '/?error=oauth_user');
    return new Response(null, { status: 302, headers });
  }

  const user = await userRes.json();
  try {
    const sessionCookie = await createSessionCookie(
      {
        username: user.login,
        token: tokenData.access_token,
        avatar: user.avatar_url,
      },
      env,
      request,
    );
    headers.append('Set-Cookie', sessionCookie);
  } catch {
    headers.set('Location', '/?error=oauth_config');
    return new Response(null, { status: 302, headers });
  }

  return new Response(null, { status: 302, headers });
}

export async function handleLogout(request, env) {
  const cookies = parseCookies(request);
  await deleteSessionFromCookie(cookies[SESSION_COOKIE], env);

  const headers = new Headers({
    Location: '/',
    'Set-Cookie': clearSessionCookie(request),
  });
  return new Response(null, { status: 302, headers });
}

export async function handleMe(request, env) {
  const session = await getSession(request, env);
  if (!session) {
    return Response.json({ login: false });
  }
  return Response.json({
    login: true,
    username: session.username,
    avatar: session.avatar,
  });
}

export function requireSession(session) {
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
