// JobDesk branded builds: how a score is shown. career-ops scores 1–5 and is
// honest about weak fits, which is right, but a bare "2/5" deflates people.
// So the card shows a friendly label with an encouraging line, strengths come
// first, and the exact number lives behind "Read why". The labels never
// overstate: the order and the cut-offs follow career-ops's own scale (4.0 is
// its apply line).

export type Tier = { label: string; className: string; line: string };

export function tierOf(score: number | null | undefined): Tier | null {
  if (score === null || score === undefined || !Number.isFinite(score)) return null;
  if (score >= 4.0)
    return {
      label: "Great match",
      className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
      line: "This one fits you really well. Go for it!",
    };
  if (score >= 3.3)
    return {
      label: "Good match",
      className: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
      line: "You're a solid fit. A couple of tweaks will make you stand out.",
    };
  if (score >= 2.5)
    return {
      label: "Worth a shot",
      className: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
      line: "You bring real strengths here. Here's how to close the gap.",
    };
  return {
    label: "Stretch role",
    className: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    line: "A stretch, and stretches are how careers grow. If you love this one, here's how to make your case.",
  };
}
