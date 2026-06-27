export type UserRole = "fde" | "ae" | "am" | "se" | "ce" | "swe" | "admin";

export type CaseStage = "intake" | "context" | "build" | "test" | "deploy";

export type CaseType = "quickwin" | "bigbet";

export type RequirementStatus = "open" | "confirmed" | "dropped";

export type CaseEventKind =
  | "intake"
  | "open_case"
  | "stage_change"
  | "classify"
  | "context_score"
  | "ae_sync"
  | "build_kickoff"
  | "ingest";

export type IntegrationProvider = "gmail" | "slack" | "monday" | "linkedin";

export interface ContextGap {
  text: string;
  severity: "low" | "medium" | "high";
}

export interface ContextScoreResult {
  score: number;
  gaps: ContextGap[];
  aeSyncNeeded: boolean;
  summary: string;
}

export interface IntakeExtraction {
  client: string;
  title: string;
  requirements: string[];
  initialContextScore: number;
  valueUsd?: number;
  aeName?: string;
}

export const STAGES: CaseStage[] = [
  "intake",
  "context",
  "build",
  "test",
  "deploy",
];

export const STAGE_LABELS: Record<CaseStage, string> = {
  intake: "Intake",
  context: "Context Check",
  build: "Build",
  test: "Test",
  deploy: "Deploy",
};

export const CONTEXT_GATE = 60;

// FDE Engagement — mirrors shared/fde-engagement.ts for web client use
export type EngagementStage = 'intake' | 'context' | 'build' | 'test' | 'deploy' | 'paused'
export type ScopeBucket = 'quick_win' | 'big_bet' | 'unknown'
export type EscalationLevel = 0 | 1 | 2

export interface FdeEngagement {
  id: string
  clientName: string
  company?: string
  stage: EngagementStage
  scope: ScopeBucket
  summary?: string
  buildPrompt?: string
  nextSteps: string[]
  flags: string[]
  openQuestions: string[]
  meetingIds: string[]
  feedItemIds: string[]
  proposalIds?: string[]
  signalSources?: ('linkedin' | 'gmail' | 'meeting' | 'monday' | 'slack')[]
  googleDocUrl?: string
  escalationLevel: EscalationLevel
  contextScore?: number
  createdAt: number
  updatedAt: number
}
