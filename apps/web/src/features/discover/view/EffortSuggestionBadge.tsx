import { useTranslation } from 'react-i18next'
import { suggestedEffortLevelFor } from '../lib/discover-effort-suggestion'
import type { DiscoverCandidate } from '../lib/discover-types'
import { familyOf } from './FamilyBadge'

/**
 * #3408.3 (beta 30/09/2026, #3408) — LE NIVEAU D'EFFORT SUGGÉRÉ, SUR LA CARTE.
 *
 * `FamilyBadge`, juste à côté, dit déjà la famille (tome 1 §8.4). Ce badge la
 * NOMME dans le vocabulaire du board d'effort (`sprint.ts`, #3407) — pas un
 * second calcul, `suggestedEffortLevelFor` (pure, testée seule) ne fait que
 * relire cette même famille. Le libellé du niveau est celui du board
 * (`sprints.json#levels`), JAMAIS redéfini ici (GA-26).
 *
 * ⚠️ Réservé aux candidats SANS `accountId` — même garde que
 * `AccessLevelBadge` juste au-dessus dans `CandidateCard` : un compte déjà
 * possédé porte sa VRAIE décision (`accounts.sprint`, posée par un
 * commercial, potentiellement corrigée à la main) — une correction humaine
 * gagne toujours, une suggestion ne doit jamais sembler la remplacer.
 */
export function EffortSuggestionBadge({ candidate }: { candidate: DiscoverCandidate }) {
  const { t } = useTranslation('discover')
  const { t: tSprint } = useTranslation('sprints')
  const suggestion = suggestedEffortLevelFor(familyOf(candidate))
  return (
    <span
      data-testid="discover-effort-suggestion-badge"
      className="shrink-0 rounded-full px-2 py-0.5 text-xs"
      style={{
        background: 'var(--bg-elevated)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border-subtle)',
      }}
      title={t(`effortSuggestion.help.${suggestion.reasonKey}`)}
    >
      {t('effortSuggestion.badge', { level: tSprint(`levels.${suggestion.level}`) })}
    </span>
  )
}
