import { defineTool, jsonResult } from '../tool'

/**
 * `get_profile` — the connected account: tenant, display name, email and the
 * active feature flags. An agent calls this first to learn what it may do
 * (Spec #115, user story 18).
 */
export const getProfile = defineTool({
  name: 'get_profile',
  description:
    'Liefert das verbundene Konto: Mandant, Anzeigename, E-Mail und aktive Feature-Flags. Zuerst aufrufen, um zu erfahren, was erlaubt ist.',
  handler: ({ ctx }) =>
    jsonResult({
      user_id: ctx.userId,
      tenant_id: ctx.tenantId,
      display_name: ctx.displayName,
      email: ctx.email,
      features: ctx.features,
    }),
})
