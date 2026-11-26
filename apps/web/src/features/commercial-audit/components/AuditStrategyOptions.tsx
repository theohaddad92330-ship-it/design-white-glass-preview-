import { useOpenLauraInPlace } from '@/features/laura/bubble/use-open-laura-in-place'
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { entryStrategyValues, type EntryStrategy } from '@bellum/contracts'
import { Badge, Button, Text } from '@bellum/ui'
import { useChooseEntryStrategy } from '@/features/profile-context/hooks/useChooseEntryStrategy'
import { AuditCard } from './AuditCard'
import type { AuditHeadline } from '../lib/build-audit'

/**
 * #2073 — LES VOIES POSSIBLES, ET UNE STRATÉGIE QUI SE CHOISIT.
 *
 * « On PROPOSE, on ne décide pas à la place » (#2073) appliqué à la stratégie
 * d'entrée : les quatre voies connues du produit (`entryStrategyValues`) sont
 * un CATALOGUE — vrai quel que soit le profil, donc il s'affiche toujours,
 * même quand rien n'a pu être établi (#2073.1-.4). La voie MARQUÉE
 * « Recommandée » dépend du profil (`idealAccountProfile.entryStrategy`,
 * CALCULÉ par le profileur) : sans elle, aucune carte ne porte ce badge — une
 * recommandation par défaut serait précisément le « 0 » qui n'est pas vrai
 * (#2073.5-.7).
 *
 * #2073.8 — « Choisir cette stratégie » PERSISTE le choix de l'utilisateur
 * dans SA PROPRE colonne (`profiles.chosen_entry_strategy`,
 * `useChooseEntryStrategy`), distincte du champ calculé : les deux badges,
 * « Recommandée » et « Stratégie retenue », peuvent donc porter sur des
 * cartes DIFFÉRENTES — une correction humaine gagne toujours, mais elle ne
 * réécrit pas ce que le profileur a calculé.
 *
 * #2073.9 — « Comparer » n'a de sens qu'une fois un choix posé (comparer À
 * QUOI, sinon ?) : le bouton n'apparaît qu'après un premier choix, et révèle
 * l'écart — ou l'accord — avec la recommandation initiale. « Modifier une
 * hypothèse » reste la seule porte qui RECONSIDÈRE l'analyse (mène à
 * `/settings/profile/context`), puisque `entryStrategy` calculé n'est pas un
 * champ saisi — ne pas confondre reconsidérer le calcul et choisir parmi ses
 * résultats.
 *
 * #2073.11 — doublon ASSUMÉ de #2068.22-.33 : `entryStrategy` alimentait déjà
 * `AuditConsequences` (règle « accounts ») ; ce lot fait seulement entrer le
 * champ CHOISI là où le champ CALCULÉ entrait (`buildCommercialAudit`, 4e
 * paramètre) — rien n'est re-câblé ici.
 *
 * #2066.20 / #2066.23-.26 — le corps de #2066 concatène une SECONDE demande,
 * « options, prérequis et premier test » : le même catalogue que ci-dessus,
 * complété par cinq champs. #2066.21 (prérequis) et #2066.22 (limite) sont le
 * DOUBLON exact de #2073.2 / #2073.3 — déjà rendus par `prereq` / `limits`,
 * rien ne se répète sous un autre nom. Les cinq nouveaux : potentiel, charge,
 * délai de retour, risque, condition d'arrêt (accolée au premier test).
 * ⚠️ #2066.25 demande « risque + preuve existante » : aucune preuve mesurée
 * n'existe pour un catalogue générique (ce n'est pas une donnée de CETTE
 * entreprise) — en inventer une serait la donnée fictive interdite. Le champ
 * `risk` nomme le risque ET le signal OBSERVABLE qui le révèle, sans prétendre
 * à une preuve qu'aucune source ne porte.
 */
