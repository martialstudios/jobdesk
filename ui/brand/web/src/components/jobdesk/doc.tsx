"use client";
// JobDesk branded builds: Markdown shown as a clean document (the web UI has
// no typography plugin, and Tailwind's reset flattens headings and lists).
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const STYLE = `
.jd-doc{color:var(--fg);line-height:1.6;font-size:15px}
.jd-doc h1{font-size:1.7em;font-weight:600;margin:.2em 0 .3em;letter-spacing:-.01em}
.jd-doc h2{font-size:1.05em;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:hsl(186 60% 32%);
  border-bottom:1px solid color-mix(in srgb,var(--fg) 14%,transparent);padding-bottom:.25em;margin:1.4em 0 .6em}
.dark .jd-doc h2{color:hsl(186 55% 60%)}
.jd-doc h3{font-size:1.02em;font-weight:600;margin:1em 0 .2em}
.jd-doc p{margin:.35em 0}
.jd-doc ul,.jd-doc ol{margin:.35em 0 .6em 1.3em}
.jd-doc ul{list-style:disc}.jd-doc ol{list-style:decimal}
.jd-doc li{margin:.2em 0}
.jd-doc strong{font-weight:600}
.jd-doc a{color:hsl(26 73% 45%);text-decoration:underline;text-underline-offset:2px}
.jd-doc table{border-collapse:collapse;margin:.8em 0;font-size:.9em;display:block;overflow-x:auto}
.jd-doc th,.jd-doc td{border:1px solid color-mix(in srgb,var(--fg) 14%,transparent);padding:.4em .6em;text-align:left;vertical-align:top}
.jd-doc th{font-weight:600;background:color-mix(in srgb,var(--fg) 5%,transparent)}
.jd-doc code{font-size:.9em}
.jd-doc hr{border:0;border-top:1px solid color-mix(in srgb,var(--fg) 12%,transparent);margin:1.2em 0}
`;

/** `lines`: keep line breaks as written (resumes put contact details and
 *  "Title, dates" on their own lines; Markdown would join them). */
export function Doc({ children, className = "", lines = false }: { children: string; className?: string; lines?: boolean }) {
  const text = lines ? children.replace(/([^\n])\n(?=[^\n#\-*|>\d])/g, "$1  \n") : children;
  return (
    <div className={`jd-doc ${className}`}>
      <style dangerouslySetInnerHTML={{ __html: STYLE }} />
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
