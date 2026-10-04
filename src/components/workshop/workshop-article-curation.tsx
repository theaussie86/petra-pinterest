import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Clock, Undo2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import i18n from '@/lib/i18n'
import type { Article, ArticleWorkshopStatus } from '@/types/articles'

const NOTE_MAX = 1000

/** A plain-text teaser of the scraped article so the decision needs no new tab. */
export function articleExcerpt(content: string | null, max = 600): string {
  if (!content) return ''
  const text = content
    .replace(/[#>*_`[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? text.slice(0, max).replace(/\s+\S*$/, '') + ' …' : text
}

interface WorkshopArticleCurationProps {
  article: Article
  onCurate: (status: ArticleWorkshopStatus | null, note?: string | null) => void
  isSaving?: boolean
}

/**
 * The middle column for an article without templates: decide whether the agent
 * should write pins for it (with an optional note), or leave it out. A wanted
 * article shows that it waits for the agent and keeps its note editable.
 */
export function WorkshopArticleCuration({ article, onCurate, isSaving }: WorkshopArticleCurationProps) {
  const { t } = useTranslation()
  const [note, setNote] = useState(article.workshop_note ?? '')

  // A different article (or a saved note) resets the draft.
  useEffect(() => {
    setNote(article.workshop_note ?? '')
  }, [article.id, article.workshop_note])

  const excerpt = articleExcerpt(article.content)
  const status = article.workshop_status ?? null
  const noteChanged = note.trim() !== (article.workshop_note ?? '')
  const since = article.workshop_status_changed_at
    ? new Date(article.workshop_status_changed_at).toLocaleDateString(i18n.language, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null

  const noteField = (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="workshop-note">{t('workshop.curate.noteLabel')}</Label>
      <Textarea
        id="workshop-note"
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
        placeholder={t('workshop.curate.notePlaceholder')}
        rows={3}
        className="resize-none"
      />
      <p className="text-xs text-muted-foreground">{t('workshop.curate.noteHint')}</p>
    </div>
  )

  return (
    <div className="flex flex-col gap-5">
      {excerpt ? (
        <p className="text-sm leading-relaxed text-foreground/80 line-clamp-[8]">{excerpt}</p>
      ) : (
        <p className="text-sm text-muted-foreground">{t('workshop.curate.noContent')}</p>
      )}

      <div className="flex flex-col gap-4 rounded-xl bg-muted/60 p-4">
        {status === null && (
          <>
            <p className="font-display text-sm font-bold">{t('workshop.curate.question')}</p>
            {noteField}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={isSaving}
                onClick={() => onCurate('wanted', note)}
              >
                <Check />
                {t('workshop.curate.want')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSaving}
                onClick={() => onCurate('excluded')}
              >
                <X />
                {t('workshop.curate.exclude')}
              </Button>
            </div>
          </>
        )}

        {status === 'wanted' && (
          <>
            <p className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-primary" />
              <span>
                <span className="font-medium">{t('workshop.waitingForAgent')}</span>
                {since && (
                  <span className="text-muted-foreground"> · {t('workshop.curate.since', { date: since })}</span>
                )}
              </span>
            </p>
            {noteField}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isSaving || !noteChanged}
                onClick={() => onCurate('wanted', note)}
              >
                {t('workshop.curate.saveNote')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                disabled={isSaving}
                onClick={() => onCurate(null)}
              >
                <Undo2 />
                {t('workshop.curate.withdraw')}
              </Button>
            </div>
          </>
        )}

        {status === 'excluded' && (
          <>
            <p className="text-sm">{t('workshop.curate.excludedInfo')}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={isSaving}
                onClick={() => onCurate('wanted')}
              >
                <Check />
                {t('workshop.curate.want')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                disabled={isSaving}
                onClick={() => onCurate(null)}
              >
                <Undo2 />
                {t('workshop.curate.reset')}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
