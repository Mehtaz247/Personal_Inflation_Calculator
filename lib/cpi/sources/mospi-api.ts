import https from "node:https";
import crypto from "node:crypto";
import { URL } from "node:url";

const BASE_URL = "https://api.mospi.gov.in/api/cpi/getCPIData";
const LOGIN_URL = "https://api.mospi.gov.in/api/users/login";

const legacyAgent = new https.Agent({
  secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
});

interface RequestOptions { method?: "GET" | "POST"; headers?: Record<string, string>; body?: string }

function httpRequest(url: string, opts: RequestOptions = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        method: opts.method ?? "GET",
        host: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        headers: opts.headers ?? {},
        agent: legacyAgent,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

export interface CpiApiQuery {
  base_year: number;
  year: number;
  month_code: number;
  limit?: number;
  sector?: string;
  state_code?: number;
}

export interface CpiApiResponse {
  raw: unknown;
  rows: Record<string, unknown>[];
  url: string;
}

let cachedToken: string | null = null;

async function loginIfPossible(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  const username = process.env.MOSPI_USERNAME;
  const password = process.env.MOSPI_PASSWORD;
  if (!username || !password) return null;
  const res = await httpRequest(LOGIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`MoSPI login failed ${res.status} — ${res.body.slice(0, 200)}`);
  }
  let data: unknown;
  try { data = JSON.parse(res.body); } catch { throw new Error("MoSPI login: invalid JSON"); }
  const token = extractToken(data);
  if (!token) throw new Error("MoSPI login returned no token");
  cachedToken = token;
  return token;
}

function extractToken(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  for (const key of ["token", "access_token", "accessToken", "jwt", "authToken"]) {
    const v = obj[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  if (obj.data && typeof obj.data === "object") return extractToken(obj.data);
  return null;
}

export async function fetchCpiMonth(
  query: CpiApiQuery,
  _opts?: { signal?: AbortSignal },
): Promise<CpiApiResponse> {
  const limit = Math.min(Math.max(query.limit ?? 100, 10), 100);
  const params = new URLSearchParams({
    base_year: String(query.base_year),
    year: String(query.year),
    month_code: String(query.month_code),
    limit: String(limit),
  });
  if (query.sector) params.set("sector_code", query.sector);
  if (query.state_code != null) params.set("state_code", String(query.state_code));

  const url = `${BASE_URL}?${params.toString()}`;
  const headers: Record<string, string> = { Accept: "application/json" };

  const token = await loginIfPossible();
  if (token) headers["Authorization"] = token;

  const res = await httpRequest(url, { headers });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`MoSPI CPI API ${res.status} — ${res.body.slice(0, 200)}`);
  }
  let raw: unknown;
  try { raw = JSON.parse(res.body); } catch { throw new Error("MoSPI CPI API: invalid JSON"); }
  const rows = extractRows(raw);
  return { raw, rows, url };
}

function extractRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const key of ["data", "records", "result", "rows", "items"]) {
      const candidate = obj[key];
      if (Array.isArray(candidate)) return candidate as Record<string, unknown>[];
    }
  }
  throw new Error(
    `Could not find a row array in MoSPI response. Top-level keys: ${
      payload && typeof payload === "object"
        ? Object.keys(payload as object).join(", ")
        : typeof payload
    }`,
  );
}
