import { createSign } from "node:crypto";
import type { FirebasePvpTree, InMemoryFirebaseRtdbEngine } from "./firebase-rtdb";

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

const globalForFirebaseAuth = globalThis as unknown as {
  __cityBloxxFirebaseToken?: CachedToken;
  __cityBloxxFirebaseHydrated?: boolean;
  __cityBloxxFirebaseHydrating?: Promise<void> | null;
};

function base64UrlEncode(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function getFirebaseDatabaseUrl(): string | null {
  const raw = process.env.FIREBASE_DATABASE_URL || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
  if (!raw || !raw.trim()) return null;
  return raw.trim().replace(/\/$/, "");
}

export async function getFirebaseAdminAccessToken(): Promise<string | null> {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (!clientEmail || !rawPrivateKey) return null;

  const nowMs = Date.now();
  if (
    globalForFirebaseAuth.__cityBloxxFirebaseToken &&
    globalForFirebaseAuth.__cityBloxxFirebaseToken.expiresAtMs - 60_000 > nowMs
  ) {
    return globalForFirebaseAuth.__cityBloxxFirebaseToken.accessToken;
  }

  const privateKey = rawPrivateKey.replace(/\\n/g, "\n");
  const iat = Math.floor(nowMs / 1000);
  const exp = iat + 3600;

  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claimSet = base64UrlEncode(
    JSON.stringify({
      iss: clientEmail,
      sub: clientEmail,
      aud: "https://oauth2.googleapis.com/token",
      iat,
      exp,
      scope: "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email",
    }),
  );

  const unsignedJwt = `${header}.${claimSet}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedJwt);
  signer.end();
  const signature = base64UrlEncode(signer.sign(privateKey));
  const assertion = `${unsignedJwt}.${signature}`;

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;

    globalForFirebaseAuth.__cityBloxxFirebaseToken = {
      accessToken: data.access_token,
      expiresAtMs: nowMs + (data.expires_in ?? 3600) * 1000,
    };
    return data.access_token;
  } catch {
    return null;
  }
}

async function buildRtdbUrl(subPath: string): Promise<string | null> {
  const baseUrl = getFirebaseDatabaseUrl();
  if (!baseUrl) return null;
  const cleanPath = subPath.replace(/^\/+/, "");
  const token = await getFirebaseAdminAccessToken();
  const query = token ? `?access_token=${encodeURIComponent(token)}` : "";
  return `${baseUrl}/${cleanPath}.json${query}`;
}

export async function writeFirebaseRtdbNode(path: string, payload: unknown): Promise<boolean> {
  const url = await buildRtdbUrl(`cityBloxxPvp/${path}`);
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function readFirebaseRtdbNode<T = unknown>(path = ""): Promise<T | null> {
  const clean = path ? `cityBloxxPvp/${path.replace(/^\/+/, "")}` : "cityBloxxPvp";
  const url = await buildRtdbUrl(clean);
  if (!url) return null;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T | null;
  } catch {
    return null;
  }
}

export async function ensureFirebaseCloudHydrated(engine: InMemoryFirebaseRtdbEngine): Promise<void> {
  if (globalForFirebaseAuth.__cityBloxxFirebaseHydrated) return;
  if (globalForFirebaseAuth.__cityBloxxFirebaseHydrating) {
    await globalForFirebaseAuth.__cityBloxxFirebaseHydrating;
    return;
  }
  globalForFirebaseAuth.__cityBloxxFirebaseHydrating = (async () => {
    try {
      const cloudTree = await readFirebaseRtdbNode<Partial<FirebasePvpTree>>("");
      if (cloudTree && (cloudTree.stats || cloudTree.rooms)) {
        engine.hydrate(cloudTree);
      } else {
        const snapshot = engine.getSnapshot();
        await writeFirebaseRtdbNode("stats", snapshot.stats);
      }
      globalForFirebaseAuth.__cityBloxxFirebaseHydrated = true;
    } catch {
      // Ignore network failure during initial hydration
    } finally {
      globalForFirebaseAuth.__cityBloxxFirebaseHydrating = null;
    }
  })();
  await globalForFirebaseAuth.__cityBloxxFirebaseHydrating;
}
