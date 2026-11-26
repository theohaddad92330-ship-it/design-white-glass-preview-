import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  isAnswerFilled,
  prefillToAnswers,
  toFormAnswerValue,
  type EsnAnswers,
  type PrefillConfidence,
  type PrefillSource,
  type PrefilledField,
  type UnknownAnswerReason,
} from '@bellum/contracts'

export type OnboardingAnswerValue = string | string[]
export type OnboardingAnswers = Record<string, OnboardingAnswerValue>

/**
 * Provenance of a PREFILLED answer, kept ALONGSIDE the value (never inside
 * `answers`, which stays the plain payload the wizard saves). Drives the
 * "Prérempli · <source>" badge and its rationale tooltip.
 */
export type PrefillFieldMeta = {
  confidence: PrefillConfidence
  source: PrefillSource
  rationale?: string
  /**
   * #2028.2 — quand la donnée préremplie a été observée, ISO ou `null` quand
   * la source ne la fournit pas encore (#2028.8, `à trancher`). Optionnel
   * pour les métadonnées construites avant ce champ (tests, fixtures) ; une
   * fois posée par `applyPrefill` elle vaut toujours `string | null`, jamais
   * omise — un badge qui l'omettrait laisserait deviner « aujourd'hui ».
   */
  asOf?: string | null
}

export type OnboardingPrefillMeta = Record<string, PrefillFieldMeta>

type OnboardingStore = {
  /** Working copy of every stage's answers, keyed by question key. */
  answers: OnboardingAnswers
  /** Provenance for the keys still holding their prefilled (suggested) value. */
  prefillMeta: OnboardingPrefillMeta
  /**
   * #2026.2 — ISO de la dernière réponse écrite dans le brouillon LOCAL.
   * `null` tant qu'aucune réponse n'a été saisie dans cette session : pas
   * d'heure inventée. Rendu à l'écran par `formatSavedAt` (`lib/saved-at.ts`).
   */
  lastSavedAt: string | null
  /**
   * Théo O onboarding-theme.N1 — le statut d'une réponse qui ne peut pas le
   * porter dans sa valeur (nombre, liste) : `text`/`single` le portent déjà
   * verbatim (#2027). Une clé absente = aucun statut déclaré.
   */
  statuses: Record<string, UnknownAnswerReason>
  setStatus: (key: string, status: UnknownAnswerReason | null) => void
  setAnswer: (key: string, value: OnboardingAnswerValue) => void
  /** Seed answers + provenance from a `POST /esn-profile/prefill` response. */
  applyPrefill: (fields: Record<string, PrefilledField>) => void
  /** Seed from the server without clobbering values already edited locally. */
  hydrate: (answers: EsnAnswers) => void
  reset: () => void
}

function toAnswers(esn: EsnAnswers): OnboardingAnswers {
  const out: OnboardingAnswers = {}
  for (const [key, value] of Object.entries(esn)) {
    // `null` = pas une valeur de formulaire (`esn_objectives` est structuré).
    // On SAUTE la clé : la déformer en chaîne l'afficherait « [object Object] ».
    const forForm = toFormAnswerValue(value)
    if (forForm !== null) out[key] = forForm
  }
  return out
}

/**
 * Holds the onboarding selections so they survive moving between stages (the
 * "Retour" button) without a server round-trip. Hydrated from the persisted
 * `esn_profiles` answers on load; local edits win over the server base.
 *
 * Prefill contract:
 * - `applyPrefill` seeds a value AND its provenance, but only for questions the
 *   user has not answered yet — a real answer is never overwritten by a guess.
 * - `setAnswer` DROPS the provenance of the edited key: once the user touches a
 *   field it is their answer, not a suggestion, so no badge may survive.
 *
 * #2026.1 — LE BROUILLON SURVIT À LA FERMETURE DE L'ONGLET.
 *
 * « Ne jamais perdre une réponse ». Jusqu'ici la sauvegarde était SERVEUR et au
 * clic sur « Continuer » (`useOnboardingNavigation`) : tout ce qui était saisi
 * dans la sous-étape courante disparaissait avec l'onglet, et une perte de
 * réseau sur « Continuer » affichait une erreur puis perdait la réponse quand
 * même. Le brouillon local ne REMPLACE pas l'enregistrement serveur — il le
 * précède, exactement comme le demande l'issue (« localement PUIS côté
 * serveur »), et `hydrate` continue de faire gagner l'édition locale sur la
 * base persistée.
 *
 * ⚠️ Le brouillon est une donnée de COMPTE, pas une préférence de poste : il
 * part à la déconnexion. C'est `reset()`, déjà appelé par
 * `clearVolatileUserState`, qui l'écrase — sans quoi les réponses d'un
 * utilisateur seraient rejouées dans le questionnaire du suivant sur le même
 * navigateur.
 */
export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    set => ({
      answers: {},
      prefillMeta: {},
      lastSavedAt: null,
      statuses: {},

      setStatus: (key, status) =>
        set(s => {
          const statuses = { ...s.statuses }
          if (status === null) delete statuses[key]
          else statuses[key] = status
          return { statuses, lastSavedAt: new Date().toISOString() }
        }),

      setAnswer: (key, value) =>
        set(s => {
          const answers = { ...s.answers, [key]: value }
          const lastSavedAt = new Date().toISOString()
          if (!(key in s.prefillMeta)) return { answers, lastSavedAt }
          const prefillMeta = { ...s.prefillMeta }
          delete prefillMeta[key]
          return { answers, prefillMeta, lastSavedAt }
        }),

      applyPrefill: fields =>
        set(s => {
          const seeded = prefillToAnswers(fields ?? {})
          const answers = { ...s.answers }
          const prefillMeta = { ...s.prefillMeta }

          for (const [key, value] of Object.entries(seeded)) {
            if (value == null || isAnswerFilled(s.answers[key])) continue
            const forForm = toFormAnswerValue(value)
            if (forForm === null) continue
            answers[key] = forForm
            const field = fields?.[key]
            if (!field) continue
            prefillMeta[key] = {
              confidence: field.confidence,
              source: field.source,
              ...(field.rationale ? { rationale: field.rationale } : {}),
              // #2028.2 — toujours posé, même `null` : un badge qui l'omettrait
              // laisserait le composant deviner « aujourd'hui ».
              asOf: field.as_of ?? null,
            }
          }

          return { answers, prefillMeta }
        }),

      hydrate: esn => set(s => ({ answers: { ...toAnswers(esn), ...s.answers } })),
      reset: () => set({ answers: {}, prefillMeta: {}, lastSavedAt: null, statuses: {} }),
    }),
    {
      name: 'bellum:onboarding-draft',
      storage: createJSONStorage(() => localStorage),
      // Les réponses ET leur provenance : un badge « Prérempli » qui survivrait
      // sans sa valeur, ou l'inverse, mentirait sur l'origine de la réponse.
      // `lastSavedAt` (#2026.2) voyage aussi : une heure RÉELLEMENT écrite, pas
      // une heure rejouée depuis le rechargement de l'onglet.
      partialize: state => ({
        answers: state.answers,
        prefillMeta: state.prefillMeta,
        lastSavedAt: state.lastSavedAt,
        statuses: state.statuses,
      }),
      version: 1,
    },
  ),
)
