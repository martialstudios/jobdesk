// JobDesk branded builds: can Apply fill this job's form? career-ops fills
// Greenhouse, Lever and Ashby forms well; Workday (an account first, many
// steps) and other sites are applied to on the company's own site, with the
// resume PDF ready to upload.

const EASY_ATS = new Set(["greenhouse", "lever", "ashby"]);
const EASY_HOST = /(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com)$/i;

export function canAutofill(url: string, ats?: string): boolean {
  if (ats && EASY_ATS.has(ats.toLowerCase())) return true;
  try {
    return EASY_HOST.test(new URL(url).hostname);
  } catch {
    return false;
  }
}
