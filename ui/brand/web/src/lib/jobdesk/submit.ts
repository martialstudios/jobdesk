// JobDesk branded builds: "Approve & submit". career-ops fills the real form
// in her Chrome and never submits; here, and only when she presses Approve &
// submit in the app (and confirms), the form's own submit button is clicked.
// Then: did the page say it went through (a thank-you / received message, or
// the form gone), or did it complain (errors still on the form)?

import { getSession } from "@/lib/apply/session";
import { captchaWarning } from "@/lib/apply/diagnose";

export type SubmitResult =
  | { ok: true; message: string }
  | { ok: false; reason: "no-session" | "captcha" | "no-button" | "errors" | "unclear"; message: string; errors?: string[] };

const SUBMIT_TEXT = /^(submit( application)?|send( application)?|apply|apply now|submit your application|finish|complete application)$/i;
const THANKS = /thank(s| you)|application (has been |was )?(received|submitted|sent)|we('ve| have) received|successfully (submitted|applied)|you('ve| have) applied/i;

export async function submitSession(id: string): Promise<SubmitResult> {
  const s = getSession(id);
  if (!s) return { ok: false, reason: "no-session", message: "The form isn't open anymore (it closes after 15 minutes). Press Apply again." };
  const { page, frame } = s;

  // A box she has to tick herself ("I'm not a robot") blocks it.
  const captcha = await captchaWarning(page).catch(() => null);
  if (captcha) {
    return { ok: false, reason: "captcha", message: "The form has an \"I'm not a robot\" check. Tick it in the Chrome window, then press Approve & submit again." };
  }

  // The form's own submit button: a visible, enabled submit control.
  const button = await frame
    .evaluateHandle((rx: string) => {
      const re = new RegExp(rx, "i");
      const vis = (el: Element) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
      };
      const all = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]')) as HTMLElement[];
      const text = (el: HTMLElement) => ((el as HTMLInputElement).value || el.innerText || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ");
      const ok = (el: HTMLElement) => vis(el) && !(el as HTMLButtonElement).disabled;
      return (
        all.find((el) => ok(el) && el.getAttribute("type") === "submit" && re.test(text(el))) ||
        all.find((el) => ok(el) && re.test(text(el))) ||
        all.find((el) => ok(el) && el.getAttribute("type") === "submit") ||
        null
      );
    }, SUBMIT_TEXT.source)
    .catch(() => null);
  const el = button?.asElement();
  if (!el) {
    return { ok: false, reason: "no-button", message: "I couldn't find this form's Submit button. Press it yourself in the Chrome window, then press Mark applied." };
  }

  await page.bringToFront().catch(() => {});
  await el.scrollIntoViewIfNeeded().catch(() => {});
  await el.click({ timeout: 10_000 });

  // Up to 20 s for the page to answer: a thank-you, the form gone, or errors.
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1000);
    const state = await page
      .evaluate((thanks: string) => {
        const body = document.body?.innerText || "";
        const inFrames = Array.from(document.querySelectorAll("iframe"))
          .map((f) => {
            try {
              return f.contentDocument?.body?.innerText || "";
            } catch {
              return "";
            }
          })
          .join("\n");
        const text = body + "\n" + inFrames;
        const said = new RegExp(thanks, "i").exec(text);
        const errs = Array.from(document.querySelectorAll('[role="alert"], .error, .field-error, [aria-invalid="true"]'))
          .map((e) => ((e as HTMLElement).innerText || (e as HTMLElement).getAttribute("aria-label") || "").trim())
          .filter(Boolean);
        // The browser's own check: required fields left empty block the send.
        for (const el of Array.from(document.querySelectorAll("input:invalid, select:invalid, textarea:invalid"))) {
          const id = el.getAttribute("id");
          const label = (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent) || el.getAttribute("aria-label") || el.getAttribute("name") || "";
          if (label.trim()) errs.push(`${label.replace(/\s*\*\s*$/, "").trim()} needs an answer`);
        }
        errs.splice(6);
        return { said: said ? text.slice(Math.max(0, said.index - 40), said.index + 120).replace(/\s+/g, " ").trim() : "", errs };
      }, THANKS.source)
      .catch(() => ({ said: "", errs: [] as string[] }));
    if (state.said) return { ok: true, message: state.said };
    if (state.errs.length) return { ok: false, reason: "errors", message: "The form wants a few things fixed before it will send.", errors: state.errs };
    const formLeft = await frame.locator("[data-co-field]").count().catch(() => 0);
    if (formLeft === 0) return { ok: true, message: "The form went away after Submit, which usually means it was sent." };
  }
  return { ok: false, reason: "unclear", message: "I pressed Submit but the page didn't clearly say it went through. Check the Chrome window; if it says thank you, press Mark applied." };
}
