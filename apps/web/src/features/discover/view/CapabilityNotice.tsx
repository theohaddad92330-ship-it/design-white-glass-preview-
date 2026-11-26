import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'
import type { DiscoverDegradedSource } from '@/features/discover/lib/discover-types'
import { dataSourceLabels } from '@/lib/data-source-label'

/**
 * Filet de sécurité des limites de capacité qu'aucun champ d'écran ne porte.
 *
 * Le cas nominal n'est PAS ici : quand la source nomme le critère qu'elle n'a
 * pas su exprimer (`fields: ['sector']`), la note se pose à côté du filtre
 * concerné, là où elle est actionnable. Reste le cas où le critère n'a pas de
 * contrôle à l'écran (le registre gouv.fr sait refuser un `revenue_min`) ou
 * n'est pas nommé du tout — se taire perdrait alors une information vraie
 * (« pourquoi ces lignes sont-elles plus larges que ma demande ? »).
 *
 * Ton NEUTRE, jamais l'ambre : la source a répondu. Ce qui manque n'est pas des
 * entreprises, c'est le resserrement — la liste est un SUR-ensemble. Écrire
 * « résultats partiels » ici serait l'exact inverse de la vérité.
 */
export function CapabilityNotice({
  capabilities,
  shown,
}: {
  capabilities: DiscoverDegradedSource[]
  /** Les lignes que la liste montre. #4588 — à zéro, l'élargissement n'a rien ramené : le bandeau se tait. */
  shown: number
}) {
  const { t, i18n } = useTranslation('discover')
  if (capabilities.length === 0 || shown === 0) return null

  // #1912 — les CAPACITÉS, dédoublonnées, jamais les identifiants de nos fournisseurs.
  const labels = dataSourceLabels(
    t,
    capabilities.map(entry => entry.source),
  )
  const sources = new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(labels)

  return (
    <div
      role="status"
      className="mb-4 rounded-lg p-3"
      style={{
        background: 'var(--surface-raised, rgba(148,163,184,0.06))',
        border: '1px solid rgba(148,163,184,0.22)',
      }}
    >
      <p className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
        <Info className="h-[13px] w-[13px]" />
        {t('capability.title')}
      </p>
      <p className="mt-1 text-xs leading-snug first-letter:uppercase" style={{ color: 'var(--text-secondary)' }}>
        {t('capability.description', { sources, count: labels.length })}
      </p>
    </div>
  )
}
