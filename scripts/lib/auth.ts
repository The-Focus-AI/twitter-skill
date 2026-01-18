/**
 * Twitter OAuth 2.0 PKCE Authentication
 *
 * Token storage: .claude/twitter-skill.local.json (project-local)
 * Credentials: embedded or ~/.config/twitter-skill/credentials.json
 */

import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import http from "node:http";
import crypto from "node:crypto";
import open from "open";

// ============================================================================
// Configuration
// ============================================================================

// Embedded OAuth credentials - shared across all users of this skill
// These are for a "Web App" OAuth client in the Focus.AI Twitter Developer Portal
const EMBEDDED_CLIENT_ID = "SzBqQmhsWTdPWVhpdUhraGh4X1U6MTpjaQ";
const EMBEDDED_CLIENT_SECRET = "tqg9wXfKg7CXmUz0VlJhxDG_jKwafnLAI6X-6_0W6Mxzr5fQTz";

// Global config for OAuth client credentials (same across all projects)
export function getGlobalConfigDir(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(xdgConfig, "twitter-skill");
}

export const GLOBAL_CONFIG_DIR = getGlobalConfigDir();
export const CREDENTIALS_PATH = path.join(GLOBAL_CONFIG_DIR, "credentials.json");

// Project-local token storage (different Twitter account per project)
const PROJECT_TOKEN_DIR = ".claude";
const PROJECT_TOKEN_FILE = "twitter-skill.local.json";

export function getProjectTokenPath(): string {
  return path.join(process.cwd(), PROJECT_TOKEN_DIR, PROJECT_TOKEN_FILE);
}

// OAuth endpoints
const TWITTER_AUTH_URL = "https://twitter.com/i/oauth2/authorize";
const TWITTER_TOKEN_URL = "https://api.twitter.com/2/oauth2/token";

// CRITICAL: Must use 127.0.0.1, NOT localhost - Twitter rejects localhost
const CALLBACK_URL = "http://127.0.0.1:3000/callback";
const PORT = 3000;

// OAuth scopes - offline.access is CRITICAL for refresh tokens
export const SCOPES = [
  "tweet.read",
  "tweet.write",
  "users.read",
  "list.read",
  "list.write",
  "like.read",
  "like.write",
  "offline.access",
].join(" ");

// ============================================================================
// Setup Instructions
// ============================================================================

export const SETUP_INSTRUCTIONS = `
═══════════════════════════════════════════════════════════════════════════════
                       TWITTER SKILL - FIRST TIME SETUP
═══════════════════════════════════════════════════════════════════════════════

This skill needs Twitter OAuth credentials to access the Twitter API.

CREDENTIALS (optional - embedded credentials work for most users):
  ${CREDENTIALS_PATH}

TOKENS (per-project, stores which Twitter account to use):
  .claude/twitter-skill.local.json (in your project directory)

STEP 1: Create a Twitter Developer App (if using your own credentials)
──────────────────────────────────────────────────────────────────────
1. Go to: https://developer.twitter.com/en/portal/dashboard
2. Create a new project and app
3. In "User authentication settings":
   - App type: "Web App, Automated App or Bot"
   - App permissions: "Read and Write"
   - Callback URI: http://127.0.0.1:3000/callback
   - Website URL: http://127.0.0.1:3000

STEP 2: Save Credentials (optional)
────────────────────────────────────
Create ${CREDENTIALS_PATH}:
{
  "client_id": "YOUR_CLIENT_ID",
  "client_secret": "YOUR_CLIENT_SECRET"
}

STEP 3: Authenticate
────────────────────
Run: pnpm tsx scripts/twitter.ts auth

This will open a browser to authenticate with Twitter. The token will be saved
to your project's .claude/ directory.

═══════════════════════════════════════════════════════════════════════════════
`;

// ============================================================================
// Types
// ============================================================================

interface Credentials {
  client_id: string;
  client_secret: string;
}

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string;
  token_type: string;
}

