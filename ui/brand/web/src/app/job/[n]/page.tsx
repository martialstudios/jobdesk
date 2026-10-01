// JobDesk branded builds: one scored job (components/jobdesk/job-view.tsx).
import { JobView } from "@/components/jobdesk/job-view";

export const dynamic = "force-dynamic";

export default async function JobPage({ params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  return <JobView n={n} />;
}
