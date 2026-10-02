// JobDesk branded builds: where a job is, for Find jobs' "within N miles" and
// "US only". Job boards write locations every way ("Irvine, CA", "Remote -
// USA", "Office - Los Angeles, CA; San Diego", "Toronto - Remote · Canada"),
// so each one is split into places and matched against US Census places
// (public/jobdesk-us-places.tsv: 32,000 US cities and towns with
// coordinates, public domain). All on this Mac; nothing is looked up online.

import fs from "node:fs";
import path from "node:path";

export type Where = {
  /** true: a US location; false: only outside the US; null: can't tell. */
  us: boolean | null;
  remote: boolean;
  /** Nearest of its US places to home, in miles; null when it has none. */
  miles: number | null;
};
type Point = { lat: number; lon: number };

const STATES: Record<string, string> = {
  AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas", CA: "california", CO: "colorado", CT: "connecticut",
  DE: "delaware", FL: "florida", GA: "georgia", HI: "hawaii", ID: "idaho", IL: "illinois", IN: "indiana", IA: "iowa",
  KS: "kansas", KY: "kentucky", LA: "louisiana", ME: "maine", MD: "maryland", MA: "massachusetts", MI: "michigan",
  MN: "minnesota", MS: "mississippi", MO: "missouri", MT: "montana", NE: "nebraska", NV: "nevada", NH: "new hampshire",
  NJ: "new jersey", NM: "new mexico", NY: "new york", NC: "north carolina", ND: "north dakota", OH: "ohio",
  OK: "oklahoma", OR: "oregon", PA: "pennsylvania", RI: "rhode island", SC: "south carolina", SD: "south dakota",
  TN: "tennessee", TX: "texas", UT: "utah", VT: "vermont", VA: "virginia", WA: "washington", WV: "west virginia",
  WI: "wisconsin", WY: "wyoming", DC: "district of columbia", PR: "puerto rico",
};
const CODE_BY_NAME = Object.fromEntries(Object.entries(STATES).map(([c, n]) => [n, c]));

// Bare city names that mean one place to almost everyone.
const MAJOR: Record<string, string> = {
  "new york": "NY", "los angeles": "CA", "chicago": "IL", "houston": "TX", "phoenix": "AZ", "philadelphia": "PA",
  "san antonio": "TX", "san diego": "CA", "dallas": "TX", "san jose": "CA", "austin": "TX", "jacksonville": "FL",
  "san francisco": "CA", "seattle": "WA", "denver": "CO", "boston": "MA", "nashville": "TN", "detroit": "MI",
  "las vegas": "NV", "atlanta": "GA", "miami": "FL", "minneapolis": "MN", "pittsburgh": "PA", "salt lake city": "UT",
  "raleigh": "NC", "charlotte": "NC", "baltimore": "MD", "sacramento": "CA", "oakland": "CA", "irvine": "CA",
  "santa monica": "CA", "palo alto": "CA", "mountain view": "CA", "menlo park": "CA", "sunnyvale": "CA",
  "san mateo": "CA", "redwood city": "CA", "huntington beach": "CA", "newport beach": "CA", "costa mesa": "CA",
  "anaheim": "CA", "long beach": "CA", "pasadena": "CA", "burbank": "CA", "culver city": "CA", "el segundo": "CA",
  "santa ana": "CA", "brooklyn": "NY", "manhattan": "NY", "washington dc": "DC", "washington d.c.": "DC",
  "new york city": "NY", "nyc": "NY", "sf": "CA", "bay area": "CA", "san francisco bay area": "CA",
};
const ALIAS: Record<string, string> = {
  "new york city": "new york", nyc: "new york", manhattan: "new york", brooklyn: "new york", sf: "san francisco",
  "bay area": "san francisco", "san francisco bay area": "san francisco", "washington dc": "washington",
  "washington d.c.": "washington", honolulu: "urban honolulu",
};

