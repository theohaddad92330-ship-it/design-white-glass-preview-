import { useTranslation } from 'react-i18next'
import { HelpCircle } from 'lucide-react'
import { DegradedLines } from './DegradedBanner'
import type { DiscoverDegradedSource } from '@/features/discover/lib/discover-types'

/**
 * #1766 — « PLUSIEURS ENTITÉS PORTENT CE NOM » N'EST PAS UNE PANNE.
 *
 * Trouvé en creusant le retour client du 09/09, et non demandé : `splitDegraded`
 * rangeait les homonymies non tranchées (`kind: 'ambiguous'`) dans le même
 * panier que les vraies pannes réseau (`unreachable`). Le bandeau ambre leur
 * faisait donc dire « une source n'a pas pu répondre » — faux dans les deux
 * moitiés : le registre a répondu, et il a même répondu PLUSIEURS fois. Ce qui
 * manque, c'est un moyen de trancher, et le produit refuse d'inventer un SIREN.
 *
 * Même famille de défaut que les trois déjà séparées ici (`not-examined`,
 * `capability`, `no-match`) : fondre deux affirmations différentes dans un seul
 * costume, jusqu'à ce que le costume mente sur les deux.
 *
 * Ton NEUTRE, comme `CoverageNotice` et `CapabilityNotice` : rien n'est cassé.
 * L'ambre reste réservé à ce qui l'est — un avertissement qui crie au loup
 * n'est plus lu le jour où le loup arrive.
 */
export function AmbiguityNotice({ ambiguities }: { ambiguities: readonly DiscoverDegradedSource[] }) {
  const { t } = useTranslation('discover')
  if (ambiguities.length === 0) return null

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
        <HelpCircle className="h-[13px] w-[13px]" />
        {t('ambiguous.title')}
      </p>
      <p className="mt-1 text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
        {t('ambiguous.description')}
      </p>
      <DegradedLines entries={ambiguities} />
    </div>
  )
}
