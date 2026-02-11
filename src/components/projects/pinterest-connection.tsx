import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Unplug } from 'lucide-react'
import {
  usePinterestConnection,
  useConnectPinterest,
  useDisconnectPinterest,
} from '@/lib/hooks/use-pinterest-connection'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'

interface PinterestConnectionProps {
  blogProjectId: string
  pinterestConnected?: boolean
  pinterestError?: string
}

export function PinterestConnection({
  blogProjectId,
  pinterestConnected,
  pinterestError,
}: PinterestConnectionProps) {
  const { t, i18n } = useTranslation()
  const { data, isLoading } = usePinterestConnection(blogProjectId)
  const connectMutation = useConnectPinterest()
  const disconnectMutation = useDisconnectPinterest()

  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false)
  const [hasShownSuccessToast, setHasShownSuccessToast] = useState(false)

  // Show success toast after OAuth redirect
  useEffect(() => {
    if (pinterestConnected && !hasShownSuccessToast) {
      toast.success(t('toast.pinterest.connected'))
      setHasShownSuccessToast(true)

      // Clean URL params after showing toast
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href)
        url.searchParams.delete('pinterest_connected')
        window.history.replaceState({}, '', url.toString())
      }
    }
  }, [pinterestConnected, hasShownSuccessToast, t])

  const handleConnect = () => {
    connectMutation.mutate({ blog_project_id: blogProjectId })
  }

  const handleDisconnect = () => {
    disconnectMutation.mutate(
      { blog_project_id: blogProjectId },
      {
        onSuccess: () => {
          setDisconnectDialogOpen(false)
        },
      }
    )
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(i18n.language === 'de' ? 'de-DE' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            {t('pinterestConnection.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
          </div>
        </CardContent>
      </Card>
    )
  }

  const connection = data?.connected ? data.connection : null

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            {t('pinterestConnection.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Error state from OAuth redirect */}
          {pinterestError && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>
                {t('pinterestConnection.connectionFailed', { error: pinterestError })}{' '}
                <button
                  onClick={handleConnect}
                  className="underline hover:no-underline"
                >
                  {t('pinterestConnection.tryAgain')}
                </button>
              </AlertDescription>
            </Alert>
          )}

          {/* Not connected state */}
          {!connection && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">{t('pinterestConnection.notConnected')}</p>
              <Button
                onClick={handleConnect}
                disabled={connectMutation.isPending}
              >
                {connectMutation.isPending ? (
                  <>
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    {t('pinterestConnection.connecting')}
                  </>
                ) : (
                  <>
                    <Link className="mr-2 h-4 w-4" />
                    {t('pinterestConnection.connect')}
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Connected state - inactive (needs attention) */}
          {connection && !connection.is_active && (
            <div className="space-y-4">
              <Alert variant="destructive">
                <AlertDescription>
                  {t('pinterestConnection.needsAttention', { error: connection.last_error || 'Unknown error' })}
                </AlertDescription>
              </Alert>
              <div className="flex gap-2">
                <Button
                  onClick={handleConnect}
                  disabled={connectMutation.isPending}
                >
                  {connectMutation.isPending ? t('pinterestConnection.reconnecting') : t('pinterestConnection.reconnect')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setDisconnectDialogOpen(true)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Unplug className="mr-2 h-4 w-4" />
                  {t('pinterestConnection.disconnect')}
                </Button>
              </div>
            </div>
          )}

          {/* Connected state - active */}
          {connection && connection.is_active && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <p className="text-sm font-medium">
                    {t('pinterestConnection.connected', { username: connection.pinterest_username })}
                  </p>
                </div>
                <p className="text-sm text-slate-500">
                  {t('pinterestConnection.tokenExpires', { date: formatDate(connection.token_expires_at) })}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setDisconnectDialogOpen(true)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Unplug className="mr-2 h-4 w-4" />
                  {t('pinterestConnection.disconnect')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disconnect confirmation dialog */}
      <Dialog open={disconnectDialogOpen} onOpenChange={setDisconnectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pinterestConnection.disconnectTitle')}</DialogTitle>
            <DialogDescription>
              {t('pinterestConnection.disconnectMessage', { username: connection?.pinterest_username })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDisconnectDialogOpen(false)}
              disabled={disconnectMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisconnect}
              disabled={disconnectMutation.isPending}
            >
              {disconnectMutation.isPending ? t('pinterestConnection.disconnecting') : t('pinterestConnection.disconnect')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
