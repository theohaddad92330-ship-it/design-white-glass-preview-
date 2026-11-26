import { contactIdentityKeys } from './contact-identity'

/**
 * #2553 / #3740 — un organigramme importé devient des CONTACTS du compte.
 *
 * Pure : le plan se décide ici, l'écriture se fait dans `ContactsService`.
 *  - une personne NOUVELLE → à créer ;
 *  - une personne qui correspond à un contact existant (même moteur d'identité
 *    que tout import : nom plié casse + accents, e-mail, téléphone, LinkedIn) →
 *    LIÉE à ce contact, jamais écrasée, jamais fusionnée (« on PROPOSE une
 *    fusion, on ne fusionne JAMAIS ») ;
 *  - un doublon DANS le document ne crée qu'une fois.
 * Réimporter le même document ne crée donc rien : tout se relie.
 *
 * #3740.3 — « écriture inverse » : une personne LIÉE porte le
 * LinkedIn du fichier quand le contact existant n'en a pas. PRESENT-ONLY,
 * comme `enrichDeclaredFromBellum` côté inverse : un LinkedIn déjà sur le
 * contact (import antérieur ou correction humaine) n'est jamais écrasé par
 * le fichier — `linkedinUrl` n'apparaît sur l'entrée `linked` que s'il y a
 * réellement quelque chose à écrire.
 */
type ExistingIdentity = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  linkedin_url: string | null
}

type OrgChartPerson = { fullName: string; title?: string; entityName?: string; linkedinUrl?: string }

type OrgChartContactPlan = {
  toCreate: OrgChartPerson[]
  linked: Array<{ fullName: string; contactId: string; linkedinUrl?: string }>
}

/** La source portée par le contact : l'année du DOCUMENT, jamais celle du clic. */
export function orgChartSourceLabel(documentDate: string | undefined): string {
  const year = documentDate?.slice(0, 4)
  return year && /^\d{4}$/.test(year) ? `organigramme importé (${year})` : 'organigramme importé'
}

export function planOrgChartContacts(
  existing: readonly ExistingIdentity[],
  people: readonly OrgChartPerson[],
): OrgChartContactPlan {
  const byKey = new Map<string, string>()
  const byId = new Map<string, ExistingIdentity>()
  for (const row of existing) {
    byId.set(row.id, row)
    for (const key of contactIdentityKeys({
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      linkedinUrl: row.linkedin_url,
    })) {
      if (!byKey.has(key)) byKey.set(key, row.id)
    }
  }

  const plan: OrgChartContactPlan = { toCreate: [], linked: [] }
  const seenInDocument = new Set<string>()
  for (const person of people) {
    const keys = contactIdentityKeys({ fullName: person.fullName })
    if (keys.length === 0) continue
    const hit = keys.map(key => byKey.get(key)).find((id): id is string => id !== undefined)
    if (hit) {
      const linkedinUrl = person.linkedinUrl?.trim()
      const contactHasNone = !byId.get(hit)?.linkedin_url?.trim()
      plan.linked.push({
        fullName: person.fullName,
        contactId: hit,
        ...(linkedinUrl && contactHasNone ? { linkedinUrl } : {}),
      })
      continue
    }
    if (keys.some(key => seenInDocument.has(key))) continue
    for (const key of keys) seenInDocument.add(key)
    plan.toCreate.push(person)
  }
  return plan
}
