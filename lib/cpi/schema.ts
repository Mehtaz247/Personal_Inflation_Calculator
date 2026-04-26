import { z } from "zod";

const monthKey = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must be YYYY-MM");

const subgroupMeta = z.object({
  label: z.string().min(1),
  weight: z.number().gt(0).lte(1),
});

export const cpiSnapshotSchema = z
  .object({
    series_id: z.string().min(1),
    description: z.string().min(1),
    source: z.string().min(1),
    source_url: z.string().url(),
    base_year: z.number().int().gte(1990).lte(2100),
    as_of_month: monthKey,
    frequency: z.literal("monthly"),
    currency_unit: z.string().min(1),
    provenance_note: z.string().min(1),
    subgroups: z.record(z.string().min(1), subgroupMeta),
    indices: z.record(z.string().min(1), z.record(monthKey, z.number().positive())),
  })
  .superRefine((snap, ctx) => {
    // Weights must sum to ~1.
    const total = Object.values(snap.subgroups).reduce((s, m) => s + m.weight, 0);
    if (Math.abs(total - 1) > 0.001) {
      ctx.addIssue({
        code: "custom",
        path: ["subgroups"],
        message: `Subgroup weights must sum to 1 (got ${total.toFixed(4)})`,
      });
    }

    // Every declared subgroup must have an index series.
    for (const key of Object.keys(snap.subgroups)) {
      if (!snap.indices[key]) {
        ctx.addIssue({
          code: "custom",
          path: ["indices", key],
          message: `Missing index series for declared subgroup "${key}"`,
        });
      }
    }

    // as_of_month must exist in every series (can't publish a partial snapshot).
    for (const [key, series] of Object.entries(snap.indices)) {
      if (series[snap.as_of_month] == null) {
        ctx.addIssue({
          code: "custom",
          path: ["indices", key, snap.as_of_month],
          message: `Series "${key}" is missing a value for as_of_month ${snap.as_of_month}`,
        });
      }
    }
  });

export type ValidatedSnapshot = z.infer<typeof cpiSnapshotSchema>;
