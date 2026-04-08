/**
 * Error notification e-mails via Resend.
 *
 * Sends a one-shot e-mail when a pin (or background job) ends up in the
 * `error` status. Uses the per-project `notification_email` if set, otherwise
 * falls back to the login e-mail of any user belonging to the project's tenant.
 *
 * Throttling: `pins.error_notified_at` is set after a successful send so a
 * pin that has already triggered a mail won't trigger a second one for the
 * same error episode. The DB trigger `pins_reset_error_notified_at` clears
 * the timestamp whenever the pin transitions away from `error`.
 *
 * Failure policy: this module **never throws**. Any error during recipient
 * resolution or mail sending is logged via `console.error` and swallowed —
 * notification failures must not break the underlying publish/scrape flow.
 */
import { Resend } from 'resend'
import type { SupabaseClient } from '@supabase/supabase-js'

type ServiceClient = SupabaseClient

function getAppUrl(): string {
  return process.env.APP_URL ?? 'https://pinfinity.onlineheldinnen.de'
}

let cachedResend: Resend | null = null

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('[notifications] RESEND_API_KEY is not set — skipping mail')
    return null
  }
  if (!cachedResend) {
    cachedResend = new Resend(apiKey)
  }
  return cachedResend
}

function getFromAddress(): string {
  return process.env.RESEND_FROM_EMAIL ?? 'Pinfinity <noreply@onlineheldinnen.de>'
}

export interface NotificationRecipient {
  email: string
  projectName: string
  projectId: string
}

/**
 * Resolve the e-mail recipient for a project: per-project override first,
 * then fall back to a tenant user's auth e-mail.
 */
export async function resolveNotificationRecipient(
  supabase: ServiceClient,
  projectId: string,
): Promise<NotificationRecipient | null> {
  const { data: project, error: projectError } = await supabase
    .from('blog_projects')
    .select('id, name, tenant_id, notification_email')
    .eq('id', projectId)
    .single()

  if (projectError || !project) {
    console.error(
      `[notifications] could not load project ${projectId}:`,
      projectError?.message,
    )
    return null
  }

  if (project.notification_email && project.notification_email.trim() !== '') {
    return {
      email: project.notification_email.trim(),
      projectName: project.name,
      projectId: project.id,
    }
  }

  // Fallback: any profile belonging to this tenant -> look up their auth e-mail
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id')
    .eq('tenant_id', project.tenant_id)
    .order('created_at', { ascending: true })
    .limit(1)

  if (profilesError || !profiles || profiles.length === 0) {
    console.error(
      `[notifications] no profile found for tenant ${project.tenant_id} (project ${projectId})`,
    )
    return null
  }

  const userId = profiles[0].id

  // Service client can read auth.users via the admin API
  const { data: userData, error: userError } =
    await supabase.auth.admin.getUserById(userId)

  if (userError || !userData?.user?.email) {
    console.error(
      `[notifications] failed to resolve auth e-mail for user ${userId}:`,
      userError?.message,
    )
    return null
  }

  return {
    email: userData.user.email,
    projectName: project.name,
    projectId: project.id,
  }
}

interface PinErrorMailContext {
  projectName: string
  projectId: string
  pinId: string
  pinTitle: string | null
  errorMessage: string
  pinUrl: string
}