const FOREIGN = new RegExp(
  "\\b(" +
    [
      "canada", "mexico", "united kingdom", "uk", "u\\.k\\.", "england", "scotland", "wales", "ireland", "germany",
      "france", "spain", "portugal", "italy", "netherlands", "belgium", "switzerland", "austria", "poland", "czechia",
      "czech republic", "sweden", "norway", "denmark", "finland", "estonia", "latvia", "lithuania", "romania",
      "bulgaria", "greece", "turkey", "ukraine", "israel", "india", "pakistan", "bangladesh", "sri lanka", "nepal",
      "china", "hong kong", "taiwan", "japan", "korea", "south korea", "singapore", "malaysia", "indonesia",
      "philippines", "thailand", "vietnam", "australia", "new zealand", "brazil", "argentina", "chile", "colombia",
      "peru", "uruguay", "costa rica", "guatemala", "dominican republic", "nigeria", "kenya", "south africa",
      "egypt", "morocco", "ghana", "uae", "united arab emirates", "saudi arabia", "qatar", "kazakhstan", "serbia",
      "croatia", "hungary", "slovakia", "slovenia", "cyprus", "malta", "luxembourg", "iceland", "armenia", "georgia \\(country\\)",
      "emea", "apac", "latam", "europe", "european union", "eu", "asia", "africa", "oceania", "anz",
      "toronto", "vancouver", "montreal", "montréal", "ottawa", "calgary", "edmonton", "waterloo", "london", "manchester",
      "edinburgh", "dublin", "berlin", "munich", "münchen", "hamburg", "frankfurt", "paris", "lyon", "madrid",
      "barcelona", "lisbon", "milan", "rome", "amsterdam", "rotterdam", "brussels", "zurich", "zürich", "geneva",
      "vienna", "stockholm", "copenhagen", "oslo", "helsinki", "warsaw", "krakow", "kraków", "prague", "budapest",
      "bucharest", "athens", "istanbul", "tel aviv", "bangalore", "bengaluru", "hyderabad", "mumbai", "delhi",
      "new delhi", "pune", "chennai", "gurgaon", "gurugram", "noida", "tokyo", "osaka", "seoul", "beijing",
      "shanghai", "shenzhen", "taipei", "manila", "jakarta", "kuala lumpur", "bangkok", "ho chi minh", "hanoi",
      "sydney", "melbourne", "brisbane", "perth", "auckland", "wellington", "sao paulo", "são paulo",
      "rio de janeiro", "buenos aires", "santiago", "bogota", "bogotá", "medellin", "medellín", "lima",
      "mexico city", "ciudad de méxico", "guadalajara", "monterrey", "dubai", "abu dhabi", "riyadh", "doha",
      "cairo", "lagos", "nairobi", "cape town", "johannesburg", "kyiv", "kiev", "almaty", "heredia", "san josé, costa rica",
    ].join("|") +
    ")\\b",
  "i",
);
const CA_PROVINCES = /,\s*(ON|BC|QC|AB|MB|NS|NB|NL|PE|SK)\b/;
// Not "America" alone: "Latin America" isn't the US.
const US_WORDS = /united states|\busa\b|\bu\.s\.(?:a\.)?|north america|nationwide/i;
const US_CODE = /\bUS\b/;
const REMOTE = /\b(remote|anywhere|work from home|wfh|distributed|virtual)\b/i;
const NOT_A_PLACE = /\b(remote|anywhere|work from home|wfh|distributed|virtual|hybrid|on-?site|in-office|flexible)\b/gi;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\bsaint\b/g, "st.")
    .replace(/\bst\b(?!\.)/g, "st.")
    .replace(/^(greater|downtown|metro)\s+/, "")
    .replace(/\s+(metropolitan area|metro area|area|metro)$/, "")
    .replace(/\s+/g, " ")
    .trim();

let INDEX: Map<string, Point> | null = null;
let BY_NAME: Map<string, string[]> | null = null;

