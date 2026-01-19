/**
 * Twitter OAuth 2.0 PKCE Authentication
 *
 * Token storage: .claude/twitter-skill.local.json (project-local)
 * Credentials: ~/.config/twitter-skill/credentials.json or 1Password
 */

import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import http from "node:http";
import crypto from "node:crypto";
import { execSync, spawn } from "node:child_process";
import * as readline from "node:readline";
// Cross-platform browser open using built-in Node.js
function openBrowser(url: string): void {
  const platform = process.platform;
  let command: string;
  let args: string[];

  if (platform === "darwin") {
    command = "open";
    args = [url];
  } else if (platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", url];
  } else {
    // Linux and others
    command = "xdg-open";
    args = [url];
  }

  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

// ============================================================================
// Configuration
// ============================================================================

// 1Password references for Twitter credentials
const OP_CLIENT_ID_REF = "op://Development/Twitter Client ID/notesPlain";
const OP_CLIENT_SECRET_REF = "op://Development/Twitter Client Secret/notesPlain";

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

// Global token storage (fallback when no project-local token)
const GLOBAL_TOKEN_FILE = "tokens.json";

export function getProjectTokenPath(): string {
  return path.join(process.cwd(), PROJECT_TOKEN_DIR, PROJECT_TOKEN_FILE);
}

export function getGlobalTokenPath(): string {
  return path.join(GLOBAL_CONFIG_DIR, GLOBAL_TOKEN_FILE);
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

Run: pnpm tsx scripts/twitter.ts setup

This will guide you through setting up credentials using either:
  1. 1Password CLI (recommended if you have it)
  2. Manual entry

CREDENTIALS STORAGE:
  ${CREDENTIALS_PATH}

TOKENS (per-project, stores which Twitter account to use):
  .claude/twitter-skill.local.json (in your project directory)

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
// 1Password Integration
// ============================================================================

function is1PasswordAvailable(): boolean {
  try {
    execSync("op --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function readFrom1Password(reference: string): string | null {
  try {
    const result = execSync(`op read "${reference}"`, {
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf-8",
    });
    return result.trim();
  } catch {
    return null;
  }
}

async function loadCredentialsFrom1Password(): Promise<Credentials | null> {
  const clientId = readFrom1Password(OP_CLIENT_ID_REF);
  const clientSecret = readFrom1Password(OP_CLIENT_SECRET_REF);

  if (clientId && clientSecret) {
    return { client_id: clientId, client_secret: clientSecret };
  }
  return null;
}

// ============================================================================
// Interactive Setup
// ============================================================================

function askQuestion(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function credentialsFileExists(): Promise<boolean> {
  try {
    await fs.access(CREDENTIALS_PATH);
    return true;
  } catch {
    return false;
  }
}

export async function performSetup(): Promise<void> {
  console.error(`
═══════════════════════════════════════════════════════════════════════════════
                       TWITTER SKILL - CREDENTIAL SETUP
═══════════════════════════════════════════════════════════════════════════════
`);

  // Check if credentials file already exists
  if (await credentialsFileExists()) {
    console.error(`Credentials already configured at ${CREDENTIALS_PATH}`);
    const answer = await askQuestion("Overwrite existing credentials? (y/N): ");
    if (answer.toLowerCase() !== "y") {
      console.error("Setup cancelled.");
      return;
    }
  }

  const has1Password = is1PasswordAvailable();

  console.error("How would you like to provide Twitter API credentials?\n");
  if (has1Password) {
    console.error("  1. Load from 1Password (recommended)");
    console.error("  2. Enter manually");
  } else {
    console.error("  1. Enter manually");
    console.error("  (1Password CLI not detected - install 'op' for 1Password support)");
  }
  console.error("");

  const choice = await askQuestion("Enter choice (1" + (has1Password ? " or 2" : "") + "): ");

  let credentials: Credentials;

  if (has1Password && choice === "1") {
    // Load from 1Password
    console.error("\nLoading credentials from 1Password...");
    const opCreds = await loadCredentialsFrom1Password();
    if (!opCreds) {
      console.error("Failed to load credentials from 1Password.");
      console.error("Make sure you have these items in your 1Password:");
      console.error(`  - ${OP_CLIENT_ID_REF}`);
      console.error(`  - ${OP_CLIENT_SECRET_REF}`);
      throw new Error("1Password credentials not found");
    }
    credentials = opCreds;
    console.error("✓ Loaded credentials from 1Password");
  } else {
    // Manual entry
    console.error("\nEnter your Twitter API credentials:");
    console.error("(Get these from https://developer.twitter.com/en/portal/dashboard)\n");

    const clientId = await askQuestion("Client ID: ");
    const clientSecret = await askQuestion("Client Secret: ");

    if (!clientId || !clientSecret) {
      throw new Error("Both Client ID and Client Secret are required");
    }

    credentials = { client_id: clientId, client_secret: clientSecret };
  }

  // Save credentials
  await fs.mkdir(GLOBAL_CONFIG_DIR, { recursive: true });
  await fs.writeFile(CREDENTIALS_PATH, JSON.stringify(credentials, null, 2));
  console.error(`\n✓ Credentials saved to ${CREDENTIALS_PATH}`);
  console.error("\nNext step: Run 'pnpm tsx scripts/twitter.ts auth' to authenticate with Twitter.");
}

// ============================================================================
// Credential & Token Management
// ============================================================================

export async function loadCredentials(): Promise<Credentials> {
  // Check for saved credentials file
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
    // No saved credentials
  }

  // Try 1Password as fallback
  if (is1PasswordAvailable()) {
    const opCreds = await loadCredentialsFrom1Password();
    if (opCreds) {
      return opCreds;
    }
  }

  throw new Error(
    `No credentials found. Run: pnpm tsx scripts/twitter.ts setup\n` +
    `Credentials will be saved to: ${CREDENTIALS_PATH}`
  );
}

export async function findTokenPath(): Promise<string | null> {
  // Check project-local first
  const projectPath = getProjectTokenPath();
  try {
    await fs.access(projectPath);
    return projectPath;
  } catch {
    // Fall back to global config
  }

  // Check global config directory
  const globalPath = getGlobalTokenPath();
  try {
    await fs.access(globalPath);
    return globalPath;
  } catch {
    return null;
  }
}

export async function loadToken(): Promise<TokenData> {
  const tokenPath = await findTokenPath();

  if (!tokenPath) {
    throw new Error(
      `Token not found. Run: pnpm tsx scripts/twitter.ts auth\n` +
      `Looked in:\n` +
      `  - ${getProjectTokenPath()} (project-local)\n` +
      `  - ${getGlobalTokenPath()} (global fallback)`
    );
  }

  const content = await fs.readFile(tokenPath, "utf-8");
  return JSON.parse(content) as TokenData;
}

export async function saveToken(tokenData: TokenData, global: boolean = false): Promise<void> {
  const tokenPath = global ? getGlobalTokenPath() : getProjectTokenPath();
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

async function refreshAccessToken(credentials: Credentials, refreshToken: string, tokenPath: string): Promise<TokenData> {
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

  // Save back to the original location
  const isGlobal = tokenPath === getGlobalTokenPath();
  await saveToken(tokenData, isGlobal);
  return tokenData;
}

// ============================================================================
// Get Valid Access Token (auto-refresh)
// ============================================================================

export async function getValidAccessToken(): Promise<string> {
  const credentials = await loadCredentials();
  const tokenPath = await findTokenPath();

  if (!tokenPath) {
    throw new Error(
      `Token not found. Run: pnpm tsx scripts/twitter.ts auth\n` +
      `Looked in:\n` +
      `  - ${getProjectTokenPath()} (project-local)\n` +
      `  - ${getGlobalTokenPath()} (global fallback)`
    );
  }

  const content = await fs.readFile(tokenPath, "utf-8");
  let tokenData = JSON.parse(content) as TokenData;

  // Refresh if expired (with 5 minute buffer)
  const bufferMs = 5 * 60 * 1000;
  if (tokenData.expires_at < Date.now() + bufferMs) {
    console.error("Token expired or expiring soon, refreshing...");
    tokenData = await refreshAccessToken(credentials, tokenData.refresh_token, tokenPath);
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

export async function performAuth(global: boolean = false): Promise<void> {
  const credentials = await loadCredentials();
  const tokenPath = global ? getGlobalTokenPath() : getProjectTokenPath();
  const tokenDir = path.dirname(tokenPath);

  // Ensure token directory exists
  await fs.mkdir(tokenDir, { recursive: true });

  // Ensure .gitignore is configured to exclude tokens (only for project-local)
  if (!global) {
    await ensureGitignore();
  }

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
      try {
        openBrowser(authUrl.toString());
      } catch {
        console.error("Could not open browser automatically.");
      }
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

  await saveToken(tokenData, global);
  const savedPath = global ? getGlobalTokenPath() : getProjectTokenPath();
  console.error(`\n✓ Token saved to ${savedPath}`);
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
