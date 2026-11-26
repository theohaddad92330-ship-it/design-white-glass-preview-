import type { CrmList, CrmSequence } from '@bellum/contracts'
import { Logger } from '@nestjs/common'
import type { DealFact } from './pipeline-report'
import type { EngagementSignals } from './lead-score'

/**
 * La profondeur CRM — listes, séquences, sociétés, import en masse, historique
 * des deals, signaux d'engagement.
 *
 * Un fichier à part du client d'origine, et non trois cents lignes de plus dans
 * `hubspot.client.ts` : ce qui est ici répond à des questions de PILOTAGE
 * (« mon pipeline », « mes leads chauds », « ma liste de prospection »), là où
 * le client d'origine répond à des questions de FICHE (« pousse ce contact »,
 * « journalise cette réunion »). Les deux ont des raisons de changer
 * différentes.
 *
 * Toutes les méthodes vérifient `res.ok` et lèvent une erreur nommée — jamais de
 * repli inventé (règle du dépôt). L'appelant décide si l'échec est fatal.
 */

const LISTS_URL = 'https://api.hubapi.com/crm/v3/lists'
const SEQUENCES_URL = 'https://api.hubapi.com/automation/v4/sequences'
const SEQUENCE_ENROLLMENTS_URL = 'https://api.hubapi.com/automation/v4/sequences/enrollments'
const OWNERS_URL = 'https://api.hubapi.com/crm/v3/owners'
const DEAL_PIPELINES_URL = 'https://api.hubapi.com/crm/v3/pipelines/deals'
const DEALS_URL = 'https://api.hubapi.com/crm/v3/objects/deals'
const COMPANIES_URL = 'https://api.hubapi.com/crm/v3/objects/companies'
const COMPANIES_BATCH_READ_URL = 'https://api.hubapi.com/crm/v3/objects/companies/batch/read'

/** #3918.a — HubSpot accepte au plus 100 identifiants par lecture en lot. */
const COMPANY_BATCH = 100

/** #3918.a — les clés de jointure deal → compte lues sur la société associée.
 *  `siren` n'est PAS une propriété standard HubSpot : un portail français la
 *  crée souvent ; absente, HubSpot l'ignore et la clé reste `null`. */
const COMPANY_KEY_PROPERTIES = ['domain', 'siren', 'name']
const CONTACTS_BATCH_UPSERT_URL = 'https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert'
const CONTACTS_SEARCH_URL = 'https://api.hubapi.com/crm/v3/objects/contacts/search'

/** `0-1` est l'identifiant HubSpot du type d'objet « contact ». */
const CONTACT_OBJECT_TYPE_ID = '0-1'

/** Une page de deals à la lecture profonde. 100 est le maximum accepté. */
const DEAL_PAGE = 100

/**
 * Borne dure de la lecture profonde.
 *
 * Un portail d'ESN porte rarement plus de quelques milliers de deals, mais la
 * borne n'est pas là pour le cas normal : elle est là pour que la lecture d'un
 * portail de 400 000 deals s'arrête et le DISE, plutôt que de tourner une heure
 * et d'épuiser le quota d'API de l'utilisateur sur un rapport qu'il regarde
 * trois secondes. `truncated` remonte jusqu'à l'écran.
 */
export const DEEP_READ_MAX_DEALS = 5_000

/** Propriétés lues sur un deal — demandées explicitement, HubSpot ne rend que
 *  ce qu'on nomme. */
const DEAL_PROPERTIES = [
  'dealname',
  'dealstage',
  'pipeline',
  'amount',
  'createdate',
  'closedate',
  'hs_is_closed',
  'hs_is_closed_won',
  'hubspot_owner_id',
  // #3918 — la dernière activité connue sur le deal, pour que « affaire
  // dormante » (crm-deal-signal-rules.ts) ne retombe sur la date de création
  // que lorsque le deal n'a VRAIMENT jamais été modifié depuis.
  'hs_lastmodifieddate',
]

/** Propriétés d'engagement. Toutes peuvent être absentes selon les fonctions
 *  activées sur le portail — d'où le `null` systématique plutôt qu'un zéro. */
const ENGAGEMENT_PROPERTIES = [
  'email',
  'firstname',
  'lastname',
  'company',
  'lastmodifieddate',
  'notes_last_contacted',
  'num_notes',
  'num_contacted_notes',
  'hs_email_open',
  'hs_email_click',
  'num_associated_deals',
  'hs_email_optout',
]

