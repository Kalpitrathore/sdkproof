/**
 * The two things every rate on this site was missing (raised on dev.to,
 * 2026-08-06, and both fair):
 *
 * 1. A rate with no interval invites the reader to treat 10/10 as certainty.
 *    At n=10 it is not — Wilson puts 10/10 at ">=72%" and 0/10 at "up to 28%".
 *    The refusal table had four 10/10 rows and three 0/10 rows presented as if
 *    they were the same strength of evidence.
 * 2. One score over one denominator hides which denominator it used. A Stripe
 *    run is 100% of what it wrote and 67% of what it was asked — both true, and
 *    publishing only the first hides the actual failure mode.
 *
 * Wilson rather than the normal approximation because every interesting cell
 * here is at or near an edge (0/10, 10/10), where the textbook interval is
 * either degenerate or runs outside [0,1].
 */

export interface Interval {
  /** lower bound, 0-1 */
  low: number;
  /** upper bound, 0-1 */
  high: number;
  /** point estimate, 0-1 */
  p: number;
  /** the denominator the interval was computed over */
  n: number;
}

/** 95% two-sided normal quantile. */
const Z95 = 1.959963984540054;

/**
 * Wilson score interval for a binomial proportion.
 *
 * Throws on an empty or impossible denominator rather than returning a
 * confident-looking zero — the same rule exp-refusals.ts already applies when
 * more than half its requests error out. A broken input must not render as a
 * number.
 */
export function wilson(k: number, n: number, z = Z95): Interval {
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`wilson: empty denominator (n=${n}) — no rate to report`);
  }
  if (!Number.isFinite(k) || k < 0 || k > n) {
    throw new Error(`wilson: need 0 <= k <= n, got k=${k}, n=${n}`);
  }
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return {
    // Pinned at the edges rather than clamped: floating point leaves k===n at
    // 0.9999999999999999, and an interval that excludes its own point estimate
    // is worse than no interval.
    low: k === 0 ? 0 : Math.max(0, center - margin),
    high: k === n ? 1 : Math.min(1, center + margin),
    p,
    n,
  };
}

const pct = (x: number) => {
  const s = (100 * x).toFixed(1);
  // 100.0% and 0.0% read as false precision; the bound is exact at the edges.
  return s.endsWith(".0") ? s.slice(0, -2) : s;
};

/** "33.8–49.3%" — an en dash, so it never reads as a minus sign. */
export function fmtInterval(ci: Interval): string {
  return `${pct(ci.low)}–${pct(ci.high)}%`;
}

export interface RateSplit {
  /** passes over usable, non-refused completions — "did it write the current API" */
  conditional: { passed: number; n: number; pct: number; ci: Interval };
  /** passes over every task asked — "did I get a usable answer at all" */
  unconditional: { passed: number; n: number; pct: number; ci: Interval };
  /** true when the two differ, i.e. something was refused and the split matters */
  split: boolean;
}

/**
 * Both top-line numbers for a run, side by side.
 *
 * `scored` is the count that produced code and reached the compiler; `refused`
 * is the count that produced none. A refusal is not a failure of the library,
 * which is why it stays out of the conditional denominator — and it is not a
 * success either, which is why it stays in the unconditional one.
 */
export function rates(run: { passed: number; scored: number; refused: number }): RateSplit {
  const attempted = run.scored + run.refused;
  const conditional = wilson(run.passed, run.scored);
  const unconditional = wilson(run.passed, attempted);
  return {
    conditional: {
      passed: run.passed,
      n: run.scored,
      pct: Math.round(100 * conditional.p),
      ci: conditional,
    },
    unconditional: {
      passed: run.passed,
      n: attempted,
      pct: Math.round(100 * unconditional.p),
      ci: unconditional,
    },
    split: run.refused > 0,
  };
}

export interface Delta {
  /** point estimate of arm − baseline, -1 to 1 */
  diff: number;
  /** lower bound on the difference */
  low: number;
  /** upper bound on the difference */
  high: number;
  /** true iff the 95% interval excludes zero, i.e. the sign is supported */
  significant: boolean;
}

/**
 * 95% interval for the difference between a context arm and its baseline,
 * by Newcombe's method — the two Wilson intervals combined, rather than a
 * normal approximation on the difference.
 *
 * Why this exists (2026-08-08): every context arm on the site was published as
 * a bare delta. React Router's skill-only arm is 42/45 against a 41/45
 * baseline and was rendered as "+2", which is one generation out of
 * forty-five. Prisma's best arm is +6, which is three. Neither survives a
 * moment's arithmetic, and a site whose argument is that unmeasured numbers
 * mislead cannot ship a delta without an interval on it.
 *
 * Newcombe rather than the textbook two-proportion interval for the same
 * reason wilson() is used above: the interesting arms sit at the edges
 * (0/10 -> 10/10), where the normal approximation runs outside [-1, 1].
 *
 * `significant` is deliberately the only boolean here. Everything downstream
 * must branch on it rather than on the sign of `diff`, so a direction can
 * never be reported from noise.
 */
export function armDelta(
  armPassed: number,
  armN: number,
  basePassed: number,
  baseN: number,
): Delta {
  const a = wilson(armPassed, armN);
  const b = wilson(basePassed, baseN);
  const diff = a.p - b.p;
  // Newcombe method 10: each side takes the far bound of one interval and the
  // near bound of the other, so the result inherits Wilson's edge behaviour.
  const low = diff - Math.sqrt((a.p - a.low) ** 2 + (b.high - b.p) ** 2);
  const high = diff + Math.sqrt((a.high - a.p) ** 2 + (b.p - b.low) ** 2);
  return {
    diff,
    low: Math.max(-1, low),
    high: Math.min(1, high),
    significant: low > 0 || high < 0,
  };
}
