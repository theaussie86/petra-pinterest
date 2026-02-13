import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { ImageUploadZone } from '@/components/pins/image-upload-zone'
import { useArticles } from '@/lib/hooks/use-articles'
import { useCreatePins } from '@/lib/hooks/use-pins'
import { usePinterestBoards, usePinterestConnection } from '@/lib/hooks/use-pinterest-connection'
import { uploadPinImage } from '@/lib/api/pins'
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

  const { data: articles = [] } = useArticles(projectId)
  const { data: connectionData } = usePinterestConnection(projectId)
  const isConnected = connectionData?.connected === true && connectionData?.connection?.is_active !== false
  const { data: boards = [] } = usePinterestBoards(projectId)
  const createPinsMutation = useCreatePins()

  const handleSubmit = async () => {
    if (files.length === 0) {
      toast.error(t('createPin.validationImageRequired'))
      return
    }
    if (!selectedArticleId) {
      toast.error(t('createPin.validationArticleRequired'))
      return
    }

    setIsUploading(true)

    try {
      const { tenant_id } = await ensureProfile()

      const imagePaths: string[] = []
      for (const file of files) {
        const path = await uploadPinImage(file, tenant_id)
        imagePaths.push(path)
      }

      const selectedBoard = boards.find((b) => b.pinterest_board_id === selectedBoardId)
      await createPinsMutation.mutateAsync(
        imagePaths.map((imagePath) => ({
          blog_project_id: projectId,
          blog_article_id: selectedArticleId,
          image_path: imagePath,
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
            <Select
              value={selectedArticleId}
              onValueChange={setSelectedArticleId}
              disabled={isUploading}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('createPin.placeholderArticle')} />
              </SelectTrigger>
              <SelectContent>
                {articles.map((article) => (
                  <SelectItem key={article.id} value={article.id}>
                    <div className="flex flex-col">
                      <span className="truncate max-w-[400px]">{article.title}</span>
                      <span className="text-xs text-slate-400 truncate max-w-[400px]">
                        {article.url}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Select
              value={selectedBoardId}
              onValueChange={setSelectedBoardId}
              disabled={!isConnected || isUploading}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('createPin.placeholderBoard')} />
              </SelectTrigger>
              <SelectContent>
                {boards.map((board) => (
                  <SelectItem key={board.pinterest_board_id} value={board.pinterest_board_id}>
                    {board.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isConnected && boards.length === 0 && (
              <p className="text-xs text-slate-500">
                {t('createPin.noBoards')}
              </p>
            )}
          </div>

          {/* Image upload zone */}
          <div className="space-y-2">
            <Label>{t('createPin.fieldImages')}</Label>
            <ImageUploadZone
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
