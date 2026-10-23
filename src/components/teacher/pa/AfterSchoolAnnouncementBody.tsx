"use client";
import { useState } from "react";
export function AfterSchoolAnnouncementBody({ body }: { body: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-expanded={expanded}
        className="underline text-sm mb-2"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? "[收起名單]" : "[點我查看全部]"}
      </button>
      <p
        className={`text-body whitespace-pre-wrap mb-2 ${expanded ? "" : "line-clamp-6"}`}
        style={{ color: "var(--color-ink-700)" }}
      >
        {body}
      </p>
    </>
  );
}
