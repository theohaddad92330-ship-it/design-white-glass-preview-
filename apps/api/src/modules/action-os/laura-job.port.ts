import type { ActionDispatchResult, ActionIntent } from '@bellum/contracts'

/**
 * #2276 tranche 2 — ce que l'exécuteur du job composite de Laura emprunte aux
 * autres modules, sous leur forme la plus étroite.
 *
 * Pourquoi des ports plutôt que les services : GA-07 fige le nombre d'imports
 * service → service entre modules. L'exécuteur ne réimplémente AUCUNE capacité —
 * il passe par le routeur d'actions (droits, mandat, idempotence, débit observé),
 * par le message canonique d'Outreach et par le solde de la facturation. Le
 * câblage réel vit dans `action-os.module.ts` (un module n'est pas compté).
 *
 * Ce fichier n'importe que des TYPES du contrat et son nom ne contient pas
 * « service » (même règle que `credit-reservation.port.ts`).
 */

/** La file BullMQ des jobs de Laura — un job = une exécution par étapes. */
export const LAURA_JOB_QUEUE = 'laura-job'

/**
 * Ce que la file transporte : l'identité, jamais la fiche (relue en base à
 * chaque étape, pour voir une annulation). L'e-mail est celui de la personne
 * elle-même — le routeur en a besoin pour signer ce qu'il prépare.
 */
export type LauraJobQueueData = { jobId: string; workspaceId: string; userId: string; email: string }

/** Le routeur d'actions — la SEULE porte d'exécution (droits, mandat, débit). */
export const LAURA_JOB_DISPATCHER = Symbol('LAURA_JOB_DISPATCHER')
export type LauraJobDispatcher = {
  dispatch(
    intent: ActionIntent,
    principal: { userId: string; email: string; origin?: 'user' | 'system' },
  ): Promise<ActionDispatchResult>
}

/**
 * #2366.2 — un brouillon généré devient le message canonique d'Outreach (né
 * `needs_review` : préparé n'est jamais envoyé). Rend son identifiant.
 */
export const LAURA_JOB_DRAFTS = Symbol('LAURA_JOB_DRAFTS')
export type LauraJobDrafts = {
  keep(input: {
    userId: string
    workspaceId: string
    contactId: string
    channel: 'email' | 'linkedin' | 'phone'
    subject: string | null
    body: string
  }): Promise<string>
}

/**
 * Le solde DISPONIBLE (pool moins ce qui est déjà réservé), lu chez la
 * facturation — jamais un second compteur. `null` = pas de plafond connu.
 */
export const LAURA_JOB_BALANCE = Symbol('LAURA_JOB_BALANCE')
export type LauraJobBalance = { remainingOf(userId: string): Promise<number | null> }

/** Mettre un job en file — lié à la file BullMQ par le module. */
export const LAURA_JOB_ENQUEUER = Symbol('LAURA_JOB_ENQUEUER')
/** #3860.1 — `delayMs` : le passage suivant d'un job qui ATTEND une analyse asynchrone. */
export type LauraJobEnqueuer = { enqueue(data: LauraJobQueueData, options?: { delayMs?: number }): Promise<void> }

/**
 * #3860.1 (lot M06) — les capacités d'un job qui ne passent PAS par le routeur
 * d'actions (elles ne visent pas un contact) : chacune est le service qui la
 * possède déjà, câblé dans `action-os.module.ts` (composition, GA-07) — jamais
 * une seconde implémentation. Une réponse `null` = la source n'a pas répondu
 * ou l'objet est introuvable : l'étape le DIT, rien n'est deviné.
 */
export const LAURA_JOB_CAPABILITY_PORTS = Symbol('LAURA_JOB_CAPABILITY_PORTS')
export type LauraJobAnalysisState = 'running' | 'done' | 'failed' | 'cancelled' | 'unknown'
export type LauraJobCapabilityPorts = {
  /** Lance l'analyse d'un compte de l'espace (`refresh` : rejouer un dossier déjà analysé). */
  startAnalysis(input: {
    userId: string
    workspaceId: string
    accountId: string
    refresh: boolean
  }): Promise<{ runRef: string } | { refused: string }>
  /** Où en est une analyse lancée par le job (`unknown` = illisible, jamais « terminée »). */
  analysisState(input: {
    userId: string
    accountId: string
    runRef: string
    launchedAt: Date
  }): Promise<LauraJobAnalysisState>
  /** La mémoire marché, filtrée (le filtre est obligatoire côté service) : combien d'entreprises. */
  searchMarketMemory(input: {
    workspaceId: string
    criteria: { technology?: string; location?: string; region?: string; department?: string }
  }): Promise<{ count: number; truncated: boolean } | null>
  /** Le vivier classé contre UN besoin : combien de profils recommandés. `null` = besoin introuvable. */
  matchNeed(input: { workspaceId: string; userId: string; needId: string }): Promise<{ recommended: number } | null>
  /** La DERNIÈRE photo hebdomadaire d'un département (jamais une collecte à la demande). */
  latestTerritorySnapshot(department: string): Promise<{ takenOn: string; offers: number | null } | null>
}