function buildPinErrorMail(ctx: PinErrorMailContext): {
  subject: string
  text: string
  html: string
} {
  const subject = `[Pinfinity] Fehler beim Veröffentlichen – ${ctx.projectName}`
  const titleLine = ctx.pinTitle ? `Pin: ${ctx.pinTitle}` : `Pin: ${ctx.pinId}`

  const text = [
    `Beim Veröffentlichen eines Pins ist ein Fehler aufgetreten.`,
    ``,
    `Projekt: ${ctx.projectName}`,
    titleLine,
    ``,
    `Fehlermeldung:`,
    ctx.errorMessage,
    ``,
    `Pin im Dashboard öffnen:`,
    ctx.pinUrl,
    ``,
    `— Pinfinity`,
  ].join('\n')

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.5;color:#0f172a;max-width:560px;">
      <h2 style="margin:0 0 16px;font-size:18px;">Fehler beim Veröffentlichen</h2>
      <p>Beim Veröffentlichen eines Pins ist ein Fehler aufgetreten.</p>
      <p>
        <strong>Projekt:</strong> ${escapeHtml(ctx.projectName)}<br/>
        <strong>${ctx.pinTitle ? 'Pin' : 'Pin-ID'}:</strong> ${escapeHtml(ctx.pinTitle ?? ctx.pinId)}
      </p>
      <p style="background:#fef2f2;border:1px solid #fecaca;padding:12px;border-radius:6px;color:#991b1b;white-space:pre-wrap;">
        ${escapeHtml(ctx.errorMessage)}
      </p>
      <p>
        <a href="${ctx.pinUrl}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">
          Pin im Dashboard öffnen
        </a>
      </p>
      <p style="color:#64748b;font-size:12px;margin-top:24px;">— Pinfinity</p>
    </div>
  `.trim()

  return { subject, text, html }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Notify about a pin that just transitioned to `error`.
 * Caller should already have set `pins.status='error'` + `pins.error_message`.
 *
 * Idempotent per pin: subsequent calls for the same pin without a status
 * change in between are no-ops thanks to `error_notified_at`.
 */
export async function notifyPinError(opts: {
  supabase: ServiceClient
  pinId: string
  errorMessage: string
}): Promise<void> {
  try {
    const { data: pin, error: pinError } = await opts.supabase
      .from('pins')
      .select(
        'id, title, blog_project_id, error_notified_at, blog_articles(title)',
      )
      .eq('id', opts.pinId)
      .single()

    if (pinError || !pin) {
      console.error(
        `[notifications] notifyPinError: pin ${opts.pinId} not found:`,
        pinError?.message,
      )
      return
    }

    // Throttle: already mailed for this error episode
    if (pin.error_notified_at) {
      return
    }

    const recipient = await resolveNotificationRecipient(
      opts.supabase,
      pin.blog_project_id,
    )
    if (!recipient) return

    const articleTitle = Array.isArray(pin.blog_articles)
      ? (pin.blog_articles[0] as { title?: string } | undefined)?.title ?? null
      : ((pin.blog_articles as { title?: string } | null)?.title ?? null)

    const mail = buildPinErrorMail({
      projectName: recipient.projectName,
      projectId: recipient.projectId,
      pinId: pin.id,
      pinTitle: pin.title ?? articleTitle ?? null,
      errorMessage: opts.errorMessage,
      pinUrl: `${getAppUrl()}/projects/${recipient.projectId}/pins/${pin.id}`,
    })

    const resend = getResendClient()
    if (!resend) return

    const { error: sendError } = await resend.emails.send({
      from: getFromAddress(),
      to: recipient.email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    })

    if (sendError) {
      console.error(
        `[notifications] resend send failed for pin ${pin.id}:`,
        sendError,
      )
      return
    }

    // Mark as notified so we don't double-mail
    const { error: updateError } = await opts.supabase
      .from('pins')
      .update({ error_notified_at: new Date().toISOString() })
      .eq('id', pin.id)

    if (updateError) {
      console.error(
        `[notifications] failed to set error_notified_at for ${pin.id}:`,
        updateError.message,
      )
    }
  } catch (err) {
    console.error('[notifications] notifyPinError unexpected error:', err)
  }
}

/**
 * Notify about a non-pin failure inside a project (e.g. a Trigger.dev scrape
 * task that failed before any pin existed). No throttling — these are rare.
 */
export async function notifyProjectError(opts: {
  supabase: ServiceClient
  projectId: string
  subject: string
  errorMessage: string
  context?: string
}): Promise<void> {
  try {
    const recipient = await resolveNotificationRecipient(
      opts.supabase,
      opts.projectId,
    )
    if (!recipient) return

    const projectUrl = `${getAppUrl()}/projects/${recipient.projectId}`

    const text = [
      `Bei deinem Projekt "${recipient.projectName}" ist ein Fehler aufgetreten.`,
      ``,
      opts.context ? `Kontext: ${opts.context}` : null,
      ``,
      `Fehlermeldung:`,
      opts.errorMessage,
      ``,
      `Projekt im Dashboard öffnen:`,
      projectUrl,
      ``,
      `— Pinfinity`,
    ]
      .filter((line) => line !== null)
      .join('\n')

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.5;color:#0f172a;max-width:560px;">
        <h2 style="margin:0 0 16px;font-size:18px;">${escapeHtml(opts.subject)}</h2>
        <p>Bei deinem Projekt <strong>${escapeHtml(recipient.projectName)}</strong> ist ein Fehler aufgetreten.</p>
        ${opts.context ? `<p><strong>Kontext:</strong> ${escapeHtml(opts.context)}</p>` : ''}
        <p style="background:#fef2f2;border:1px solid #fecaca;padding:12px;border-radius:6px;color:#991b1b;white-space:pre-wrap;">
          ${escapeHtml(opts.errorMessage)}
        </p>
        <p>
          <a href="${projectUrl}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">
            Projekt im Dashboard öffnen
          </a>
        </p>
        <p style="color:#64748b;font-size:12px;margin-top:24px;">— Pinfinity</p>
      </div>
    `.trim()

    const resend = getResendClient()
    if (!resend) return

    const { error: sendError } = await resend.emails.send({
      from: getFromAddress(),
      to: recipient.email,
      subject: opts.subject,
      text,
      html,
    })

    if (sendError) {
      console.error(
        `[notifications] resend send failed for project ${opts.projectId}:`,
        sendError,
      )
    }
  } catch (err) {
    console.error('[notifications] notifyProjectError unexpected error:', err)
  }
}
