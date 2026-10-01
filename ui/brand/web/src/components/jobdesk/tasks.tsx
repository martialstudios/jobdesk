"use client";

// JobDesk branded builds: "Score these" and "Tailor my resume for these" for a
// group of jobs on My list. Queued in the browser and worked through in the
// background with career-ops's own workers (useJobs().startJob), a few at a
// time, while the person keeps browsing. Tailoring needs a score first
// (career-ops tailors against its evaluation), so a tailor task scores first.

import { useCallback, useEffect, useRef, useState } from "react";
import { useJobs } from "@/components/jobs/job-store";

export type Task = { url: string; company: string; title: string; tailor: boolean; failed?: string };

const KEY = "jobdesk:tasks";
const EVENT = "jobdesk:tasks";
const MAX_SCORING = 2;
const MAX_TAILORING = 1;

export function readTasks(): Task[] {
  try {
    const t = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(t) ? t : [];
  } catch {
    return [];
  }
}

function writeTasks(tasks: Task[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(tasks));
  } catch {
    /* private mode: the run still happens this session */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function queueTasks(items: { url: string; company: string; title: string }[], tailor: boolean) {
  const tasks = readTasks();
  for (const i of items) {
    const have = tasks.find((t) => t.url === i.url);
    if (have) {
      have.tailor = have.tailor || tailor;
      delete have.failed;
    } else tasks.push({ url: i.url, company: i.company, title: i.title, tailor });
  }
  writeTasks(tasks);
}

export function clearFailed(url: string) {
  writeTasks(readTasks().filter((t) => t.url !== url));
}

/** The queue, kept in sync across components. */
export function useTasks(): Task[] {
  const [tasks, setTasks] = useState<Task[]>([]);
  useEffect(() => {
    const load = () => setTasks(readTasks());
    load();
    window.addEventListener(EVENT, load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, []);
  return tasks;
}

type Scored = { url: string; n?: string; tailored?: boolean };

/** Mounted once in the app shell; does the work. Renders nothing. */
export function TaskRunner() {
  const { jobs, startJob } = useJobs();
  const tasks = useTasks();
  const [list, setList] = useState<Scored[]>([]);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  const refresh = useCallback(async () => {
    try {
      const d = await (await fetch("/api/jobdesk/list")).json();
      if (Array.isArray(d.items)) setList(d.items);
    } catch {
      /* try again next tick */
    }
  }, []);

  // While there's work: refresh the list (scores and tailored CVs land there).
  const busy = tasks.some((t) => !t.failed);
  useEffect(() => {
    if (!busy) return;
    void refresh();
    const t = window.setInterval(() => void refresh(), 6000);
    return () => window.clearInterval(t);
  }, [busy, refresh]);

  useEffect(() => {
    if (!busy) return;
    const step = () => {
      const all = readTasks();
      const js = jobsRef.current;
      let scoring = js.filter((j) => j.kind === "evaluate" && j.status === "running").length;
      let tailoring = js.filter((j) => j.kind === "pdf" && j.status === "running").length;
      let changed = false;
      const next: Task[] = [];
      for (const t of all) {
        if (t.failed) {
          next.push(t);
          continue;
        }
        const item = list.find((i) => i.url === t.url);
        if (list.length && !item) {
          changed = true; // removed from the list
          continue;
        }
        const evalJob = js.find((j) => j.kind === "evaluate" && j.input === t.url);
        if (!item?.n) {
          if (evalJob?.status === "running") {
            next.push(t);
          } else if (evalJob && Date.now() - (evalJob.endedAt ?? 0) > 15000) {
            // Finished, but no score showed up.
            next.push({ ...t, failed: "Couldn't score this one. Try again, or open the job to read it yourself." });
            changed = true;
          } else if (!evalJob && scoring < MAX_SCORING) {
            startJob({ title: `Scoring · ${t.company}`, subtitle: t.title, kind: "evaluate", input: t.url, page: "/my-list" });
            scoring++;
            next.push(t);
          } else next.push(t);
          continue;
        }
        if (!t.tailor || item.tailored) {
          changed = true; // done
          continue;
        }
        const pdfJob = js.find((j) => j.kind === "pdf" && j.input === item.n);
        if (pdfJob?.status === "running") next.push(t);
        else if (pdfJob && Date.now() - (pdfJob.endedAt ?? 0) > 20000) {
          next.push({ ...t, failed: "Couldn't tailor the resume for this one. Try again from the job's page." });
          changed = true;
        } else if (!pdfJob && tailoring < MAX_TAILORING) {
          startJob({ title: `Tailoring resume · ${t.company}`, subtitle: t.title, kind: "pdf", input: item.n!, page: `/job/${item.n}` });
          tailoring++;
          next.push(t);
        } else next.push(t);
      }
      if (changed) writeTasks(next);
    };
    step();
    const t = window.setInterval(step, 3000);
    return () => window.clearInterval(t);
  }, [busy, list, startJob]);

  return null;
}
