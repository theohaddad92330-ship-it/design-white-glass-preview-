import { motion } from 'framer-motion'
import { Wand2 } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { auditHypothesesFrom, auditMovesFrom } from '@bellum/contracts'
import { Button, MOTION, Text } from '@bellum/ui'
import { useReconfigureOnboarding } from '@/features/profile/hooks/useReconfigureOnboarding'
import { AuditActiveLoad } from '../components/AuditActiveLoad'
import { AuditChain } from '../components/AuditChain'
import { AuditCollaborationCard } from '../components/AuditCollaborationCard'
import { AuditConsequences } from '../components/AuditConsequences'
import { AuditDeclaredSignals } from '../components/AuditDeclaredSignals'
import { AuditDecisionColumns } from '../components/AuditDecisionColumns'
import { AuditDirectionAndRoadmap } from '../components/AuditDirectionAndRoadmap'
import { AuditExpertiseCredibility } from '../components/AuditExpertiseCredibility'
import { AuditFactsAndScope } from '../components/AuditFactsAndScope'
import { AuditFirstMoves } from '../components/AuditFirstMoves'
import { AuditHero } from '../components/AuditHero'
import { AuditHypotheses } from '../components/AuditHypotheses'
import { ReportAuditInterpretation } from '../components/ReportAuditInterpretation'
import { AuditMarketMemory } from '../components/AuditMarketMemory'
import { AuditMaturityAxes } from '../components/AuditMaturityAxes'
import { AuditPlanAndMilestones } from '../components/AuditPlanAndMilestones'
import { AuditPositioning } from '../components/AuditPositioning'
import { AuditStrategicCombination } from '../components/AuditStrategicCombination'
import { AuditStrategyOptions } from '../components/AuditStrategyOptions'
import { AuditUnestablished } from '../components/AuditUnestablished'
import { AuditStageSources } from '../components/AuditSources'
import { AuditVerdict } from '../components/AuditVerdict'
import { AuditWeeklyPriority } from '../components/AuditWeeklyPriority'
import { buildWeeklyPriority } from '../lib/audit-priority'
import { AUDIT_COMPUTED_BLOCK_STAGES } from '../lib/audit-sources'
import { buildAuditVerdict } from '../lib/audit-verdict'
import { useCommercialAudit } from '../hooks/useCommercialAudit'

/**
 * #2071 à #2075 — L'AUDIT COMMERCIAL : « voici ce que le produit a compris ».
 *
 * #2090 (V3, « premier effet waouh ») ajoute cinq blocs SUR CE MÊME contexte,
 * dans cet ordre : un VERDICT qui tranche (`AuditVerdict`), la chaîne
 * commerciale et ses ruptures cliquables (`AuditChain`), la mémoire marché
 * (`AuditMarketMemory`, jusque-là confinée à `/welcome`), et une priorité
 * unique pour la semaine (`AuditWeeklyPriority`). Aucun n'ajoute de source :
 * les cinq dérivent de `auditContext`/`chain`, déjà calculés par
 * `useCommercialAudit()`.
 *
 * #2081 (lot FD, ARRÊT levé par Louis le 18/09/2026) ajoute un sixième bloc,
 * `AuditCollaborationCard` — la question « ton collègue gère-t-il une partie
 * de ces comptes ? », posée EN DERNIER, une fois que l'audit a montré ce
 * qu'il sait.
 *
 * Un seul mouvement (`MOTION.reveal`) : sur un outil ouvert huit heures par
 * jour, tout le reste fatigue en trois jours.
 */
