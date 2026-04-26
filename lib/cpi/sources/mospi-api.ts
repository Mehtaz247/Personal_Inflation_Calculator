/**
 * Fetcher for the MoSPI eSankhyiki CPI API.
 *
 * Endpoint pattern (from https://esankhyiki.mospi.gov.in/macroindicators?product=cpi&tab=api):
 *   GET https://api.mospi.gov.in/api/cpi/getCPIData
 *     ?base_year=2024&year=YYYY&month_code=M&limit=N
 *
 * The exact response field names are not documented from outside the portal,
 * so this module:
 *   1. Accepts the response as `unknown` and exposes the raw rows for
 *      inspection (--log-raw mode in the orchestrator).
 *   2. Lets the transform layer pick out the fields it needs by best-effort
 *      key matching, with loud failure if expected fields are missing.
 *
 * Authentication: optional. If MOSPI_API_KEY is set, it's sent as both
 * `api-key` header and `apikey` query param (covers common gateway styles).
 */

const BASE_URL = "https://api.mospi.gov.in/api/cpi/getCPIData";

export interface CpiApiQuery {
  base_year: number;
  year: number;
  month_code: number; // 1..12
  limit?: number;
  sector?: string;    // e.g. "Combined" — only used if API supports it
}

export interface CpiApiResponse {
  raw: unknown;
  rows: Record<string, unknown>[];
  url: string;
}

export async function fetchCpiMonth(query: CpiApiQuery, opts?: { apiKey?: string; signal?: AbortSignal }): Promise<CpiApiResponse> {
  const params = new URLSearchParams({
    base_year: String(query.base_year),
    year: String(query.year),
    month_code: String(query.month_code),
    limit: String(query.limit ?? 200),
  });
  if (query.sector) params.set("sector", query.sector);

  const apiKey = opts?.apiKey ?? process.env.MOSPI_API_KEY;
  if (apiKey) params.set("apikey", apiKey);

  const url = `${BASE_URL}?${params.toString()}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers["api-key"] = apiKey;

  const res = await fetch(url, { headers, signal: opts?.signal });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`MoSPI CPI API ${res.status} ${res.statusText} — ${body.slice(0, 200)}`);
  }
  const raw: unknown = await res.json();
  const rows = extractRows(raw);
  return { raw, rows, url };
}

/**
 * Pull rows from the response regardless of whether they're nested under
 * `data`, `records`, `result`, or returned as a top-level array. Failing
 * loudly is better than silently parsing zero rows.
 */
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
