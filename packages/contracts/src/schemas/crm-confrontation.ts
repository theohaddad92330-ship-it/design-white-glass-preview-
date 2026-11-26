import { z } from 'zod'

/**
 * #2120.48 — CONFRONTER AVEC MON CRM, SUR LE DERNIER INSTANTANÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DÉCISION LOUIS 18/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * Tous les fournisseurs, sur le DERNIER INSTANTANÉ déjà en base — aucun appel
 * live. `crm_connections` dit si un CRM est branché (n'importe lequel : ce
 * module ne distingue jamais un fournisseur), et `contacts.crm_synced_at` /
 * `contacts.source = 'crm'` disent ce qui a déjà été rapproché. Confronter est
 * donc une LECTURE de ce que le dernier passage de synchronisation (ou une
 * fiche créée depuis le CRM) a déjà écrit — jamais une requête réseau au clic.
 *
 * Une confrontation est une LECTURE : elle PROPOSE des paires probablement
 * dupliquées (une fiche venue du CRM, une fiche trouvée par Bellum), elle ne
 * fusionne JAMAIS. L'écran qui consomme ce résultat n'a que deux gestes
 * possibles — masquer l'une des deux fiches (réversible, `hidden`), ou ne rien
 * faire — et aucun champ n'est jamais écrasé automatiquement : une correction
 * humaine survit donc à toute confrontation, par construction, puisque rien
 * n'écrit de valeur ici.
 */

/** Un contact tel que la confrontation le compare — jamais le contact entier :
 *  seuls les trois champs qui servent au rapprochement voyagent. */
export const crmConfrontationContactSchema = z.object({
  id: z.string().guid(),
  fullName: z.string().nullable(),
  email: z.string().nullable(),
})
export type CrmConfrontationContact = z.infer<typeof crmConfrontationContactSchema>

/** Pourquoi deux fiches se ressemblent — même critère que `crm-duplicates.ts`
 *  (adresse d'abord, nom ensuite), sans le distinguo « même société » : au sein
 *  d'UN compte, toutes les fiches partagent déjà la même société. */
export const crmConfrontationReasonSchema = z.enum(['same_email', 'same_name'])
export type CrmConfrontationReason = z.infer<typeof crmConfrontationReasonSchema>

export const crmConfrontationPairSchema = z.object({
  crmContact: crmConfrontationContactSchema,
  bellumContact: crmConfrontationContactSchema,
  reason: crmConfrontationReasonSchema,
  /** Confiance 0-1, affichée telle quelle — on ne masque pas l'incertitude. */
  confidence: z.number().min(0).max(1),
})
export type CrmConfrontationPair = z.infer<typeof crmConfrontationPairSchema>

export const crmConfrontationResultSchema = z.object({
  /** `false` = aucun CRM branché sur cet espace, quel qu'en soit le
   *  fournisseur. L'écran DOIT le dire — jamais disparaître en silence, jamais
   *  un « 0 écart » qui laisserait croire à une comparaison faite. */
  connected: z.boolean(),
  /**
   * La date du DERNIER instantané déjà en base (`MAX(contacts.crm_synced_at)`
   * sur ce compte), ou `null` quand elle est inconnue — jamais une date
   * devinée. `null` avec `connected: true` se lit « fraîcheur non mesurée »,
   * pas « rien à confronter ».
   */
  snapshotAt: z.string().nullable(),
  /**
   * #4680 — `true` = la confrontation porte sur les contacts IMPORTÉS déjà en base (un fichier, un ancien CRM),
   * faute de connecteur live : `connected` reste `false` (aucun CRM branché, c'est vrai), mais ce n'est pas
   * « rien à confronter ». Absent = comme avant.
   */
  imported: z.boolean().optional(),
  pairs: z.array(crmConfrontationPairSchema),
})
export type CrmConfrontationResult = z.infer<typeof crmConfrontationResultSchema>

/** Normalise un nom : sans accents, sans ponctuation, en minuscules — même
 *  règle que `crm-duplicates.ts` (dupliquée à dessein : ce paquet ne peut pas
 *  importer `apps/api`, et l'inverse casserait la frontière du monorepo). */
function normalizeName(value: string | null): string {
  if (!value) return ''
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Normalise une adresse ; `''` quand elle n'a pas la forme d'une adresse. */
function normalizeEmail(value: string | null): string {
  if (!value) return ''
  const lowered = value.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lowered) ? lowered : ''
}

/**
 * Les paires CRM ↔ Bellum probablement dupliquées, à confiance décroissante.
 *
 * Une fiche sans nom NI adresse n'est comparée à rien. Deux fiches du MÊME
 * côté (deux CRM, ou deux Bellum) ne sont jamais rapprochées ici : ce module
 * répond seulement à « le CRM et Bellum connaissent-ils déjà la même
 * personne ? » — le doublon PUREMENT Bellum est une autre question, déjà
 * traitée par `DuplicatesSweeper` (gouvernance).
 */
export function findConfrontationPairs(
  crmContacts: CrmConfrontationContact[],
  bellumContacts: CrmConfrontationContact[],
  limit = 25,
): CrmConfrontationPair[] {
  const pairs: CrmConfrontationPair[] = []
  const seen = new Set<string>()

  for (const crmContact of crmContacts) {
    const crmEmail = normalizeEmail(crmContact.email)
    const crmName = normalizeName(crmContact.fullName)
    if (!crmEmail && !crmName) continue

    for (const bellumContact of bellumContacts) {
      const key = `${crmContact.id}::${bellumContact.id}`
      if (seen.has(key)) continue

      const bellumEmail = normalizeEmail(bellumContact.email)
      if (crmEmail && bellumEmail && crmEmail === bellumEmail) {
        seen.add(key)
        pairs.push({ crmContact, bellumContact, reason: 'same_email', confidence: 0.95 })
        continue
      }

      const bellumName = normalizeName(bellumContact.fullName)
      if (crmName && bellumName && crmName === bellumName) {
        seen.add(key)
        pairs.push({ crmContact, bellumContact, reason: 'same_name', confidence: 0.7 })
      }
    }
  }

  return pairs.sort((a, b) => b.confidence - a.confidence).slice(0, limit)
}