export function CommercialAuditScreen() {
  const { t } = useTranslation(['commercialAudit', 'profile'])
  // #2021 — recette écran 27/09 : le lien du mode guidé existait sur chaque
  // étape (`ProfileStagePage`) mais pas sur CETTE page de Réglages › Profil.
  // Même déclencheur (`useReconfigureOnboarding`, GA-26), même libellé.
  const guidedMode = useReconfigureOnboarding()
  const onOpenGuidedMode = async (): Promise<void> => {
    const ok = await guidedMode.trigger()
    if (!ok) toast.error(t('profile:stage.guidedModeError'))
  }
  const {
    audit,
    auditContext,
    chain,
    isLoading,
    loadError,
    hasProfileContext,
    validatedAt,
    chosenEntryStrategy,
    isPendingReview,
    auditMoveDecisions,
    // #2075.24/.27/.28 — CE LOT (rebranchement) : `firstAnalysisSuggestions`
    // était déjà calculé par `useCommercialAudit()` et déjà attendu par
    // `AuditHero`/`ValidateContextStatus` (leurs props existent depuis #2075),
    // mais jamais destructuré ni relayé ici — code juste, calculé, testé, que
    // personne n'appelait.
    firstAnalysisSuggestions,
  } = useCommercialAudit()

  // #4969 — un échec se DIT, jamais un chargement qui tourne : la lecture du profil a échoué.
  if (loadError) {
    return (
      <Text element="p" size="sm" role="alert" className="text-[var(--bellum-text-secondary)]">
        {t('loadError')}
      </Text>
    )
  }

  if (isLoading) {
    return (
      <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('loading')}
      </Text>
    )
  }

  if (!hasProfileContext) {
    // Le profil n'a jamais été établi : on le DIT et on ouvre la porte, on ne
    // rend pas un écran de cases vides qui ressemblerait à une panne.
    return (
      <div className="mx-auto w-full max-w-5xl space-y-3 rounded-card border border-[var(--bellum-border)] bg-card p-6">
        <Text element="h1" size="2xl" weight="semibold" className="tracking-tight">
          {t('empty.title')}
        </Text>
        <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('empty.description')}
        </Text>
        <Button asChild variant="default" size="sm" className="pointer-coarse:min-h-11">
          <Link to="/settings/profile">{t('empty.cta')}</Link>
        </Button>
      </div>
    )
  }

  // #2075.24 — LA MÊME priorité que la carte « Prioriser cette semaine »
  // ci-dessous (GA-26 : une dérivation, une fonction pure, appelée deux fois
  // sur les mêmes entrées — jamais deux dérivations qui divergent) : le
  // relais post-validation (`ValidateContextStatus`, via `AuditHero`) pose la
  // MÊME question à Laura, jamais une deuxième priorité inventée à côté.
  const weeklyPriority = buildWeeklyPriority(auditContext)
  // #2075.29 — LA MÊME dérivation que `AuditFirstMoves` juste plus bas (GA-26,
  // un seul appel réutilisé) : `AuditHero` en a besoin pour le snapshot posé
  // sur la conversation ouverte depuis « Demander à… ».
  const firstMoves = auditMovesFrom(auditContext.contradictions)

  return (
    <motion.div {...MOTION.reveal} className="mx-auto w-full max-w-5xl space-y-6">
      <AuditHero
        audit={audit}
        validatedAt={validatedAt}
        isPendingReview={isPendingReview}
        firstAnalysisSuggestions={firstAnalysisSuggestions}
        weeklyPriorityAction={weeklyPriority?.action ?? null}
        hypotheses={auditHypothesesFrom(auditContext.contradictions)}
        chosenEntryStrategy={chosenEntryStrategy}
        firstMoves={firstMoves}
      />
      {/* #2010.15 — PRÉCISER / SIGNALER une mauvaise interprétation, au
          niveau de l'écran entier (verdict, recommandations, hypothèses) —
          distinct de `ReportCorrectionDialog` (#2018.7, une réponse
          déclarée, sur `/settings/profile`). */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {guidedMode.available && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={Wand2}
            isLoading={guidedMode.pending}
            disabled={guidedMode.pending}
            onClick={() => void onOpenGuidedMode()}
          >
            {t('profile:stage.guidedModeLink')}
          </Button>
        )}
        <ReportAuditInterpretation />
      </div>
      {/* #2061.2 / #2061.3 — CE QUI EST ÉTABLI, avant le verdict : le
          périmètre de l'audit et les faits, pour que la suite (verdict,
          chaîne, décisions) se lise sur une base nommée. Réouverture du
          24/09/2026 — voir le docblock d'`AuditFactsAndScope.tsx`. */}
      <AuditFactsAndScope scope={auditContext.scope} facts={auditContext.facts} />
      {/* #2090.12 / #2090.13 — le VERDICT qui tranche, pas un résumé : dérivé
          de la première rupture ou, à défaut, du goulot mesuré. */}
      <AuditVerdict verdict={buildAuditVerdict(auditContext)} />
      {/* #4425.1 — verdict, chaîne, maturité, plan : CALCULÉS, jamais éditables ;
          chacun dit à partir de quelles étapes du profil, un lien par étape. */}
      <AuditStageSources stages={AUDIT_COMPUTED_BLOCK_STAGES.verdict} />
      {/* #2090.15 / #2090.16 / #2090.17 — la chaîne Entrées → … →
          Capitalisation, ses ruptures mises en évidence, chacune cliquable. */}
      <AuditChain stages={chain} />
      <AuditStageSources stages={AUDIT_COMPUTED_BLOCK_STAGES.chain} />
      {/* #2065.1-.18 — les 12 axes de maturité commerciale, TOUJOURS nommés :
          `computeCommercialMaturity` était déjà posé sur `auditContext.maturity`
          (`build-audit.ts`), sans écran pour le rendre. */}
      <AuditMaturityAxes maturity={auditContext.maturity} />
      <AuditStageSources stages={AUDIT_COMPUTED_BLOCK_STAGES.maturity} />
      {/* Épopée #2880 (#2039.9/.12/.13/.14) — l'audit à 3 états PAR EXPERTISE
          (savoir-faire, preuve, vendable maintenant) et le croisement
          expertise ↔ fondement/preuve qui le nourrit. Voir son docblock. */}
      <AuditExpertiseCredibility />
      {/* #2061.7 / #2061.8 — ATOUTS ET CONTRAINTES, avant les trois décisions :
          voir le docblock d'`AuditPositioning.tsx` pour ce que ce bloc refuse
          de dupliquer (#2072.1-.3). Réouverture du 24/09/2026. */}
      <AuditPositioning assets={auditContext.assets} constraints={auditContext.constraints} />
      <AuditDecisionColumns
        columns={audit.columns}
        version={audit.version}
        updatedAt={audit.updatedAt}
        pendingReview={isPendingReview}
      />
      {/* #2073 — les voies d'entrée possibles, à côté des trois décisions :
          même donnée de profil (`idealAccountProfile`), lecture différente. */}
      <AuditStrategyOptions
        target={audit.headlines.find(h => h.key === 'target')}
        chosenEntryStrategy={chosenEntryStrategy}
      />
      {/* #2066.19 / #2066.27 — DÉCISION Louis 17/09 : la combinaison de voies
          GÉNÉRÉE, à côté de la stratégie validée ci-dessus ; lecture seule. */}
      <AuditStrategicCombination strategicOptions={auditContext.strategicOptions} />
      {/* #2090.36 — un bloc fort Mémoire marché après les options, pas
          seulement à l'onboarding : un audit relu plus tard le reste. */}
      <AuditMarketMemory />
      {/* #2090.31 — une seule carte, une seule action pour la semaine. */}
      <AuditWeeklyPriority priority={weeklyPriority} />
      {/* #2061.15 / #2061.18 / #2061.20 — LA DIRECTION RECOMMANDÉE, LA
          ROADMAP CONDITIONNELLE ET LES QUESTIONS À REVISITER, juste après la
          priorité de la semaine : même matériau (les tensions détectées),
          une lecture au-delà de l'unique priorité. Réouverture du
          24/09/2026 — voir le docblock d'`AuditDirectionAndRoadmap.tsx`. */}
      <AuditDirectionAndRoadmap
        recommendedDirection={auditContext.recommendedDirection}
        conditionalRoadmap={auditContext.conditionalRoadmap}
        questionsToRevisit={auditContext.questionsToRevisit}
      />
      {/* #2042.15 / #2043.10 / #2049.15 / #2050.14 / #2051.16 — CE QUE TES
          RÉPONSES DISENT. Les réponses du questionnaire étaient collectées,
          stockées et envoyées au modèle ; l'audit ne lisait que la SORTIE du
          Profileur, jamais les réponses. Elles arrivent ici, dérivées par
          `buildAuditDeclaredSignals` sur le même `auditContext`, sans aucune
          requête supplémentaire. */}
      <AuditDeclaredSignals declaredSignals={auditContext.declaredSignals} funnel={auditContext.funnel} />
      <AuditConsequences consequences={audit.consequences} />
      {/* #2067.2 / #2067.4 / #2067.5 / #2067.6 — L'ARBITRAGE DE LA CHARGE
          ACTIVE, juste après ses deux frères (#2067.1 comptes actifs, #2067.3
          volume de suivi, rendus ci-dessus) : partenaires, créneaux, réserve,
          éléments à reporter, dérivés des réponses déclarées et du budget de
          fronts — chacun avec sa règle, ou « non établi » avec la réponse qui
          manque. Même objet que `auditContext.activeLoad`, aucune requête de plus. */}
      <AuditActiveLoad activeLoad={audit.activeLoad} />
      {/* #2068 — le chaînon manquant : le plan à 4 semaines, les paliers et
          la configuration produit ARRIVENT désormais à l'écran, câblés sur
          le même contexte versionné (`auditContext`, #2061.1/.23/.24). */}
      <AuditPlanAndMilestones
        thirtyDayPlan={auditContext.thirtyDayPlan}
        milestones={auditContext.milestones}
        productConfiguration={auditContext.productConfiguration}
      />
      <AuditStageSources stages={AUDIT_COMPUTED_BLOCK_STAGES.plan} />
      {/* #2074.10-.15 / #2090.7 — LES PREMIERS MOUVEMENTS, le sixième et dernier
          temps du récit (situation → ce qui marche → ce qui bloque → les choix →
          la recommandation → les premiers mouvements). Trois au plus, un par
          genre, dérivés des MÊMES ruptures que le verdict et la priorité —
          aucune requête, aucune source de plus. Placés AVANT « ce qui n'a pas pu
          être établi », qui est le pied de page d'honnêteté de l'écran et non un
          temps du récit. */}
      <AuditFirstMoves moves={firstMoves} decisions={auditMoveDecisions} />
      {/* #2010.10 — RELIRE LES HYPOTHÈSES : même source que `AuditFirstMoves`
          juste au-dessus (`auditContext.contradictions`), un lecteur de plus
          sur `possibleExplanation`, aucune requête de plus. */}
      <AuditHypotheses hypotheses={auditHypothesesFrom(auditContext.contradictions)} />
      {/* Défaut du 16/09/2026 — la liste est dérivée de TOUS les blocs de cet écran, les
          trois ci-dessus compris : elle ne peut plus conclure « tout a pu être
          établi » pendant qu'un bloc voisin dit « non mesuré ». */}
      <AuditUnestablished entries={audit.unestablished} />
      {/* #2081.1/.2/.3/.7/.11/.12 — la collaboration se propose APRÈS que
          l'audit a montré ce qu'il sait, jamais avant (lot FD, ARRÊT levé par
          Louis le 18/09/2026). Se tait d'elle-même si l'espace collabore déjà. */}
      <AuditCollaborationCard />
    </motion.div>
  )
}
