// When a job applied to is due a follow-up (Follow-ups, the applied tracker).
import type { ListItem } from "./use-list";

export const DAY = 86_400_000;
const WAIT_DAYS = 7;
const MAX_FOLLOW_UPS = 2;

export type Plan = { stage: "due" | "waiting" | "quiet" | "heard" | "closed"; due: number; last: number };

export function planFor(i: ListItem, now = Date.now()): Plan {
  const applied = i.appliedAt ?? i.addedAt;
  const last = Math.max(applied, ...(i.followUps ?? []));
  const due = i.nextAt ?? last + WAIT_DAYS * DAY;
  if (i.outcome === "interview" || i.outcome === "offer") return { stage: "heard", due, last };
  if (i.outcome === "rejected") return { stage: "closed", due, last };
  if ((i.followUps?.length ?? 0) >= MAX_FOLLOW_UPS && now >= due) return { stage: "quiet", due, last };
  return { stage: now >= due ? "due" : "waiting", due, last };
}
