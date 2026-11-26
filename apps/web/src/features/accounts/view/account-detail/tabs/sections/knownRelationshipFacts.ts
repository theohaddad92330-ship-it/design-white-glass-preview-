import type { Contact } from '@bellum/contracts'

/**
 * #1607.5 — CE QUE BELLUM SAIT DÉJÀ DE LA RELATION, DEPUIS `employment_history[]`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * D'OÙ VIENT LE FAIT, ET CE QU'IL DIT
 * ─────────────────────────────────────────────────────────────────────────────
 * `employment_history[]` vit sur l'enrichissement Apollo d'un CONTACT
 * (`contact.apollo_enrichment.employment_history`), pas sur le compte. Chaque
 * entrée porte un rôle chez une organisation, avec `current: true` sur celle
 * en cours. Pour un contact déjà rattaché à ce compte, l'entrée `current`
 * dit depuis QUAND on connaît sa présence dans l'entreprise — un fait daté et
 * FACTUEL (pas une inférence), qui existait déjà pour chaque fiche contact
 * (`ContactApolloProfile.tsx`) mais n'était lu par AUCUN écran de COMPTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS ÉTATS, PAS DEUX — « non mesuré n'est jamais 0 »
 * ─────────────────────────────────────────────────────────────────────────────
 * Un contact non enrichi (`apollo_enrichment` absent) et un contact enrichi
 * sans rôle courant identifié ne disent PAS la même chose : le premier est
 * NON MESURÉ (on n'a jamais regardé), le second est une MESURE qui n'a rien
 * trouvé. Les deux sont distingués par `KnownContactsSummary.status`, jamais
 * fondus dans un même silence ni dans un même zéro.
 */

export type KnownContactPresence = {
  contactId: string
  name: string
  role: string | null
  /** ISO (souvent juste une année) — `null` quand l'entrée courante ne porte
   *  pas de date de début. Jamais devinée. */
  since: string | null
}

type KnownContactsSummary =
  | { status: 'no_contacts' }
  | { status: 'not_enriched'; contactCount: number }
  | { status: 'enriched_no_presence'; enrichedCount: number }
  | { status: 'has_presence'; presences: KnownContactPresence[]; mostRecentUpdateAt: string | null }

/**
 * Le rôle courant d'un contact chez ce compte, ou `null` : aucune entrée
 * `employment_history` marquée `current: true`. Une entrée `current` sans
 * titre retombe sur le titre que Bellum connaît déjà pour ce contact — les
 * deux décrivent le même poste, et en préférer un silencieusement effacerait
 * l'autre sans raison.
 */
function currentRole(contact: Contact): { role: string | null; since: string | null } | null {
  const history = contact.apollo_enrichment?.employment_history ?? []
  const current = history.find(entry => entry?.current === true)
  if (!current) return null
  const role = current.title?.trim() || contact.title?.trim() || null
  const since = current.start_date?.trim() || null
  return { role, since }
}

/**
 * Résume ce que Bellum sait déjà de la relation à partir des CONTACTS déjà
 * rattachés à ce compte. Pure — testable sans réseau, sans dépendre du hook
 * qui les charge.
 */
export function summarizeKnownContacts(contacts: readonly Contact[]): KnownContactsSummary {
  if (contacts.length === 0) return { status: 'no_contacts' }

  const enriched = contacts.filter(contact => contact.apollo_enrichment != null)
  if (enriched.length === 0) return { status: 'not_enriched', contactCount: contacts.length }

  const presences: KnownContactPresence[] = []
  let mostRecentUpdateAt: string | null = null
  for (const contact of enriched) {
    const found = currentRole(contact)
    if (!found) continue
    presences.push({ contactId: contact.id, name: contact.full_name, role: found.role, since: found.since })
    if (contact.updated_at && (!mostRecentUpdateAt || contact.updated_at > mostRecentUpdateAt)) {
      mostRecentUpdateAt = contact.updated_at
    }
  }

  if (presences.length === 0) return { status: 'enriched_no_presence', enrichedCount: enriched.length }
  return { status: 'has_presence', presences, mostRecentUpdateAt }
}
