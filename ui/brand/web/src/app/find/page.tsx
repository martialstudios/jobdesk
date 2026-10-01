// JobDesk branded builds: the home page once there's a resume. Jobs first.
import { FindView } from "@/components/jobdesk/find-view";
import { seedExploreFilters } from "@/lib/core/portals";
import { DEFAULT_FILTERS } from "@/lib/explore";

export const dynamic = "force-dynamic";

export default function FindPage() {
  let seed = DEFAULT_FILTERS;
  try {
    seed = seedExploreFilters().filters;
  } catch {
    /* no profile yet: defaults */
  }
  return <FindView seed={seed} />;
}
