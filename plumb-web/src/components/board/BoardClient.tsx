"use client";

import { useCallback, useState, useTransition } from "react";
import { PipelineColumn } from "./CaseCard";
import { CaseDrawer } from "./CaseDrawer";
import { SensorRail } from "./SensorRail";
import { PlumbLogo } from "@/app/plumb-logo";
import { formatUsd } from "@/lib/utils";
import { STAGES, STAGE_LABELS, type CaseStage } from "@/lib/types";
import type { CaseWithClient, CaseDetail } from "@/lib/db/cases";
import type { CaseEventRow } from "@/lib/db/schema";
import { getCaseDetailAction, ingestCaseAction, ingestFromInboxAction } from "@/app/app/actions";
import type { InboxThread } from "@/lib/integrations/inbox";

// ── Design tokens ──────────────────────────────────────────────────────────
const C = {
  bg:       "#f5f4f1",   // warm off-white page bg
  sidebar:  "#ffffff",   // sidebar
  card:     "#ffffff",   // content cards
  border:   "#e8e6e1",   // warm gray border
  ink:      "#111111",   // primary text
  muted:    "#777777",   // secondary text
  subtle:   "#aaaaaa",   // tertiary
  teal:     "#1db584",   // accent
  amber:    "#d97706",   // warning
} as const;

const mono = { fontFamily: "var(--font-jetbrains), monospace" };

const NAV = [
  { key: "pipeline", label: "Pipeline",  icon: "⬦" },
  { key: "inbox",    label: "Inbox",     icon: "◻" },
  { key: "settings", label: "Settings",  icon: "⊙" },
] as const;

