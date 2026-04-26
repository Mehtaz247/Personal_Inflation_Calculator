import { USER_CATEGORIES } from "@/lib/cpi/categories";
import { getSnapshot } from "@/lib/cpi/snapshot";
import Calculator from "@/components/Calculator";

export default function Page() {
  const snapshot = getSnapshot();
  const categories = USER_CATEGORIES.map((c) => ({
    key: c.key,
    label: c.label,
    description: c.description,
  }));

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 md:py-14">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-wider text-ink-400">
          India · CPI base {snapshot.base_year}=100 · {formatMonth(snapshot.as_of_month)}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-900 md:text-4xl">
          Personal Inflation Calculator
        </h1>
        <p className="mt-3 max-w-2xl text-ink-600">
          Official CPI reflects an average household. Yours probably doesn&apos;t.
          Enter your monthly spending and we&apos;ll reweight the official CPI
          components to estimate the inflation <em>you</em> actually face.
        </p>
      </header>

      <Calculator categories={categories} />

      <section className="mt-12 rounded-xl border border-ink-200 bg-white p-5 text-sm text-ink-600">
        <h2 className="mb-2 text-sm font-semibold text-ink-800">How this works</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            We load official CPI subgroup indices (MoSPI, base {snapshot.base_year}=100).
          </li>
          <li>
            For each subgroup we compute year-over-year inflation from the index
            ratio: <code className="rounded bg-ink-50 px-1">idx / idx_prev_year − 1</code>.
          </li>
          <li>
            Your rupee spending becomes your personal weights. We map each bucket
            to one or more CPI subgroups.
          </li>
          <li>
            Personal inflation = Σ (your weight × category inflation). The official
            headline on the same data is shown for comparison.
          </li>
        </ol>
      </section>

      <footer className="mt-10 border-t border-ink-200 pt-5 text-xs text-ink-500">
        <p>
          Source: {snapshot.source}. Series: {snapshot.series_id}. As of{" "}
          {formatMonth(snapshot.as_of_month)}.
        </p>
        <p className="mt-1 italic">{snapshot.provenance_note}</p>
      </footer>
    </main>
  );
}

function formatMonth(m: string): string {
  const [y, mm] = m.split("-");
  const d = new Date(Number(y), Number(mm) - 1, 1);
  return d.toLocaleString("en-IN", { month: "long", year: "numeric" });
}
