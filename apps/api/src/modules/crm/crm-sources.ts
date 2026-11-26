import type { IncomingRecord } from '@bellum/contracts'
import type { CrmAccountSource, CrmSource } from './crm-import.service'
import type { CrmAdapter } from './adapter/crm-adapter'
import type { CrmService } from './crm.service'

/**
 * Les SOURCES importables.
 *
 * HubSpot a ses sources dédiées (ci-dessous) — c'est le seul connecteur dont la
 * lecture paginée a été vérifiée sur un portail réel. Depuis #4189, les autres CRM
 * (Salesforce, Pipedrive, Attio, Odoo, Zoho) relisent par l'adaptateur commun, avec
 * les endpoints PUBLICS documentés de chacun (`adapterContactSource` /
 * `adapterAccountSource`, en bas de ce fichier). ⚠️ Ces lectures ne sont pas encore
 * vérifiées sur une instance réelle : la première reprise d'un espace est faite à la
 * main, en simulation d'abord — c'est la recette de chaque connecteur. Un objet que le
 * CRM n'expose pas n'a pas de méthode de lecture : « absent », jamais « zéro ligne ».
 */
export function hubspotContactSource(crm: CrmService): CrmSource {
  return {
    provider: 'hubspot',
    async listContacts(userId, limit) {
      const records: IncomingRecord[] = []
      let after: string | undefined
      let more = false

      // La demande (200 par défaut) est SUPÉRIEURE à ce qu'une requête HubSpot
      // rend (100 maximum, cap du fournisseur). On boucle donc sur le curseur au
      // lieu de demander tout d'un coup — la version d'avant envoyait `limit=200`
      // et HubSpot refusait l'appel ENTIER : la reprise ne pouvait pas aboutir
      // sur un portail réel, quel que soit son nombre de contacts.
      while (records.length < limit) {
        const page = await crm.listContacts(userId, { limit: limit - records.length, after })
        for (const contact of page.contacts) {
          records.push({
            externalId: contact.id,
            email: contact.email ?? null,
            name: [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() || null,
          })
        }
        // `nextAfter` non nul veut dire qu'il RESTE des pages. L'écran doit le dire :
        // « 200 contacts importés » sur une base de 3000 se lit comme une fin.
        more = page.nextAfter !== null
        if (!more) break
        after = page.nextAfter ?? undefined
        // Une page vide AVEC un curseur ferait tourner la boucle sans avancer :
        // on s'arrête et on l'annonce tronqué plutôt que de boucler sans fin.
        if (page.contacts.length === 0) break
      }

      return { records: records.slice(0, limit), truncated: more }
    },
  }
}

/**
 * #2388.24 — même discipline que {@link hubspotContactSource}, côté sociétés :
 * `CrmService.listCompanies` est la seule lecture paginée vérifiée aujourd'hui.
 */
export function hubspotCompanySource(crm: CrmService): CrmAccountSource {
  return {
    provider: 'hubspot',
    async listCompanies(userId, limit) {
      const records: IncomingRecord[] = []
      let after: string | undefined
      let more = false

      while (records.length < limit) {
        const page = await crm.listCompanies(userId, { limit: limit - records.length, after })
        for (const company of page.companies) {
          // #4603 — le SIREN voyage quand le portail le porte ; sinon la ligne reste celle d'avant.
          records.push({
            externalId: company.id,
            email: null,
            name: company.name,
            ...(company.siren ? { siren: company.siren } : {}),
          })
        }
        more = page.nextAfter !== null
        if (!more) break
        after = page.nextAfter ?? undefined
        if (page.companies.length === 0) break
      }

      return { records: records.slice(0, limit), truncated: more }
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// #4189 — les sources GÉNÉRIQUES : tout adaptateur qui porte `read` est importable.
// ─────────────────────────────────────────────────────────────────────────────

/** Bornes d'une lecture : au-delà, on s'arrête et on l'annonce tronquée — jamais une boucle sans fin. */
const MAX_PAGES = 50

type PageStep<T> = { items: T[]; nextAfter: string | null }

/**
 * Lit les pages d'un adaptateur jusqu'à `limit` fiches. `truncated` dit qu'il EN RESTE (curseur
 * non nul, ou arrêt par la borne de pages). Une page FILTRÉE vide avec un curseur ne coupe pas la
 * lecture (Attio filtre « depuis » côté client) ; seule la borne de pages la coupe.
 */
async function readPages<T>(
  limit: number,
  fetchPage: (after: string | undefined, want: number) => Promise<PageStep<T>>,
): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = []
  let after: string | undefined
  let more = false
  for (let page = 0; page < MAX_PAGES && items.length < limit; page++) {
    const step = await fetchPage(after, limit - items.length)
    items.push(...step.items)
    more = step.nextAfter !== null
    if (!more) break
    // Un curseur qui ne bouge pas ferait tourner la boucle sans avancer.
    if (step.nextAfter === after) return { items: items.slice(0, limit), truncated: true }
    after = step.nextAfter ?? undefined
  }
  return { items: items.slice(0, limit), truncated: more || items.length > limit }
}

/** Les contacts d'un adaptateur, comme source de reprise. `since` : seulement ce qui a bougé après. */
export function adapterContactSource(adapter: CrmAdapter): CrmSource {
  return {
    provider: adapter.provider,
    async listContacts(userId, limit, opts) {
      const read = adapter.read
      if (!read) throw new Error('Ce CRM ne se relit pas encore depuis Bellum.')
      const { items, truncated } = await readPages(limit, async (after, want) => {
        const page = await read.contacts(userId, {
          limit: want,
          ...(after ? { after } : {}),
          ...(opts?.since ? { since: opts.since } : {}),
        })
        return { items: page.contacts, nextAfter: page.nextAfter }
      })
      const records: IncomingRecord[] = items.map(contact => ({
        externalId: contact.id,
        email: contact.email ?? null,
        name: [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() || null,
        modifiedAt: contact.modifiedAt ?? null,
      }))
      return { records, truncated }
    },
  }
}

/** Les sociétés d'un adaptateur, comme source de reprise. */
export function adapterAccountSource(adapter: CrmAdapter): CrmAccountSource {
  return {
    provider: adapter.provider,
    async listCompanies(userId, limit, opts) {
      const read = adapter.read
      if (!read) throw new Error('Ce CRM ne se relit pas encore depuis Bellum.')
      const { items, truncated } = await readPages(limit, async (after, want) => {
        const page = await read.companies(userId, {
          limit: want,
          ...(after ? { after } : {}),
          ...(opts?.since ? { since: opts.since } : {}),
        })
        return { items: page.companies, nextAfter: page.nextAfter }
      })
      const records: IncomingRecord[] = items.map(company => ({
        externalId: company.id,
        email: null,
        name: company.name,
        modifiedAt: company.modifiedAt ?? null,
        // #4603 — le SIREN voyage quand l'adaptateur le rend ; sinon la ligne reste celle d'avant.
        ...(company.siren ? { siren: company.siren } : {}),
      }))
      return { records, truncated }
    },
  }
}
