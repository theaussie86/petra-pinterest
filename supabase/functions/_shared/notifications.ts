// Deno-side mirror of src/lib/server/notifications.ts.
// Used by Supabase Edge Functions (publish-scheduled-pins, ...).
//
// Differences vs the Node version:
//   - Direct fetch() to the Resend HTTP API instead of the SDK (smaller cold start)
//   - Reads SUPABASE_URL / RESEND_* from Deno.env
//   - Same throttling semantics via pins.error_notified_at
//
// All functions are best-effort: errors are logged, never thrown.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const APP_URL = Deno.env.get('APP_URL') ?? 'https://pinfinity.onlineheldinnen.de'

export interface NotificationRecipient {
  email: string
  projectName: string
  projectId: string
}

function getResendApiKey(): string | null {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) {
    console.error('[notifications] RESEND_API_KEY not set — skipping mail')
    return null
  }
  return key
}

function getFromAddress(): string {
  return (
    Deno.env.get('RESEND_FROM_EMAIL') ??
    'Pinfinity <noreply@onlineheldinnen.de>'
  )
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function sendResendMail(opts: {
  to: string
  subject: string
  text: string
  html: string
}): Promise<boolean> {
  const apiKey = getResendApiKey()
  if (!apiKey) return false

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: getFromAddress(),
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(
        `[notifications] resend HTTP ${res.status}: ${body.slice(0, 500)}`,
      )
      return false
    }
    return true
  } catch (err) {
    console.error('[notifications] resend fetch failed:', err)
    return false
  }
}

export async function resolveNotificationRecipient(
  supabase: SupabaseClient,
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
  // deno-lint-ignore no-explicit-any
  const { data: userData, error: userError } = await (supabase as any).auth.admin.getUserById(
    userId,
  )

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

export async function notifyPinError(opts: {
  supabase: SupabaseClient
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

    if (pin.error_notified_at) return

    const recipient = await resolveNotificationRecipient(
      opts.supabase,
      pin.blog_project_id,
    )
    if (!recipient) return

    const articleTitle = Array.isArray(pin.blog_articles)
      ? (pin.blog_articles[0] as { title?: string } | undefined)?.title ?? null
      : ((pin.blog_articles as { title?: string } | null)?.title ?? null)

    const pinTitle: string | null = pin.title ?? articleTitle ?? null
    const pinUrl = `${APP_URL}/projects/${recipient.projectId}/pins/${pin.id}`
    const subject = `[Pinfinity] Fehler beim Veröffentlichen – ${recipient.projectName}`

    const text = [
      'Beim Veröffentlichen eines Pins ist ein Fehler aufgetreten.',
      '',
      `Projekt: ${recipient.projectName}`,
      pinTitle ? `Pin: ${pinTitle}` : `Pin: ${pin.id}`,
      '',
      'Fehlermeldung:',
      opts.errorMessage,
      '',
      'Pin im Dashboard öffnen:',
      pinUrl,
      '',
      '— Pinfinity',
    ].join('\n')

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.5;color:#0f172a;max-width:560px;">
        <h2 style="margin:0 0 16px;font-size:18px;">Fehler beim Veröffentlichen</h2>
        <p>Beim Veröffentlichen eines Pins ist ein Fehler aufgetreten.</p>
        <p>
          <strong>Projekt:</strong> ${escapeHtml(recipient.projectName)}<br/>
          <strong>${pinTitle ? 'Pin' : 'Pin-ID'}:</strong> ${escapeHtml(pinTitle ?? pin.id)}
        </p>
        <p style="background:#fef2f2;border:1px solid #fecaca;padding:12px;border-radius:6px;color:#991b1b;white-space:pre-wrap;">
          ${escapeHtml(opts.errorMessage)}
        </p>
        <p>
          <a href="${pinUrl}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">
            Pin im Dashboard öffnen
          </a>
        </p>
        <p style="color:#64748b;font-size:12px;margin-top:24px;">— Pinfinity</p>
      </div>
    `.trim()

    const sent = await sendResendMail({
      to: recipient.email,
      subject,
      text,
      html,
    })
    if (!sent) return

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
