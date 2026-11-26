import type {
  CompanySuggestion,
  FramingDecision,
  FramingOrientationId,
  FramingStateResponse,
  EsnPrefillRequest,
  EsnPrefillResponse,
  OnboardingActivation,
  OnboardingReformulateRequest,
  OnboardingReformulateResponse,
  OnboardingStateResponse,
  ProfileComplementState,
  SaveAnswers,
  WelcomeRedesignBannerState,
} from '@bellum/contracts'
import {
  framingStateResponseSchema,
  profileComplementStateSchema,
  welcomeRedesignBannerStateSchema,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/** Nom court de l'état d'onboarding renvoyé par `getState()`. Le garde de route
 *  (`guard-state.ts`, #771) et le contrat (`OnboardingStateResponse`, #735) ont
 *  divergé sur le nom ; cet alias les réconcilie sans renommer l'un ou l'autre. */
export type OnboardingState = OnboardingStateResponse

/** Parses a complement payload. A response this build cannot read (deploy skew)
 *  throws → the query errors → the card simply does not render. A non-essential
 *  reminder must never render half-understood. */
function parseComplement(payload: unknown): ProfileComplementState {
  return profileComplementStateSchema.parse(payload)
}

/** HTTP client for the `/onboarding/*` endpoints (Temps 1 questionnaire). */
export const onboardingApi = {
  getState(): Promise<OnboardingStateResponse> {
    return apiFetch<OnboardingStateResponse>({ path: '/onboarding/state' })
  },

  advanceStage(stageCode: string): Promise<OnboardingStateResponse> {
    const body = { stage_code: stageCode }
    return apiFetch<OnboardingStateResponse, typeof body>({ path: '/onboarding/state', method: 'PUT', body })
  },

  saveAnswers(answers: SaveAnswers): Promise<OnboardingStateResponse> {
    return apiFetch<OnboardingStateResponse, SaveAnswers>({ path: '/onboarding/answers', method: 'PUT', body: answers })
  },

  complete(): Promise<OnboardingStateResponse> {
    return apiFetch<OnboardingStateResponse>({ path: '/onboarding/complete', method: 'POST' })
  },

  /**
   * #2013.7 / #2022.6 — « je le ferai plus tard », posé noir sur blanc.
   *
   * `POST /onboarding/skip` existe côté API depuis la recette finale §13 et
   * **aucun écran ne l'appelait** : le produit promettait une sortie que le
   * front ne savait pas prendre, si bien que « revenir plus tard » voulait dire
   * « être renvoyé ici à la navigation suivante ». C'est la page 0 qui l'appelle
   * désormais, là où l'issue demande que le report soit annoncé.
   *
   * Le report est une DÉCISION, pas une complétion : les analyses lancées
   * ensuite restent marquées génériques, et reprendre le questionnaire l'efface.
   */
  skip(): Promise<OnboardingStateResponse> {
    return apiFetch<OnboardingStateResponse>({ path: '/onboarding/skip', method: 'POST' })
  },

  /**
   * #2022 — la reconfiguration guidée, DEMANDÉE par l'utilisateur.
   *
   * `POST /onboarding/refresh` est la seule arête qui pose `refresh_required`,
   * l'état que lit `resolveOnboardingEntry` pour montrer la page 0 version
   * « on a repensé la personnalisation ». Il existait côté API sans aucun
   * appelant web : la reconfiguration était donc INATTEIGNABLE depuis le
   * produit — du code juste, testé, que personne n'appelait.
   *
   * ⚠️ Rien ne l'appelle automatiquement, et c'est la doctrine du endpoint :
   * le déclencheur (une durée écoulée ? un changement d'offre détecté ?) n'est
   * PAS tranché. Un seul appelant, un clic dans Réglages › Profil.
   */
  requestRefresh(): Promise<OnboardingStateResponse> {
    return apiFetch<OnboardingStateResponse>({ path: '/onboarding/refresh', method: 'POST' })
  },

  /**
   * Best-effort ESN prefill from the company name (first onboarding screen).
   * Persists NOTHING server-side — the answers are seeded into the store and
   * saved by the wizard like any manual answer. A failed resolution comes back
   * as `{ matched: false, company: null, fields: {} }`, never an error.
   */
  prefill(body: EsnPrefillRequest): Promise<EsnPrefillResponse> {
    return apiFetch<EsnPrefillResponse, EsnPrefillRequest>({ path: '/esn-profile/prefill', method: 'POST', body })
  },

  /**
   * #2626.2 — une première sélection de comptes RÉELS, à la fin du Temps 1
   * (écran de relecture), avant la génération longue. Dérivée du secteur
   * ciblé déjà répondu, côté serveur — jamais un second questionnaire.
   */
  getFirstSelection(): Promise<{ suggestions: CompanySuggestion[] }> {
    return apiFetch<{ suggestions: CompanySuggestion[] }>({ path: '/esn-profile/first-selection' })
  },

  /** The 5-milestone activation checklist, derived server-side from real data. */
  getActivation(): Promise<OnboardingActivation> {
    return apiFetch<OnboardingActivation>({ path: '/onboarding/activation' })
  },

  /**
   * #2060.9 — « Laura reformule, l'utilisateur valide avant enregistrement ».
   *
   * Écrit RIEN server-side : `saveAnswers` reste le seul chemin d'écriture,
   * appelé avec ce que l'utilisateur a CHOISI (sa version ou celle de Laura).
   * Un échec (503 sans clé de modèle / timeout, 502 sinon) part comme une
   * erreur — jamais une reformulation devinée côté client.
   */
  reformulateAnswer(body: OnboardingReformulateRequest): Promise<OnboardingReformulateResponse> {
    return apiFetch<OnboardingReformulateResponse, OnboardingReformulateRequest>({
      path: '/onboarding/reformulate-answer',
      method: 'POST',
      body,
    })
  },

  /* ---------------------------------------------------------------------- */
  /*  Temps 2 — le complément de profil (proposé après la 1re analyse)       */
  /*                                                                        */
  /*  Les RÉPONSES passent par `saveAnswers` comme celles du Temps 1 (mêmes  */
  /*  colonnes `esn_profiles`, même route) — seul le cycle de vie « proposé  */
  /*  / plus tard / terminé / refusé » a ses propres endpoints.             */
  /* ---------------------------------------------------------------------- */

  async getComplement(): Promise<ProfileComplementState> {
    return parseComplement(await apiFetch({ path: '/onboarding/complement' }))
  },

  async snoozeComplement(): Promise<ProfileComplementState> {
    return parseComplement(await apiFetch({ path: '/onboarding/complement/snooze', method: 'POST' }))
  },

  async dismissComplement(): Promise<ProfileComplementState> {
    return parseComplement(await apiFetch({ path: '/onboarding/complement/dismiss', method: 'POST' }))
  },

  async completeComplement(): Promise<ProfileComplementState> {
    return parseComplement(await apiFetch({ path: '/onboarding/complement/complete', method: 'POST' }))
  },

  /* ---------------------------------------------------------------------- */
  /*  Théo O onboarding-relecture.N1/N2 — décisions et validation du cadrage  */
  /* ---------------------------------------------------------------------- */

  async getFraming(): Promise<FramingStateResponse> {
    return framingStateResponseSchema.parse(await apiFetch({ path: '/onboarding/framing' }))
  },

  async saveFramingDecision(
    orientation: FramingOrientationId,
    decision: FramingDecision,
  ): Promise<FramingStateResponse> {
    const body = { decision }
    return framingStateResponseSchema.parse(
      await apiFetch({ path: `/onboarding/framing/decisions/${orientation}`, method: 'PUT', body }),
    )
  },

  async validateFraming(digest: string): Promise<FramingStateResponse> {
    const body = { digest }
    return framingStateResponseSchema.parse(
      await apiFetch({ path: '/onboarding/framing/validate', method: 'POST', body }),
    )
  },

  /* ---------------------------------------------------------------------- */
  /*  #2897 (#2091.36) — bannière « BellumAI a été repensé »                 */
  /* ---------------------------------------------------------------------- */

  async getRedesignBanner(): Promise<WelcomeRedesignBannerState> {
    return welcomeRedesignBannerStateSchema.parse(await apiFetch({ path: '/onboarding/redesign-banner' }))
  },

  async dismissRedesignBanner(): Promise<WelcomeRedesignBannerState> {
    return welcomeRedesignBannerStateSchema.parse(
      await apiFetch({ path: '/onboarding/redesign-banner/dismiss', method: 'POST' }),
    )
  },
}

export const onboardingKeys = {
  state: ['onboarding', 'state'] as const,
  activation: ['onboarding', 'activation'] as const,
  complement: ['onboarding', 'complement'] as const,
  firstSelection: ['onboarding', 'firstSelection'] as const,
  framing: ['onboarding', 'framing'] as const,
}
