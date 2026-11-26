import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/** Roles an operator may hand out at provisioning time. `owner` is excluded —
 *  it belongs to the account holder and is set by the provisioning itself. */
const invitableRole = z.enum(['admin', 'sales_ops', 'sales', 'tech_admin', 'member', 'viewer'])

/**
 * Sales-led client provisioning: one ESN, its owner, its team, a negotiated
 * plan and the offline commercial terms. No Stripe involved.
 *
 * `plan` excludes `trial` deliberately — trial rows are skipped by the monthly
 * quota reset, so an invoice-billed client parked on `trial` would silently run
 * out and never refill. Keep the enum in sync with `assign-plan.dto.ts` minus
 * `trial`.
 */
export const provisionClientSchema = z.object({
  esnName: z.string().trim().min(1).max(120),
  owner: z.object({
    email: z.string().trim().toLowerCase().email().max(320),
    firstName: z.string().trim().max(80).optional(),
    lastName: z.string().trim().max(80).optional(),
  }),
  plan: z.enum(['starter', 'team', 'growth', 'beta']),
  // Capped at the same ceiling as the self-serve seat add-on (MAX_EXTRA_SEATS).
  extraSeats: z.coerce.number().int().min(0).max(47).optional(),
  // Quota overrides for a negotiated contract. Bounded so a typo can't mint a
  // effectively-unlimited account.
  accountsLimit: z.coerce.number().int().min(0).max(100_000).optional(),
  enrichmentCredits: z.coerce.number().int().min(0).max(1_000_000).optional(),
  billing: z.object({
    amountCents: z.coerce.number().int().min(0).max(100_000_000),
    currency: z.string().trim().length(3).toUpperCase().optional(),
    period: z.enum(['monthly', 'quarterly', 'yearly', 'one_off']),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date de début attendue au format YYYY-MM-DD'),
    // Durée de l'engagement. ABSENTE = aucun engagement, et le minimum est 1 :
    // « 0 mois » se lirait comme un contrat qui se termine le jour où il
    // commence, ce qu'aucun opérateur ne veut dire.
    commitmentMonths: z.coerce.number().int().min(1).max(120).optional(),
    billedToName: z.string().trim().max(160).optional(),
    billedToKind: z.enum(['person', 'company']).optional(),
    billingEmail: z.string().trim().toLowerCase().email().max(320).optional(),
    billingPhone: z.string().trim().max(40).optional(),
    /** Statut de la PREMIÈRE facture — il se pose sur elle, pas sur le contrat. */
    paymentStatus: z.enum(['unpaid', 'paid']).optional(),
    reference: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(2000).optional(),
  }),
  team: z
    .array(z.object({ email: z.string().trim().toLowerCase().email().max(320), role: invitableRole }))
    .max(50)
    .optional(),
  /**
   * L'OPÉRATEUR qui déclenche l'opération (#1665, règle 4 · T3).
   *
   * ⚠️ Une prémisse de l'issue était fausse : « l'opération entière est
   * journalisée avec son auteur » supposait que l'API connaisse l'auteur. Elle
   * ne le connaissait PAS — `InternalSecretGuard` valide un secret PARTAGÉ, pas
   * une identité, et le proxy du back-office ne transmettait rien. L'auteur
   * devait donc d'abord VOYAGER.
   *
   * ⚠️ Le champ est rempli côté SERVEUR du back-office, à partir de la session
   * signée (`operateurDeLaRequete`), jamais depuis le navigateur : un champ que
   * le client peut écrire n'est pas une identité, c'est une déclaration. Le
   * gestionnaire de route ÉCRASE ce que le corps porterait.
   *
   * Optionnel, et l'absence se lit : sans `DM_ALLOWED_EMAILS`, la couche
   * d'identité du back-office est inerte et personne ne peut être nommé. Le
   * journal écrit alors « opérateur non identifié », jamais un nom deviné.
   */
  actor: z
    .object({
      email: z.string().trim().toLowerCase().email().max(320),
      role: z.enum(['owner', 'operator', 'viewer']),
    })
    .optional(),
})
export class ProvisionClientDto extends createZodDto(provisionClientSchema) {}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format YYYY-MM-DD')

/**
 * L'opérateur corrige le CONTRAT : la durée d'engagement, le destinataire de la
 * facture, ses coordonnées.
 *
 * `commitmentMonths` accepte explicitement `null` — c'est le seul moyen de
 * REVENIR à « sans engagement » après une saisie erronée. `.optional()` seul
 * rendrait la correction impossible : champ absent et champ effacé se
 * ressembleraient.
 *
 * Le PAIEMENT n'est plus ici : il appartient à une facture (voir
 * {@link updateManualInvoiceSchema}). Une période jamais facturée n'a pas de
 * paiement à déclarer.
 */
export const updateBillingTermsSchema = z.object({
  commitmentMonths: z.coerce.number().int().min(1).max(120).nullable().optional(),
  billedToName: z.string().trim().max(160).nullable().optional(),
  billedToKind: z.enum(['person', 'company']).nullable().optional(),
  billingEmail: z.string().trim().toLowerCase().email().max(320).nullable().optional(),
  billingPhone: z.string().trim().max(40).nullable().optional(),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
})
export class UpdateBillingTermsDto extends createZodDto(updateBillingTermsSchema) {}

/**
 * Une facture émise ailleurs, enregistrée ici.
 *
 * `reference` est obligatoire et rien d'autre ne l'est : la période se DÉDUIT
 * de la plus ancienne qui manque, ce qui est ce que l'opérateur veut dire en
 * enregistrant une facture, et ce qu'il retaperait de travers un jour sur deux.
 */
export const recordManualInvoiceSchema = z.object({
  reference: z.string().trim().min(1).max(120),
  amountCents: z.coerce.number().int().min(0).max(100_000_000).optional(),
  currency: z.string().trim().length(3).toUpperCase().optional(),
  periodStart: day.optional(),
  periodEnd: day.optional(),
  issuedOn: day.optional(),
  paymentStatus: z.enum(['unpaid', 'paid']).optional(),
  paidOn: day.optional(),
  notes: z.string().trim().max(2000).optional(),
})
export class RecordManualInvoiceDto extends createZodDto(recordManualInvoiceSchema) {}

/** Encaisser une facture, ou corriger une saisie. Aucune suppression : une
 *  facture fausse se corrige, un journal troué ne se rapproche plus de la
 *  comptabilité qu'il reflète. */
export const updateManualInvoiceSchema = z.object({
  reference: z.string().trim().min(1).max(120).optional(),
  amountCents: z.coerce.number().int().min(0).max(100_000_000).optional(),
  periodStart: day.optional(),
  periodEnd: day.optional(),
  issuedOn: day.nullable().optional(),
  paymentStatus: z.enum(['unpaid', 'paid']).optional(),
  paidOn: day.nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
})
export class UpdateManualInvoiceDto extends createZodDto(updateManualInvoiceSchema) {}
