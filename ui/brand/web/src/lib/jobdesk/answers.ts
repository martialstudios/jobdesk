// JobDesk branded builds: what job applications usually ask, kept so each new
// form needs less from her. Two parts, in .career-ops-web/jobdesk-answers.json:
//  - basics: the "My info" survey (contact, address, work authorization,
//    start date, salary, education, how she heard, demographics);
//  - learned: every short answer she approved on a real form, by question.
// Prefill uses them over the AI's draft (learned first, then basics); the AI
// also gets them as context. Long essays, files and anything naming the
// company are never learned (they belong to one job).

import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { careerOpsRoot } from "@/lib/career-ops";
import type { ApplyField } from "@/lib/apply/extract";

export const DECLINE = "I don't wish to answer";

export type Basic = {
  key: string;
  label: string;
  section: "Contact" | "Work" | "Availability" | "Education" | "About you";
  /** Labels on real forms this answers. */
  match: RegExp;
  options?: string[];
  placeholder?: string;
  initial?: string;
  hint?: string;
};

export const BASICS: Basic[] = [
  { key: "firstName", label: "First name", section: "Contact", match: /^(legal )?first name|^given name|^preferred first name/i },
  { key: "lastName", label: "Last name", section: "Contact", match: /^(legal )?last name|^surname|^family name/i },
  { key: "email", label: "Email", section: "Contact", match: /^e-?mail( address)?\b/i },
  { key: "phone", label: "Phone", section: "Contact", match: /^(mobile |cell )?phone( number)?\b/i },
  { key: "street", label: "Street address", section: "Contact", match: /^(street |home |mailing )?address( line 1)?$|^street/i },
  { key: "city", label: "City", section: "Contact", match: /^city\b/i },
  { key: "state", label: "State", section: "Contact", match: /^state\b|^state\/province/i },
  { key: "zip", label: "ZIP code", section: "Contact", match: /^(zip|postal)( code)?\b/i },
  { key: "location", label: "Where you live (City, State)", section: "Contact", match: /^(current )?location\b|^where are you (currently )?(located|based)/i, placeholder: "Huntington Beach, CA" },
  { key: "linkedin", label: "LinkedIn profile", section: "Contact", match: /linkedin/i, placeholder: "https://www.linkedin.com/in/…" },
  { key: "website", label: "Website or portfolio (optional)", section: "Contact", match: /^(personal )?(website|portfolio)\b/i },
  {
    key: "authorized",
    label: "Are you legally allowed to work in the US?",
    section: "Work",
    match: /(legally )?(authori[sz]ed|eligible|permitted) to work|right to work|work authori[sz]ation/i,
    options: ["Yes", "No"],
  },
  {
    key: "sponsorship",
    label: "Will you now or later need visa sponsorship?",
    section: "Work",
    match: /sponsor/i,
    options: ["No", "Yes"],
  },
  { key: "over18", label: "Are you 18 or older?", section: "Work", match: /(18|eighteen) (years|or older)|at least 18/i, options: ["Yes", "No"], initial: "Yes" },
  { key: "startDate", label: "When could you start?", section: "Availability", match: /start date|when (can|could) you start|availability to start|earliest (start|available)/i, placeholder: "Two weeks after an offer" },
  { key: "relocate", label: "Open to moving for a job?", section: "Availability", match: /relocat/i, options: ["No", "Yes", "Maybe, for the right job"] },
  { key: "workMode", label: "Remote, hybrid or in the office?", section: "Availability", match: /(remote|hybrid|on-?site|in[- ]office).*(prefer|open|comfortable|able)|work (arrangement|setting) preference/i, options: ["Any of them", "Remote", "Hybrid", "In the office"] },
  { key: "salary", label: "Pay you're hoping for (per year)", section: "Availability", match: /salary|compensation|pay (expectation|requirement)|desired pay/i, placeholder: "$55,000" },
  { key: "education", label: "Highest education", section: "Education", match: /highest (level of )?(education|degree)|education level/i, options: ["High school", "Some college", "Associate's degree", "Bachelor's degree", "Master's degree", "Doctorate"] },
  { key: "school", label: "School", section: "Education", match: /^(school|university|college)( name)?$/i },
  { key: "degree", label: "Degree and field", section: "Education", match: /^(degree|discipline|field of study|major)\b/i, placeholder: "B.A. English" },
  { key: "hearAbout", label: "How did you hear about jobs? (forms ask this)", section: "About you", match: /how did you (hear|find|learn)|where did you (hear|find)|referral source|source/i, initial: "Online job board" },
  { key: "pronouns", label: "Pronouns (optional)", section: "About you", match: /pronoun/i, placeholder: "she/her" },
  { key: "gender", label: "Gender", section: "About you", match: /^gender\b|gender identity/i, options: [DECLINE, "Female", "Male", "Non-binary"], initial: DECLINE, hint: "Optional on US forms; never affects whether you're hired." },
  { key: "hispanic", label: "Hispanic or Latino?", section: "About you", match: /hispanic|latin[oax]/i, options: [DECLINE, "No", "Yes"], initial: DECLINE },
  {
    key: "race",
    label: "Race or ethnicity",
    section: "About you",
    match: /^race\b|ethnicity/i,
    options: [DECLINE, "Asian", "White", "Black or African American", "Native Hawaiian or Other Pacific Islander", "American Indian or Alaska Native", "Two or more races", "Middle Eastern or North African"],
    initial: DECLINE,
  },
  { key: "veteran", label: "Veteran status", section: "About you", match: /veteran/i, options: [DECLINE, "I am not a protected veteran", "I identify as one or more of the classifications of protected veteran"], initial: DECLINE },
  { key: "disability", label: "Disability status", section: "About you", match: /disabilit/i, options: [DECLINE, "No, I don't have a disability", "Yes, I have a disability (or previously had one)"], initial: DECLINE },
];

