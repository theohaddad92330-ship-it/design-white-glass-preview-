import { useTranslation } from 'react-i18next'
import { ListChecks } from 'lucide-react'
import { Text } from '@bellum/ui'

/**
 * #1950.3 / #1950.9 / #1950.25 — LA LIGNE QUI RÉCAPITULE UN PLAN DE LAURA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE FORMALISE, ET CE QU'ELLE N'INVENTE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Décision du 12/09/2026 : formaliser l'existant. Quand Laura propose plusieurs
 * gestes, ce sont des cartes INDÉPENDANTES (`PendingActions`), numérotées dans
 * un ordre suggéré. Cette ligne les résume — combien d'étapes, ce qu'elles
 * coûtent au total selon ce que CHAQUE carte annonce, et que rien ne part sans
 * un clic. Elle ne crée ni état d'étape, ni dépendance, ni exécution enchaînée :
 * ces trois-là attendent la migration Action OS, où vivront les cartes
 * gouvernées.
 *
 * #1950.14 revient sur 1950.3, délibérément (décision Louis 19/09/2026) : les
 * trois existent désormais sur les cartes GOUVERNÉES (`CopilotCards.tsx`,
 * `CopilotPlanBar` ; règle unique `packages/contracts/src/schemas/copilot-plan.ts`).
 * Cette ligne-ci reste celle du legs `PendingActions` — JSON brut du modèle,
 * sans état persisté — où rien n'est enchaîné : sa phrase « étape par étape »
 * y reste vraie.
 *
 * ⚠️ « Non annoncé » n'est jamais « 0 ». Une carte sans `cost_credits` ne
 * s'additionne pas en zéro : elle se compte à part, et un plan dont aucune carte
 * n'annonce de coût dit « coût non annoncé », pas « aucun crédit ».
 *
 * Le plafond agrégé d'une réponse (#1950.17) est tenu côté serveur : au-delà,
 * la carte n'arrive pas ici et Laura le dit dans son texte.
 */
type PlanStep = { cost_credits?: number }

export function PlanRecap({ actions }: { actions: readonly PlanStep[] }) {
  const { t } = useTranslation('chat')
  // Une carte seule n'est pas un plan — même règle que la numérotation des cartes.
  if (actions.length < 2) return null

  return (
    <div
      role="note"
      className="mt-2 flex w-full items-start gap-2 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 py-2"
    >
      <ListChecks className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />
      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
        {[t('pending.plan.steps', { count: actions.length }), t('pending.plan.validation')].join(' · ')}
      </Text>
    </div>
  )
}
