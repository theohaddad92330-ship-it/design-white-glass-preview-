import { z } from 'zod'

/**
 * LA DÉCLARATION D'ÉVALUATIONS DE ROUTAGE FOURNISSEUR — épopée #2975 (#2440.82).
 *
 * `provider_evals.py` (IA) dit « à évaluer » pour toute destination routée
 * autre que la référence Anthropic, tant que l'opérateur n'a pas rejoué les
 * évaluations ET déclaré la destination. Avant ce schéma, le SEUL geste pour
 * déclarer passait par une variable d'env (`LLM_ROUTING_EVALS_PASSED`) posée
 * au déploiement — personne, depuis la console d'opérations qui AFFICHE le
 * statut, ne pouvait le faire. Ce schéma valide le corps de
 * `POST /config/model-routing/evals` (IA) et `POST .../model-routing/evals`
 * (API, back-office).
 *
 * `destinationKey` reprend le format `provider` ou `provider:model` déjà lu
 * par l'IA (minuscules, espaces tolérés — normalisés côté serveur). `note`
 * est un texte libre facultatif (ex. lien vers le rejeu), jamais affiché au
 * produit (fournisseurs et modèles ne se nomment jamais côté client).
 */
export const declareModelRoutingEvalSchema = z.object({
  destinationKey: z.string().trim().min(1, 'destinationKey manquant'),
  note: z.string().trim().max(500).nullable().optional(),
})
export type DeclareModelRoutingEval = z.infer<typeof declareModelRoutingEvalSchema>

/**
 * Le même corps, + `declaredBy` — jamais écrit par le NAVIGATEUR : l'écran
 * poste {@link declareModelRoutingEvalSchema} à SA route Next.js, qui résout
 * l'auteur depuis la session serveur (même geste qu'`acteurDepuisBasicAuth`
 * pour `/analyses/:id/stop`) puis appelle l'API interne avec ce schéma-ci.
 * « Qui » vient toujours de l'authentification, jamais d'un champ de formulaire.
 */
export const declareModelRoutingEvalInternalSchema = declareModelRoutingEvalSchema.extend({
  declaredBy: z.string().trim().min(1, 'declaredBy manquant'),
})
export type DeclareModelRoutingEvalInternal = z.infer<typeof declareModelRoutingEvalInternalSchema>
