import type { ManagerCoaching } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { MessageCircleHeart } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * #2405.6 — COACHING PARTI D'UN FAIT DATÉ, JAMAIS D'UN JUGEMENT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI PAS DANS `ArbitrationQueue`
 * ─────────────────────────────────────────────────────────────────────────────
 * `ArbitrationQueue` pose des DÉCISIONS (attribuer, coordonner, réaffecter) —
 * chaque carte mène au bloc qui porte le geste. Un fait de coaching ne se
 * « résout » pas d'un clic : c'est une phrase à apporter en échange individuel,
 * pas une file à vider. Les mélanger ferait lire une conversation RH comme une
 * tâche en attente. Même donnée déjà servie (`coaching.stale_opportunities`,
 * `GET /manager/team-stats`) — AUCUN appel réseau de plus.
 *
 * ⚠️ Jamais un score, jamais un rang : `count`/`days` sont les deux seuls
 * nombres, et l'ORDRE du tableau est déjà celui de l'équipe (posé côté API,
 * `manager.service.ts`) — ce composant ne trie pas non plus.
 *
 * ⚠️ ABSENT ≠ VIDE. `coaching` est optionnel (deploy-skew, même raison que le
 * reste de `ManagerTeamStats`) : une API plus ancienne ne sait pas répondre,
 * ce composant retourne alors `null` plutôt que d'afficher un « rien à
 * signaler » inventé.
 */
export function CoachingPanel({ coaching }: { coaching: ManagerCoaching | undefined }) {
  const { t } = useTranslation('manager')
  if (!coaching) return null
  const { stale_opportunities: entries } = coaching
  if (entries.length === 0) return null

  return (
    <section aria-label={t('coaching.sectionTitle')} className="space-y-3">
      <div className="flex items-center gap-2">
        <MessageCircleHeart className="size-4 text-[var(--bellum-text-accent)]" aria-hidden />
        <Text element="h3" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {t('coaching.sectionTitle')}
        </Text>
      </div>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {entries.map(entry => (
          <li
            key={entry.member_user_id}
            className="flex flex-col gap-1 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4"
          >
            <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
              {entry.member_name}
            </Text>
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('coaching.staleOpportunities', { count: entry.count, days: entry.days })}
            </Text>
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('coaching.why')}
            </Text>
          </li>
        ))}
      </ul>
    </section>
  )
}
