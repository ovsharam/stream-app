import type { EngagementStage } from './fde-engagement'

/** Stages for the FDE deployment workspace — intake through deploy. */
export const PIPELINE_STAGES: {
  id: EngagementStage
  label: string
  hint: string
}[] = [
  {
    id: 'intake',
    label: 'Intake',
    hint: 'Scope inbound · qualify technical buyer · AE alignment'
  },
  {
    id: 'context',
    label: 'Context',
    hint: 'Discovery · requirements · context score gate'
  },
  {
    id: 'build',
    label: 'Build',
    hint: 'Solutioning · agents · POC · custom deploy path'
  },
  {
    id: 'test',
    label: 'Test',
    hint: 'Validation · UAT · buyer sign-off'
  },
  {
    id: 'deploy',
    label: 'Deploy',
    hint: 'Production handoff · support · expansion'
  },
  {
    id: 'paused',
    label: 'On hold',
    hint: 'Stalled · waiting on customer or internal'
  }
]

export const PIPELINE_THESIS =
  'One workspace for forward-deployed engineering — intake, context, build, test, and deploy without switching tools.'
