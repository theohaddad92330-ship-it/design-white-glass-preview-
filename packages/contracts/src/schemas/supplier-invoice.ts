import { z } from 'zod'
import { evidenceFieldSourceSchema } from './provenance.js'

/**
 * La FACTURE ENTRANTE d'un sous-traitant (30/08/2026) — distincte de la
 * facture CLIENT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Le canal `subcontracting` existe sur `mission_commercial_terms` depuis le
 * Delivery OS, et `partnerCommissionDailyCents` en porte une ESTIMATION
 * journalière — mais rien n'enregistrait ce qu'on doit RÉELLEMENT à un
 * sous-traitant : `supplier_invoice` / `incoming_invoice` étaient à zéro
 * occurrence dans `apps/api/src` et `packages/contracts/src` avant ce lot.
 * Quand une mission passait par un sous-traitant, rien n'enregistrait sa
 * facture.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN STATUT À PART, ET NON CELUI DE LA FACTURATION CLIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * `invoice_readiness` (la facturation CLIENT) répond à « sommes-nous prêts à
 * ÉMETTRE » — préparé / facturé / encaissé / contesté, du point de vue de
 * l'ESN qui VEND. Une facture fournisseur répond à l'inverse : « devons-nous
 * PAYER », du point de vue de l'ESN qui ACHÈTE une prestation. Les deux
 * comptent un argent qui change de sens, et un statut partagé mélangerait deux
 * notions différentes derrière le même mot — ce que la consigne du lot
 * interdit explicitement.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PROVENANCE — le même motif que les frais, pas un second
 * ─────────────────────────────────────────────────────────────────────────────
 * `source` reprend {@link evidenceFieldSourceSchema}, exactement comme
 * `mission-expense.ts` : `human` pour une saisie depuis la fiche, `connector`
 * pour un futur import comptable. Toute édition passe par `decideFieldWrite` —
 * un montant saisi à la main n'est pas plus écrasable ici que sur une ligne de
 * frais.
 */

export const SUPPLIER_INVOICE_STATUSES = [
  /** Reçue, pas encore vérifiée. */
  'pending',
  /** Vérifiée — le montant est confirmé, en attente de paiement. */
  'validated',
  /** Réglée. */
  'paid',
  /** Contestée — le montant ou la prestation sont en désaccord avec le
   *  sous-traitant. Elle continue de compter dans le coût de la mission : une
   *  facture contestée n'est pas une facture annulée (« on archive, on ne
   *  supprime pas »), son montant reste la meilleure estimation connue tant
   *  que le litige n'est pas résolu. */
  'disputed',
] as const
export const supplierInvoiceStatusSchema = z.enum(SUPPLIER_INVOICE_STATUSES)
export type SupplierInvoiceStatus = z.infer<typeof supplierInvoiceStatusSchema>

export const supplierInvoiceSchema = z.object({
  id: z.string().guid(),
  missionId: z.string().guid(),
  /** La référence PORTÉE PAR la facture du sous-traitant — pas un libellé
   *  qu'on invente, le numéro qu'il a lui-même émis. */
  reference: z.string().min(1).max(300),
  /** En CENTIMES, toujours strictement positif. */
  amountCents: z.number().int().positive(),
  invoiceDate: z.string().date(),
  status: supplierInvoiceStatusSchema,
  /** Qui l'a SAISIE — immuable, posé à la création. */
  enteredByUserId: z.string().guid(),
  source: evidenceFieldSourceSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type SupplierInvoice = z.infer<typeof supplierInvoiceSchema>

const MAX_SUPPLIER_INVOICE_AMOUNT_CENTS = 100_000_000

export const createSupplierInvoiceSchema = z
  .object({
    reference: z.string().trim().min(1).max(300),
    amountCents: z.number().int().positive().max(MAX_SUPPLIER_INVOICE_AMOUNT_CENTS),
    invoiceDate: z.string().date(),
  })
  .strict()
export type CreateSupplierInvoiceInput = z.infer<typeof createSupplierInvoiceSchema>

/** Édition des CHAMPS de valeur — en REMPLACEMENT explicite, comme les frais.
 *  Le statut ne passe PAS par ici : c'est un cycle de vie, pas une valeur
 *  qu'une source concurrente propose. */
export const updateSupplierInvoiceSchema = z
  .object({
    reference: z.string().trim().min(1).max(300).optional(),
    amountCents: z.number().int().positive().max(MAX_SUPPLIER_INVOICE_AMOUNT_CENTS).optional(),
    invoiceDate: z.string().date().optional(),
  })
  .strict()
export type UpdateSupplierInvoiceInput = z.infer<typeof updateSupplierInvoiceSchema>

/** Le geste qui fait avancer le cycle de vie. Aucune transition n'est
 *  refusée ici : contester puis re-valider un paiement annulé est un cas réel
 *  (le sous-traitant corrige sa facture), et une machine à états qui l'interdit
 *  forcerait un contournement en base. */
export const setSupplierInvoiceStatusSchema = z.object({ status: supplierInvoiceStatusSchema }).strict()
export type SetSupplierInvoiceStatusInput = z.infer<typeof setSupplierInvoiceStatusSchema>
