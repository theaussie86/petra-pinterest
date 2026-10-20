import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, Loader2, Unplug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatDateTime } from '@/lib/format'
import type { ConnectedAgent } from '@/lib/api/connected-agents'
import {
  useConnectedAgents,
  useRevokeConnectedAgent,
} from '@/lib/hooks/use-connected-agents'

/**
 * "Verbundene Agenten" settings section (issue #128, Spec #115, ADR-0006).
 *
 * Lists the OAuth clients (Claude, ChatGPT, Codex, …) the user authorized for
 * the `/mcp` server, with the grant time, and revokes a single one behind a
 * confirmation. Revocation invalidates the client's sessions and refresh tokens
 * so its next tool call gets a 401.
 */
export function ConnectedAgents() {
  const { t } = useTranslation()
  const revoke = useRevokeConnectedAgent()
  const [pendingRevoke, setPendingRevoke] = useState<ConnectedAgent | null>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.connectedAgents.title')}</CardTitle>
        <CardDescription>
          {t('settings.connectedAgents.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AgentList onRevoke={setPendingRevoke} />
      </CardContent>

      <Dialog
        open={pendingRevoke !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRevoke(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.connectedAgents.revokeTitle')}</DialogTitle>
            <DialogDescription>
              {t('settings.connectedAgents.revokeMessage', {
                client: pendingRevoke?.name,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingRevoke(null)}
              disabled={revoke.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!pendingRevoke) return
                revoke.mutate(pendingRevoke.clientId, {
                  onSettled: () => setPendingRevoke(null),
                })
              }}
              disabled={revoke.isPending}
            >
              {t('settings.connectedAgents.confirmRevoke')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function AgentList({
  onRevoke,
}: {
  onRevoke: (agent: ConnectedAgent) => void
}) {
  const { t } = useTranslation()
  const { data: agents, isLoading, isError } = useConnectedAgents()

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{t('settings.connectedAgents.loading')}</span>
      </div>
    )
  }

  if (isError) {
    return (
      <p className="text-destructive">{t('settings.connectedAgents.error')}</p>
    )
  }

  if (!agents || agents.length === 0) {
    return (
      <p className="text-muted-foreground">
        {t('settings.connectedAgents.empty')}
      </p>
    )
  }

  return (
    <ul className="divide-y divide-border">
      {agents.map((agent) => (
        <AgentRow
          key={agent.clientId}
          agent={agent}
          onRevoke={() => onRevoke(agent)}
        />
      ))}
    </ul>
  )
}

function AgentRow({
  agent,
  onRevoke,
}: {
  agent: ConnectedAgent
  onRevoke: () => void
}) {
  const { t, i18n } = useTranslation()

  return (
    <li className="flex items-center justify-between gap-4 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
          <Bot className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium">{agent.name}</p>
          <p className="text-sm text-muted-foreground">
            {t('settings.connectedAgents.grantedAt', {
              date: formatDateTime(agent.grantedAt, i18n.language),
            })}
          </p>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={onRevoke}>
        <Unplug className="mr-2 h-4 w-4" />
        {t('settings.connectedAgents.revoke')}
      </Button>
    </li>
  )
}