// ============================================================================
// Credential & Token Management
// ============================================================================

export async function loadCredentials(): Promise<Credentials> {
  // First, check for user-provided credentials (allows overriding embedded ones)
  try {
    const content = await fs.readFile(CREDENTIALS_PATH, "utf-8");
    const data = JSON.parse(content);

    if (data.client_id && data.client_secret) {
      return {
        client_id: data.client_id,
        client_secret: data.client_secret,
      };
    }
  } catch {
    // Fall through to embedded credentials
  }

  // Fall back to embedded credentials (no setup required)
  return {
    client_id: EMBEDDED_CLIENT_ID,
    client_secret: EMBEDDED_CLIENT_SECRET,
  };
}

export async function findTokenPath(): Promise<string | null> {
  const projectPath = getProjectTokenPath();
  try {
    await fs.access(projectPath);
    return projectPath;
  } catch {
    return null;
  }
}

export async function loadToken(): Promise<TokenData> {
  const tokenPath = await findTokenPath();

  if (!tokenPath) {
    throw new Error(
      `Token not found. Run: pnpm tsx scripts/twitter.ts auth\n` +
      `Token will be saved to: ${getProjectTokenPath()}`
    );
  }

  const content = await fs.readFile(tokenPath, "utf-8");
  return JSON.parse(content) as TokenData;
}

export async function saveToken(tokenData: TokenData): Promise<void> {
  const tokenPath = getProjectTokenPath();
  const tokenDir = path.dirname(tokenPath);

  await fs.mkdir(tokenDir, { recursive: true });
  await fs.writeFile(tokenPath, JSON.stringify(tokenData, null, 2));
}

// ============================================================================
// PKCE Helpers
// ============================================================================

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

function generateState(): string {
  return crypto.randomBytes(16).toString("hex");
}

// ============================================================================
// Token Refresh
// ============================================================================

async function refreshAccessToken(credentials: Credentials, refreshToken: string): Promise<TokenData> {
  const basicAuth = Buffer.from(`${credentials.client_id}:${credentials.client_secret}`).toString("base64");

  const response = await fetch(TWITTER_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const data = await response.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
    error?: string;
    error_description?: string;
  };

  if (data.error) {
    throw new Error(`Token refresh failed: ${data.error_description || data.error}`);
  }

  if (!data.access_token || !data.refresh_token) {
    throw new Error("Invalid token response from Twitter");
  }

  const tokenData: TokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in || 7200) * 1000,
    scope: data.scope || SCOPES,
    token_type: data.token_type || "bearer",
  };

  await saveToken(tokenData);
  return tokenData;
}

// ============================================================================
// Get Valid Access Token (auto-refresh)
// ============================================================================

export async function getValidAccessToken(): Promise<string> {
  const credentials = await loadCredentials();
  let tokenData = await loadToken();

  // Refresh if expired (with 5 minute buffer)
  const bufferMs = 5 * 60 * 1000;
  if (tokenData.expires_at < Date.now() + bufferMs) {
    console.error("Token expired or expiring soon, refreshing...");
    tokenData = await refreshAccessToken(credentials, tokenData.refresh_token);
    console.error("Token refreshed successfully");
  }

  return tokenData.access_token;
}

// ============================================================================
// Gitignore Management
// ============================================================================

export async function ensureGitignore(): Promise<void> {
  const gitignorePath = path.join(process.cwd(), ".gitignore");
  const pattern = ".claude/*.local.*";

  try {
    const content = await fs.readFile(gitignorePath, "utf-8");
    if (content.includes(pattern)) {
      return; // Already configured
    }
    // Append the pattern
    const newContent = content.endsWith("\n")
      ? content + `\n# Twitter skill tokens (per-project auth)\n${pattern}\n`
      : content + `\n\n# Twitter skill tokens (per-project auth)\n${pattern}\n`;
    await fs.writeFile(gitignorePath, newContent);
    console.error(`✓ Added ${pattern} to .gitignore`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      // No .gitignore, create one
      await fs.writeFile(gitignorePath, `# Twitter skill tokens (per-project auth)\n${pattern}\n`);
      console.error(`✓ Created .gitignore with ${pattern}`);
    } else {
      throw err;
    }
  }
}

