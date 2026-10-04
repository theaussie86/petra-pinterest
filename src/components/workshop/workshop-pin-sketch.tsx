import { useTranslation } from 'react-i18next'
import { ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PinTemplateDesign } from '@/types/pin-templates'

/** Relative luminance of a `#rgb` / `#rrggbb` color, or null for anything else. */
function luminance(color: string): number | null {
  const hex = color.trim().replace(/^#/, '')
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex
  if (!/^[0-9a-f]{6}$/i.test(full)) return null
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export interface SketchPalette {
  panel: string
  ink: string
  accent: string
}

/**
 * Assign the design brief's colors to sketch roles: the lightest becomes the
 * text panel, the darkest the ink, a remaining one the accent. Non-hex values
 * are ignored; with too few usable colors the roles fall back to neutrals.
 */
export function sketchPalette(colors: string[]): SketchPalette {
  const usable = colors
    .map((c) => ({ c: c.trim(), l: luminance(c) }))
    .filter((x): x is { c: string; l: number } => x.l !== null)
    .sort((a, b) => b.l - a.l)
  const panel = usable[0]?.c ?? '#ffffff'
  const ink = usable.length > 1 ? usable[usable.length - 1].c : '#1f1a2e'
  const accent = usable.length > 2 ? usable[1].c : usable.length === 2 ? ink : '#7c3aed'
  return { panel, ink, accent }
}

/** Uppercase words (3+ letters) in the scroll-stopper note, e.g. "AUSTAUSCHBAR". */
export function scrollStopperWords(note: string | undefined): string[] {
  if (!note) return []
  return note.match(/\b[A-ZÄÖÜ]{3,}\b/g) ?? []
}

/** Whether the layout note puts the text panel at the bottom of the pin. */
export function textAtBottom(layout: string | undefined): boolean {
  if (!layout) return false
  return /text\w*(\s+\S+){0,3}\s+unten|text\w*(\s+\S+){0,3}\s+bottom/i.test(layout)
}

interface WorkshopPinSketchProps {
  overlayLines: string[]
  design: PinTemplateDesign
  footer: string
  className?: string
}

/**
 * A 2:3 sketch of the pin assembled from the template's overlay and design
 * brief: text panel, highlighted scroll-stopper, photo area, domain footer.
 * Gives the reviewer an idea of the result before the image exists. It is a
 * sketch, not a render, and says so.
 */
export function WorkshopPinSketch({ overlayLines, design, footer, className }: WorkshopPinSketchProps) {
  const { t } = useTranslation()
  const { panel, ink, accent } = sketchPalette(design.colors ?? [])
  const stoppers = scrollStopperWords(design.scroll_stopper).map((w) => w.toLowerCase())
  const bottom = textAtBottom(design.layout)
  // Match by word start so inflections still light up (AUSTAUSCHBAR → AUSTAUSCHBARE).
  const isStopper = (word: string) => {
    const w = word.toLowerCase().replace(/[^\p{L}]/gu, '')
    return w.length > 0 && stoppers.some((s) => w.startsWith(s))
  }

  const renderLine = (line: string) =>
    line.split(/(\s+)/).map((part, i) =>
      isStopper(part) ? (
        <span key={i} style={{ color: accent }}>
          {part}
        </span>
      ) : (
        part
      ),
    )

  const textPanel = (
    <div className="px-3.5 py-3" style={{ backgroundColor: panel, color: ink }}>
      {overlayLines.length > 0 ? (
        overlayLines.map((line, i) => (
          <p
            key={i}
            className={cn(
              'font-display font-extrabold uppercase leading-[1.08] tracking-[-0.01em] [overflow-wrap:anywhere]',
              i === 0 ? 'text-[15px]' : 'mt-1 text-[12px]',
            )}
          >
            {renderLine(line)}
          </p>
        ))
      ) : (
        <p className="text-xs opacity-60">—</p>
      )}
    </div>
  )

  return (
    <figure className={cn('flex flex-col gap-1.5', className)}>
      <div
        className="relative flex aspect-[2/3] w-full flex-col overflow-hidden rounded-xl shadow-[0_2px_12px_rgba(75,31,166,0.12)]"
        style={{ backgroundColor: panel }}
      >
        {!bottom && textPanel}
        <div
          className="relative flex flex-1 items-center justify-center"
          style={{
            backgroundImage: `linear-gradient(160deg, ${accent}99 0%, ${ink}e6 100%)`,
          }}
        >
          <span className="flex flex-col items-center gap-1 px-3 text-center" style={{ color: panel }}>
            <ImageIcon className="h-5 w-5 opacity-80" />
            {design.image_position && (
              <span className="line-clamp-2 text-[10px] leading-tight opacity-90">
                {design.image_position}
              </span>
            )}
          </span>
        </div>
        {bottom && textPanel}
        <div
          className="px-2 py-1 text-center text-[10px] font-medium tracking-wide"
          style={{ backgroundColor: panel, color: ink }}
        >
          {footer}
        </div>
      </div>
      <figcaption className="text-[11px] leading-tight text-muted-foreground">
        {t('workshop.detail.sketchNote')}
      </figcaption>
    </figure>
  )
}