const logger = new Logger('HubspotDepth')

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; error_description?: string }
    return body?.message || body?.error_description || `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

const str = (value: unknown): string | null => (value == null || value === '' ? null : String(value))

/** Un compteur du CRM en nombre, ou `null` s'il est absent ou illisible. Ne
 *  RAMÈNE JAMAIS zéro sur une valeur absente — c'est toute la différence entre
 *  « ce contact n'a rien fait » et « on ne mesure pas ça ici ». */
function counter(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function amountOf(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** ISO d'une date HubSpot (millisecondes ou ISO selon l'endpoint), ou `null`. */
function isoOf(value: unknown): string | null {
  const raw = str(value)
  if (!raw) return null
  const asNumber = Number(raw)
  const parsed = Number.isFinite(asNumber) && raw.trim() !== '' ? asNumber : Date.parse(raw)
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString()
}

type CrmOwner = { id: string; email: string | null; name: string | null }

/** Une étape de pipeline, telle que le portail la nomme. */
type CrmStage = { id: string; label: string; isClosed: boolean | null }

export type BatchUpsertOutcome = { requested: number; written: number; errors: string[] }

export type ContactEngagement = {
  id: string
  name: string | null
  email: string | null
  company: string | null
  /** `true` quand le contact s'est désabonné CHEZ LE FOURNISSEUR. */
  optedOut: boolean
  signals: EngagementSignals
}

export class HubspotDepthClient {
  private headers(accessToken: string): Record<string, string> {
    return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
  }

  // ---- Listes (§13.3 n°27 « crée une vue filtrée », §8 rapport 2) -----------

  /** Les listes du portail, les plus récentes d'abord. */
  async listLists(accessToken: string, limit = 50): Promise<CrmList[]> {
    const res = await fetch(`${LISTS_URL}/search`, {
      method: 'POST',
      headers: this.headers(accessToken),
      body: JSON.stringify({ count: Math.min(Math.max(limit, 1), 100), offset: 0 }),
    })
    if (!res.ok) throw new Error(`HubSpot list search failed: ${await readError(res)}`)
    const data = (await res.json()) as {
      lists?: Array<{ listId?: unknown; name?: unknown; size?: unknown; processingType?: unknown }>
    }
    return (data?.lists ?? []).map(row => ({
      id: String(row.listId ?? ''),
      name: str(row.name) ?? '(sans nom)',
      size: counter(row.size),
      processingType: str(row.processingType),
    }))
  }

  /**
   * Crée une liste STATIQUE de contacts.
   *
   * `MANUAL` et non `DYNAMIC` : une liste dynamique est pilotée par des filtres
   * HubSpot que nous n'écrivons pas. Composer un filtre à l'aveugle produirait
   * une liste qui se remplit toute seule avec des fiches que personne n'a
   * choisies — l'inverse de ce que demande « crée-moi ma liste des 30 prospects
   * à appeler cette semaine ».
   */
  async createStaticList(accessToken: string, name: string): Promise<CrmList> {
    const res = await fetch(LISTS_URL, {
      method: 'POST',
      headers: this.headers(accessToken),
      body: JSON.stringify({ name, objectTypeId: CONTACT_OBJECT_TYPE_ID, processingType: 'MANUAL' }),
    })
    if (!res.ok) throw new Error(`HubSpot create list failed: ${await readError(res)}`)
    const data = (await res.json()) as { list?: { listId?: unknown; name?: unknown; processingType?: unknown } }
    return {
      id: String(data?.list?.listId ?? ''),
      name: str(data?.list?.name) ?? name,
      size: 0,
      processingType: str(data?.list?.processingType) ?? 'MANUAL',
    }
  }

  /** Ajoute des fiches à une liste statique. Rend les identifiants réellement
   *  ajoutés — HubSpot ignore silencieusement ceux qu'il ne connaît pas, et
   *  l'appelant doit pouvoir le dire. */
  async addToList(accessToken: string, listId: string, recordIds: readonly string[]): Promise<{ added: string[] }> {
    if (recordIds.length === 0) return { added: [] }
    const res = await fetch(`${LISTS_URL}/${encodeURIComponent(listId)}/memberships/add`, {
      method: 'PUT',
      headers: this.headers(accessToken),
      body: JSON.stringify(recordIds),
    })
    if (!res.ok) throw new Error(`HubSpot add to list failed: ${await readError(res)}`)
    const data = (await res.json()) as { recordIdsAdded?: unknown }
    const added = Array.isArray(data?.recordIdsAdded) ? (data.recordIdsAdded as unknown[]).map(String) : []
    return { added }
  }

  // ---- Séquences (arbitrage Louis : Bellum orchestre) -----------------------

  /**
   * Les séquences existantes du portail.
   *
   * Bellum ne CRÉE pas de séquence chez le fournisseur : l'API publique de
   * séquences est en lecture et en inscription, pas en création. Le produit a
   * déjà son propre moteur de séquences ; enrôler dans celui du CRM sert à
   * rejoindre un enchaînement que l'ESN a construit chez elle, pas à en
   * fabriquer un nouveau à l'aveugle.
   */
  async listSequences(accessToken: string, limit = 50): Promise<CrmSequence[]> {
    const res = await fetch(`${SEQUENCES_URL}?limit=${Math.min(Math.max(limit, 1), 100)}`, {
      method: 'GET',
      headers: this.headers(accessToken),
    })
    if (!res.ok) throw new Error(`HubSpot list sequences failed: ${await readError(res)}`)
    const data = (await res.json()) as { results?: Array<{ id?: unknown; name?: unknown }> }
    return (data?.results ?? []).map(row => ({ id: String(row.id ?? ''), name: str(row.name) ?? '(sans nom)' }))
  }

  /**
   * Inscrit UN contact dans une séquence du CRM.
   *
   * Un contact à la fois, délibérément : l'inscription programme des envois dans
   * un moteur qui n'est pas le nôtre et qui a ses propres règles de
   * désabonnement. Un appel par personne laisse l'appelant vérifier l'opt-out
   * des DEUX côtés avant chaque geste, et arrêter net au premier refus.
   */
  async enrollInSequence(
    accessToken: string,
    input: { sequenceId: string; contactId: string; senderEmail: string },
  ): Promise<{ id: string }> {
    const res = await fetch(SEQUENCE_ENROLLMENTS_URL, {
      method: 'POST',
      headers: this.headers(accessToken),
      body: JSON.stringify({
        sequenceId: input.sequenceId,
        contactId: input.contactId,
        senderEmail: input.senderEmail,
      }),
    })
    if (!res.ok) throw new Error(`HubSpot sequence enrollment failed: ${await readError(res)}`)
    const data = (await res.json()) as { id?: unknown }
    return { id: String(data?.id ?? '') }
  }

  // ---- Sociétés (§5.1 « créer et enrichir contacts, SOCIÉTÉS, deals ») ------

  /** Crée une société. La recherche par domaine/nom vit dans le client d'origine
   *  (`findCompanyId`) ; ici on écrit seulement, et seulement quand l'appelant a
   *  vérifié qu'elle n'existait pas. */
  async createCompany(
    accessToken: string,
    input: { name: string; domain?: string | null; industry?: string | null; city?: string | null },
  ): Promise<{ id: string }> {
    const properties: Record<string, string> = { name: input.name }
    if (input.domain) properties['domain'] = input.domain
    if (input.industry) properties['industry'] = input.industry
    if (input.city) properties['city'] = input.city
    const res = await fetch(COMPANIES_URL, {
      method: 'POST',
      headers: this.headers(accessToken),
      body: JSON.stringify({ properties }),
    })
    if (!res.ok) throw new Error(`HubSpot create company failed: ${await readError(res)}`)
    const data = (await res.json()) as { id?: unknown }
    return { id: String(data?.id ?? '') }
  }

  // ---- Import en masse (§13.3 n°13 « importer en masse un fichier ») --------

  /**
   * Écrit un lot de contacts, appariés par e-mail.
   *
   * `batch/upsert` avec `idProperty: email` : c'est HubSpot qui décide s'il met
   * à jour ou crée, en une seule requête. L'alternative — chercher puis écrire,
   * contact par contact — multiplie les appels par trois et introduit une
   * fenêtre pendant laquelle deux imports concurrents créent le doublon qu'on
   * voulait éviter.
   *
   * Un contact sans e-mail est REFUSÉ plutôt que créé : sans clé d'appariement,
   * chaque import recréerait la même personne.
   */
  async batchUpsertContacts(
    accessToken: string,
    contacts: ReadonlyArray<{
      email: string
      firstName?: string | null
      lastName?: string | null
      company?: string | null
      jobTitle?: string | null
      phone?: string | null
    }>,
  ): Promise<BatchUpsertOutcome> {
    const eligible = contacts.filter(contact => contact.email?.trim())
    if (eligible.length === 0) {
      return { requested: contacts.length, written: 0, errors: contacts.length ? ['Aucun e-mail exploitable'] : [] }
    }
    const inputs = eligible.map(contact => {
      const properties: Record<string, string> = { email: contact.email.trim() }
      if (contact.firstName) properties['firstname'] = contact.firstName
      if (contact.lastName) properties['lastname'] = contact.lastName
      if (contact.company) properties['company'] = contact.company
      if (contact.jobTitle) properties['jobtitle'] = contact.jobTitle
      if (contact.phone) properties['phone'] = contact.phone
      return { idProperty: 'email', id: contact.email.trim(), properties }
    })
    const res = await fetch(CONTACTS_BATCH_UPSERT_URL, {
      method: 'POST',
      headers: this.headers(accessToken),
      body: JSON.stringify({ inputs }),
    })
    if (!res.ok) throw new Error(`HubSpot batch upsert failed: ${await readError(res)}`)
    const data = (await res.json()) as { results?: unknown[]; errors?: Array<{ message?: unknown }> }
    const written = Array.isArray(data?.results) ? data.results.length : 0
    const errors = (data?.errors ?? []).map(error => str(error?.message) ?? 'Erreur non détaillée')
    if (eligible.length < contacts.length) {
      errors.push(`${contacts.length - eligible.length} ligne(s) sans e-mail, non écrites`)
    }
    return { requested: contacts.length, written, errors }
  }

  // ---- Lecture profonde de l'historique (arbitrage Louis 03/08) ------------

  /** Les propriétaires du portail, pour donner un NOM aux identifiants de deals. */
  async listOwners(accessToken: string): Promise<CrmOwner[]> {
    const res = await fetch(`${OWNERS_URL}?limit=100`, { method: 'GET', headers: this.headers(accessToken) })
    if (!res.ok) throw new Error(`HubSpot list owners failed: ${await readError(res)}`)
    const data = (await res.json()) as {
      results?: Array<{ id?: unknown; email?: unknown; firstName?: unknown; lastName?: unknown }>
    }
    return (data?.results ?? []).map(row => {
      const name = [str(row.firstName), str(row.lastName)].filter(Boolean).join(' ') || null
      return { id: String(row.id ?? ''), email: str(row.email), name }
    })
  }

  /** Les étapes de tous les pipelines de deals, pour traduire `dealstage` en
   *  libellé. Sans elles le rapport afficherait `appointmentscheduled`, ce que
   *  personne ne lit. */
  async listDealStages(accessToken: string): Promise<Map<string, CrmStage>> {
    const res = await fetch(DEAL_PIPELINES_URL, { method: 'GET', headers: this.headers(accessToken) })
    if (!res.ok) throw new Error(`HubSpot list pipelines failed: ${await readError(res)}`)
    const data = (await res.json()) as {
      results?: Array<{
        stages?: Array<{ id?: unknown; label?: unknown; metadata?: { isClosed?: unknown } }>
      }>
    }
    const stages = new Map<string, CrmStage>()
    for (const pipeline of data?.results ?? []) {
      for (const stage of pipeline.stages ?? []) {
        const id = String(stage.id ?? '')
        if (!id) continue
        const isClosedRaw = stage.metadata?.isClosed
        stages.set(id, {
          id,
          label: str(stage.label) ?? id,
          isClosed: isClosedRaw == null ? null : String(isClosedRaw) === 'true',
        })
      }
    }
    return stages
  }

  /**
   * Lit l'historique des deals, page par page, jusqu'à la borne.
   *
   * L'endpoint de LISTE et non celui de recherche : la recherche HubSpot plafonne
   * à 10 000 résultats cumulés et refuse de paginer au-delà, ce qui produirait un
   * historique tronqué SANS le dire. La liste pagine sans plafond, donc la seule
   * borne est la nôtre — et elle est déclarée.
   */
  async readDealHistory(
    accessToken: string,
    options: { maxDeals?: number } = {},
  ): Promise<{ deals: DealFact[]; truncated: boolean }> {
    const maxDeals = Math.min(Math.max(options.maxDeals ?? DEEP_READ_MAX_DEALS, 1), DEEP_READ_MAX_DEALS)

    // Les libellés d'étapes et les noms de propriétaires enrichissent le rapport
    // mais ne le conditionnent pas : un portail qui refuse ces portées doit
    // quand même produire ses chiffres, avec des identifiants bruts.
    let stages = new Map<string, CrmStage>()
    let owners = new Map<string, CrmOwner>()
    try {
      stages = await this.listDealStages(accessToken)
    } catch (error) {
      logger.warn('HubSpot: libellés d’étapes indisponibles, le rapport garde les identifiants bruts', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
    try {
      owners = new Map((await this.listOwners(accessToken)).map(owner => [owner.id, owner]))
    } catch (error) {
      logger.warn('HubSpot: noms de propriétaires indisponibles, le rapport garde les identifiants', {
        error: error instanceof Error ? error.message : String(error),
      })
    }

    const deals: DealFact[] = []
    let after: string | null = null
    let truncated = false

    while (deals.length < maxDeals) {
      const params = new URLSearchParams({
        limit: String(Math.min(DEAL_PAGE, maxDeals - deals.length)),
        properties: DEAL_PROPERTIES.join(','),
        archived: 'false',
        // #3918.a — la société associée au deal : la clé de jointure deal → compte.
        associations: 'companies',
      })
      if (after) params.set('after', after)
      const res: Response = await fetch(`${DEALS_URL}?${params.toString()}`, {
        method: 'GET',
        headers: this.headers(accessToken),
      })
      if (!res.ok) throw new Error(`HubSpot read deals failed: ${await readError(res)}`)
      const page = (await res.json()) as {
        results?: Array<{
          id?: unknown
          properties?: Record<string, unknown>
          associations?: { companies?: { results?: Array<{ id?: unknown }> } }
        }>
        paging?: { next?: { after?: unknown } }
      }
      for (const row of page?.results ?? []) {
        const properties = row.properties ?? {}
        const stageId = str(properties['dealstage'])
        const ownerId = str(properties['hubspot_owner_id'])
        const closedFlag = str(properties['hs_is_closed'])
        const wonFlag = str(properties['hs_is_closed_won'])
        const isClosed = closedFlag === 'true'
        deals.push({
          id: String(row.id ?? ''),
          name: str(properties['dealname']),
          stage: stageId,
          stageLabel: stageId ? (stages.get(stageId)?.label ?? null) : null,
          pipeline: str(properties['pipeline']),
          amount: amountOf(properties['amount']),
          ownerId,
          ownerName: ownerId ? (owners.get(ownerId)?.name ?? null) : null,
          createdAt: isoOf(properties['createdate']),
          closedAt: isoOf(properties['closedate']),
          lastActivityAt: isoOf(properties['hs_lastmodifieddate']),
          isClosed,
          // Ouvert ⇒ issue inconnue, pas « perdu ». Un deal en cours compté
          // comme perdu ferait chuter le taux de conversion de tout le monde.
          isWon: !isClosed ? null : wonFlag === 'true' ? true : wonFlag === 'false' ? false : null,
          // #3918.a — la PREMIÈRE société associée (HubSpot rend l'association
          // principale en tête). Aucune association : aucune clé, jamais le nom.
          companyExternalId: str(row.associations?.companies?.results?.[0]?.id),
          companySiren: null,
          companyDomain: null,
          companyName: null,
        })
      }
      const next = str(page?.paging?.next?.after)
      if (!next) break
      after = next
      if (deals.length >= maxDeals) {
        truncated = true
        break
      }
    }

    await this.attachCompanyKeys(accessToken, deals)
    return { deals, truncated }
  }

  /**
   * #3918.a — complète chaque deal avec le domaine et le SIREN de sa société
   * associée, en lots de 100. Best-effort : une lecture refusée (portée
   * `crm.objects.companies.read` absente) laisse ces deux clés à `null` — le
   * deal garde l'id société, qui suffit quand l'import CRM a posé son lien.
   * Jamais un domaine deviné depuis le nom du deal.
   */
  private async attachCompanyKeys(accessToken: string, deals: DealFact[]): Promise<void> {
    const ids = [...new Set(deals.map(deal => deal.companyExternalId).filter((id): id is string => Boolean(id)))]
    if (ids.length === 0) return
    const keys = new Map<string, { domain: string | null; siren: string | null; name: string | null }>()
    try {
      for (let i = 0; i < ids.length; i += COMPANY_BATCH) {
        const res = await fetch(COMPANIES_BATCH_READ_URL, {
          method: 'POST',
          headers: this.headers(accessToken),
          body: JSON.stringify({
            properties: COMPANY_KEY_PROPERTIES,
            inputs: ids.slice(i, i + COMPANY_BATCH).map(id => ({ id })),
          }),
        })
        if (!res.ok) throw new Error(`HubSpot read companies failed: ${await readError(res)}`)
        const page = (await res.json()) as { results?: Array<{ id?: unknown; properties?: Record<string, unknown> }> }
        for (const company of page?.results ?? []) {
          const id = str(company.id)
          if (!id) continue
          keys.set(id, {
            domain: str(company.properties?.['domain']),
            siren: str(company.properties?.['siren']),
            name: str(company.properties?.['name']),
          })
        }
      }
    } catch (error) {
      logger.warn('HubSpot: clés société (domaine, SIREN) indisponibles — les deals gardent leur id société', {
        error: error instanceof Error ? error.message : String(error),
      })
      return
    }
    for (const deal of deals) {
      const company = deal.companyExternalId ? keys.get(deal.companyExternalId) : undefined
      if (!company) continue
      deal.companyDomain = company.domain
      deal.companySiren = company.siren
      deal.companyName = company.name
    }
  }

  // ---- Signaux d'engagement (§13.3 n°8/11/35) ------------------------------

  /**
   * Les contacts récemment modifiés, avec leurs compteurs d'engagement.
   *
   * Trié par date de modification décroissante : scorer « les leads chauds »
   * suppose de regarder ceux qui ont bougé, pas les cinq cents premiers de
   * l'ordre alphabétique.
   */
  async readEngagement(accessToken: string, limit = 100): Promise<ContactEngagement[]> {
    const res = await fetch(CONTACTS_SEARCH_URL, {
      method: 'POST',
      headers: this.headers(accessToken),
      body: JSON.stringify({
        filterGroups: [],
        properties: ENGAGEMENT_PROPERTIES,
        sorts: [{ propertyName: 'lastmodifieddate', direction: 'DESCENDING' }],
        limit: Math.min(Math.max(limit, 1), 200),
      }),
    })
    if (!res.ok) throw new Error(`HubSpot engagement read failed: ${await readError(res)}`)
    const data = (await res.json()) as {
      results?: Array<{ id?: unknown; properties?: Record<string, unknown> }>
    }
    const now = Date.now()
    return (data?.results ?? []).map(row => {
      const properties = row.properties ?? {}
      const name = [str(properties['firstname']), str(properties['lastname'])].filter(Boolean).join(' ') || null
      const lastTouch = isoOf(properties['notes_last_contacted']) ?? isoOf(properties['lastmodifieddate'])
      const lastTouchMs = lastTouch ? Date.parse(lastTouch) : Number.NaN
      return {
        id: String(row.id ?? ''),
        name,
        email: str(properties['email']),
        company: str(properties['company']),
        optedOut: str(properties['hs_email_optout']) === 'true',
        signals: {
          daysSinceLastActivity: Number.isNaN(lastTouchMs)
            ? null
            : Math.max(0, Math.floor((now - lastTouchMs) / 86_400_000)),
          notes: counter(properties['num_notes']),
          contacted: counter(properties['num_contacted_notes']),
          emailOpens: counter(properties['hs_email_open']),
          emailClicks: counter(properties['hs_email_click']),
          associatedDeals: counter(properties['num_associated_deals']),
        },
      }
    })
  }

  /**
   * L'e-mail et l'état de désabonnement d'UNE fiche, en un seul appel.
   *
   * Les deux ensemble et non deux méthodes : la vérification d'opt-out en
   * demande toujours les deux — celui du fournisseur (`hs_email_optout`) et,
   * via l'e-mail, celui de Bellum. Deux appels par contact doubleraient la
   * latence d'une inscription de cinquante personnes pour rien.
   *
   * `null` quand la fiche est introuvable — ce qui n'est PAS « il accepte ».
   */
  async readContactState(
    accessToken: string,
    contactId: string,
  ): Promise<{ email: string | null; optedOut: boolean } | null> {
    const params = new URLSearchParams({ properties: 'hs_email_optout,email' })
    const res = await fetch(
      `https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(contactId)}?${params.toString()}`,
      { method: 'GET', headers: this.headers(accessToken) },
    )
    if (!res.ok) {
      if (res.status === 404) return null
      throw new Error(`HubSpot contact read failed: ${await readError(res)}`)
    }
    const data = (await res.json()) as { properties?: Record<string, unknown> }
    return {
      email: str(data?.properties?.['email']),
      optedOut: str(data?.properties?.['hs_email_optout']) === 'true',
    }
  }
}
