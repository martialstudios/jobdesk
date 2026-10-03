"use client";

// JobDesk branded builds: on My list, until My info is mostly answered, a
// pointer to it (forms fill themselves from it).

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, UserRound } from "lucide-react";

export function MyInfoNudge() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    fetch("/api/jobdesk/answers")
      .then((r) => r.json())
      .then((d) => {
        const qs: { key: string }[] = d.questions || [];
        setLeft(qs.filter((q) => !(d.basics?.[q.key] || "").trim()).length + (d.missing?.length || 0));
      })
      .catch(() => {});
  }, []);
  if (left < 4) return null;
  return (
    <Link href="/my-info" className="mt-4 flex items-center gap-3 rounded-2xl border border-brand/30 bg-brand/5 px-4 py-3 text-sm text-foreground hover:border-brand/50">
      <UserRound className="size-5 shrink-0 text-brand" />
      <span className="flex-1">
        <strong>Fill in My info</strong> ({left} questions left) so applications fill themselves: your address, work authorization, start date and the like.
      </span>
      <ArrowRight className="size-4 shrink-0" />
    </Link>
  );
}
