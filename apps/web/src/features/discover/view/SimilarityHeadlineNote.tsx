import { Trans, useTranslation } from 'react-i18next'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'

/**
 * #2166.11 (épopée #2806) — LA RÉFÉRENCE COMPARABLE, en clair.
 *
 * Seul `kind: 'sector'` arrive sur ce chemin (voir `discover-types.ts`) : la
 * phrase est donc unique, contrairement à `SimilarHeadlineText` (panneau
 * « Similaires » de la fiche compte, qui doit aussi couvrir `twin`/`tech`).
 * `null` en l'absence de `similarityHeadline` — jamais un texte de repli
 * deviné, jamais « 0 compte comparable ».
 *
 * `<Trans>` plutôt qu'une chaîne concaténée : le nom du compte de référence
 * est en GRAS, et une concaténation sortirait de l'i18n (`SimilarHeadlineText`
 * porte le même commentaire sur `accounts.json`).
 */
export function SimilarityHeadlineNote({ candidate }: { candidate: DiscoverCandidate }) {
  const { t } = useTranslation('discover')
  const headline = candidate.similarityHeadline
  if (!headline || headline.kind !== 'sector') return null

  return (
    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
      <Trans
        t={t}
        i18nKey="card.similarityHeadlineSector"
        values={{ account: headline.referenceAccount }}
        components={{ account: <span className="font-semibold" /> }}
      />
    </p>
  )
}
