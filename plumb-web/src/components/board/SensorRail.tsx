"use client";

import { useEffect, useRef, useState } from "react";
import type { CaseEventRow } from "@/lib/db/schema";

export function SensorRail({
  orgId,
  initialEvent,
}: {
  orgId: string;
  initialEvent: CaseEventRow | null;
}) {
  const [event, setEvent] = useState(initialEvent);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Primary: SSE stream from /api/events/stream
    const es = new EventSource("/api/events/stream");
    esRef.current = es;

    es.onmessage = (e) => {
      if (!e.data || e.data.startsWith(":")) return;
      try {
        const row = JSON.parse(e.data as string) as CaseEventRow;
        setEvent(row);
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      // EventSource reconnects automatically — no manual handling needed
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [orgId]);

  const mono = { fontFamily: "var(--font-jetbrains), monospace" } as const;

  if (!event) {
    return (
      <div style={{ height: 28, display: "flex", alignItems: "center", paddingLeft: 0 }}>
        <span style={{ fontSize: 11, color: "#bbb", ...mono }}>sensor idle</span>
      </div>
    );
  }

  return (
    <div style={{ height: 28, display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#1db584", flexShrink: 0, animation: "dot-blink 2s ease-in-out infinite" }} />
      <span style={{ fontSize: 11, color: "#1db584", textTransform: "uppercase", letterSpacing: "0.06em", ...mono, flexShrink: 0 }}>{event.kind}</span>
      <span style={{ fontSize: 11.5, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{event.detail}</span>
      <span style={{ fontSize: 11, color: "#bbb", ...mono, flexShrink: 0 }}>
        {new Date(event.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
    </div>
  );
}
