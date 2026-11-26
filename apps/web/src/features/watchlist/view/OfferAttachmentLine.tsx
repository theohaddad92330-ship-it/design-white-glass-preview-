import { useTranslation } from 'react-i18next'
import { offerAttachmentView, type WatchlistItem } from '../model/watchlist'

/**
 * #4437.5 (recette prod 23/10) — un intitulé d'offre LIBRE (« React JS-Python », « Fullstack ») est rattaché à un type,
 * une compétence et une famille ; les trois se lisent sur la ligne. Le rattachement vient de la collecte (jamais
 * recomposé ici) : « non classé » et « rien posé » (collecte antérieure) ne font AUCUNE ligne — un intitulé non
 * rattachable reste nu. Le détail, lui, dit « non classé » (`WatchlistSignalDetail`).
 */
export function OfferAttachmentLine({ attachment }: { attachment: WatchlistItem['offerAttachment'] }) {
  const { t } = useTranslation('watchlist')
  const view = offerAttachmentView(attachment)
  if (!view || view.unclassified) return null
  const parts = [
    view.factType ? t(`detail.attachmentType.${view.factType}`) : null,
    ...view.skills,
    view.family ? t(`discover:rail.jobFamily.${view.family}`) : null,
  ].filter((part): part is string => Boolean(part))
  if (parts.length === 0) return null
  return (
    <ul
      data-testid="offer-attachment-chips"
      aria-label={t('detail.attachmentAria')}
      className="mt-1 flex flex-wrap gap-1"
    >
      {parts.map(part => (
        <li
          key={part}
          className="rounded-full bg-[var(--bellum-surface-2)] px-2 py-0.5 text-xs text-[var(--bellum-text-secondary)]"
        >
          {part}
        </li>
      ))}
    </ul>
  )
}
