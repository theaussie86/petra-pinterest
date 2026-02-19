import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Check, ChevronsUpDown, Loader2 } from 'lucide-react'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MediaUploadZone } from '@/components/pins/media-upload-zone'
import { useArticles } from '@/lib/hooks/use-articles'
import { useCreatePins } from '@/lib/hooks/use-pins'
import { usePinterestBoards, usePinterestConnection } from '@/lib/hooks/use-pinterest-connection'
import { uploadPinMedia } from '@/lib/api/pins'
import { ensureProfile } from '@/lib/auth'
import { toast } from 'sonner'

export const Route = createFileRoute('/_authed/projects/$projectId/create-pin')({
  component: CreatePinPage,
})

function CreatePinPage() {
  const { projectId } = Route.useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [files, setFiles] = useState<File[]>([])
  const [selectedArticleId, setSelectedArticleId] = useState<string>('')
  const [selectedBoardId, setSelectedBoardId] = useState<string>('')
  const [isUploading, setIsUploading] = useState(false)
  const [articlePopoverOpen, setArticlePopoverOpen] = useState(false)
  const [boardPopoverOpen, setBoardPopoverOpen] = useState(false)

  const { data: articles = [] } = useArticles(projectId)
  const { data: connectionData } = usePinterestConnection(projectId)
  const isConnected = connectionData?.connected === true && connectionData?.connection?.is_active !== false
  const { data: boards = [] } = usePinterestBoards(projectId)
  const createPinsMutation = useCreatePins()

  const handleSubmit = async () => {
    if (files.length === 0) {
      toast.error(t('createPin.validationMediaRequired'))
      return
    }
    if (!selectedArticleId) {
      toast.error(t('createPin.validationArticleRequired'))
      return
    }

    setIsUploading(true)

    try {
      const { tenant_id } = await ensureProfile()

      const uploadedFiles: { path: string; mediaType: 'image' | 'video' }[] = []
      for (const file of files) {
        const path = await uploadPinMedia(file, tenant_id)
        uploadedFiles.push({
          path,
          mediaType: file.type.startsWith('video/') ? 'video' : 'image',
        })
      }

      const selectedBoard = boards.find((b) => b.pinterest_board_id === selectedBoardId)
      await createPinsMutation.mutateAsync(
        uploadedFiles.map(({ path, mediaType }) => ({
          blog_project_id: projectId,
          blog_article_id: selectedArticleId,
          image_path: path,
          media_type: mediaType,
          pinterest_board_id: selectedBoardId || null,
          pinterest_board_name: selectedBoard?.name || null,
        }))
      )

      navigate({ to: '/projects/$projectId/pins', params: { projectId } })
    } catch (error) {
      console.error('Failed to create pins:', error)
      toast.error(t('createPin.errorCreateFailed'))
    } finally {
      setIsUploading(false)
    }
  }

  const pinCount = files.length
  const submitLabel = isUploading
    ? t('createPin.uploading')
    : pinCount === 1
      ? t('createPin.createButton', { count: 1 })
      : t('createPin.createButton_plural', { count: pinCount })

  return (
    <>
      <PageHeader title={pinCount <= 1 ? t('createPin.titleSingle') : t('createPin.titleMultiple', { count: pinCount })} />
      <PageLayout maxWidth="medium">
        <div className="space-y-6">
          {/* Article selector */}
          <div className="space-y-2">
            <Label>{t('createPin.fieldArticle')}</Label>
            <Popover open={articlePopoverOpen} onOpenChange={setArticlePopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={articlePopoverOpen}
                  className="w-full justify-between font-normal"
                  disabled={isUploading}
                >
                  {selectedArticleId ? (
                    <span className="truncate">
                      {articles.find((a) => a.id === selectedArticleId)?.title}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {t('createPin.placeholderArticle')}
                    </span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command filter={(value, search, keywords) => {
                  const haystack = [value, ...(keywords ?? [])].join(' ').toLowerCase()
                  return haystack.includes(search.toLowerCase()) ? 1 : 0
                }}>
                  <CommandInput placeholder={t('createPin.searchArticle')} />
                  <CommandList>
                    <CommandEmpty>{t('createPin.noArticles')}</CommandEmpty>
                    <CommandGroup>
                      {articles.map((article) => (
                        <CommandItem
                          key={article.id}
                          value={article.title || article.id}
                          keywords={[article.url]}
                          onSelect={() => {
                            setSelectedArticleId(article.id)
                            setArticlePopoverOpen(false)
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              selectedArticleId === article.id ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          <div className="flex flex-col min-w-0">
                            <span className="truncate">{article.title}</span>
                            <span className="text-xs text-muted-foreground truncate">
                              {article.url}
                            </span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {articles.length === 0 && (
              <p className="text-xs text-slate-500">
                {t('createPin.noArticles')}
              </p>
            )}
          </div>

          {/* Board selector (optional) */}
          <div className="space-y-2">
            <Label>{t('createPin.fieldBoard')}</Label>
            {!isConnected && (
              <Alert variant="warning">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {t('createPin.pinterestNotConnected')}
                </AlertDescription>
              </Alert>
            )}
            <Popover open={boardPopoverOpen} onOpenChange={setBoardPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={boardPopoverOpen}
                  className="w-full justify-between font-normal"
                  disabled={!isConnected || isUploading}
                >
                  {selectedBoardId ? (
                    <span className="truncate">
                      {boards.find((b) => b.pinterest_board_id === selectedBoardId)?.name}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {t('createPin.placeholderBoard')}
                    </span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command filter={(value, search) => {
                  return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                }}>
                  <CommandInput placeholder={t('createPin.searchBoard')} />
                  <CommandList>
                    <CommandEmpty>{t('createPin.noBoards')}</CommandEmpty>
                    <CommandGroup>
                      {boards.map((board) => (
                        <CommandItem
                          key={board.pinterest_board_id}
                          value={board.name}
                          onSelect={() => {
                            setSelectedBoardId(board.pinterest_board_id)
                            setBoardPopoverOpen(false)
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              selectedBoardId === board.pinterest_board_id ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          {board.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {isConnected && boards.length === 0 && (
              <p className="text-xs text-slate-500">
                {t('createPin.noBoards')}
              </p>
            )}
          </div>

          {/* Media upload zone */}
          <div className="space-y-2">
            <Label>{t('createPin.fieldMedia')}</Label>
            <MediaUploadZone
              files={files}
              onFilesChange={setFiles}
              disabled={isUploading}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate({ to: '/projects/$projectId/pins', params: { projectId } })}
              disabled={isUploading}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isUploading || files.length === 0 || !selectedArticleId}
            >
              {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {submitLabel}
            </Button>
          </div>
        </div>
      </PageLayout>
    </>
  )
}