function load() {
  if (INDEX) return;
  INDEX = new Map();
  BY_NAME = new Map();
  let text = "";
  try {
    text = fs.readFileSync(path.join(/* turbopackIgnore: true */ process.cwd(), "public", "jobdesk-us-places.tsv"), "utf8");
  } catch {
    return;
  }
  const add = (name: string, st: string, p: Point) => {
    const key = `${name}|${st}`;
    if (INDEX!.has(key)) return;
    INDEX!.set(key, p);
    BY_NAME!.set(name, [...(BY_NAME!.get(name) || []), st]);
  };
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const [st, name, lat, lon] = line.split("\t");
    const p = { lat: Number(lat), lon: Number(lon) };
    if (!Number.isFinite(p.lat)) continue;
    const n = norm(name);
    add(n, st, p);
    // "Nashville-Davidson", "Louisville/Jefferson County": the city too.
    const first = n.split(/[-/]/)[0].trim();
    if (first && first !== n) add(first, st, p);
  }
}

function lookup(city: string, st?: string, homeSt?: string): Point | null {
  load();
  let n = norm(city);
  n = ALIAS[n] ?? n;
  if (st) return INDEX!.get(`${n}|${st}`) ?? null;
  const states = BY_NAME!.get(n) || [];
  const pick = MAJOR[norm(city)] ?? (states.length === 1 ? states[0] : homeSt && states.includes(homeSt) ? homeSt : undefined);
  return pick ? INDEX!.get(`${n}|${pick}`) ?? null : null;
}

function stateOf(token: string): string | undefined {
  const t = token.trim().replace(/\.$/, "");
  if (/^[A-Z]{2}$/.test(t) && STATES[t]) return t;
  return CODE_BY_NAME[t.toLowerCase()];
}

function miles(a: Point, b: Point): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLon = r(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

/** "Huntington Beach, CA" → its point and state. */
export function placeOf(home: string): { point: Point; st: string } | null {
  const parts = home.split(",").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const st = parts.slice(1).map(stateOf).find(Boolean);
  const point = lookup(parts[0], st);
  if (!point) return null;
  return { point, st: st ?? MAJOR[norm(parts[0])] ?? "" };
}

export function where(loc: string, home: { point: Point; st: string } | null): Where {
  const text = String(loc || "").trim();
  const remote = REMOTE.test(text);
  let us = US_WORDS.test(text) || US_CODE.test(text);
  const foreign = FOREIGN.test(text) || CA_PROVINCES.test(text);
  let best: number | null = null;

  const segments = text
    .split(/\s*(?:;|\||·|•|\n|\s-\s|\s–\s|\s\/\s|\sor\s|\sand\s|\s&\s)\s*/)
    .map((seg) =>
      seg
        .replace(/^(office|hq|headquarters)\s*[:-]?\s*/i, "")
        .replace(NOT_A_PLACE, " ")
        .replace(/[()]/g, ",")
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p && !US_WORDS.test(p) && !US_CODE.test(p)),
    )
    .filter((parts) => parts.length);

  // States named anywhere help the bare city names elsewhere in the string.
  const states = new Set<string>();
  for (const parts of segments) for (const p of parts) {
    const st = stateOf(p);
    if (st) states.add(st);
  }
  if (states.size) us = true;

  for (const parts of segments) {
    let point: Point | null = null;
    const stIdx = parts.findIndex((p, i) => i > 0 && stateOf(p));
    if (stIdx > 0) point = lookup(parts[stIdx - 1], stateOf(parts[stIdx]));
    else if (!stateOf(parts[0]) && !FOREIGN.test(parts[0])) {
      for (const st of states) {
        point = lookup(parts[0], st);
        if (point) break;
      }
      // A state was named: a same-name town in another state isn't it
      // (Northridge, a part of LA, isn't Northridge, Ohio).
      if (!point && !states.size) point = lookup(parts[0], undefined, home?.st);
    }
    if (point) {
      us = true;
      if (home) {
        const m = miles(home.point, point);
        best = best === null ? m : Math.min(best, m);
      }
    }
  }
  return { us: us ? true : foreign ? false : null, remote, miles: best === null ? null : Math.round(best) };
}
