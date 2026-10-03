// JobDesk branded builds: "Approve & submit". career-ops fills the real form
// in her Chrome and never submits; here, and only when she presses Approve &
// submit in the app (and confirms), the form's own submit button is clicked.
// Then: did the page say it went through (a thank-you / received message, or
// the form gone), or did it complain (errors still on the form)?
//
// Before that: answers she gave in the app for questions the form still had
// empty (her phone, say) are typed into the form. After it: some job sites
// (Greenhouse) email a security code to make sure a person is applying; this
// never gets around that check, it says so, and when she pastes the code into
// the app it's typed into the form and the form is sent again.

import { fillSession, getSession } from "@/lib/apply/session";
import { captchaWarning } from "@/lib/apply/diagnose";
import type { ApplyField } from "@/lib/apply/extract";

export type SubmitResult =
  | { ok: true; message: string }
  | { ok: false; reason: "no-session" | "captcha" | "no-button" | "errors" | "unclear" | "code" | "flagged"; message: string; errors?: string[] };

// The site's spam check turned down a send from a browser the app drives.
const FLAGGED = /flagged as (possible )?spam|couldn.?t submit your application|suspicious activity|automated (browser|submission)/i;

const CODE_TEXT = /security code|verification code|confirmation code|enter (the|your) code|code (we|was) (sent|emailed)|we('ve| have)? (sent|emailed) (you )?(a|an|the) (code|email)/i;

// Fill the code into the form's code box (one box, or one box per character).
async function typeCode(frame: import("playwright-core").Frame, page: import("playwright-core").Page, code: string): Promise<boolean> {
  for (const target of [frame, page.mainFrame()]) {
    const boxes = target.locator('input[maxlength="1"]:visible');
    const n = await boxes.count().catch(() => 0);
    if (n >= 4 && n >= code.length) {
      for (let i = 0; i < code.length; i++) await boxes.nth(i).fill(code[i]).catch(() => {});
      return true;
    }
    const one = target
      .locator("input:visible")
      .filter({ has: target.locator("xpath=self::*[contains(translate(@name,'CODE','code'),'code') or contains(translate(@id,'CODE','code'),'code') or contains(translate(@placeholder,'CODE','code'),'code') or contains(translate(@aria-label,'CODE','code'),'code') or @autocomplete='one-time-code']") });
    if ((await one.count().catch(() => 0)) > 0) {
      await one.first().fill(code);
      return true;
    }
  }
  return false;
}

export type SubmitOptions = { extra?: Record<string, string>; fields?: ApplyField[]; code?: string };

const SUBMIT_TEXT = /^(submit( application)?|send( application)?|apply|apply now|submit your application|finish|complete application)$/i;
const THANKS = /thank(s| you)|application (has been |was )?(received|submitted|sent)|we('ve| have) received|successfully (submitted|applied)|you('ve| have) applied/i;

export async function submitSession(id: string, opts: SubmitOptions = {}): Promise<SubmitResult> {
  const s = getSession(id);
  if (!s) return { ok: false, reason: "no-session", message: "The form isn't open anymore (it closes after an hour). Press Apply again." };
  const { page, frame } = s;

  // Her answers from the app go into the form first.
  const extra = Object.fromEntries(Object.entries(opts.extra || {}).filter(([, v]) => String(v || "").trim()));
  if (Object.keys(extra).length) {
    const fields = (opts.fields || s.fields).filter((f) => f.id in extra);
    await fillSession(id, extra, fields).catch(() => null);
  }
  // A security code she pasted: into the form's code box, then send again.
  if (opts.code?.trim() && !(await typeCode(frame, page, opts.code.trim()))) {
    return { ok: false, reason: "code", message: "I couldn't find where the code goes. Type it into the Chrome window and press Submit there." };
  }

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
      .evaluate(({ thanks, code, spam }: { thanks: string; code: string; spam: string }) => {
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
        const askedCode = new RegExp(code, "i").test(text);
        const flagged = new RegExp(spam, "i").test(text);
        return { said: said ? text.slice(Math.max(0, said.index - 40), said.index + 120).replace(/\s+/g, " ").trim() : "", errs, askedCode, flagged };
      }, { thanks: THANKS.source, code: CODE_TEXT.source, spam: FLAGGED.source })
      .catch(() => ({ said: "", errs: [] as string[], askedCode: false, flagged: false }));
    if (state.flagged) {
      return {
        ok: false,
        reason: "flagged",
        message: "This company's job site turned the app's send down as possible spam (it does that to any browser the app drives). Every answer is ready below: send it from your own Chrome.",
      };
    }
    if (state.said) return { ok: true, message: state.said };
    // A code she pasted that the site turned down: ask for it again.
    if (opts.code && state.errs.length) {
      return {
        ok: false,
        reason: "code",
        message: `That code didn't work (the site said: ${state.errs[0]}). Check the email, or ask the site for a new code, and paste it again.`,
      };
    }
    if (state.askedCode && !opts.code) {
      return {
        ok: false,
        reason: "code",
        message: "The job site emailed you a security code to check it's really you. Open that email, then paste the code here.",
      };
    }
    if (state.errs.length) return { ok: false, reason: "errors", message: "The form wants a few things fixed before it will send.", errors: state.errs };
    const formLeft = await frame.locator("[data-co-field]").count().catch(() => 0);
    if (formLeft === 0) return { ok: true, message: "The form went away after Submit, which usually means it was sent." };
  }
  if (opts.code) {
    return { ok: false, reason: "code", message: "The site didn't accept the code. Check the email, or ask the site for a new code, and paste it again." };
  }
  return { ok: false, reason: "unclear", message: "I pressed Submit but the page didn't clearly say it went through. Check the Chrome window; if it says thank you, press Mark applied." };
}