type Learned = { label: string; value: string; at: string; uses: number };
export type AnswerStore = { basics: Record<string, string>; learned: Record<string, Learned>; missing: Record<string, { label: string; at: string }> };

function file() {
  return path.join(/* turbopackIgnore: true */ careerOpsRoot(), ".career-ops-web", "jobdesk-answers.json");
}

// career-ops's example person ("+1-555-0123"): never one of her answers.
function exampleValues(): Set<string> {
  try {
    const ex = yaml.load(fs.readFileSync(path.join(/* turbopackIgnore: true */ careerOpsRoot(), "config", "profile.example.yml"), "utf8")) as Record<string, any>;
    const c = ex?.candidate || {};
    return new Set([c.full_name, c.email, c.phone, c.location, c.linkedin, c.portfolio_url, ...String(c.full_name || "").split(/\s+/)].filter(Boolean).map(String));
  } catch {
    return new Set();
  }
}

export function readAnswers(): AnswerStore {
  try {
    const d = JSON.parse(fs.readFileSync(file(), "utf8"));
    const examples = exampleValues();
    const basics: Record<string, string> = {};
    for (const [k, v] of Object.entries((d.basics || {}) as Record<string, string>)) if (!examples.has(v)) basics[k] = v;
    const learned: Record<string, Learned> = {};
    for (const [k, v] of Object.entries((d.learned || {}) as Record<string, Learned>)) if (!examples.has(v?.value)) learned[k] = v;
    return { basics, learned, missing: d.missing || {} };
  } catch {
    const basics: Record<string, string> = {};
    for (const b of BASICS) if (b.initial) basics[b.key] = b.initial;
    return { basics, learned: {}, missing: {} };
  }
}

export function writeAnswers(store: AnswerStore) {
  const f = file();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(store, null, 2));
}

// Contact details she hasn't typed into My info yet: from her profile (made
// from her resume), else from the resume itself.
function suggestions(): Record<string, string> {
  const root = careerOpsRoot();
  let cv = "";
  try {
    cv = fs.readFileSync(path.join(/* turbopackIgnore: true */ root, "cv.md"), "utf8").slice(0, 4000);
  } catch {
    cv = "";
  }
  const fromCv = {
    email: cv.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] || "",
    phone: cv.match(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/)?.[0] || "",
    linkedin: cv.match(/(https?:\/\/)?(www\.)?linkedin\.com\/in\/[\w-]+/i)?.[0] || "",
  };
  let c: Record<string, any> = {};
  try {
    c = ((yaml.load(fs.readFileSync(path.join(/* turbopackIgnore: true */ root, "config", "profile.yml"), "utf8")) as Record<string, any>) || {}).candidate || {};
  } catch {
    c = {};
  }
  const [first, ...rest] = String(c.full_name || "").trim().split(/\s+/);
  const out: Record<string, string> = {
    firstName: first || "",
    lastName: rest.join(" "),
    email: String(c.email || fromCv.email),
    phone: String(c.phone || fromCv.phone),
    location: String(c.location || ""),
    linkedin: String(c.linkedin || fromCv.linkedin),
    website: String(c.portfolio_url || ""),
  };
  const examples = exampleValues();
  for (const k of Object.keys(out)) if (!out[k] || examples.has(out[k])) delete out[k];
  return out;
}

