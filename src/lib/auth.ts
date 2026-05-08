/**
 * @module lib/auth
 * @description OAuth token management for the OpenAI Codex provider.
 *
 * Implements the OAuth 2.0 Device Authorization Grant flow:
 * 1. Request device code from OpenAI
 * 2. User visits the authorization URL and enters the code in a browser
 * 3. Poll the token endpoint for authorization confirmation
 * 4. Exchange the confirmation for access and refresh tokens
 * 5. Automatically refresh the tokens when the `access_token` expires
 *
 * Tokens are securely persisted in `~/.anya/auth.json` with restricted
 * file permissions (`0o600`).
 *
 * @see https://auth.openai.com/codex/device
 */

import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { AUTH_PATH } from './paths.js';
import { agentLogger } from './logger.js';

// ── Constants ────────────────────────────────────────────────────────────────

/** OpenAI OAuth client ID (matches Codex CLI client ID) */
const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';

/** OpenAI OAuth token exchange and refresh endpoint */
const CODEX_TOKEN_URL = 'https://auth.openai.com/oauth/token';

/** OpenAI device code request endpoint */
const CODEX_DEVICE_URL = 'https://auth.openai.com/api/accounts/deviceauth/usercode';

/** OpenAI device authorization polling endpoint */
const CODEX_POLL_URL = 'https://auth.openai.com/api/accounts/deviceauth/token';

// ── Auth Store ───────────────────────────────────────────────────────────────

/**
 * Represents the structure of the serialized authentication store (`auth.json`).
 */
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
 * Loads and parses the authentication store from the local filesystem.
 *
 * @returns {AuthStore} The parsed authentication store, or an empty object if missing/invalid.
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
 * Serializes and saves the authentication store to the local filesystem.
 * Enforces restricted `0o600` permissions for security.
 *
 * @param {AuthStore} store - The authentication state to persist.
 */
function saveAuthStore(store: AuthStore): void {
  writeFileSync(AUTH_PATH, JSON.stringify(store, null, 2) + '\n', 'utf-8');
  try {
    chmodSync(AUTH_PATH, 0o600);
  } catch {
    // Permission modification may fail on certain environments (e.g., Windows), treat as non-critical
  }
}

// ── Device Code Login ────────────────────────────────────────────────────────

/**
 * Executes the interactive OpenAI device code login flow via the CLI.
 *
 * This process involves:
 * 1. Requesting a device code from OpenAI.
 * 2. Prompting the user to complete authentication via a provided URL and code.
 * 3. Polling the authorization endpoint until user action is detected.
 * 4. Exchanging the final authorization code for access and refresh tokens.
 * 5. Persisting the tokens securely to `auth.json`.
 *
 * @throws {Error} If any step in the authentication flow fails or times out.
 */
export async function codexDeviceLogin(): Promise<void> {
  // Step 1: Request device code from authorization server
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

  // Step 2: Display instructions to the user
  console.log('\n  To sign in with OpenAI:\n');
  console.log('  1. Open this URL in your browser:');
  console.log(`     \x1b[94mhttps://auth.openai.com/codex/device\x1b[0m\n`);
  console.log('  2. Enter this code:');
  console.log(`     \x1b[94m${user_code}\x1b[0m\n`);
  console.log('  Waiting for sign-in... (press Ctrl+C to cancel)');

  // Step 3: Poll the server for user authorization
  const maxWait = 15 * 60 * 1000; // 15 minutes maximum polling duration
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
      continue; // User has not completed the flow yet
    } else {
      throw new Error(`Device auth polling returned status ${pollResp.status}`);
    }
  }

  if (!codeResp) {
    throw new Error('Login timed out after 15 minutes');
  }

  // Step 4: Exchange the authorization code for final tokens
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

  // Step 5: Save tokens to the secure store
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
 * Retrieves the currently stored OpenAI access token.
 *
 * Token expiration is not validated locally; the downstream provider logic
 * intercepts HTTP 401 Unauthorized responses and orchestrates forced refreshes
 * via `forceRefreshCodexToken()`.
 *
 * @returns {string} The stored `access_token`.
 * @throws {Error} If no valid tokens are located in the auth store.
 */
export function getCodexAccessToken(): string {
  const store = loadAuthStore();

  if (!store.openai?.tokens?.access_token) {
    throw new Error(
      'No OpenAI credentials found. Run "anya config" → LLM to authenticate.'
    );
  }

  return store.openai.tokens.access_token;
}

/**
 * Refreshes the active OpenAI `access_token` utilizing the stored `refresh_token`.
 * Transparently saves the new token pair back to the store.
 *
 * @param {string} refreshToken - The active refresh token.
 * @returns {Promise<string>} The newly issued `access_token`.
 * @throws {Error} If the refresh endpoint rejects the request.
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

  // Persist updated token pair
  const store = loadAuthStore();
  store.openai = {
    tokens: {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken, // Retain existing if a new refresh token is not rotated
    },
    last_refresh: new Date().toISOString(),
    source: store.openai?.source || 'device-code',
  };
  saveAuthStore(store);

  agentLogger.info({ msg: 'codex_token_refreshed' });

  return data.access_token;
}

/**
 * Forcibly refreshes the access token, bypassing time-based validity checks.
 * Primarily invoked by provider implementations upon receiving HTTP 401 responses.
 *
 * @returns {Promise<string>} The newly issued `access_token`.
 * @throws {Error} If no `refresh_token` exists, or the refresh operation fails.
 */
export async function forceRefreshCodexToken(): Promise<string> {
  const store = loadAuthStore();
  const refreshToken = store.openai?.tokens?.refresh_token;

  if (!refreshToken) {
    throw new Error('No refresh_token available. Run "anya config" → LLM to re-authenticate.');
  }

  agentLogger.info({ msg: 'codex_force_refresh', reason: '401' });
  return refreshCodexToken(refreshToken);
}

/**
 * Verifies if OpenAI authentication credentials (access tokens) are currently configured.
 *
 * @returns {boolean} True if an access token is present in the store.
 */
export function hasCodexAuth(): boolean {
  const store = loadAuthStore();
  return !!(store.openai?.tokens?.access_token);
}