export function AuditStrategyOptions({
  target,
  chosenEntryStrategy = null,
}: {
  target: AuditHeadline | undefined
  /** #2073.8 — `null` = aucun choix explicite encore posé. */
  chosenEntryStrategy?: EntryStrategy | null
}) {
  const { t } = useTranslation('commercialAudit')
  const openLauraInPlace = useOpenLauraInPlace()
  const [dismissed, setDismissed] = useState(false)
  const [comparing, setComparing] = useState(false)
  const choose = useChooseEntryStrategy()

  if (dismissed) return null

  const recommended = target?.value?.kind === 'target' ? target.value.entryStrategy : null
  const targetValue = target?.value?.kind === 'target' ? target.value : null
  // #2073.8 — la réponse de la mutation prime dès qu'elle existe (même
  // précédent que `ValidateContextStatus`) : la carte porte le bon badge au
  // clic, sans attendre un second aller-retour de `GET /profile-context/me`.
  const chosen = choose.data?.chosenEntryStrategy ?? chosenEntryStrategy

  return (
    <section className="space-y-3">
      <Text element="h2" size="lg" weight="semibold">
        {t('strategyOptions.title')}
      </Text>

      {recommended === null ? (
        // Le mot « non mesuré » vit à UN seul endroit (common) : on ne le
        // réécrit pas ici (voir AuditHero).
        <div className="space-y-1">
          <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
            {t('common:unknownValue')}
          </Text>
          <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
            {t('strategyOptions.unmeasured')}
          </Text>
        </div>
      ) : (
        <Text element="p" size="sm" weight="medium">
          {t('strategyOptions.pick', { strategy: t(`strategy.${recommended}`) })}
        </Text>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {entryStrategyValues.map(strategy => (
          <StrategyOptionCard
            key={strategy}
            strategy={strategy}
            isRecommended={strategy === recommended}
            isChosen={strategy === chosen}
            targetValue={targetValue}
            isChoosing={choose.isPending && choose.variables === strategy}
            onChoose={() => choose.mutate(strategy)}
          />
        ))}
      </div>

      {/* #2073.9 — « Comparer » : n'existe qu'une fois un choix posé, et
          révèle l'écart (ou l'accord) avec la recommandation initiale. */}
      {chosen !== null && (
        <div className="space-y-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="pointer-coarse:min-h-11"
            aria-pressed={comparing}
            onClick={() => setComparing(value => !value)}
          >
            {t('strategyOptions.actions.compare')}
          </Button>
          {comparing && (
            <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
              {recommended !== null && chosen !== recommended
                ? t('strategyOptions.comparison.different', {
                    chosen: t(`strategy.${chosen}`),
                    recommended: t(`strategy.${recommended}`),
                  })
                : t('strategyOptions.comparison.same', { chosen: t(`strategy.${chosen}`) })}
            </Text>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm" className="pointer-coarse:min-h-11">
          <Link to="/settings/profile/context">{t('strategyOptions.actions.reconsider')}</Link>
        </Button>
        {recommended !== null &&
          (openLauraInPlace ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="pointer-coarse:min-h-11"
              onClick={() =>
                openLauraInPlace(
                  t('strategyOptions.actions.askCopilotPrompt', { strategy: t(`strategy.${recommended}`) }),
                )
              }
            >
              {t('strategyOptions.actions.askCopilot')}
            </Button>
          ) : (
            <Button asChild variant="ghost" size="sm" className="pointer-coarse:min-h-11">
              <Link
                to="/chat"
                search={{
                  prompt: t('strategyOptions.actions.askCopilotPrompt', { strategy: t(`strategy.${recommended}`) }),
                }}
              >
                {t('strategyOptions.actions.askCopilot')}
              </Link>
            </Button>
          ))}
        <Button variant="ghost" size="sm" className="pointer-coarse:min-h-11" onClick={() => setDismissed(true)}>
          {t('strategyOptions.actions.notNow')}
        </Button>
      </div>
    </section>
  )
}

function StrategyOptionCard({
  strategy,
  isRecommended,
  isChosen,
  targetValue,
  isChoosing,
  onChoose,
}: {
  strategy: EntryStrategy
  isRecommended: boolean
  isChosen: boolean
  targetValue: { size: string; decisionLevel: string } | null
  isChoosing: boolean
  onChoose: () => void
}) {
  const { t } = useTranslation('commercialAudit')

  return (
    <AuditCard className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Text element="h3" size="sm" weight="semibold">
          {t(`strategy.${strategy}`)}
        </Text>
        <div className="flex items-center gap-1.5">
          {isRecommended && <Badge variant="primary">{t('strategyOptions.recommended')}</Badge>}
          {/* #2073.8 — badge DISTINCT de « Recommandée » : le choix de
              l'utilisateur n'est pas le calcul du profileur, même quand les
              deux tombent sur la même carte. */}
          {isChosen && <Badge variant="success">{t('strategyOptions.chosenBadge')}</Badge>}
        </div>
      </div>

      <div className="space-y-1.5">
        {/* #2066.20 — le potentiel : ce que la voie peut apporter, avant ses
            prérequis et ses limites. */}
        <StrategyDetailLine
          label={t('strategyOptions.potential')}
          value={t(`strategyOptions.details.${strategy}.potential`)}
        />
        <StrategyDetailLine
          label={t('strategyOptions.prereq')}
          value={t(`strategyOptions.details.${strategy}.prereq`)}
        />
        <StrategyDetailLine
          label={t('strategyOptions.limits')}
          value={t(`strategyOptions.details.${strategy}.limits`)}
        />
        {/* #2066.23 / #2066.24 — la charge et le délai de retour. */}
        <StrategyDetailLine
          label={t('strategyOptions.workload')}
          value={t(`strategyOptions.details.${strategy}.workload`)}
        />
        <StrategyDetailLine
          label={t('strategyOptions.paybackDelay')}
          value={t(`strategyOptions.details.${strategy}.paybackDelay`)}
        />
        {/* #2066.25 — le risque et son signal observable (voir docblock). */}
        <StrategyDetailLine label={t('strategyOptions.risk')} value={t(`strategyOptions.details.${strategy}.risk`)} />
        <StrategyDetailLine
          label={t('strategyOptions.firstTest')}
          value={t(`strategyOptions.details.${strategy}.firstTest`)}
        />
        {/* #2066.26 — la condition d'arrêt, accolée au premier test. */}
        <StrategyDetailLine
          label={t('strategyOptions.stopCondition')}
          value={t(`strategyOptions.details.${strategy}.stopCondition`)}
        />
      </div>

      {/* #2073.7 — pourquoi CETTE voie passe devant : la raison cite les
          champs RÉELS du profil qui l'ont produite, jamais une phrase
          générique. */}
      {isRecommended && targetValue && (
        <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('strategyOptions.why', {
            size: t(`discover:sidebar.size.${targetValue.size}`),
            level: t(`discover:sidebar.level.${targetValue.decisionLevel}`),
          })}
        </Text>
      )}

      {/* #2073.8 — le geste EST la décision (auto-approuvé) : pas de
          confirmation avant l'appel. Une carte déjà retenue ne porte plus le
          bouton — son badge suffit à dire l'état. */}
      {!isChosen && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="pointer-coarse:min-h-11"
          isLoading={isChoosing}
          onClick={onChoose}
        >
          {t('strategyOptions.actions.choose')}
        </Button>
      )}
    </AuditCard>
  )
}

function StrategyDetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Text element="p" size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
        {label}
      </Text>
      <Text element="p" size="sm">
        {value}
      </Text>
    </div>
  )
}
