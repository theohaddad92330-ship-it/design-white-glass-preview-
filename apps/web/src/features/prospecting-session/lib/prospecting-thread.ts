import type { ProspectingSessionMode } from './prospecting-session'

/**
 * #2386.1 — LE FIL, PAS UN NOUVEAU MOTEUR.
 *
 * L'audit du 23/09 (registre `chat-lot7.md`) le dit en une phrase : chaque
 * maillon existe déjà SÉPARÉMENT — Découvrir (compte, contact), la session de
 * prospection (`buildProspectingSession`, le pitch), Séquences (l'envoi PAR LE
 * COMMERCIAL, `/actions/sequences`), la messagerie (la trace CRM, `/mailbox`)
 * — mais rien ne les CHAÎNE : on quitte un écran, on revient sur l'autre à la
 * main. Ce fichier ne réimplémente RIEN de ces trois écrans ; il ne fait que
 * nommer l'ORDRE et calculer le LIEN vers l'étape suivante, avec son contexte
 * en paramètres d'URL — même patron que `campaign-prefill.ts` (#1935.25) : un
 * écran qui sait déjà lire `location.search` sans `validateSearch` imposé.
 *
 * Trois étapes, pas cinq : « compte », « contact » et « message préparé » se
 * jouent au MÊME endroit dans ce dépôt (Découvrir → `ProspectingSessionDialog`,
 * #2375) — leur donner trois écrans distincts inventerait une navigation qui
 * n'existe pas. `prepare` porte les trois.
 */
export const PROSPECTING_THREAD_STEPS = ['prepare', 'send', 'issue'] as const
type ProspectingThreadStep = (typeof PROSPECTING_THREAD_STEPS)[number]

interface ProspectingThreadContext {
  /**
   * Le compte visé — REPRIS, jamais recalculé. `undefined` quand la session
   * couvre plusieurs comptes à la fois (liste d'appels multi-comptes) : le
   * lien ne porte alors aucun `account_id`, jamais un compte deviné (GA-18/19).
   */
  accountId?: string
  mode?: ProspectingSessionMode
}

/** Le nom d'écran littéral par étape — jamais dérivé (même garde que
 *  `ACCOUNT_DETAIL_SCREEN`, `AccountDetailHeroPrimaryAction.tsx:16`). */
const PROSPECTING_THREAD_ROUTE: Record<ProspectingThreadStep, string> = {
  prepare: '/discover',
  send: '/actions/sequences',
  issue: '/mailbox',
}

/** `null` sur la dernière étape — jamais une boucle, jamais une étape inventée. */
export function nextProspectingThreadStep(step: ProspectingThreadStep): ProspectingThreadStep | null {
  const index = PROSPECTING_THREAD_STEPS.indexOf(step)
  return PROSPECTING_THREAD_STEPS[index + 1] ?? null
}

interface ProspectingThreadLink {
  to: string
  search: Record<string, string>
}

/**
 * Le lien « étape suivante » depuis `step`, avec son contexte en paramètres.
 * `null` depuis la dernière étape (`issue`) : il n'y a rien après la trace CRM
 * — pas de lien qui boucle sur lui-même.
 */
export function prospectingThreadNextLink(
  step: ProspectingThreadStep,
  context: ProspectingThreadContext,
): ProspectingThreadLink | null {
  const next = nextProspectingThreadStep(step)
  if (!next) return null

  const search: Record<string, string> = { prospecting_thread_step: next }
  // Jamais une clé posée sur une valeur absente (GA-18/19) : un contexte
  // partiel porte moins de paramètres, jamais une valeur inventée.
  if (context.accountId) search.prospecting_account_id = context.accountId
  if (context.mode) search.prospecting_mode = context.mode

  return { to: PROSPECTING_THREAD_ROUTE[next], search }
}

/**
 * Le lecteur, côté écran d'arrivée — même patron que `campaignFromSearch`
 * (`campaign-prefill.ts`) : tolérant, une valeur hors vocabulaire est IGNORÉE.
 * `null` si l'écran n'a pas été ouvert PAR le fil (aucune navigation propre à
 * cet écran n'en dépend).
 */
export function prospectingThreadFromSearch(raw: Record<string, unknown>): {
  step: ProspectingThreadStep
  context: ProspectingThreadContext
} | null {
  const step = String(raw.prospecting_thread_step ?? '')
  if (!(PROSPECTING_THREAD_STEPS as readonly string[]).includes(step)) return null

  const accountId =
    typeof raw.prospecting_account_id === 'string' && raw.prospecting_account_id
      ? raw.prospecting_account_id
      : undefined
  const mode = typeof raw.prospecting_mode === 'string' ? raw.prospecting_mode : undefined

  return {
    step: step as ProspectingThreadStep,
    context: {
      ...(accountId ? { accountId } : {}),
      ...(mode ? { mode: mode as ProspectingSessionMode } : {}),
    },
  }
}
