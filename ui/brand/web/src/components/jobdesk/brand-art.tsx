// JobDesk branded builds: a picture of the builder's choosing under the menu
// (BRAND_ART in the brand file). Renders nothing without one.
import { JOBDESK_ART } from "@/lib/jobdesk-brand";

export function BrandArt() {
  if (!JOBDESK_ART) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={JOBDESK_ART} alt="" aria-hidden="true" className="mt-6 h-auto w-full rounded-xl object-contain" style={{ maxHeight: 300 }} />
  );
}
