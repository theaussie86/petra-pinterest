import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'

// Guards the CI-Deploy für Edge Functions (issue #86): a merge to main must
// deploy the Supabase Edge Functions when — and only when — something under
// supabase/functions changed, mirroring the existing Trigger.dev deploy job,
// and it must never apply database migrations.

interface WorkflowStep {
  name?: string
  if?: string
  run?: string
  uses?: string
  env?: Record<string, string>
  with?: Record<string, string>
}

interface WorkflowJob {
  needs?: string | string[]
  if?: string
  steps?: WorkflowStep[]
}

interface Workflow {
  on?: unknown
  jobs?: Record<string, WorkflowJob>
}

const ci = yaml.load(
  readFileSync(resolve(__dirname, '../../.github/workflows/ci.yml'), 'utf8'),
) as Workflow

describe('CI edge-functions deploy job', () => {
  const job = ci.jobs?.['deploy-edge-functions']

  it('exists and runs after ci only on a push to main', () => {
    expect(job).toBeDefined()
    expect(job?.needs).toBe('ci')
    expect(job?.if).toContain("github.ref == 'refs/heads/main'")
    expect(job?.if).toContain("github.event_name == 'push'")
  })

  it('detects changes only under supabase/functions', () => {
    const steps = job?.steps ?? []
    const changeStep = steps.find((s) =>
      s.run?.includes('functions_changed'),
    )
    expect(changeStep).toBeDefined()
    expect(changeStep?.run).toContain('git diff --name-only HEAD~1 HEAD')
    expect(changeStep?.run).toContain('supabase/functions/')
  })

  it('deploys the functions gated on the change check', () => {
    const steps = job?.steps ?? []
    const deployStep = steps.find((s) =>
      s.run?.includes('supabase functions deploy'),
    )
    expect(deployStep).toBeDefined()
    expect(deployStep?.if).toContain(
      "steps.changes.outputs.functions_changed == 'true'",
    )
    // Uses the documented deploy token secret.
    expect(deployStep?.env?.SUPABASE_ACCESS_TOKEN).toContain(
      'secrets.SUPABASE_ACCESS_TOKEN',
    )
  })

  it('never applies database migrations', () => {
    const steps = job?.steps ?? []
    for (const step of steps) {
      expect(step.run ?? '').not.toContain('db push')
      expect(step.run ?? '').not.toContain('migration up')
      expect(step.run ?? '').not.toContain('migrations up')
    }
  })
})
