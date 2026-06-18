import {
  getSession,
  handleCallback,
  handleLogin,
  handleLogout,
  handleMe,
} from './auth.js';
import { migrateIfNeeded } from './migrate.js';
import {
  handleDelete,
  handleList,
  handleLoad,
  handleMove,
  handleRename,
  handleSave,
  handleView,
} from './api-handlers.js';

export default {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === '/auth/login' && request.method === 'GET') {
      return handleLogin(request, env);
    }

    if (pathname === '/auth/callback' && request.method === 'GET') {
      return handleCallback(request, env);
    }

    if (pathname === '/auth/logout' && request.method === 'GET') {
      return handleLogout(request, env);
    }

    if (pathname === '/auth/me' && request.method === 'GET') {
      const meSession = await getSession(request, env);
      const meResponse = await handleMe(request, env);
      if (meSession) {
        try {
          await migrateIfNeeded(meSession, env.SESSIONS);
        } catch (err) {
          console.error('migrateIfNeeded failed:', err);
        }
      }
      return meResponse;
    }

    const session = await getSession(request, env);

    if (pathname === '/api/save' && request.method === 'POST') {
      return handleSave(request, env, session);
    }

    if (pathname === '/api/load' && request.method === 'GET') {
      return handleLoad(request, env, session);
    }

    if (pathname === '/api/list' && request.method === 'GET') {
      return handleList(request, env, session);
    }

    if (pathname === '/api/rename' && request.method === 'POST') {
      return handleRename(request, env, session);
    }

    if (pathname === '/api/delete' && request.method === 'POST') {
      return handleDelete(request, env, session);
    }

    if (pathname === '/api/move' && request.method === 'POST') {
      return handleMove(request, env, session);
    }

    if (pathname.startsWith('/view/') && request.method === 'GET') {
      return handleView(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
