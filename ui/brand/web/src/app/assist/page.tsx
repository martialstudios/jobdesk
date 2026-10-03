// JobDesk branded builds: send-it-yourself with every answer ready (see
// components/jobdesk/assist-view.tsx).
import { Suspense } from "react";
import { AssistView } from "@/components/jobdesk/assist-view";

export const dynamic = "force-dynamic";

export default function AssistPage() {
  return (
    <Suspense>
      <AssistView />
    </Suspense>
  );
}
