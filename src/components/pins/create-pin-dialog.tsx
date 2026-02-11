import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { ImageUploadZone } from '@/components/pins/image-upload-zone'
import { useArticles } from '@/lib/hooks/use-articles'
import { useCreatePins } from '@/lib/hooks/use-pins'
import { usePinterestBoards } from '@/lib/hooks/use-pinterest-connection'
import { uploadPinImage } from '@/lib/api/pins'
import { ensureProfile } from '@/lib/auth'
import { toast } from 'sonner'

interface CreatePinDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  preselectedArticleId?: string
}

export function CreatePinDialog({
  open,
  onOpenChange,
  projectId,
  preselectedArticleId,
}: CreatePinDialogProps) {
  const { t } = useTranslation()
  const [files, setFiles] = useState<File[]>([])
  const [selectedArticleId, setSelectedArticleId] = useState<string>('')
  const [selectedBoardId, setSelectedBoardId] = useState<string>('')
  const [isUploading, setIsUploading] = useState(false)

  const { data: articles = [] } = useArticles(projectId)
  const { data: boards = [] } = usePinterestBoards(projectId)
  const createPinsMutation = useCreatePins()

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setFiles([])
      setSelectedArticleId(preselectedArticleId || '')
      setSelectedBoardId('')
      setIsUploading(false)
    }
  }, [open, preselectedArticleId])

  const handleSubmit = async () => {
    // Validation
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
      // Get tenant_id for storage upload
      const { tenant_id } = await ensureProfile()

      // Upload all images
      const imagePaths: string[] = []
      for (const file of files) {
        const path = await uploadPinImage(file, tenant_id)
        imagePaths.push(path)
      }

      // Create pin rows (one per image)
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

      onOpenChange(false)
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {pinCount <= 1 ? t('createPin.titleSingle') : t('createPin.titleMultiple', { count: pinCount })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
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
            <Select
              value={selectedBoardId}
              onValueChange={setSelectedBoardId}
              disabled={isUploading}
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
            {boards.length === 0 && (
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
        </div>

        <DialogFooter className="mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
