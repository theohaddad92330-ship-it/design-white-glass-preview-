import { ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'
import { chipClassName } from '@bellum/ui'
import {
  completePlace,
  OTHER_ACTOR_KINDS,
  type OtherActorKind,
  type OtherActorRow,
} from '@/features/discover/lib/discover-other-actors'

/**
 * #4746.2 (lot P, Louis 31/10) — les deux onglets de la liste : « Comptes » (clients finaux seulement) et « Autres
 * acteurs » (ESN, cabinets, intérim, partenaires, sites d'annonces). Cet onglet ne fait AUCUNE requête : il lit ce que
 * la recherche a déjà rendu. Son compteur n'apparaît qu'une fois l'onglet ouvert (jamais « 0 » d'une non-mesure).
 * Remplace le bloc « Cabinets et ESN qui recrutent » (#4746) ; le filtre `entityType` y vit seul (GA-26).
 */
export type ActorsTab = 'accounts' | 'others'

const OFFER_DATE_FORMAT: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }

export function OtherActorsTab({
  rows,
  kinds,
  onKindsChange,
}: {
  rows: readonly OtherActorRow[]
  /** Les pastilles COCHÉES ; toutes cochées par défaut. */
  kinds: readonly OtherActorKind[]
  onKindsChange: (next: OtherActorKind[]) => void
}) {
  const { t } = useTranslation('discover')
  const shown = rows.filter(row => kinds.includes(row.kind))
  const toggle = (kind: OtherActorKind) =>
    onKindsChange(kinds.includes(kind) ? kinds.filter(k => k !== kind) : [...kinds, kind])
  return (
    <section
      data-testid="other-actors"
      aria-label={t('actors.tabs.others', { count: rows.length })}
      className="flex flex-col gap-3"
    >
      <div role="group" aria-label={t('actors.pillsLabel')} className="flex flex-wrap gap-2">
        {OTHER_ACTOR_KINDS.map(kind => (
          <button
            key={kind}
            type="button"
            aria-pressed={kinds.includes(kind)}
            onClick={() => toggle(kind)}
            className={chipClassName({ active: kinds.includes(kind), size: 'md', className: 'min-h-11' })}
          >
            {t(`actors.kind.${kind}`)}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-[var(--bellum-text-secondary)]" data-testid="other-actors-empty">
          {t(rows.length === 0 ? 'actors.emptyNone' : 'actors.emptyFiltered')}
        </p>
      ) : (
        <div className="w-full overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[40rem] text-left text-xs text-[var(--bellum-text-secondary)]">
            <caption className="sr-only">{t('actors.tabs.others', { count: rows.length })}</caption>
            <thead className="text-[var(--bellum-text-muted)]">
              <tr>
                {(['name', 'type', 'city', 'offers', 'latest', 'date'] as const).map(column => (
                  <th key={column} scope="col" className="px-2 py-1 font-medium">
                    {t(`actors.columns.${column}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map(row => {
                const date = row.latestDate ? (formatDate(row.latestDate, OFFER_DATE_FORMAT) ?? row.latestDate) : null
                return (
                  <tr
                    key={row.id}
                    data-testid="other-actor-row"
                    className="border-t border-[var(--border-subtle)] align-top"
                  >
                    <th scope="row" className="px-2 py-1 text-sm font-medium text-[var(--bellum-text-primary)]">
                      {row.name}
                    </th>
                    <td className="px-2 py-1">
                      {t(`actors.kind.${row.kind}`)}
                      {row.esnRecognition && (
                        <span data-testid="other-actor-reason" className="block text-[var(--bellum-text-muted)]">
                          {t(`card.esnRecognition_${row.esnRecognition}`)}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1">{completePlace(row.city)}</td>
                    <td className="px-2 py-1">{row.offerCount}</td>
                    <td className="px-2 py-1">
                      {row.latestTitle ? (
                        row.latestUrl ? (
                          <a
                            href={row.latestUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-sm py-1 text-[var(--bellum-text-accent)] underline underline-offset-2 pointer-coarse:min-h-11"
                          >
                            {row.latestTitle}
                            <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          </a>
                        ) : (
                          row.latestTitle
                        )
                      ) : null}
                    </td>
                    <td className="px-2 py-1">{date}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
