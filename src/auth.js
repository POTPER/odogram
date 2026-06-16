const SESSION_COOKIE = 'odogram_session';
const STATE_COOKIE = 'odogram_oauth_state';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const ID_PATTERN = /^[a-zA-Z0-9_-]{3,64}$/;

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

export async function createSessionCookie(session, secret, request) {
  const payload = JSON.stringify({
    username: session.username,
    token: session.token,
    avatar: session.avatar || '',
    exp: Date.now() + SESSION_MAX_AGE * 1000,
  });
  const encoded = toBase64Url(new TextEncoder().encode(payload));
  const sig = await signPayload(encoded, secret);
  const value = `${encoded}.${sig}`;
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; ${cookieFlags(request)}; Max-Age=${SESSION_MAX_AGE}`;
}

export async function getSession(request, env) {
  const cookies = parseCookies(request);
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return null;

  const secret = env.SESSION_SECRET;
  if (!secret) return null;

  const dot = raw.lastIndexOf('.');
  if (dot === -1) return null;

  const encoded = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const valid = await verifyPayload(encoded, sig, secret);
  if (!valid) return null;

  try {
    const json = new TextDecoder().decode(fromBase64Url(encoded));
    const session = JSON.parse(json);
    if (!session.username || !session.token || !session.exp) return null;
    if (Date.now() > session.exp) return null;
    return session;
  } catch {
    return null;
  }
}

export function clearSessionCookie(request) {
  return `${SESSION_COOKIE}=; ${cookieFlags(request)}; Max-Age=0`;
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
    scope: 'repo',
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
  const sessionCookie = await createSessionCookie(
    {
      username: user.login,
      token: tokenData.access_token,
      avatar: user.avatar_url,
    },
    sessionSecret,
    request,
  );
  headers.append('Set-Cookie', sessionCookie);
  return new Response(null, { status: 302, headers });
}

export function handleLogout(request) {
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
