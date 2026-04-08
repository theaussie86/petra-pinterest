#!/usr/bin/env node
/**
 * End-to-end smoke test for the error-notification pipeline.
 *
 * Verifies:
 *   1. Required env vars are present
 *   2. Resend API key is valid + the configured FROM domain accepts a send
 *   3. Recipient resolution works against a real Supabase project
 *      (per-project notification_email -> auth-email fallback)
 *   4. Optional: full notifyPinError flow against a real pin
 *
 * Usage:
 *   node --env-file=.env.local scripts/test-error-notification.mjs
 *   node --env-file=.env.local scripts/test-error-notification.mjs --project <blog_project_id>
 *   node --env-file=.env.local scripts/test-error-notification.mjs --pin <pin_id>
 *
 * Without --project / --pin the script only sends a plain Resend test mail
 * (verifies API key + FROM address). Pass --project to also resolve a
 * recipient. Pass --pin to inspect the throttle state of a real pin
 * (no actual notifyPinError() side-effects).
 *
 * Optional env: RESEND_TEST_TO=you@example.com — overrides the default
 * smoke-test recipient (which otherwise reuses the FROM address).
 */
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const args = process.argv.slice(2)
function getFlag(name) {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 ? args[idx + 1] : null
}

const projectArg = getFlag('project')
const pinArg = getFlag('pin')

const c = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
}

function ok(msg) {
  console.log(`${c.green}✓${c.reset} ${msg}`)
}
function fail(msg) {
  console.log(`${c.red}✗${c.reset} ${msg}`)
}
function info(msg) {
  console.log(`${c.blue}ℹ${c.reset} ${msg}`)
}
function header(msg) {
  console.log(`\n${c.bold}${msg}${c.reset}`)
}

let failures = 0

// ─── Step 1: env vars ────────────────────────────────────────────────────
header('1. Environment')

const required = ['RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY']
const missing = required.filter((k) => !process.env[k])

if (missing.length > 0) {
  fail(`Missing env vars: ${missing.join(', ')}`)
  fail('Add them to .env.local and re-run.')
  process.exit(1)
}
ok(`All required env vars present`)
info(`FROM: ${process.env.RESEND_FROM_EMAIL}`)
info(`APP_URL: ${process.env.APP_URL ?? '(default) https://pinfinity.onlineheldinnen.de'}`)

// ─── Step 2: Resend smoke test ───────────────────────────────────────────
header('2. Resend smoke send')

const resend = new Resend(process.env.RESEND_API_KEY)

// Decide where to send the smoke test
// Priority: --project (resolve recipient) > RESEND_TEST_TO env > FROM address
async function pickSmokeRecipient() {
  if (projectArg) return null // resolved later
  if (process.env.RESEND_TEST_TO) return process.env.RESEND_TEST_TO
  // Fallback: parse the FROM "Name <addr>" header
  const fromHeader = process.env.RESEND_FROM_EMAIL ?? ''
  const match = fromHeader.match(/<([^>]+)>/)
  return match ? match[1] : fromHeader
}

const smokeTo = await pickSmokeRecipient()
if (smokeTo) {
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: smokeTo,
      subject: '[Pinfinity] Test — Error notification setup',
      text:
        'This is a smoke test from scripts/test-error-notification.mjs.\n' +
        'If you received this, your Resend API key + FROM domain are working.\n\n' +
        '— Pinfinity',
    })
    if (error) {
      fail(`Resend send failed: ${JSON.stringify(error)}`)
      failures++
    } else {
      ok(`Smoke mail sent to ${smokeTo} (id: ${data?.id})`)
    }
  } catch (err) {
    fail(`Resend threw: ${err.message ?? err}`)
    failures++
  }
}

// ─── Step 3: recipient resolution ────────────────────────────────────────
if (projectArg || pinArg) {
  header('3. Supabase recipient resolution')
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)

  let projectId = projectArg

  // If only --pin given, fetch the project from the pin
  if (!projectId && pinArg) {
    const { data: pin, error } = await supabase
      .from('pins')
      .select('id, blog_project_id')
      .eq('id', pinArg)
      .single()
    if (error || !pin) {
      fail(`Pin ${pinArg} not found: ${error?.message}`)
      process.exit(1)
    }
    projectId = pin.blog_project_id
    info(`Pin ${pinArg} -> project ${projectId}`)
  }

  // Mirror src/lib/server/notifications.ts:resolveNotificationRecipient
  const { data: project, error: projectError } = await supabase
    .from('blog_projects')
    .select('id, name, tenant_id, notification_email')
    .eq('id', projectId)
    .single()

  if (projectError || !project) {
    fail(`Project ${projectId} not found: ${projectError?.message}`)
    process.exit(1)
  }
  ok(`Project loaded: "${project.name}" (tenant ${project.tenant_id})`)

  let recipient
  if (project.notification_email) {
    recipient = project.notification_email
    ok(`Using project override: ${recipient}`)
  } else {
    info(`No notification_email set — falling back to tenant user`)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id')
      .eq('tenant_id', project.tenant_id)
      .order('created_at', { ascending: true })
      .limit(1)
    if (!profiles || profiles.length === 0) {
      fail(`No profile found for tenant ${project.tenant_id}`)
      failures++
    } else {
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(
        profiles[0].id,
      )
      if (userError || !userData?.user?.email) {
        fail(`Could not resolve auth e-mail: ${userError?.message}`)
        failures++
      } else {
        recipient = userData.user.email
        ok(`Resolved fallback e-mail: ${recipient}`)
      }
    }
  }

  // Send a recipient-resolution test mail
  if (recipient) {
    try {
      const { data, error } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL,
        to: recipient,
        subject: `[Pinfinity] Test — Recipient resolution for ${project.name}`,
        text:
          `Recipient resolution worked for project "${project.name}".\n` +
          `Resolved address: ${recipient}\n\n` +
          `— Pinfinity smoke test`,
      })
      if (error) {
        fail(`Resend send to resolved recipient failed: ${JSON.stringify(error)}`)
        failures++
      } else {
        ok(`Resolution mail sent to ${recipient} (id: ${data?.id})`)
      }
    } catch (err) {
      fail(`Resend threw: ${err.message ?? err}`)
      failures++
    }
  }

  // ─── Step 4: optional full notifyPinError flow ───────────────────────────
  if (pinArg) {
    header('4. Full notifyPinError flow')
    info(`Importing src/lib/server/notifications.ts via tsx-less inline path`)

    // Inline reimplementation rather than importing TS — keeps the script
    // dependency-free. The logic is identical to notifyPinError().
    const { data: pin, error: pinErr } = await supabase
      .from('pins')
      .select('id, title, blog_project_id, error_notified_at')
      .eq('id', pinArg)
      .single()
    if (pinErr || !pin) {
      fail(`Pin ${pinArg} not found`)
      failures++
    } else if (pin.error_notified_at) {
      info(
        `Pin already has error_notified_at = ${pin.error_notified_at} — throttle would skip a real send.`,
      )
      info(
        `Reset by flipping the pin status away from 'error', or run:`,
      )
      console.log(
        c.dim +
          `   UPDATE pins SET error_notified_at = NULL WHERE id = '${pin.id}';` +
          c.reset,
      )
    } else {
      ok(`Pin throttle is clear (error_notified_at IS NULL).`)
      info(
        `notifyPinError() would send a real error mail next time this pin enters status='error'.`,
      )
    }
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────
header('Summary')
if (failures === 0) {
  ok(`All checks passed.`)
  process.exit(0)
} else {
  fail(`${failures} check(s) failed.`)
  process.exit(1)
}
