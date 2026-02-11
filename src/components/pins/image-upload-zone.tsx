import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, X, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ImageUploadZoneProps {
  files: File[]
  onFilesChange: (files: File[]) => void
  disabled?: boolean
}

/** Check if image aspect ratio is approximately 2:3 (ratio 0.6-0.7) */
function isAcceptableRatio(width: number, height: number): boolean {
  if (height === 0) return false
  const ratio = width / height
  return ratio >= 0.6 && ratio <= 0.7
}

/** Format bytes to human-readable string */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface ThumbnailInfo {
  url: string
  width: number
  height: number
}

export function ImageUploadZone({ files, onFilesChange, disabled }: ImageUploadZoneProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [thumbnails, setThumbnails] = useState<Map<string, ThumbnailInfo>>(new Map())

  // Create/revoke object URLs for previews
  useEffect(() => {
    const newThumbnails = new Map<string, ThumbnailInfo>()
    const urls: string[] = []

    files.forEach((file) => {
      const key = `${file.name}-${file.size}-${file.lastModified}`
      const existing = thumbnails.get(key)
      if (existing) {
        newThumbnails.set(key, existing)
      } else {
        const url = URL.createObjectURL(file)
        urls.push(url)
        // Load image to get dimensions
        const img = new Image()
        img.onload = () => {
          setThumbnails((prev) => {
            const updated = new Map(prev)
            updated.set(key, { url, width: img.naturalWidth, height: img.naturalHeight })
            return updated
          })
        }
        img.src = url
        // Set placeholder until loaded
        newThumbnails.set(key, { url, width: 0, height: 0 })
      }
    })

    setThumbnails(newThumbnails)

    // Cleanup: revoke URLs that are no longer in use
    return () => {
      // We only revoke on unmount; active URLs are managed by the Map
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files])

  // Cleanup all URLs on unmount
  useEffect(() => {
    return () => {
      thumbnails.forEach((info) => URL.revokeObjectURL(info.url))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addFiles = useCallback(
    (newFiles: File[]) => {
      const imageFiles = newFiles.filter((f) => f.type.startsWith('image/'))
      if (imageFiles.length === 0) return
      onFilesChange([...files, ...imageFiles])
    },
    [files, onFilesChange]
  )

  const removeFile = useCallback(
    (index: number) => {
      const key = `${files[index].name}-${files[index].size}-${files[index].lastModified}`
      const info = thumbnails.get(key)
      if (info) {
        URL.revokeObjectURL(info.url)
      }
      onFilesChange(files.filter((_, i) => i !== index))
    },
    [files, onFilesChange, thumbnails]
  )

  // Drag & Drop handlers
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!disabled) setIsDragOver(true)
    },
    [disabled]
  )

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)
      if (disabled) return
      const droppedFiles = Array.from(e.dataTransfer.files)
      addFiles(droppedFiles)
    },
    [disabled, addFiles]
  )

  // File picker handler
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        addFiles(Array.from(e.target.files))
        // Reset so same file can be re-selected
        e.target.value = ''
      }
    },
    [addFiles]
  )

  // Clipboard paste handler
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (disabled) return
      const items = e.clipboardData?.items
      if (!items) return
      const pastedFiles: File[] = []
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) pastedFiles.push(file)
        }
      }
      if (pastedFiles.length > 0) {
        addFiles(pastedFiles)
      }
    }

    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [disabled, addFiles])

  const getFileKey = (file: File) => `${file.name}-${file.size}-${file.lastModified}`

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        ref={dropZoneRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={`
          flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6
          cursor-pointer transition-colors
          ${isDragOver ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-slate-400 bg-slate-50'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <Upload className={`h-8 w-8 mb-2 ${isDragOver ? 'text-blue-500' : 'text-slate-400'}`} />
        <p className="text-sm font-medium text-slate-600">
          {t('imageUpload.dropMessage')}{' '}
          <span className="text-blue-600 underline">{t('imageUpload.browseFiles')}</span>
        </p>
        <p className="text-xs text-slate-400 mt-1">
          {t('imageUpload.hint')}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
          className="hidden"
          disabled={disabled}
        />
      </div>

      {/* File count */}
      {files.length > 0 && (
        <p className="text-sm text-slate-600 font-medium">
          {files.length === 1
            ? t('imageUpload.count', { count: 1 })
            : t('imageUpload.count_plural', { count: files.length })}
        </p>
      )}

      {/* Thumbnail preview grid */}
      {files.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {files.map((file, index) => {
            const key = getFileKey(file)
            const info = thumbnails.get(key)
            const hasRatioWarning = info && info.width > 0 && !isAcceptableRatio(info.width, info.height)

            return (
              <div
                key={`${key}-${index}`}
                className="relative group rounded-lg border border-slate-200 bg-white overflow-hidden"
              >
                {/* Image preview */}
                <div className="aspect-square bg-slate-100">
                  {info?.url && (
                    <img
                      src={info.url}
                      alt={file.name}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>

                {/* Remove button */}
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeFile(index)
                  }}
                  disabled={disabled}
                >
                  <X className="h-3 w-3" />
                </Button>

                {/* Aspect ratio warning badge */}
                {hasRatioWarning && (
                  <div className="absolute top-1 left-1 flex items-center gap-1 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700">
                    <AlertTriangle className="h-3 w-3" />
                    {t('imageUpload.warningAspectRatio')}
                  </div>
                )}

                {/* File info */}
                <div className="p-1.5">
                  <p className="text-xs text-slate-700 truncate" title={file.name}>
                    {file.name}
                  </p>
                  <p className="text-[10px] text-slate-400">{formatFileSize(file.size)}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
