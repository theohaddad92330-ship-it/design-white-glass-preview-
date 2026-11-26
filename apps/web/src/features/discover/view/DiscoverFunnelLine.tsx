import { readDiscoverFunnel } from '@bellum/contracts'
import { Filter } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * #4419 — le REJET se lit : « 128 trouvés · 3 retenus — 94 hors ville, 31 hors métier ». Une ligne, posée par la
 * recherche (`query.funnel`). Un critère qui n'a rien écarté n'y figure pas (jamais « 0 hors zone ») ; sans
 * « entrés » côté amont, la ligne ne dit que les retenus. Aucun fournisseur n'est nommé. Rien à dire : rien.
 */
export function DiscoverFunnelLine({
  query,
  widenedCount,
}: {
  query: Record<string, unknown> | undefined
  /** #4631.6 — les comptes que l'élargissement de zone a AJOUTÉS à la liste rendue ; 0 ou absent : aucune mention. */
  widenedCount?: number
}) {
  const { t } = useTranslation('discoverSkill')
  const funnel = readDiscoverFunnel(query)
  if (!funnel) return null
  // Lot 790 (#5212) — coupée par le délai avant la vérification : rien n'a été mesuré, le « 0 » serait inventé (GA-18/19).
  const cut = (query?.skillSearch as { deadlineCut?: unknown } | undefined)?.deadlineCut === true
  if (cut && funnel.kept === 0 && !funnel.entered) return null
  const head =
    funnel.entered === undefined
      ? t('funnel.lineKeptOnly', { kept: funnel.kept })
      : t('funnel.line', { entered: funnel.entered, kept: funnel.kept })
  const rejected = funnel.rejected.map(({ criterion, count }) => t(`funnel.${criterion}`, { count })).join(', ')
  return (
    <p
      role="status"
      data-testid="discover-funnel"
      className="mb-3 flex items-center gap-1.5 text-sm"
      style={{ color: 'var(--text-secondary)' }}
    >
      <Filter className="h-[13px] w-[13px]" aria-hidden />
      {rejected ? `${head}${t('funnel.separator')}${rejected}` : head}
      {widenedCount ? t('funnel.widened', { count: widenedCount }) : null}
    </p>
  )
}
