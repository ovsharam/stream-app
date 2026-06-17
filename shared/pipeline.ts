import type { EngagementStage } from './fde-engagement'

/** Stages for the agentic conversion layer — SDR/AE top-of-funnel → FDE → post-sales. */
export const PIPELINE_STAGES: {
  id: EngagementStage
  label: string
  hint: string
}[] = [
  {
    id: 'intake',
    label: 'Intake',
    hint: 'Technical buyer surfaced · AE gap · scope the mismatch'
  },
  {
    id: 'build',
    label: 'Build',
    hint: 'FDE solutioning · POC · custom software path'
  },
  {
    id: 'maintenance',
    label: 'Live',
    hint: 'White-glove onboard · support · expansion'
  },
  {
    id: 'paused',
    label: 'Paused',
    hint: 'Stalled pipeline · revisit later'
  }
]

export const PIPELINE_THESIS =
  'Top-of-funnel is automated — conversion is not. FDEs bridge technical buyers and business-side AEs until agents handle it agent-to-agent.'
