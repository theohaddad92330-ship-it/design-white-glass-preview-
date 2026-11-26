import { ChevronDown, CircleHelp } from 'lucide-react'
import { memo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { GuideHelpCenter } from '@/features/guide/GuideHelpCenter'

/**
 * Coque Théo (23/10/2026) — « Comment travailler ici ? » (`.v18-guide` des maquettes
 * appliquées), sous l'en-tête de chaque écran.
 *
 * Il ouvre le parcours qui EXISTE : le centre d'aide des guides (`GuideHelpCenter`,
 * #2214.24), qui liste les guides du registre et lance celui de l'écran courant. La
 * coque n'écrit aucun second parcours ; le texte propre à chaque écran que la maquette
 * déplie ici viendra avec les lots écrans (contrat : `docs/maquettes/theo-v22/COQUE.md`).
 *
 * Refonte Théo (lots écrans) — un écran qui passe `guide` (prop `screenGuide` de
 * `CustomerPage`) voit le MÊME libellé devenir un repli (`details`, `.v18-guide`) qui
 * déplie son texte ; le centre d'aide reste à un clic, dedans. Un seul « Comment
 * travailler ici ? » par écran, jamais deux (GA-26).
 */
export const ScreenGuideLink = memo(function ScreenGuideLink({ guide }: { guide?: ReactNode } = {}) {
  const { t } = useTranslation('nav')
  const [open, setOpen] = useState(false)
  if (guide) {
    return (
      <>
        <details data-shell="screen-guide" className="group rounded-card border border-[var(--bellum-border)] bg-card">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-xs text-[var(--bellum-text-accent)] md:min-h-9">
            <CircleHelp className="size-4 shrink-0" aria-hidden="true" />
            <span>{t('shell.howToWork')}</span>
            <ChevronDown
              className="ml-auto size-4 shrink-0 transition-transform duration-immediate ease-bellum-out group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="space-y-3 border-t border-[var(--bellum-border)] px-4 py-3">
            {guide}
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex min-h-11 items-center text-xs text-[var(--bellum-text-accent)] hover:underline md:min-h-8"
            >
              {t('shell.allGuides')}
            </button>
          </div>
        </details>
        {open ? <GuideHelpCenter open={open} onOpenChange={setOpen} /> : null}
      </>
    )
  }
  return (
    <>
      <button
        type="button"
        data-shell="screen-guide"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 py-1.5 text-xs text-[var(--bellum-text-accent)] transition-colors duration-immediate hover:underline md:min-h-8"
      >
        <CircleHelp className="size-4 shrink-0" aria-hidden="true" />
        <span>{t('shell.howToWork')}</span>
      </button>
      {open ? <GuideHelpCenter open={open} onOpenChange={setOpen} /> : null}
    </>
  )
})
