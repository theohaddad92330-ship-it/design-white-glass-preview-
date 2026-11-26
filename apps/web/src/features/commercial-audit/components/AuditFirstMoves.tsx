import { useTranslation } from 'react-i18next'
import { AUDIT_MOVE_DECISION_STATUSES, auditMovePage, type AuditMove, type AuditMoveDecisions } from '@bellum/contracts'
import { Badge, Button, Text } from '@bellum/ui'
import { useRecordAuditMoveDecision } from '@/features/profile-context/hooks/useRecordAuditMoveDecision'
import { AuditCard } from './AuditCard'
import { ConfidenceBadge } from './ConfidenceBadge'

/**
 * #2074.10 à #2074.15 / #2090.7 — LES PREMIERS MOUVEMENTS, EN FIN D'AUDIT.
 *
 * Trois au plus, un par genre, dérivés par `auditMovesFrom()`
 * (`packages/contracts/src/schemas/commercial-audit-moves.ts`) depuis les
 * ruptures déjà calculées par `useCommercialAudit()`. Aucune requête de plus,
 * aucune source de plus : la même discipline que `AuditWeeklyPriority`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE CARTE N'AFFICHE PAS, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────
 * - **Ni responsable ni échéance** (#2074.14) : l'audit ne les connaît pas, et
 *   `action_plan_items` les porte déjà (GA-26). Les afficher vides ferait
 *   croire à un champ qu'on aurait oublié de remplir.
 * - **Aucun lien** vers la page nommée : la page se DÉRIVE de la nature visée
 *   (`auditMovePage`), mais un mouvement ne vise aucun enregistrement précis —
 *   il n'y a donc pas d'identifiant à mettre dans une route. La page se NOMME,
 *   on n'invente pas de lien (même choix que `planItemFactsData.ts`).
 *
 * #2074.16 — « L'utilisateur VALIDE ou MODIFIE avant création dans Actions » :
 * trois boutons par mouvement (Valider / Modifier / Écarter), persistés dans
 * `profiles.audit_move_decisions` (`useRecordAuditMoveDecision`), clé sur
 * `AuditMove.ruleId` — jamais dans `profile_context`. Le clic EST la décision
 * (geste utilisateur = auto-approuvé), et un second clic sur un AUTRE bouton
 * REMPLACE simplement le premier (même discipline que
 * `AuditStrategyOptions`). Le statut affiché (`Badge`) est la décision
 * humaine si elle existe, sinon le `propose` dérivé par `auditMovesFrom` —
 * jamais les deux à la fois (GA-26, une seule vérité par mouvement).
 */
export function AuditFirstMoves({
  moves,
  decisions,
}: {
  moves: readonly AuditMove[]
  /** #2074.16 — clé sur `AuditMove.ruleId`. `{}` = aucune décision : le
   *  mouvement reste `propose`. */
  decisions: AuditMoveDecisions
}) {
  const { t } = useTranslation('commercialAudit')
  const record = useRecordAuditMoveDecision()

  return (
    <AuditCard className="space-y-3">
      <div className="space-y-1">
        <Text
          element="h2"
          size="xs"
          weight="semibold"
          className="uppercase tracking-wide text-[var(--bellum-text-muted)]"
        >
          {t('moves.title')}
        </Text>
        <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('moves.intro')}
        </Text>
      </div>

      {moves.length === 0 ? (
        <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
          {t('moves.unmeasured')}
        </Text>
      ) : (
        <>
          <ul className="space-y-3">
            {moves.map(move => {
              const page = auditMovePage(move)
              // #2074.16 — la décision HUMAINE gagne toujours ; `propose` est
              // le statut DÉRIVÉ par défaut tant qu'elle n'existe pas.
              const decision = decisions[move.ruleId]
              const effectiveStatus: AuditMove['status'] = decision?.status ?? move.status
              return (
                <li
                  key={move.kind}
                  data-testid="audit-move"
                  className="space-y-1.5 rounded-lg border border-[var(--bellum-border)] p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Text element="span" size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
                      {t(`moves.kind.${move.kind}`)}
                    </Text>
                    <Badge variant="outline">{t(`moves.status.${effectiveStatus}`)}</Badge>
                    <ConfidenceBadge confidence={move.confidence} />
                  </div>

                  <Text element="p" size="sm" weight="medium">
                    {move.subject}
                  </Text>

                  <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                    {t('moves.reason')} : {move.reason}
                  </Text>

                  {move.expectedResult === null ? null : (
                    <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
                      {t('moves.expectedResult')} : {move.expectedResult}
                    </Text>
                  )}

                  {page === null ? null : (
                    <Text
                      element="p"
                      size="xs"
                      data-testid="audit-move-page"
                      className="text-[var(--bellum-text-muted)]"
                    >
                      {t('moves.pageLabel')} : {t(`moves.page.${page}`)}
                    </Text>
                  )}

                  {/* #2074.16 — le clic EST la décision (auto-approuvé) : pas
                      de confirmation avant l'appel. Les trois boutons
                      restent visibles APRÈS une décision (aria-pressed
                      distingue la retenue) : un second clic REMPLACE
                      simplement le premier. */}
                  <div className="flex flex-wrap gap-2" role="group" aria-label={t('moves.actions.prompt')}>
                    {AUDIT_MOVE_DECISION_STATUSES.map(status => (
                      <Button
                        key={status}
                        type="button"
                        size="sm"
                        variant={decision?.status === status ? 'secondary' : 'outline'}
                        aria-pressed={decision?.status === status}
                        className="pointer-coarse:min-h-11"
                        isLoading={
                          record.isPending &&
                          record.variables?.ruleId === move.ruleId &&
                          record.variables?.status === status
                        }
                        onClick={() =>
                          // #2074.16 — l'objet montré devient la tâche dans Actions (Valider/Modifier).
                          record.mutate({
                            ruleId: move.ruleId,
                            status,
                            move: {
                              subject: move.subject,
                              reason: move.reason,
                              expectedResult: move.expectedResult ?? undefined,
                            },
                          })
                        }
                      >
                        {t(`moves.actions.${status}`)}
                      </Button>
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>
          <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
            {t('moves.gate')}
          </Text>
        </>
      )}
    </AuditCard>
  )
}
