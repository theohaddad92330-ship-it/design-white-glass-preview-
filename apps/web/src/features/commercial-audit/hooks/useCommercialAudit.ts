import { useMemo } from 'react'
import type {
  AuditMoveDecisions,
  CommercialAuditContext,
  EntryStrategy,
  FirstAnalysisSuggestion,
} from '@bellum/contracts'
import { useMyActions } from '@/features/actions/hooks/useMyActions'
import { useTalentStats } from '@/features/consultants/hooks'
import { useContactFollowUpStats } from '@/features/contacts/hooks/useContactFollowUpStats'
import { useRenewals } from '@/features/missions/api'
import { useOnboardingState } from '@/features/onboarding/hooks/useOnboarding'
import { useProfileContext } from '@/features/profile-context/hooks/useProfileContext'
import { useProfileContextRevisions } from '@/features/profile-context/hooks/useProfileContextRevisions'
import { useOpenNeedsCommercialAuditSignals } from '@/features/projects/open-needs/hooks/useOpenNeeds'
import { useSubmissions } from '@/features/submissions/api'
import { buildAuditChain, type AuditChainStage } from '../lib/audit-chain'
import { buildCommercialAudit, buildCommercialAuditContext, type CommercialAudit } from '../lib/build-audit'
import { isProfileContextToReview } from '../lib/revision-review-state'
import {
  commercialTensionSignalsFromContactFollowUps,
  commercialTensionSignalsFromNeeds,
  commercialTensionSignalsFromRenewals,
  commercialTensionSignalsFromSubmissions,
  commercialTensionSignalsFromTalentStats,
} from '../lib/tension-detectors'

/**
 * L'audit lit le MÊME contexte de profil que les huit autres écrans qui le
 * consomment (`useProfileContext`) — il ne se re-sert pas à côté, et il
 * n'ajoute aucune clé de cache : deux lectures d'un même objet finissent
 * toujours par diverger.
 *
 * #2061.1 / #2061.23 / #2061.24 — `auditContext` (le contrat VERSIONNÉ,
 * `CommercialAuditContext`) est calculé ICI, dans le SEUL hook réel de cet
 * écran. Avant ce lot, `buildCommercialAuditContext()` n'avait aucun
 * appelant en dehors de son fichier de test : le schéma et son constructeur
 * existaient, codés et testés, sans jamais tourner en production. Il
 * COMPOSE `buildCommercialAudit` (voir le docblock de `build-audit.ts`)
 * plutôt que de redériver `ProfileContext` une seconde fois — GA-26, une
 * dérivation vit à un seul endroit. `audit` (forme historique, consommée par
 * `AuditHero`/`AuditDecisionColumns`/`AuditStrategyOptions`/
 * `AuditConsequences`/`AuditUnestablished`) reste calculé séparément pour ne
 * pas casser ces cinq composants dans ce lot : c'est la même fonction pure,
 * appelée deux fois sur les mêmes entrées, jamais deux dérivations qui
 * divergent.
 */
