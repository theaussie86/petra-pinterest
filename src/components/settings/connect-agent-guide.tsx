import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type Client = 'claude' | 'claudeCode' | 'chatgpt' | 'codex'

/** Per client: how many numbered steps it has and the shell commands, if any. */
const CLIENTS: Array<{
  id: Client
  steps: number
  commands?: (mcpUrl: string) => string[]
}> = [
  { id: 'claude', steps: 3 },
  {
    id: 'claudeCode',
    steps: 2,
    commands: (url) => [`claude mcp add --transport http pinfinity ${url}`],
  },
  { id: 'chatgpt', steps: 3 },
  {
    id: 'codex',
    steps: 2,
    commands: (url) => [
      `codex mcp add pinfinity --url ${url}`,
      'codex mcp login pinfinity',
    ],
  },
]

/**
 * "Agent verbinden" settings section: how to add Pinfinity's `/mcp` server to
 * Claude, Claude Code, ChatGPT or Codex (Spec #115, ADR-0006). The MCP URL is
 * derived from the current origin so previews and production show their own.
 */
export function ConnectAgentGuide() {
  const { t } = useTranslation()
  const mcpUrl = useMcpUrl()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.connectGuide.title')}</CardTitle>
        <CardDescription>{t('settings.connectGuide.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-medium">{t('settings.connectGuide.urlLabel')}</p>
          <CopyableCode text={mcpUrl} />
        </div>

        <Tabs defaultValue="claude">
          <TabsList>
            {CLIENTS.map((client) => (
              <TabsTrigger key={client.id} value={client.id}>
                {t(`settings.connectGuide.clients.${client.id}.name`)}
              </TabsTrigger>
            ))}
          </TabsList>
          {CLIENTS.map((client) => (
            <TabsContent key={client.id} value={client.id} className="space-y-4 pt-2">
              {client.commands && (
                <div className="space-y-2">
                  {client.commands(mcpUrl).map((command) => (
                    <CopyableCode key={command} text={command} />
                  ))}
                </div>
              )}
              <ol className="list-decimal space-y-2 pl-5 text-sm">
                {Array.from({ length: client.steps }, (_, i) => (
                  <li key={i}>
                    {t(`settings.connectGuide.clients.${client.id}.step${i + 1}`)}
                  </li>
                ))}
              </ol>
            </TabsContent>
          ))}
        </Tabs>

        <p className="text-sm text-muted-foreground">
          {t('settings.connectGuide.afterConnect')}
        </p>
      </CardContent>
    </Card>
  )
}

/** `<origin>/mcp`, set after mount so SSR and hydration render the same text. */
function useMcpUrl(): string {
  const [url, setUrl] = useState('/mcp')
  useEffect(() => {
    setUrl(`${window.location.origin}/mcp`)
  }, [])
  return url
}

function CopyableCode({ text }: { text: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success(t('settings.connectGuide.copied'))
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-sm">
        {text}
      </code>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleCopy}
        aria-label={t('settings.connectGuide.copy')}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  )
}