/** What forms use and My info shows: her saved answers, plus suggestions. */
export function answersForForms(): AnswerStore {
  const store = readAnswers();
  for (const [k, v] of Object.entries(suggestions())) if (!store.basics[k]) store.basics[k] = v;
  return store;
}

/** A question's identity across forms: lowercase words, no punctuation or "*". */
export const keyOf = (label: string) =>
  label
    .toLowerCase()
    .replace(/\(required\)|\*/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const basicFor = (label: string) => BASICS.find((b) => b.match.test(label.trim()));

/** Picks the form's own option for a saved answer, or undefined if none fits. */
export function pickOption(value: string, options: string[]): string | undefined {
  const v = value.trim().toLowerCase();
  if (!v || !options.length) return undefined;
  const exact = options.find((o) => o.trim().toLowerCase() === v);
  if (exact) return exact;
  const decline = /don.?t wish|prefer not|decline|not to (answer|say|disclose)|choose not/i;
  if (decline.test(value)) return options.find((o) => decline.test(o));
  if (v === "yes" || v === "no") return options.find((o) => new RegExp(`^${v}\\b`, "i").test(o.trim()));
  return options.find((o) => o.toLowerCase().includes(v)) ?? options.find((o) => v.includes(o.trim().toLowerCase()) && o.trim().length > 2);
}

/** The saved answer for one field, fitted to its options, if there is one. */
export function answerFor(f: ApplyField, store: AnswerStore): string | undefined {
  if (f.type === "file") return undefined;
  const learned = store.learned[keyOf(f.label)]?.value;
  const b = basicFor(f.label);
  const basic = b ? store.basics[b.key] : undefined;
  for (const v of [learned, basic]) {
    if (!v) continue;
    if (f.options?.length) {
      const o = pickOption(v, f.options);
      if (o) return o;
      continue;
    }
    if (f.type === "checkbox") continue;
    return v;
  }
  return undefined;
}

/** Saved answers as plain notes for the AI drafting the rest of the form. */
export function answersMemo(store: AnswerStore): string {
  const lines: string[] = [];
  for (const b of BASICS) {
    const v = store.basics[b.key];
    if (v) lines.push(`- ${b.label}: ${v}`);
  }
  for (const l of Object.values(store.learned).slice(-60)) lines.push(`- ${l.label}: ${l.value}`);
  return lines.length ? `\n\nApplication answers the candidate has saved (use them; don't invent others):\n${lines.join("\n")}` : "";
}

/** Keeps the short answers she approved on a form; notes the required ones left empty. */
export function learnFrom(fields: ApplyField[], answers: Record<string, string>, company: string) {
  const store = readAnswers();
  const examples = exampleValues();
  const now = new Date().toISOString();
  const co = company.trim().toLowerCase();
  for (const f of fields) {
    if (f.type === "file" || f.type === "textarea") continue;
    const label = f.label.trim();
    const k = keyOf(label);
    if (!k || k.length < 2) continue;
    if (co && co.length > 2 && label.toLowerCase().includes(co)) continue;
    const value = (answers[f.id] ?? "").trim();
    if (!value) {
      if (f.required && !answerFor(f, store)) store.missing[k] = { label, at: now };
      continue;
    }
    if (value.length > 150 || examples.has(value)) continue;
    delete store.missing[k];
    const prev = store.learned[k];
    store.learned[k] = { label, value, at: now, uses: (prev?.uses ?? 0) + 1 };
  }
  writeAnswers(store);
}