// ============================================================================
// OAuth 2.0 PKCE Flow
// ============================================================================

export async function performAuth(): Promise<void> {
  const credentials = await loadCredentials();
  const tokenDir = path.dirname(getProjectTokenPath());

  // Ensure .claude directory exists
  await fs.mkdir(tokenDir, { recursive: true });

  // Ensure .gitignore is configured to exclude tokens
  await ensureGitignore();

  // Generate PKCE challenge
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();

  // Build authorization URL
  const authUrl = new URL(TWITTER_AUTH_URL);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", credentials.client_id);
  authUrl.searchParams.set("redirect_uri", CALLBACK_URL);
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  console.error("\nOpening browser for authentication...");
  console.error("If browser doesn't open, visit:\n", authUrl.toString(), "\n");

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://127.0.0.1:${PORT}`);
      const returnedCode = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      const error = url.searchParams.get("error");
      const errorDescription = url.searchParams.get("error_description");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<h1>Error: ${error}</h1><p>${errorDescription || ""}</p><p>You can close this window.</p>`);
        server.close();
        reject(new Error(`${error}: ${errorDescription || ""}`));
        return;
      }

      if (returnedState !== state) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<h1>Error: State mismatch</h1><p>Possible CSRF attack. You can close this window.</p>`);
        server.close();
        reject(new Error("State mismatch - possible CSRF attack"));
        return;
      }

      if (returnedCode) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <html>
            <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
              <div style="text-align: center;">
                <h1 style="color: #1DA1F2;">✓ Authentication Successful!</h1>
                <p>You can close this window and return to the terminal.</p>
              </div>
            </body>
          </html>
        `);
        server.close();
        resolve(returnedCode);
        return;
      }

      res.writeHead(404);
      res.end();
    });

    server.listen(PORT, "127.0.0.1", () => {
      open(authUrl.toString()).catch(() => {
        console.error("Could not open browser automatically.");
      });
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error("Authentication timeout (5 minutes)"));
    }, 300000);
  });

  // Exchange code for tokens
  const basicAuth = Buffer.from(`${credentials.client_id}:${credentials.client_secret}`).toString("base64");

  const tokenResponse = await fetch(TWITTER_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      redirect_uri: CALLBACK_URL,
      code_verifier: codeVerifier,
    }),
  });

  const tokenResult = await tokenResponse.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
    error?: string;
    error_description?: string;
  };

  if (tokenResult.error) {
    throw new Error(`Token exchange failed: ${tokenResult.error_description || tokenResult.error}`);
  }

  if (!tokenResult.refresh_token) {
    throw new Error(
      "No refresh token received.\n" +
      "This can happen if you've already authorized this app.\n" +
      "Fix: Go to https://twitter.com/settings/connected_apps\n" +
      "     Remove access for this app, then run auth again."
    );
  }

  const tokenData: TokenData = {
    access_token: tokenResult.access_token!,
    refresh_token: tokenResult.refresh_token,
    expires_at: Date.now() + (tokenResult.expires_in || 7200) * 1000,
    scope: tokenResult.scope || SCOPES,
    token_type: tokenResult.token_type || "bearer",
  };

  await saveToken(tokenData);
  console.error(`\n✓ Token saved to ${getProjectTokenPath()}`);
}

// ============================================================================
// Check Authentication Status
// ============================================================================

export async function checkAuth(): Promise<{ authenticated: boolean; expiresAt?: Date; error?: string }> {
  try {
    const tokenData = await loadToken();
    const isExpired = tokenData.expires_at < Date.now();

    return {
      authenticated: !isExpired,
      expiresAt: new Date(tokenData.expires_at),
    };
  } catch (error) {
    return {
      authenticated: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