export function BoardClient({
  orgId,
  initialCases,
  initialStats,
  initialEvent,
  inboxThreads,
}: {
  orgId: string;
  initialCases: CaseWithClient[];
  initialStats: { openCases: number; pipelineUsd: number; contextGaps: number; signalsLogged: number };
  initialEvent: CaseEventRow | null;
  inboxThreads: InboxThread[];
}) {
  const [cases, setCases] = useState(initialCases);
  const [stats, setStats] = useState(initialStats);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeNav, setActiveNav] = useState<"pipeline" | "inbox" | "settings">("pipeline");
  const [showIntake, setShowIntake] = useState(false);
  const [intakeText, setIntakeText] = useState("");
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    const res = await fetch("/api/board/refresh", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { cases: CaseWithClient[]; stats: typeof initialStats };
    setCases(data.cases);
    setStats(data.stats);
    if (selectedId) {
      const d = await getCaseDetailAction(selectedId);
      if (d) setDetail(d);
    }
  }, [selectedId]);

  const openCase = (id: string) => {
    setSelectedId(id);
    setDrawerOpen(true);
    startTransition(async () => {
      const d = await getCaseDetailAction(id);
      setDetail(d);
    });
  };

  const byStage = (stage: CaseStage) => cases.filter((c) => c.stage === stage);

  const submitIntake = () => {
    if (!intakeText.trim()) return;
    const text = intakeText;
    setIntakeText("");
    setShowIntake(false);
    startTransition(async () => {
      const result = await ingestCaseAction(text);
      if (result.error) { alert(result.error); return; }
      await refresh();
    });
  };

  const activeCases = cases.filter((c) => c.stage !== "deploy");
  const needsAttention = cases.filter((c) => c.contextScore < 60 && c.stage !== "deploy");

  return (
    <div style={{ display: "flex", height: "100vh", background: C.bg, fontFamily: "var(--font-inter), system-ui, sans-serif" }}>

      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <aside style={{ width: 220, background: C.sidebar, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>

        {/* Logo */}
        <div style={{ padding: "18px 18px 14px", borderBottom: `1px solid ${C.border}` }}>
          <PlumbLogo size={22} />
        </div>

        {/* Nav */}
        <nav style={{ padding: "8px 8px 0" }}>
          {NAV.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveNav(item.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                width: "100%",
                padding: "7px 10px",
                borderRadius: 7,
                border: "none",
                cursor: "pointer",
                fontSize: 13.5,
                fontWeight: activeNav === item.key ? 600 : 400,
                color: activeNav === item.key ? C.ink : C.muted,
                background: activeNav === item.key ? C.bg : "transparent",
                letterSpacing: "-0.01em",
                textAlign: "left",
                transition: "background 0.1s, color 0.1s",
              }}
            >
              <span style={{ fontSize: 11, width: 16, textAlign: "center", color: activeNav === item.key ? C.teal : C.subtle }}>
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Active cases list */}
        <div style={{ marginTop: 20, padding: "0 8px", flex: 1, overflowY: "auto" }}>
          <p style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: C.subtle, padding: "0 10px", marginBottom: 6 }}>
            Active cases
          </p>
          {activeCases.slice(0, 8).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => openCase(c.id)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 9,
                width: "100%",
                padding: "7px 10px",
                borderRadius: 7,
                border: "none",
                cursor: "pointer",
                background: selectedId === c.id ? C.bg : "transparent",
                textAlign: "left",
              }}
            >
              <span style={{
                width: 7, height: 7, borderRadius: "50%", flexShrink: 0, marginTop: 4,
                background: c.contextScore >= 60 ? C.teal : C.amber,
              }} />
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 12.5, fontWeight: 500, color: C.ink, lineHeight: 1.35, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.clientName}
                </p>
                <p style={{ fontSize: 11, color: C.subtle, marginTop: 1, ...mono }}>
                  {c.externalId}
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* Intake button at bottom */}
        <div style={{ padding: "12px 12px 16px", borderTop: `1px solid ${C.border}` }}>
          <button
            type="button"
            onClick={() => setShowIntake((v) => !v)}
            style={{
              width: "100%", padding: "8px 12px", borderRadius: 8,
              background: C.ink, color: "#fff", border: "none", cursor: "pointer",
              fontSize: 12.5, fontWeight: 600, letterSpacing: "-0.01em",
            }}
          >
            + Intake case
          </button>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Top bar */}
        <header style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: "0 28px", flexShrink: 0 }}>
          <div style={{ height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 24 }}>
              {[
                { label: "Open", value: stats.openCases },
                { label: "Pipeline", value: formatUsd(stats.pipelineUsd) },
                { label: "Context gaps", value: stats.contextGaps },
                { label: "Signals", value: stats.signalsLogged },
              ].map((s) => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, letterSpacing: "-0.02em" }}>{s.value}</span>
                  <span style={{ fontSize: 12, color: C.subtle }}>{s.label}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {needsAttention.length > 0 && (
                <span style={{ fontSize: 11.5, padding: "3px 10px", borderRadius: 99, background: "rgba(217,119,6,0.1)", color: C.amber, fontWeight: 500 }}>
                  {needsAttention.length} need context
                </span>
              )}
            </div>
          </div>
          <SensorRail orgId={orgId} initialEvent={initialEvent} />
        </header>

        {/* Intake panel */}
        {showIntake && (
          <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: "16px 28px" }}>
            <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: "-0.01em", marginBottom: 10, color: C.ink }}>
              Paste call transcript or email thread
            </p>
            <textarea
              autoFocus
              style={{
                width: "100%", minHeight: 100, borderRadius: 8, border: `1px solid ${C.border}`,
                padding: "10px 12px", fontSize: 13, color: C.ink, background: C.bg,
                fontFamily: "var(--font-jetbrains), monospace", resize: "vertical", outline: "none",
              }}
              placeholder="Paste text here and Plumb will extract a case automatically…"
              value={intakeText}
              onChange={(e) => setIntakeText(e.target.value)}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                type="button"
                disabled={pending || !intakeText.trim()}
                onClick={submitIntake}
                style={{ padding: "7px 16px", borderRadius: 7, background: C.ink, color: "#fff", border: "none", cursor: pending ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, opacity: pending || !intakeText.trim() ? 0.5 : 1 }}
              >
                {pending ? "Extracting…" : "Extract & create"}
              </button>
              <button
                type="button"
                onClick={() => { setShowIntake(false); setIntakeText(""); }}
                style={{ padding: "7px 16px", borderRadius: 7, background: "transparent", color: C.muted, border: `1px solid ${C.border}`, cursor: "pointer", fontSize: 13 }}
              >
                Cancel
              </button>
              {inboxThreads.length > 0 && (
                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  {inboxThreads.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      disabled={pending}
                      onClick={() => startTransition(async () => {
                        const r = await ingestFromInboxAction(t.id);
                        if (r.error) alert(r.error);
                        else await refresh();
                      })}
                      style={{ padding: "6px 12px", borderRadius: 7, background: C.bg, border: `1px solid ${C.border}`, cursor: "pointer", fontSize: 11.5, color: C.muted, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {t.subject}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pipeline board */}
        <main style={{ flex: 1, overflowX: "auto", overflowY: "auto", padding: "24px 28px" }}>
          <div style={{ display: "flex", gap: 12, minWidth: "max-content", height: "100%" }}>
            {STAGES.map((stage) => (
              <PipelineColumn
                key={stage}
                stage={stage}
                label={STAGE_LABELS[stage]}
                cases={byStage(stage)}
                onSelect={openCase}
              />
            ))}
          </div>
        </main>
      </div>

      <CaseDrawer
        detail={detail}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onUpdated={refresh}
      />
    </div>
  );
}
