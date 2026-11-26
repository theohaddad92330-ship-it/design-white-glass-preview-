import type {
  AnswerMetaMap,
  CreateEsnProfileCorrectionRequest,
  EsnAnswers,
  EsnProfileCorrectionRequest,
  EsnProfileWorkspaceMeta,
  EsnTargetPersonasImportReport,
  EsnTargetPersonasResponse,
  ImportEsnTargetPersonasInput,
  MarketEsnViewRead,
  PlacedRolesInferenceResponse,
  OfferPortfolioPatch,
  ProfileContextRegenerableSection,
  ProfileContextResponse,
  ResolvedPortfolio,
  SaveAnswers,
  ConfirmAnswer,
  SkipQuestion,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/** #2306.24 — forme de `GET /accounts/impacted-by-profile-change`
 *  (`AccountsController.listImpactedByProfileChange`). Pas de type partagé
 *  côté `@bellum/contracts` : cette route n'a qu'un seul consommateur. */
type ImpactedAccountsResponse = {
  currentEsnProfileVersion: number | null
  accounts: { accountId: string; companyName: string; esnProfileVersion: number }[]
}

/** HTTP client for the `/esn-profile` endpoints (the "Mon profil" editor). */
export const esnProfileApi = {
  getMine(): Promise<EsnAnswers> {
    return apiFetch<EsnAnswers>({ path: '/esn-profile' })
  },

  /** How the profile is shared in the caller's workspace (canonical company
   *  profile vs personal overlay) — gates the company fields' editability. */
  getWorkspaceMeta(): Promise<EsnProfileWorkspaceMeta> {
    return apiFetch<EsnProfileWorkspaceMeta>({ path: '/esn-profile/workspace' })
  },

  /** #2006.22 — le statut par clé (confirmé / proposé / corrigé / inconnu),
   *  séparé de `getMine` : c'est le seul écran de réponses qui en a besoin. */
  getAnswerStatus(): Promise<AnswerMetaMap> {
    return apiFetch<AnswerMetaMap>({ path: '/esn-profile/answer-status' })
  },

  /**
   * #1636 — ce que la mémoire marché observe de l'entreprise de l'espace.
   *
   * ⚠️ AUCUN paramètre : c'est le serveur qui sait de quelle entreprise il
   * s'agit. Un nom envoyé d'ici serait un second chemin de résolution du profil,
   * et il divergerait du premier au premier profil d'équipe renommé.
   */
  getMarketMemory(): Promise<MarketEsnViewRead> {
    return apiFetch<MarketEsnViewRead>({ path: '/esn-profile/market-memory' })
  },

  updateMine(answers: SaveAnswers): Promise<EsnAnswers> {
    return apiFetch<EsnAnswers, SaveAnswers>({ path: '/esn-profile', method: 'PUT', body: answers })
  },

  /** Le portefeuille d'offre de la société — `source: 'legacy'` quand rien
   *  n'a jamais été enregistré, ce que l'écran DIT au lieu de présenter des
   *  défauts comme une configuration choisie. */
  getOfferPortfolio(): Promise<ResolvedPortfolio> {
    return apiFetch<ResolvedPortfolio>({ path: '/esn-profile/offer-portfolio' })
  },

  /** Écriture PARTIELLE : ce qui n'est pas envoyé n'est pas touché. */
  updateOfferPortfolio(patch: OfferPortfolioPatch): Promise<ResolvedPortfolio> {
    return apiFetch<ResolvedPortfolio, OfferPortfolioPatch>({
      path: '/esn-profile/offer-portfolio',
      method: 'PUT',
      body: patch,
    })
  },

  /** #3754 — les postes cibles de l'ESN (intitulé + niveau décideur). */
  getTargetPersonas(): Promise<EsnTargetPersonasResponse> {
    return apiFetch<EsnTargetPersonasResponse>({ path: '/esn-profile/target-personas' })
  },

  /** #3754.1 — REMPLACE l'ensemble des postes cibles de l'espace (csv en texte, xlsx en base64). */
  importTargetPersonas(input: ImportEsnTargetPersonasInput): Promise<EsnTargetPersonasImportReport> {
    return apiFetch<EsnTargetPersonasImportReport, ImportEsnTargetPersonasInput>({
      path: '/esn-profile/target-personas/import',
      method: 'POST',
      body: input,
    })
  },

  /** Métiers placés DÉDUITS du contexte de l'espace (11/10/2026), avec leurs indices. */
  getPlacedRolesInference(): Promise<PlacedRolesInferenceResponse> {
    return apiFetch<PlacedRolesInferenceResponse>({ path: '/esn-profile/placed-roles-inference' })
  },

  /** « Retirer » un métier déduit — aucun recalcul ne le ramène. */
  dismissInferredPlacedRole(role: string): Promise<PlacedRolesInferenceResponse> {
    return apiFetch<PlacedRolesInferenceResponse, { role: string }>({
      path: '/esn-profile/placed-roles-inference/dismiss',
      method: 'POST',
      body: { role },
    })
  },

  regenerateContext(): Promise<EsnAnswers> {
    return apiFetch<EsnAnswers>({ path: '/esn-profile/regenerate-context', method: 'POST' })
  },

  /** #2908 (#2010.16 / #2011.10) — régénère UNE section du contexte
   *  (`welcomeSummary` ou `coachingInsights`, liste fermée) : les autres
   *  restent celles déjà persistées. Attendu en entier (pas de suivi socket
   *  dédié) : l'appelant porte son propre état de chargement. */
  regenerateContextSection(section: ProfileContextRegenerableSection): Promise<ProfileContextResponse> {
    return apiFetch<ProfileContextResponse, { section: ProfileContextRegenerableSection }>({
      path: '/esn-profile/regenerate-context-section',
      method: 'POST',
      body: { section },
    })
  },

  /**
   * #2306.24 — les comptes du portefeuille analysés avec un profil ESN plus
   * ancien que celui d'aujourd'hui (secteurs/offres modifiés depuis).
   * `GET /accounts/impacted-by-profile-change` (`AccountsController`, même
   * prédicat que `ranWithOlderProfile` côté fiche compte) — vécu ici comme un
   * appel de LECTURE simple, jamais un second calcul.
   */
  getImpactedAccounts(): Promise<ImpactedAccountsResponse> {
    return apiFetch<ImpactedAccountsResponse>({ path: '/accounts/impacted-by-profile-change' })
  },

  /**
   * #2007.11 — noter qu'une question du questionnaire a été PASSÉE
   * (`ProfileQuestionnaireDialog.tsx`, bouton « passer »), nommément : ni une
   * valeur, ni une absence muette.
   */
  /** #4425.4 — confirme une réponse sans la réécrire ; rend la carte de statuts à jour. */
  confirmAnswer(dto: ConfirmAnswer): Promise<AnswerMetaMap> {
    return apiFetch<AnswerMetaMap, ConfirmAnswer>({
      path: '/esn-profile/confirm-answer',
      method: 'POST',
      body: dto,
    })
  },

  skipQuestion(dto: SkipQuestion): Promise<{ skippedQuestionKeys: string[] }> {
    return apiFetch<{ skippedQuestionKeys: string[] }, SkipQuestion>({
      path: '/esn-profile/skip-question',
      method: 'POST',
      body: dto,
    })
  },

  /** #2018.7 — signaler qu'un champ ENTREPRISE est faux, sans l'écraser :
   *  n'écrit jamais `EsnAnswers`, seulement la demande. */
  reportCorrection(dto: CreateEsnProfileCorrectionRequest): Promise<EsnProfileCorrectionRequest> {
    return apiFetch<EsnProfileCorrectionRequest, CreateEsnProfileCorrectionRequest>({
      path: '/esn-profile/correction-requests',
      method: 'POST',
      body: dto,
    })
  },
}

export const esnProfileKeys = {
  mine: ['esn-profile', 'me'] as const,
  workspaceMeta: ['esn-profile', 'workspace-meta'] as const,
  offerPortfolio: ['esn-profile', 'offer-portfolio'] as const,
  targetPersonas: ['esn-profile', 'target-personas'] as const,
  placedRolesInference: ['esn-profile', 'placed-roles-inference'] as const,
  marketMemory: ['esn-profile', 'market-memory'] as const,
  answerStatus: ['esn-profile', 'answer-status'] as const,
  /** #2306.24 — distincte des clés `esn-profile` : la ressource lue est
   *  `accounts`, l'endpoint vit dans `AccountsController`. */
  impactedAccounts: ['accounts', 'impacted-by-profile-change'] as const,
}