export function useCommercialAudit(): {
  audit: CommercialAudit
  auditContext: CommercialAuditContext
  /** #2090.15/.16/.17 — la chaîne Entrées → … → Capitalisation, calculée sur
   *  le MÊME `ProfileContext`, jamais une deuxième lecture (voir
   *  `lib/audit-chain.ts`). */
  chain: AuditChainStage[]
  isLoading: boolean
  /** #4969 — la lecture du profil a ÉCHOUÉ : l'écran le dit, il ne reste pas sur « Lecture… ». */
  loadError: boolean
  hasProfileContext: boolean
  isGenerating: boolean
  /** D9 — décision Louis 14/09/2026 : valider le contexte commercial. */
  validatedAt: string | null
  /** #2073.8 — la stratégie d'entrée CHOISIE, distincte du champ CALCULÉ par
   *  le profileur. `null` = aucun choix explicite. */
  chosenEntryStrategy: EntryStrategy | null
  /** #2010.1/.3/.17/#2011.9 — état DÉRIVÉ, scopé au SEUL audit (voir
   *  `lib/revision-review-state.ts`) : un résultat IA qui remplace une
   *  version antérieure n'est pas encore la vérité tant qu'il n'a pas été
   *  validé. */
  isPendingReview: boolean
  /** #2074.16 — les décisions humaines (valider/modifier/écarter) sur les
   *  mouvements d'audit proposés, clé sur `AuditMove.ruleId`. `{}` = aucune
   *  décision. */
  auditMoveDecisions: AuditMoveDecisions
  /** #2075.27/.28 — LA MÊME lecture que `WelcomeScreen`
   *  (`profile_context.welcomeSummary.firstAnalysisSuggestions`, GA-26) —
   *  jamais une seconde dérivation à côté. `[]` = rien à proposer. */
  firstAnalysisSuggestions: readonly FirstAnalysisSuggestion[]
} {
  const { data: response, isLoading: contextLoading, isError: contextError } = useProfileContext()
  const { data: revisions, isLoading: revisionsLoading } = useProfileContextRevisions()
  // #2042.15 / #2043.10 / #2049.15 / #2050.14 / #2051.16 — LES RÉPONSES DU
  // QUESTIONNAIRE ENTRENT DANS L'AUDIT.
  //
  // `useOnboardingState()` est le hook que le questionnaire lui-même utilise
  // (`ProfileQuestionnaireDialog`, `useOnboardingNavigation`) : aucune requête
  // neuve, aucune clé de cache ajoutée — la réponse est déjà en cache la
  // plupart du temps, et deux lectures d'un même objet finissent toujours par
  // diverger.
  //
  // ⚠️ `undefined` tant que la requête n'a pas répondu, et c'est VOULU : tant
  // qu'on n'a rien lu, le bloc est ABSENT (« non mesuré »), jamais « vide ».
  // C'est la même distinction que `answers` ?? {} aurait effacée.
  const { data: onboarding, isLoading: answersLoading } = useOnboardingState()
  // #2068.1 — décision Louis 19/09/2026 (2068.11) : le plan à 4 semaines de
  // l'audit se LIT depuis Actions, il ne s'en resert pas à côté (GA-26, même
  // clé `myPlanActionsKey` que l'onglet « Mes relances » du Centre
  // d'actions) — voir le docblock de `useMyActions`.
  const { data: myActions, isLoading: myActionsLoading } = useMyActions()
  // #2074.12 — le bandeau du vivier, MÊME requête et même clé de cache que
  // l'écran Vivier (`useTalentStats`) : le premier (et pour l'instant SEUL)
  // des sept signaux externes de `CommercialTensionExternalSignals`
  // (`tension-detectors.ts`) qu'un module existant exposait déjà — aucune
  // deuxième requête, aucun recalcul (GA-26). Non lu (chargement, erreur) ⇒
  // aucun signal, jamais un zéro.
  const { data: talentStats, isLoading: talentStatsLoading } = useTalentStats()
  // #2842.1 (épopée #2074.13-.19) — les positionnements, MÊME câblage :
  // `useSubmissions()` sert déjà l'écran Positionnements, aucune deuxième
  // requête dédiée à l'audit (GA-26). Non lu (chargement, erreur — par
  // exemple sans le plan qui ouvre les positionnements) ⇒ aucun signal.
  const { data: submissionsResponse, isLoading: submissionsLoading } = useSubmissions()
  // #2842.2 — les renouvellements, MÊME câblage : `useRenewals()` sert déjà
  // l'écran de décision `/missions/renouvellements`.
  const { data: renewalsResponse, isLoading: renewalsLoading } = useRenewals()
  // #2842 (reste, 26/09) — les deux compteurs de besoins (clientNeeds/
  // needDetailing), PREMIER comptage backend neuf du lot (voir le docblock de
  // `commercialTensionSignalsFromNeeds`).
  const { data: needsSignals, isLoading: needsSignalsLoading } = useOpenNeedsCommercialAuditSignals()
  // #2842 (reste, 26/09) — le compteur de contacts avec date de reprise
  // (contactFollowUps), même discipline : non lu ⇒ aucun signal.
  const { data: contactFollowUpStats, isLoading: contactFollowUpStatsLoading } = useContactFollowUpStats()
  const signals = useMemo(
    () => ({
      ...commercialTensionSignalsFromTalentStats(talentStats),
      ...commercialTensionSignalsFromSubmissions(submissionsResponse?.items),
      ...commercialTensionSignalsFromRenewals(renewalsResponse?.missions),
      ...commercialTensionSignalsFromNeeds(needsSignals),
      ...commercialTensionSignalsFromContactFollowUps(contactFollowUpStats),
    }),
    [talentStats, submissionsResponse, renewalsResponse, needsSignals, contactFollowUpStats],
  )

  const context = response?.profile_context ?? null
  const answers = onboarding?.answers ?? null
  // #2073.8 / #2073.11 — la stratégie CHOISIE, distincte du champ CALCULÉ que
  // `context` porte : c'est le seul lecteur (`buildCommercialAudit`) qui
  // arbitre entre les deux (GA-26).
  const chosenEntryStrategy = response?.chosenEntryStrategy ?? null
  const audit = useMemo(
    () => buildCommercialAudit(context, revisions, answers, chosenEntryStrategy, myActions, signals),
    [context, revisions, answers, chosenEntryStrategy, myActions, signals],
  )
  const auditContext = useMemo(
    () => buildCommercialAuditContext(context, revisions, answers, myActions, signals),
    [context, revisions, answers, myActions, signals],
  )
  const chain = useMemo(() => buildAuditChain(context), [context])

  return {
    audit,
    auditContext,
    chain,
    loadError: contextError && response === undefined,
    isLoading:
      contextLoading ||
      revisionsLoading ||
      answersLoading ||
      myActionsLoading ||
      talentStatsLoading ||
      submissionsLoading ||
      renewalsLoading ||
      needsSignalsLoading ||
      contactFollowUpStatsLoading,
    hasProfileContext: context !== null,
    isGenerating: response?.status === 'generating',
    validatedAt: response?.validatedAt ?? null,
    chosenEntryStrategy,
    isPendingReview: isProfileContextToReview(response?.status ?? null, revisions?.length ?? 0),
    auditMoveDecisions: response?.auditMoveDecisions ?? {},
    firstAnalysisSuggestions: context?.welcomeSummary?.firstAnalysisSuggestions ?? [],
  }
}
