import { z } from 'zod'
import { storageUploadSchema } from './storage.js'

/**
 * LA BIBLIOTHÈQUE D'ASSETS OUTREACH — le catalogue, avant le gate (#2838, 25/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER POSE, ET RIEN DE PLUS
 * ─────────────────────────────────────────────────────────────────────────────
 * L'épopée #2838 le dit : construire « asset annoncé puis envoyé seulement après
 * intérêt confirmé » (#2372.6) demande D'ABORD un catalogue — métadonnées, droits
 * d'usage — avant qu'un gate d'envoi ait quoi que ce soit à retenir. Ce fichier
 * pose CE catalogue. Le gate lui-même (qui empêche l'envoi tant que l'intérêt
 * n'est pas confirmé) reste un chantier séparé : l'écrire ici produirait du code
 * que personne n'appelle.
 *
 * `usageRights` porte déjà la distinction que le gate lira demain :
 * `after_interest_confirmed` EST #2372.6, nommé — pas une anticipation inventée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PAS DE FICHIER ICI, À DESSEIN — JUSQU'AU 09/10/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * #3699.6 (lot M08) a posé l'appelant que ce paragraphe attendait : le domaine
 * `outreach_asset_file` et `outreach_assets.storage_object_id`
 * (`1796437901201-OutreachAssetFile`), lus par l'envoi individuel d'un e-mail.
 * Le paragraphe d'origine reste ci-dessous, pour la raison de l'ordre suivi.
 *
 * `bellum_icebreaker.py` RÈGLE 6 gate déjà le premier message (« ne joins ni CV
 * ni plaquette sans contexte ») sans modéliser l'asset. Le stockage de fichiers
 * existe (`storage.ts`, domaines `expense_receipt` / `need_document` /
 * `chat_voice_message`) : un asset pourra y référencer un objet rangé dans un lot
 * ultérieur, exactement comme `need_documents` a d'abord existé SANS
 * `storage_object_id` (`1790974000001-NeedDocuments`) avant qu'un lot dédié
 * (`1790990000002-StoredFileLinks`) ne l'ajoute. Poser la colonne ou le domaine
 * de stockage maintenant, sans appelant, romprait exactement cette règle.
 */

/**
 * La NATURE d'un asset — ce qu'un commercial ESN manipule réellement en outreach
 * (`bellum_icebreaker.py` RÈGLE 6 : CV, plaquette ; `bellum_plan.py` cadence J6 :
 * « cas client chiffré »).
 *
 * ⚠️ Liste FERMÉE, et elle ne s'étend qu'en FIN (GA-08).
 */
export const OUTREACH_ASSET_CATEGORIES = ['case_study', 'company_brochure', 'resume', 'other'] as const
export const outreachAssetCategorySchema = z.enum(OUTREACH_ASSET_CATEGORIES)
export type OutreachAssetCategory = (typeof OUTREACH_ASSET_CATEGORIES)[number]

/**
 * Les DROITS D'USAGE — quand cet asset peut être envoyé.
 *
 * `always` : aucune restriction connue (ex. une plaquette générique).
 * `after_interest_confirmed` : #2372.6 — « asset utile annoncé puis envoyé
 * seulement après intérêt confirmé ». Ce champ ne fait RIEN appliquer ici : il
 * NOMME la règle pour que le gate à venir ait une colonne à lire, plutôt que de
 * la deviner.
 *
 * ⚠️ Liste FERMÉE, et elle ne s'étend qu'en FIN (GA-08).
 */
export const OUTREACH_ASSET_USAGE_RIGHTS = ['always', 'after_interest_confirmed'] as const
export const outreachAssetUsageRightsSchema = z.enum(OUTREACH_ASSET_USAGE_RIGHTS)
export type OutreachAssetUsageRights = (typeof OUTREACH_ASSET_USAGE_RIGHTS)[number]

/**
 * #2372.6 — LE GATE, enfin appliqué (#2838, suite du 25/09/2026). Fonction
 * pure : l'appelant apporte le fait mesuré (`interestConfirmed`, tiré de
 * `outreach_transitions` côté service — la même preuve déterministe que
 * `outreachReplyEffect` écrit pour une classe `positive`, #2381.6), ce gate ne
 * va rien chercher lui-même.
 *
 * `always` ne demande rien. `after_interest_confirmed` refuse tant qu'aucune
 * réponse positive n'est enregistrée pour ce contact — la raison est NOMMÉE,
 * jamais un booléen muet, pour que l'appelant puisse la citer telle quelle.
 */
export type OutreachAssetGateReason = 'interest_not_confirmed'

export type OutreachAssetGateResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: OutreachAssetGateReason }

export function outreachAssetGate(
  usageRights: OutreachAssetUsageRights,
  interestConfirmed: boolean,
): OutreachAssetGateResult {
  if (usageRights === 'always') return { ok: true }
  return interestConfirmed ? { ok: true } : { ok: false, reason: 'interest_not_confirmed' }
}

/**
 * #3699.6 — le fichier RÉEL rattaché à un asset, tel que l'écran le voit :
 * nom, type rangé (décidé sur l'extension ET la signature au dépôt), taille
 * mesurée, empreinte. Jamais un chemin de magasin, jamais le contenu.
 */
export const outreachAssetFileSchema = z.object({
  fileName: z.string(),
  contentType: z.string(),
  byteSize: z.number().int().nonnegative(),
  sha256: z.string().nullable(),
})
export type OutreachAssetFile = z.infer<typeof outreachAssetFileSchema>

/** Corps de `POST /outreach-assets/:id/file` — le dépôt partagé du stockage. */
export const uploadOutreachAssetFileSchema = storageUploadSchema

/** Un asset tel que l'écran le reçoit. */
export const outreachAssetSchema = z.object({
  id: z.string().guid(),
  title: z.string(),
  description: z.string().nullable(),
  category: outreachAssetCategorySchema,
  usageRights: outreachAssetUsageRightsSchema,
  /** #3699.6 — `null` = asset annoncé sans fichier : il ne se joint pas à un e-mail. */
  file: outreachAssetFileSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type OutreachAsset = z.infer<typeof outreachAssetSchema>

/** Corps de `POST /outreach-assets`. */
export const createOutreachAssetSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(500).nullish(),
    category: outreachAssetCategorySchema,
    usageRights: outreachAssetUsageRightsSchema,
  })
  .strict()
export type CreateOutreachAsset = z.infer<typeof createOutreachAssetSchema>

/** Corps de `PATCH /outreach-assets/:id`. */
export const updateOutreachAssetSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(500).nullable(),
    category: outreachAssetCategorySchema,
    usageRights: outreachAssetUsageRightsSchema,
  })
  .partial()
  .strict()
  .refine(patch => Object.keys(patch).length > 0, { message: 'Aucun champ à mettre à jour' })
export type UpdateOutreachAsset = z.infer<typeof updateOutreachAssetSchema>
