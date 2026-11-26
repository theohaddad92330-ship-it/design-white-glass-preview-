import { z } from 'zod'

/**
 * #2018.7/.8/.9 — SIGNALER une information d'entreprise fausse SANS l'écraser
 * (issue #2018, décision Louis reprise ci-contre).
 *
 * Un membre sans le droit d'écrire le profil canonique de son espace
 * (`team:manage` — voir `EsnProfileService.persistAnswers`, qui IGNORE déjà
 * silencieusement ses éditions de champs ENTREPRISE) ne pouvait jusqu'ici rien
 * faire d'une valeur qu'il sait fausse : ni la corriger (juste — c'est une
 * valeur PARTAGÉE), ni la signaler (manquant). Ce fichier porte le second
 * geste, distinct de l'écriture :
 *
 *  - **rien n'est écrasé** : `POST /esn-profile/correction-requests` ne
 *    touche jamais `esn_profiles` — il persiste une DEMANDE, séparée ;
 *  - **on archive, on ne supprime pas** : une demande TRANCHÉE reste lisible
 *    (`resolved`/`dismissed`), elle ne disparaît jamais ;
 *  - **le corps ne propose aucune valeur de remplacement** — le contrat est
 *    `.strict()` : signaler dit CE qui est faux et POURQUOI, jamais ce que
 *    la valeur devrait être. La correction reste le geste de qui en a le
 *    droit (doctrine « rien n'écrit tout seul »).
 */

/**
 * Les trois états d'une demande. Ajouts en FIN seulement (GA-08).
 *
 *  - `pending`   — en attente d'un administrateur.
 *  - `resolved`  — la valeur a été corrigée (par un geste séparé, sur
 *                  `PUT /esn-profile`) ; la demande elle-même reste lisible.
 *  - `dismissed` — un administrateur a jugé le signalement infondé.
 */
export const esnProfileCorrectionRequestStatusValues = ['pending', 'resolved', 'dismissed'] as const
export const esnProfileCorrectionRequestStatusSchema = z.enum(esnProfileCorrectionRequestStatusValues)
export type EsnProfileCorrectionRequestStatus = z.infer<typeof esnProfileCorrectionRequestStatusSchema>

/**
 * #2010.15 — signaler une INTERPRÉTATION de l'audit (un verdict, une
 * recommandation, une hypothèse), DISTINCT de #2018.7 (une réponse
 * DÉCLARÉE) : `fieldKey` porte alors cette valeur fixe plutôt qu'une clé
 * d'`EsnAnswers`. Une seule valeur, pas un espace de noms `audit:*` libre —
 * l'audit n'a aujourd'hui aucun identifiant stable par item (colonne,
 * contradiction…) à signaler individuellement ; un geste ÉCRAN, pas
 * per-item, suffit à ce que #2010.15 demande. Validée côté service au même
 * titre qu'une clé de `EsnAnswers` (`esn-profile-correction-request.service.ts`).
 */
export const AUDIT_INTERPRETATION_FIELD_KEY = 'audit:interpretation' as const

/** Corps de `POST /esn-profile/correction-requests`. */
export const createEsnProfileCorrectionRequestSchema = z
  .object({
    /** La clé de `EsnAnswers` que le membre signale, OU
     *  {@link AUDIT_INTERPRETATION_FIELD_KEY} — validée côté service contre
     *  le contrat réel (jamais une clé fabriquée). */
    fieldKey: z.string().min(1).max(120),
    /** Pourquoi — jamais vide : un signalement sans motif n'aide personne à
     *  trancher. */
    reason: z.string().min(1).max(2000),
  })
  .strict()
export type CreateEsnProfileCorrectionRequest = z.infer<typeof createEsnProfileCorrectionRequestSchema>

/** Ce que le membre voit de SA propre demande, une fois persistée. */
export const esnProfileCorrectionRequestSchema = z
  .object({
    id: z.string().guid(),
    fieldKey: z.string(),
    reason: z.string(),
    status: esnProfileCorrectionRequestStatusSchema,
    createdAt: z.string(),
    resolvedAt: z.string().nullable(),
  })
  .strict()
export type EsnProfileCorrectionRequest = z.infer<typeof esnProfileCorrectionRequestSchema>
