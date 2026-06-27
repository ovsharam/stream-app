"use client";

import { daysUntil, formatUsd } from "@/lib/utils";
import type { CaseWithClient } from "@/lib/db/cases";
import type { CaseStage } from "@/lib/types";

const C = {
  bg:     "#f5f4f1",
  card:   "#ffffff",
  border: "#e8e6e1",
  ink:    "#111111",
  muted:  "#777777",
  subtle: "#aaaaaa",
  teal:   "#1db584",
  amber:  "#d97706",
};

const mono = { fontFamily: "var(--font-jetbrains), monospace" };

function ScoreBar({ score }: { score: number }) {
  const color = score >= 60 ? C.teal : C.amber;
  return (
    <div style={{ height: 3, background: C.bg, borderRadius: 2, overflow: "hidden", marginTop: 10 }}>
      <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.3s" }} />
    </div>
  );
}

export function CaseCard({ caseRow, onClick }: { caseRow: CaseWithClient; onClick: () => void }) {
  const days = daysUntil(caseRow.dueDate);
  const overdue = days !== null && days < 0 && caseRow.stage !== "deploy";
  const scoreColor = caseRow.contextScore >= 60 ? C.teal : C.amber;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "block", width: "100%", textAlign: "left",
        background: C.card, borderRadius: 10,
        border: `1px solid ${overdue ? "rgba(217,119,6,0.35)" : C.border}`,
        padding: "14px 14px 12px",
        cursor: "pointer",
        transition: "border-color 0.15s, box-shadow 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = "#c8c4bd";
        (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = overdue ? "rgba(217,119,6,0.35)" : C.border;
        (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 10.5, color: C.subtle, ...mono }}>{caseRow.externalId}</span>
        {caseRow.type && (
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 99, letterSpacing: "0.02em",
            background: caseRow.type === "quickwin" ? "rgba(29,181,132,0.1)" : "rgba(217,119,6,0.1)",
            color: caseRow.type === "quickwin" ? C.teal : C.amber,
          }}>
            {caseRow.type === "quickwin" ? "Quick Win" : "Big Bet"}
          </span>
        )}
      </div>

      {/* Title */}
      <p style={{ fontSize: 13, fontWeight: 600, color: C.ink, lineHeight: 1.45, letterSpacing: "-0.01em", marginBottom: 3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {caseRow.title}
      </p>

      {/* Client */}
      <p style={{ fontSize: 12, color: C.muted, marginBottom: 2 }}>{caseRow.clientName}</p>

      {/* Score bar */}
      <ScoreBar score={caseRow.contextScore} />

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
        <span style={{ fontSize: 11, color: C.subtle }}>
          {formatUsd(caseRow.valueUsd)}
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {days !== null && caseRow.type && (
            <span style={{ fontSize: 10.5, color: overdue ? C.amber : C.subtle, ...mono }}>
              {overdue ? `${Math.abs(days)}d late` : `${days}d`}
            </span>
          )}
          <span style={{ fontSize: 10.5, color: scoreColor, fontWeight: 600, ...mono }}>
            {caseRow.contextScore}
          </span>
        </div>
      </div>
    </button>
  );
}

export function PipelineColumn({
  stage, label, cases: columnCases, onSelect,
}: {
  stage: CaseStage; label: string; cases: CaseWithClient[]; onSelect: (id: string) => void;
}) {
  const stageColors: Record<string, string> = {
    intake: "#aaaaaa", context: "#d97706", build: "#1db584", test: "#6366f1", deploy: "#111111",
  };
  const dot = stageColors[stage] ?? "#aaa";

  return (
    <div style={{ width: 256, flexShrink: 0, display: "flex", flexDirection: "column" }}>
      {/* Column header */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10, padding: "0 2px" }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, flexShrink: 0 }} />
        <h2 style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.01em", color: "#555", textTransform: "uppercase", flex: 1 }}>
          {label}
        </h2>
        <span style={{ fontSize: 11, color: "#bbb", fontFamily: "var(--font-jetbrains), monospace" }}>
          {columnCases.length}
        </span>
      </div>

      {/* Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-stage={stage}>
        {columnCases.map((c) => (
          <CaseCard key={c.id} caseRow={c} onClick={() => onSelect(c.id)} />
        ))}
        {columnCases.length === 0 && (
          <div style={{ borderRadius: 10, border: `1.5px dashed ${C.border}`, padding: "20px 14px", textAlign: "center" }}>
            <p style={{ fontSize: 11.5, color: "#ccc" }}>Empty</p>
          </div>
        )}
      </div>
    </div>
  );
}
