/**
 * @module lib/auth
 * @description OAuth token management for OpenAI Codex provider.
 *
 * Implements the OAuth 2.0 Device Authorization Grant flow:
 * 1. Request device code from OpenAI
 * 2. User visits URL and enters code in browser
 * 3. Poll for authorization
 * 4. Exchange for access + refresh tokens
 * 5. Auto-refresh when access_token expires
 *
 * Tokens are persisted in ~/.anya/auth.json with file permissions 0o600.
 *
 * @see https://auth.openai.com/codex/device
 */

import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { AUTH_PATH } from './paths.js';
import { agentLogger } from './logger.js';

// ── Constants ────────────────────────────────────────────────────────────────

/** OpenAI OAuth client ID (same as Codex CLI) */
const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';

/** OpenAI OAuth token endpoint */
const CODEX_TOKEN_URL = 'https://auth.openai.com/oauth/token';

/** OpenAI device code endpoint */
const CODEX_DEVICE_URL = 'https://auth.openai.com/api/accounts/deviceauth/usercode';

/** OpenAI device code polling endpoint */
const CODEX_POLL_URL = 'https://auth.openai.com/api/accounts/deviceauth/token';

// ── Auth Store ───────────────────────────────────────────────────────────────

interface AuthStore {
  openai?: {
    tokens: {
      access_token: string;
      refresh_token: string;
    };
    last_refresh: string;
    source: string;
  };
}

/**
 * Load the auth store from disk.
 * @returns Parsed auth store, or empty object if missing/corrupt.
 */
function loadAuthStore(): AuthStore {
  if (!existsSync(AUTH_PATH)) return {};
  try {
    return JSON.parse(readFileSync(AUTH_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * Save the auth store to disk with restricted permissions.
 */
function saveAuthStore(store: AuthStore): void {
  writeFileSync(AUTH_PATH, JSON.stringify(store, null, 2) + '\n', 'utf-8');
  try {
    chmodSync(AUTH_PATH, 0o600);
  } catch {
    // Non-critical on some systems
  }
}

// ── Device Code Login ────────────────────────────────────────────────────────

/**
 * Run the OpenAI device code login flow (interactive CLI).
 *
 * 1. Requests a device code from OpenAI
 * 2. Displays the URL and code for the user to enter in their browser
 * 3. Polls until the user completes authentication
 * 4. Exchanges the authorization code for tokens
 * 5. Saves tokens to auth.json
 *
 * @throws Error if any step fails or times out.
 */
export async function codexDeviceLogin(): Promise<void> {
  // Step 1: Request device code
  const deviceResp = await fetch(CODEX_DEVICE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CODEX_CLIENT_ID }),
  });

  if (!deviceResp.ok) {
    throw new Error(`Device code request failed (${deviceResp.status})`);
  }

  const deviceData = await deviceResp.json() as {
    user_code: string;
    device_auth_id: string;
    interval?: number;
  };

  const { user_code, device_auth_id } = deviceData;
  const pollInterval = Math.max(3, deviceData.interval || 5);

  if (!user_code || !device_auth_id) {
    throw new Error('Device code response missing required fields');
  }

  // Step 2: Display to user
  console.log('\n  To sign in with OpenAI:\n');
  console.log('  1. Open this URL in your browser:');
  console.log(`     \x1b[94mhttps://auth.openai.com/codex/device\x1b[0m\n`);
  console.log('  2. Enter this code:');
  console.log(`     \x1b[94m${user_code}\x1b[0m\n`);
  console.log('  Waiting for sign-in... (press Ctrl+C to cancel)');

  // Step 3: Poll for authorization
  const maxWait = 15 * 60 * 1000; // 15 minutes
  const start = Date.now();
  let codeResp: { authorization_code: string; code_verifier: string } | null = null;

  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, pollInterval * 1000));

    const pollResp = await fetch(CODEX_POLL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_auth_id, user_code }),
    });

    if (pollResp.status === 200) {
      codeResp = await pollResp.json() as typeof codeResp;
      break;
    } else if (pollResp.status === 403 || pollResp.status === 404) {
      continue; // User hasn't completed login yet
    } else {
      throw new Error(`Device auth polling returned status ${pollResp.status}`);
    }
  }

  if (!codeResp) {
    throw new Error('Login timed out after 15 minutes');
  }

  // Step 4: Exchange authorization code for tokens
  const { authorization_code, code_verifier } = codeResp;

  if (!authorization_code || !code_verifier) {
    throw new Error('Device auth response missing authorization_code or code_verifier');
  }

  const tokenResp = await fetch(CODEX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: authorization_code,
      redirect_uri: 'https://auth.openai.com/deviceauth/callback',
      client_id: CODEX_CLIENT_ID,
      code_verifier,
    }),
  });

  if (!tokenResp.ok) {
    throw new Error(`Token exchange failed (${tokenResp.status})`);
  }

  const tokens = await tokenResp.json() as {
    access_token: string;
    refresh_token: string;
  };

  if (!tokens.access_token) {
    throw new Error('Token exchange did not return an access_token');
  }

  // Step 5: Save tokens
  const store = loadAuthStore();
  store.openai = {
    tokens: {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || '',
    },
    last_refresh: new Date().toISOString(),
    source: 'device-code',
  };
  saveAuthStore(store);

  console.log('  \x1b[32m✓\x1b[0m Authenticated successfully!\n');
}

