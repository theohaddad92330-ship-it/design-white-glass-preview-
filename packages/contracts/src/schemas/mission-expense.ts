import { z } from 'zod'
import { evidenceFieldSourceSchema } from './provenance.js'

/**
 * Les FRAIS d'une mission — ce que sa marge ignorait (triage du 30/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Une mission n'avait aucune ligne de frais alors que sa marge est calculée et
 * affichée partout (la fiche, la liste, le board, les alertes de seuil, la
 * marge par canal). La marge affichée ignorait donc tout déplacement, tout
 * matériel, toute dépense engagée pour délivrer la mission — un chiffre qui se
 * présente comme complet et ne l'est pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PROVENANCE — pas un second vocabulaire
 * ─────────────────────────────────────────────────────────────────────────────
 * `source` reprend {@link evidenceFieldSourceSchema} (`human` > `connector` > `pipeline`
 * > `model`), le motif DÉJÀ en place pour « une correction humaine gagne
 * toujours » (`decideFieldWrite`). Une ligne de frais saisie à la main porte
 * `human` ; une ligne importée d'un outil connecté porterait `connector`. Rien
 * n'invente un second axe « manuel / importé » à côté de celui qui existe déjà.
 */
export const missionExpenseSchema = z.object({
  id: z.string().guid(),
  missionId: z.string().guid(),
  label: z.string().min(1).max(300),
  /** En CENTIMES, toujours strictement positif — une ligne de frais à 0 ne
   *  veut rien dire, et un montant négatif serait un avoir, pas une dépense. */
  amountCents: z.number().int().positive(),
  expenseDate: z.string().date(),
  /** Qui l'a SAISIE — immuable, posé à la création. Une édition ultérieure ne
   *  réattribue pas la ligne à son éditeur : « qui l'a saisie » est un fait
   *  historique, pas le dernier à y avoir touché. */
  enteredByUserId: z.string().guid(),
  source: evidenceFieldSourceSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type MissionExpense = z.infer<typeof missionExpenseSchema>

/** Le plafond d'une ligne — 1 000 000 € en centimes. Une saisie au-delà est
 *  presque toujours une erreur de frappe (des euros tapés en centimes), et la
 *  refuser tôt évite une marge qui s'effondre sur une faute de saisie. */
const MAX_EXPENSE_AMOUNT_CENTS = 100_000_000

export const createMissionExpenseSchema = z
  .object({
    label: z.string().trim().min(1).max(300),
    amountCents: z.number().int().positive().max(MAX_EXPENSE_AMOUNT_CENTS),
    expenseDate: z.string().date(),
  })
  .strict()
export type CreateMissionExpenseInput = z.infer<typeof createMissionExpenseSchema>

/**
 * Ce qu'une ÉDITION accepte. Les trois champs sont en REMPLACEMENT explicite
 * — absent du corps, `undefined` — et non en FUSION : un champ ABSENT ne parle
 * pas de lui, et c'est `decideFieldWrite` qui décide, champ par champ, si la
 * valeur transmise l'emporte sur celle déjà en base (l'arbitre de provenance,
 * pas cette validation).
 */
export const updateMissionExpenseSchema = z
  .object({
    label: z.string().trim().min(1).max(300).optional(),
    amountCents: z.number().int().positive().max(MAX_EXPENSE_AMOUNT_CENTS).optional(),
    expenseDate: z.string().date().optional(),
  })
  .strict()
export type UpdateMissionExpenseInput = z.infer<typeof updateMissionExpenseSchema>
