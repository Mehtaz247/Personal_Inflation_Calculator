/**
 * Refresh the CPI snapshot from the MoSPI eSankhyiki CPI API.
 *
 * Usage:
 *   npx tsx scripts/refresh-cpi.ts                     # auto-detect latest month
 *   npx tsx scripts/refresh-cpi.ts --as-of 2026-03     # explicit as-of month
 *   npx tsx scripts/refresh-cpi.ts --dry-run           # don't write the file
 *   npx tsx scripts/refresh-cpi.ts --log-raw           # dump raw API rows
 *   npx tsx scripts/refresh-cpi.ts --base-year 2024
 *   npx tsx scripts/refresh-cpi.ts --sector Combined   # Combined | Rural | Urban
 *   npx tsx scripts/refresh-cpi.ts --months 14         # how many months to fetch
 *
 * Env:
 *   MOSPI_API_KEY (optional)
 */

import { writeFile, readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fetchCpiMonth } from "../lib/cpi/sources/mospi-api";
import { canonicalizeRow, buildSnapshot } from "../lib/cpi/transform";
import { cpiSnapshotSchema } from "../lib/cpi/schema";
import type { MonthKey, CpiSnapshot } from "../lib/cpi/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SNAPSHOT_PATH = path.join(ROOT, "data/cpi/cpi-combined-2024.json");
const RAW_DIR = path.join(ROOT, "tmp/mospi-raw");

interface Args {
  asOf?: MonthKey;
  dryRun: boolean;
  logRaw: boolean;
  baseYear: number;
  sector: string;
  months: number;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    asOf: undefined,
    dryRun: false,
    logRaw: false,
    baseYear: 2024,
    sector: "Combined",
    months: 14,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case "--as-of": a.asOf = next() as MonthKey; break;
      case "--dry-run": a.dryRun = true; break;
      case "--log-raw": a.logRaw = true; break;
      case "--base-year": a.baseYear = Number(next()); break;
      case "--sector": a.sector = next(); break;
      case "--months": a.months = Number(next()); break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        console.error(`Unknown arg: ${arg}`);
        process.exit(2);
    }
  }
  return a;
}

function printHelp() {
  console.log(`Refresh CPI snapshot from MoSPI eSankhyiki API.\n
  --as-of YYYY-MM     Anchor month (default: auto-detect latest published)
  --base-year N       CPI base year (default: 2024)
  --sector S          Combined | Rural | Urban (default: Combined)
  --months N          How many months to pull, ending at as-of (default: 14)
  --dry-run           Validate but don't write the snapshot file
  --log-raw           Persist raw API responses to tmp/mospi-raw/ for debugging
  --help              This message`);
}

function shiftMonth(m: MonthKey, delta: number): MonthKey {
  const [yStr, mStr] = m.split("-");
  let y = Number(yStr);
  let mm = Number(mStr) + delta;
  while (mm <= 0) { mm += 12; y -= 1; }
  while (mm > 12) { mm -= 12; y += 1; }
  return `${y}-${String(mm).padStart(2, "0")}` as MonthKey;
}

function currentMonth(): MonthKey {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}` as MonthKey;
}

async function ensureRawDir() {
  await mkdir(RAW_DIR, { recursive: true });
}

async function dumpRaw(name: string, payload: unknown) {
  await ensureRawDir();
  await writeFile(path.join(RAW_DIR, `${name}.json`), JSON.stringify(payload, null, 2));
}

async function detectLatestMonth(args: Args): Promise<MonthKey> {
  // Walk backwards from "this month" until we find a month with non-empty rows.
  // MoSPI publishes ~12th of each month, so a 3-month lookback is plenty.
  let m: MonthKey = currentMonth();
  for (let attempts = 0; attempts < 4; attempts++) {
    const [y, mm] = m.split("-").map(Number);
    const res = await fetchCpiMonth({
      base_year: args.baseYear,
      year: y,
      month_code: mm,
      limit: 5,
      sector: args.sector,
    });
    if (res.rows.length > 0) return m;
    m = shiftMonth(m, -1);
  }
  throw new Error("Could not auto-detect a published CPI month within the last 4 months.");
}

async function main() {
  const args = parseArgs(process.argv);

  console.log(`[refresh-cpi] base_year=${args.baseYear} sector=${args.sector} months=${args.months}`);

  const asOf = args.asOf ?? (await detectLatestMonth(args));
  console.log(`[refresh-cpi] anchor month: ${asOf}`);

  // Fetch as-of and the prior 13 months (or whatever --months specifies),
  // plus the same-month-prev-year for YoY at the as-of (already covered if
  // months >= 13).
  const monthList: MonthKey[] = [];
  for (let i = 0; i < args.months; i++) monthList.push(shiftMonth(asOf, -i));
  // Always include same-month-previous-year for as_of so YoY works.
  const yoyAnchor = shiftMonth(asOf, -12);
  if (!monthList.includes(yoyAnchor)) monthList.push(yoyAnchor);

  const monthlyRows: Record<MonthKey, ReturnType<typeof canonicalizeRow>[]> = {};
  for (const month of monthList) {
    const [y, mm] = month.split("-").map(Number);
    const res = await fetchCpiMonth({
      base_year: args.baseYear,
      year: y,
      month_code: mm,
      limit: 200,
      sector: args.sector,
    });
    if (args.logRaw) await dumpRaw(`${month}`, res.raw);
    const canonical = res.rows.map(canonicalizeRow).filter((r): r is NonNullable<typeof r> => r != null);
    monthlyRows[month] = canonical;
    console.log(`[refresh-cpi] ${month}: ${res.rows.length} raw rows, ${canonical.length} canonical`);
  }

  const sourceUrl = `https://api.mospi.gov.in/api/cpi/getCPIData?base_year=${args.baseYear}`;

  const snapshot = buildSnapshot({
    asOfMonth: asOf,
    baseYear: args.baseYear,
    sector: args.sector,
    monthlyRows: monthlyRows as Record<MonthKey, NonNullable<ReturnType<typeof canonicalizeRow>>[]>,
    sourceUrl,
  });

  // Validate before touching the live file. A bad refresh must not corrupt
  // a known-good snapshot.
  const parsed = cpiSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) {
    console.error("[refresh-cpi] Validation failed:");
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    if (args.logRaw) {
      await dumpRaw("invalid-snapshot", snapshot);
      console.error(`[refresh-cpi] Wrote rejected snapshot to ${RAW_DIR}/invalid-snapshot.json`);
    }
    process.exit(1);
  }

  // Diff vs. existing for an informative log line.
  let prev: CpiSnapshot | null = null;
  try {
    prev = JSON.parse(await readFile(SNAPSHOT_PATH, "utf8")) as CpiSnapshot;
  } catch {
    /* first run, no previous */
  }

  if (prev && prev.as_of_month === snapshot.as_of_month) {
    console.log(`[refresh-cpi] No change in as_of_month (${snapshot.as_of_month}); checking values…`);
  }

  if (args.dryRun) {
    console.log("[refresh-cpi] --dry-run: not writing file.");
    console.log(JSON.stringify(snapshot, null, 2).slice(0, 800) + "\n…");
    return;
  }

  await writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`[refresh-cpi] Wrote ${SNAPSHOT_PATH} (as_of_month=${snapshot.as_of_month})`);
}

main().catch((err) => {
  console.error("[refresh-cpi] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
