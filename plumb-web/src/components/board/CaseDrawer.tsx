"use client";

import { useTransition, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn, formatUsd } from "@/lib/utils";
import { CONTEXT_GATE, STAGE_LABELS, STAGES, type CaseStage } from "@/lib/types";
import type { CaseDetail } from "@/lib/db/cases";
import {
  addRequirementAction,
  classifyCaseAction,
  kickoffBuildAction,
  moveCaseStageAction,
  openCaseAction,
  rescoreContextAction,
  updateRequirementStatusAction,
} from "@/app/app/actions";

export function CaseDrawer({
  detail,
  open,
  onOpenChange,
  onUpdated,
}: {
  detail: CaseDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [newReq, setNewReq] = useState("");
  const [addingReq, setAddingReq] = useState(false);

  if (!detail) return null;

  const gaps = (detail.contextGaps ?? []) as { text?: string; severity?: string }[];
  const showAeSync = detail.contextScore < CONTEXT_GATE;

  const run = (fn: () => Promise<{ error?: string }>) => {
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        alert(result.error);
        return;
      }
      onUpdated();
    });
  };

  const submitReq = () => {
    if (!newReq.trim()) return;
    const text = newReq;
    setNewReq("");
    setAddingReq(false);
    run(() => addRequirementAction(detail.id, text));
  };

  const open_ = detail.requirements.filter((r) => r.status === "open");
  const confirmed = detail.requirements.filter((r) => r.status === "confirmed");
  const dropped = detail.requirements.filter((r) => r.status === "dropped");

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) run(() => openCaseAction(detail.id));
        onOpenChange(next);
      }}
      title={`${detail.externalId} — ${detail.clientName}`}
    >
      <div className="space-y-6">

        {/* Header */}
        <div>
          <h3 className="text-lg font-semibold text-text mb-1">{detail.title}</h3>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge>{STAGE_LABELS[detail.stage]}</Badge>
            {detail.type && (
              <Badge variant={detail.type === "quickwin" ? "green" : "signal"}>
                {detail.type === "quickwin" ? "Quick Win" : "Big Bet"}
              </Badge>
            )}
            <Badge variant="muted">{formatUsd(detail.valueUsd)}</Badge>
            {detail.aeName && <Badge variant="muted">AE {detail.aeName}</Badge>}
          </div>
        </div>

        {/* Context score */}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-text-muted">Context score</span>
            <span className="font-mono text-text">{detail.contextScore}/100</span>
          </div>
          <Progress value={detail.contextScore} />
          {showAeSync && (
            <p className="mt-2 text-sm text-amber">
              Context gap — request AE sync before build.
            </p>
          )}
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            disabled={pending}
            onClick={() => run(() => rescoreContextAction(detail.id))}
          >
            Re-score context
          </Button>
        </div>

        {/* Context gaps */}
        {gaps.length > 0 && (
          <div>
            <h4 className="text-xs uppercase tracking-wider text-text-muted mb-2">Gaps</h4>
            <ul className="space-y-2">
              {gaps.map((g, i) => (
                <li
                  key={i}
                  className={cn(
                    "text-sm rounded border border-line px-3 py-2",
                    g.severity === "high" && "border-amber/40 text-amber",
                  )}
                >
                  {g.text ?? String(g)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Requirements */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs uppercase tracking-wider text-text-muted">
              Requirements ({detail.requirements.length})
            </h4>
            <button
              type="button"
              className="text-xs text-signal hover:underline"
              onClick={() => setAddingReq((v) => !v)}
            >
              {addingReq ? "cancel" : "+ add"}
            </button>
          </div>

          {addingReq && (
            <div className="flex gap-2 mb-3">
              <input
                autoFocus
                className="flex-1 rounded border border-line bg-bg px-2 py-1.5 text-sm text-text placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-signal"
                placeholder="e.g. OAuth 2.0 scope confirmed"
                value={newReq}
                onChange={(e) => setNewReq(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitReq(); }}
              />
              <Button size="sm" disabled={pending || !newReq.trim()} onClick={submitReq}>
                Add
              </Button>
            </div>
          )}

          {/* Open requirements */}
          {open_.length > 0 && (
            <ul className="space-y-1.5 mb-3">
              {open_.map((r) => (
                <li key={r.id} className="flex items-start gap-2 group">
                  <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-text-muted/40 flex-shrink-0 mt-2" />
                  <span className="flex-1 text-sm text-text font-mono">{r.text}</span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      type="button"
                      title="Confirm"
                      disabled={pending}
                      className="text-xs text-signal hover:text-signal/70 font-mono"
                      onClick={() => run(() => updateRequirementStatusAction(r.id, "confirmed"))}
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      title="Drop"
                      disabled={pending}
                      className="text-xs text-text-muted hover:text-amber font-mono"
                      onClick={() => run(() => updateRequirementStatusAction(r.id, "dropped"))}
                    >
                      ✗
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Confirmed */}
          {confirmed.length > 0 && (
            <ul className="space-y-1 mb-2">
              {confirmed.map((r) => (
                <li key={r.id} className="flex items-start gap-2 group">
                  <span className="text-signal text-xs mt-0.5 flex-shrink-0">✓</span>
                  <span className="flex-1 text-sm text-text-muted font-mono line-through">{r.text}</span>
                  <button
                    type="button"
                    title="Reopen"
                    disabled={pending}
                    className="text-xs text-text-muted/50 hover:text-text-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    onClick={() => run(() => updateRequirementStatusAction(r.id, "open"))}
                  >
                    undo
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Dropped */}
          {dropped.length > 0 && (
            <ul className="space-y-1">
              {dropped.map((r) => (
                <li key={r.id} className="flex items-start gap-2 group">
                  <span className="text-amber text-xs mt-0.5 flex-shrink-0">✗</span>
                  <span className="flex-1 text-sm text-text-muted/50 font-mono line-through">{r.text}</span>
                  <button
                    type="button"
                    title="Reopen"
                    disabled={pending}
                    className="text-xs text-text-muted/50 hover:text-text-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    onClick={() => run(() => updateRequirementStatusAction(r.id, "open"))}
                  >
                    undo
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Classify */}
        <div>
          <h4 className="text-xs uppercase tracking-wider text-text-muted mb-2">Classify</h4>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={detail.type === "quickwin" ? "default" : "secondary"}
              size="sm"
              disabled={pending}
              onClick={() => run(() => classifyCaseAction(detail.id, "quickwin"))}
            >
              Quick Win
            </Button>
            <Button
              variant={detail.type === "bigbet" ? "default" : "secondary"}
              size="sm"
              disabled={pending}
              onClick={() => run(() => classifyCaseAction(detail.id, "bigbet"))}
            >
              Big Bet
            </Button>
          </div>
        </div>

        {/* Build kickoff */}
        <div>
          <h4 className="text-xs uppercase tracking-wider text-text-muted mb-2">Build</h4>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run(() => kickoffBuildAction(detail.id, "plumb"))}
            >
              Kick off Plumb agent
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => run(() => kickoffBuildAction(detail.id, "mcp"))}
            >
              Use my MCP stack
            </Button>
          </div>
        </div>

        {/* Build prompt output */}
        {detail.buildPrompt && (
          <div>
            <h4 className="text-xs uppercase tracking-wider text-text-muted mb-2">
              Build prompt
            </h4>
            <pre className="text-xs font-mono whitespace-pre-wrap bg-bg border border-line rounded p-3 text-text-muted max-h-64 overflow-y-auto">
              {detail.buildPrompt}
            </pre>
          </div>
        )}

        {/* Stage movement */}
        <div>
          <h4 className="text-xs uppercase tracking-wider text-text-muted mb-2">Move stage</h4>
          <div className="flex flex-wrap gap-2">
            {STAGES.map((stage) => (
              <Button
                key={stage}
                variant={detail.stage === stage ? "default" : "ghost"}
                size="sm"
                disabled={pending || detail.stage === stage}
                onClick={() => run(() => moveCaseStageAction(detail.id, stage as CaseStage))}
              >
                {STAGE_LABELS[stage]}
              </Button>
            ))}
          </div>
        </div>

        {/* Event log */}
        <div>
          <h4 className="text-xs uppercase tracking-wider text-text-muted mb-2">
            Signals ({detail.events.length})
          </h4>
          <ul className="space-y-2 max-h-48 overflow-y-auto">
            {detail.events.map((e) => (
              <li key={e.id} className="text-xs font-mono text-text-muted flex gap-2">
                <span className="text-signal flex-shrink-0">{e.kind}</span>
                <span className="truncate">{e.detail}</span>
                <span className="text-text-muted/40 ml-auto flex-shrink-0">
                  {new Date(e.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Sheet>
  );
}
