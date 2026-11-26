import type { JobsOptions } from 'bullmq'
import type { StrategyScope } from '@bellum/contracts'
import type { OnDemandFailure } from './analysis-ondemand.service'

/**
 * Contrat BullMQ de la re-planification à la demande (« Changer d'angle »).
 *
 * Pourquoi une file pour un clic (#1092) : le calcul appelle la phase 4 avec un
 * budget de 300 s, alors que la passerelle qui sert l'application coupe à 120 s.
 * Mesuré en production le 26/08 : `502 ROUTER_EXTERNAL_TARGET_ERROR` à
 * 120 176 ms, sur un calcul qui a abouti et enregistré son plan. Un budget
 * intérieur plus large que le budget extérieur ne produit pas une réponse
 * tardive, il produit une erreur — et l'utilisateur relance, donc recalcule ce
 * qui était déjà fait.
 *
 * Même motif que l'enrichissement contact : ce qui se refuse sans calculer reste
 * synchrone, seul le calcul part en file.
 */
export const REPLAN_QUEUE = 'account-replan'

export type ReplanJobData = {
  accountId: string
  userId: string
  strategy?: StrategyScope
}

/** Ce que le worker rend. Un refus MÉTIER est une valeur de retour, jamais une
 *  exception : le job a fait son travail, la réponse est « non ». Le lever
 *  ferait de BullMQ le juge d'un échec métier et perdrait le `code` typé dont le
 *  client a besoin pour dire la vérité. */
export type ReplanJobResult = { ok: true } | { ok: false; failure: OnDemandFailure }

/**
 * Un job par COMPTE. Deux clics, deux onglets ou un rechargement pendant le
 * calcul partagent donc le même travail — jamais deux phases 4 en parallèle sur
 * le même dossier, qui se marcheraient dessus à l'écriture du plan.
 *
 * ⚠️ AUCUN `:` : BullMQ l'utilise comme séparateur de clés Redis et REJETTE un
 * id personnalisé qui en contient (sauf à trois segments exactement). Le tiret
 * est neutre — leçon payée sur `enrich:<uuid>`, qui sortait en 500 au premier
 * clic.
 */
export function replanJobId(accountId: string): string {
  return `replan-${accountId}`
}

export const REPLAN_JOB_OPTIONS: JobsOptions = {
  // JAMAIS de retry : chaque tentative relance un appel modèle complet. Même
  // posture que `maxAttempts: 1` sur l'appel IA — un retry doublerait le coût et
  // le temps d'attente sans rien apprendre.
  attempts: 1,
  // Le résultat doit survivre au suivi du client ET à un rechargement de page
  // pendant le calcul. Une heure est large et borne ce qu'on garde en Redis.
  removeOnComplete: { age: 3_600, count: 500 },
  removeOnFail: { age: 86_400 },
}