// ── Token Access ─────────────────────────────────────────────────────────────

/**
 * Get the stored OpenAI access token.
 *
 * Simply returns the token from auth.json.
 * If the token is expired, the provider handles it:
 * 401 → forceRefreshCodexToken() → retry.
 *
 * @returns The stored access_token string.
 * @throws Error if no tokens are stored.
 */
export function getCodexAccessToken(): string {
  const store = loadAuthStore();

  if (!store.openai?.tokens?.access_token) {
    throw new Error(
      'No OpenAI credentials found. Run "anya model" to authenticate.'
    );
  }

  return store.openai.tokens.access_token;
}

/**
 * Refresh the OpenAI access_token using the refresh_token.
 * Saves the new token pair to auth.json.
 *
 * @returns The new access_token.
 */
async function refreshCodexToken(refreshToken: string): Promise<string> {
  const resp = await fetch(CODEX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CODEX_CLIENT_ID,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Token refresh failed (${resp.status}): ${body}`);
  }

  const data = await resp.json() as {
    access_token: string;
    refresh_token?: string;
  };

  if (!data.access_token) {
    throw new Error('Token refresh did not return an access_token');
  }

  // Save updated tokens
  const store = loadAuthStore();
  store.openai = {
    tokens: {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken, // OpenAI may rotate refresh tokens
    },
    last_refresh: new Date().toISOString(),
    source: store.openai?.source || 'device-code',
  };
  saveAuthStore(store);

  agentLogger.info({ msg: 'codex_token_refreshed' });

  return data.access_token;
}

/**
 * Force-refresh the access token (called on 401 errors).
 * Bypasses the time-based check — always refreshes.
 *
 * @returns The new access_token.
 * @throws Error if no refresh_token or refresh fails.
 */
export async function forceRefreshCodexToken(): Promise<string> {
  const store = loadAuthStore();
  const refreshToken = store.openai?.tokens?.refresh_token;

  if (!refreshToken) {
    throw new Error('No refresh_token available. Run "anya model" to re-authenticate.');
  }

  agentLogger.info({ msg: 'codex_force_refresh', reason: '401' });
  return refreshCodexToken(refreshToken);
}

/**
 * Check if OpenAI auth tokens exist.
 */
export function hasCodexAuth(): boolean {
  const store = loadAuthStore();
  return !!(store.openai?.tokens?.access_token);
}
