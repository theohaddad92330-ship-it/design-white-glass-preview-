import type {
  AccountContactsPerimeterResponse,
  ContactPerimeter,
  ContactSendChannel,
  SendResolution,
  ApolloEnrichmentData,
  AssignContactsInput,
  BulkImportContact,
  BulkImportContactsResponse,
  BulkVerifyOutcome,
  ClassifyContactInput,
  ClassifyContactsResponse,
  Contact,
  ContactAssignmentResult,
  ContactBadgeCounters,
  ContactAssociations,
  ContactCrmExports,
  ContactPreflight,
  RecordContactCrmExport,
  EngagementDraftChannel,
  EngagementDraftSnapshot,
  ContactCadence,
  ContactSendability,
  ContactSendAttachmentProof,
  ContactLifecycleHistory,
  ContactStop,
  ContactStopReason,
  ContactEmailDraftMailbox,
  ContactListItem,
  ContactListQuery,
  ContactListResponse,
  ContactRankingQuery,
  ContactRankingResponse,
  ContactRecommendationAuthorizableReason,
  ContactStats,
  ContactDeliverability,
  ContactFollowUpStats,
  ContactSolicitationsResponse,
  ContactStatus,
  CreateContactFromCrmInput,
  CreateContactFromCrmResult,
  CreateIntroductionAuthorization,
  CrmConfrontationResult,
  EnrichJobAccepted,
  EnrichJobStatus,
  EnrichmentCoordinate,
  IntroductionAuthorizationItem,
  PersonErasureResult,
  SearchPeopleByNameResult,
} from '@bellum/contracts'
import { i18n } from '@/i18n'

// `ApiError` vient d'ici (et non de `@/lib/api-error`) pour que ce soit LA même
// classe que celle levée par `apiFetch` : les appelants branchent sur
// `instanceof ApiError` pour localiser un échec, et deux classes équivalentes
// mais distinctes casseraient ce test silencieusement.
import { ApiError, apiFetch } from '@/lib/api'

type DuplicateContactView = {
  id: string
  fullName: string | null
  email: string | null
  phone: string | null
  title: string | null
}
type DuplicateProposalsResult = {
  pairs: {
    left: DuplicateContactView
    right: DuplicateContactView
    score: number
    reasons: string[]
    /** #4114.4 — `same` = déjà confirmée par un humain (rien n'est fusionné) ; absent/null = à trancher. */
    decision?: 'same' | null
  }[]
  /** #4600 — UNE adresse partagée = UN bloc, jamais N(N-1)/2 paires. Absent d'une réponse antérieure. */
  shared_email_groups?: {
    email: string
    reason: 'generic_mailbox' | 'shared_by_many' | 'unverified'
    contacts: DuplicateContactView[]
  }[]
}

/** Listing-only projection that joins `accounts.company_name` server-side. */
export type GlobalContact = ContactListItem

/** Résultat d'un enrichissement abouti — email/téléphone résolus + le solde de
 *  crédits après débit. Inchangé : c'est ce que rendait le POST synchrone, c'est
 *  ce que porte désormais l'état `done` du job. */
export type EnrichContactResponse = Contact & {
  enrichment: ApolloEnrichmentData
  credits_remaining: number
  /** J1b #3822 — les crédits RÉELLEMENT débités (0 quand rien n'a été trouvé) ; absent = non mesuré. */
  credits_debited?: number
}

/** Rythme du suivi. 1,5 s est assez fin pour que l'attente reste vivante, assez
 *  large pour qu'une cascade d'une minute ne fasse pas 60 requêtes ; le plafond
 *  couvre le pire cas mesuré (~85 s) avec de la marge, sans laisser un bouton
 *  filer indéfiniment si un worker meurt en cours de route. */
const ENRICH_POLL_INTERVAL_MS = 1_500
const ENRICH_POLL_MAX_MS = 150_000

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Suit le job jusqu'à son terme.
 *
 * `unknown` (plus aucune trace du job) n'est pas traité comme « rien trouvé » :
 * c'est nous qui avons perdu la réponse, et le dire autrement mentirait sur le
 * contact. Même chose pour l'expiration du suivi — le job continue peut-être
 * côté serveur, donc le message invite à revenir, pas à conclure.
 */
export async function pollEnrichment(contactId: string): Promise<EnrichContactResponse> {
  const deadline = Date.now() + ENRICH_POLL_MAX_MS
  for (;;) {
    const status = await apiFetch<EnrichJobStatus<EnrichContactResponse>>({
      path: `/contacts/${contactId}/enrichment`,
    })
    if (status.state === 'done') return status.result
    if (status.state !== 'queued' && status.state !== 'running') {
      // `unknown` — ou un état qu'on ne sait pas lire. Dans les deux cas c'est
      // NOTRE réponse qui manque, pas une information sur le contact : on
      // s'arrête au lieu de tourner en attendant un état qui ne viendra pas.
      throw new ApiError(i18n.t('contacts:enrich.error.resultLost'), 404, 'upstream_error')
    }
    if (Date.now() >= deadline) {
      throw new ApiError(i18n.t('contacts:enrich.error.stillRunning'), 504, 'upstream_error')
    }
    await wait(ENRICH_POLL_INTERVAL_MS)
  }
}

/** The exact email copy the seller reviewed before hitting « Envoyer ». Sent to
 *  `POST /contacts/:id/send-email` so what leaves == what was on screen. */
export type ContactEmailDraft = {
  subject?: string
  body: string
}

/** Server response from `POST /contacts/:id/send-email` (Palier 1). */
export type SendContactEmailResponse = {
  contact_id: string
  sent_to: string
  email_sent_at: string
  /** #3699 — par où le message est parti et depuis quelle adresse, lus à la source de l'envoi. */
  channel: ContactSendChannel
  sent_from: string | null
  /** « Pris en charge » : le transport a accepté. Jamais « livré » ni « lu ». */
  state: 'handed_off'
  /** #3699.6 — les pièces parties avec le message : nom, taille, empreinte. Jamais le contenu. */
  attachments: ContactSendAttachmentProof[]
}

/** Per-contact skip reason from the bulk send — mirrors the server's
 *  `ContactFailureCode`. Kept as a string union so the UI can label each case. */
export type BulkSendSkipReason =
  | 'not_found'
  | 'no_email'
  | 'no_draft'
  | 'already_sent'
  | 'send_failed'
  | 'suppressed'
  | 'insufficient_credits'
  | 'update_failed'
  | 'send_in_progress'
  | 'send_uncertain'
  | 'demo_send_blocked'

/** Server response from `POST /contacts/send-email/bulk` — each contact is
 *  handled independently (opt-out / already-sent land in `skipped`). */
export type BulkSendEmailResponse = {
  sent: { contact_id: string; sent_to: string }[]
  skipped: { contact_id: string; reason: BulkSendSkipReason }[]
}

type ContactsPageQuery = ContactListQuery & { offset: number; limit: number }

/**
 * La chaîne de requête de `GET /contacts`.
 *
 * ⚠️ C'est une LISTE BLANCHE, et c'est là que trois filtres se sont perdus.
 * Mesuré en production le 04/09/2026 : le serveur honorait `state`
 * (187 sur 257), `includeExcluded` (258) et `unassigned` (0), pendant que
 * l'écran rendait ses 25 lignes non filtrées sous chacun d'eux. Rien
 * n'échouait : le paramètre ne partait simplement pas.
 *
 * `state` était pourtant documenté « filtré SERVER-side » à trois endroits, et
 * `visibleContacts` ne filtre que par VUE — donc la pastille de cycle de vie ne
 * filtrait rien depuis le début.
 *
 * `api.query-string.test.ts` compare désormais cette fonction aux clés du
 * contrat et NOMME celle qu'on oublierait. Ajouter un filtre au contrat sans sa
 * ligne ici fait rougir la CI.
 */
function buildQueryString(filters: ContactListQuery): string {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  // `all` est le libellé « pas de filtre », pas une valeur à transmettre.
  if (filters.role && filters.role !== 'all') params.set('role', filters.role)
  // #2158.60 — la famille métier. Même convention que `role` : `all` ne part pas.
  if (filters.family && filters.family !== 'all') params.set('family', filters.family)
  if (filters.company) params.set('company', filters.company)
  // #2159.26 — l'étiquette, normalisée côté serveur.
  if (filters.tag) params.set('tag', filters.tag)
  if (filters.channel) params.set('channel', filters.channel)
  // #1473 — la file « à qualifier » : les contacts sans entreprise connue.
  if (filters.unassigned) params.set('unassigned', 'true')
  // #4599 — les contacts dont l'e-mail est un gabarit (`prenom.nom@…`), compté côté serveur. Présent-ou-absent.
  if (filters.placeholderEmail) params.set('placeholderEmail', 'true')
  // Les contacts ÉCARTÉS. Un booléen faux n'est pas un filtre : on ne
  // transmet que la demande explicite de les inclure.
  if (filters.includeExcluded) params.set('includeExcluded', 'true')
  // La pastille de cycle de vie. Elle annonce un total d'ESPACE, donc le clic
  // doit paginer sur ce total — ce qui n'est possible que côté serveur.
  if (filters.state) params.set('state', filters.state)
  if (filters.dormantMonths) params.set('dormantMonths', String(filters.dormantMonths))
  // #2158.67 — la fraîcheur de la fiche (`contact.updated_at`), distincte de `dormantMonths`.
  if (filters.updatedWithinMonths !== undefined) params.set('updatedWithinMonths', String(filters.updatedWithinMonths))
  // #2158.61 — la ville/le pays (`contact.location`, ILIKE).
  if (filters.location) params.set('location', filters.location)
  // #2158.57 — l'entité déclarée par le contact (`contact.entity`, ILIKE).
  if (filters.entity) params.set('entity', filters.entity)
  // #2158.58 — la fonction du contact (`contact.title`, ILIKE).
  if (filters.title) params.set('title', filters.title)
  // #2158.65 — le porteur du contact (`contact.assigned_to`, égalité).
  if (filters.assignedTo) params.set('assignedTo', filters.assignedTo)
  // #1903.15 — le compte discuté en conversation (`contact.account_id`, égalité exacte).
  if (filters.accountId) params.set('accountId', filters.accountId)
  // #2158.68 — la cible (`target_list_items.contact_id`, égalité exacte).
  if (filters.targetListId) params.set('targetListId', filters.targetListId)
  // #2294.2 — le secteur du compte (`accounts.sector`, ILIKE).
  if (filters.sector) params.set('sector', filters.sector)
  // #2294.2 — groupe ou filiale (`accounts.group_role`, égalité).
  if (filters.groupRole) params.set('groupRole', filters.groupRole)
  // #2294.2 — fraîcheur min de la collecte de contacts (`accounts.contacts_collected_at`).
  if (filters.contactsFreshWithinMonths !== undefined)
    params.set('contactsFreshWithinMonths', String(filters.contactsFreshWithinMonths))
  // #2834 (#2106.24) — les contacts « a changé d'employeur » (`RISQUE`).
  if (filters.sourceTag) params.set('sourceTag', filters.sourceTag)
  // #4597.3 — les contacts de CET import (identifiant du job, jamais sa date).
  if (filters.importJob) params.set('importJob', filters.importJob)
  // #2158.66 — la source (`contact.source`). Même convention que `family` :
  // `all` ne part pas.
  if (filters.source && filters.source !== 'all') params.set('source', filters.source)
  // #2158.59 — le niveau (`computeHierarchyLevel(contact.title)`). Même
  // convention que `family`/`source` : `all` ne part pas.
  if (filters.hierarchyLevel && filters.hierarchyLevel !== 'all') params.set('hierarchyLevel', filters.hierarchyLevel)
  // #2158.14 (#2997) — la vue « Sans prochaine action », posée en filtre.
  // Même geste qu'`unassigned` : un booléen faux n'est pas un filtre.
  if (filters.withoutNextAction) params.set('withoutNextAction', 'true')
  // #2158.69 (#2997) — la nature de la dernière activité échangée.
  if (filters.lastActivityKind) params.set('lastActivityKind', filters.lastActivityKind)
  // #3718 — le statut déclaré (« Répondu »…), filtré SERVEUR.
  if (filters.userStatus) params.set('userStatus', filters.userStatus)
  // #3942.2 — la portée « Recommandés », filtrée CÔTÉ SERVEUR (recette prod
  // 09/10, #3942). Même convention que `role`/`family`/`source` : `all` est
  // le libellé « pas de filtre », il ne part pas.
  if (filters.recommendedScope && filters.recommendedScope !== 'all')
    params.set('recommendedScope', filters.recommendedScope)
  // #4982.1 — le tri « zone » (proche d'abord), fait EN SQL : absent ⇒ le plus récent d'abord.
  if (filters.sort) params.set('sort', filters.sort)
  if (filters.offset !== undefined) params.set('offset', String(filters.offset))
  if (filters.limit !== undefined) params.set('limit', String(filters.limit))
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

/**
 * #2120.57 / #2297.23 — une latence du PRODUIT, jamais une donnée d'espace :
 * la médiane agrège tous les espaces, elle ne porte aucun contenu, aucun nom,
 * aucun coût. `null` sous 5 mesures (non mesuré ≠ 0, GA-18/19).
 */
export type EnrichmentDurationEstimate = {
  medianMs: number
  sampleSize: number
} | null

export const contactsApi = {
  /** #2159.26 — les étiquettes EN USAGE sur les contacts, pour la `FilterBar`. */
  listTags(): Promise<string[]> {
    return apiFetch<string[]>({ path: '/contacts/tags' })
  },
  getStats(): Promise<ContactStats> {
    return apiFetch<ContactStats>({ path: '/contacts/stats' })
  },
  /** #2384.5 — délivrabilité (bounce/raisons), distincte du taux d'envoi. */
  getDeliverability(): Promise<ContactDeliverability> {
    return apiFetch<ContactDeliverability>({ path: '/contacts/deliverability' })
  },
  /** #2842 (reste, 26/09) — `contactFollowUps` de l'audit commercial. */
  getFollowUpStats(): Promise<ContactFollowUpStats> {
    return apiFetch<ContactFollowUpStats>({ path: '/contacts/follow-up-stats' })
  },
  enrichmentDurationEstimate(): Promise<{ estimate: EnrichmentDurationEstimate }> {
    return apiFetch<{ estimate: EnrichmentDurationEstimate }>({ path: '/contacts/enrichment-duration-estimate' })
  },
  /** #2155.24/.25 — le badge de navigation « Contacts ». `readyToProcess` est
   *  ABSENT (jamais `0`) quand la mesure échoue ou que la population est
   *  vide — voir `contactBadgeCountersSchema`. */
  getBadgeCounters(): Promise<ContactBadgeCounters> {
    return apiFetch<ContactBadgeCounters>({ path: '/contacts/counts/ready-to-process' })
  },
  /** #2386.6 — la collision de sollicitation (#2128.17), groupée : UN appel
   *  pour toute une session plutôt qu'un par contact. Clé = id du contact ;
   *  un id absent de la réponse n'a pas pu être vérifié (jamais un `null`
   *  deviné). */
  solicitations(contactIds: readonly string[]): Promise<ContactSolicitationsResponse> {
    return apiFetch<ContactSolicitationsResponse, { contact_ids: readonly string[] }>({
      path: '/contacts/solicitations',
      method: 'POST',
      body: { contact_ids: contactIds },
    })
  },
  listAll(filters: ContactListQuery = {}): Promise<ContactListResponse> {
    return apiFetch<ContactListResponse>({ path: `/contacts${buildQueryString(filters)}` })
  },
  listPage(filters: ContactsPageQuery): Promise<ContactListResponse> {
    return apiFetch<ContactListResponse>({ path: `/contacts${buildQueryString(filters)}` })
  },
  listByAccount(accountId: string): Promise<Contact[]> {
    return apiFetch<Contact[]>({ path: `/contacts/account/${accountId}` })
  },
  /**
   * #4996 L6 — la liste du compte VUE DEPUIS LE PÉRIMÈTRE du lecteur (`mine` filtre, `all` ordonne). Le calcul est
   * côté serveur ; `outside_perimeter_count` vaut `null` quand le lecteur n'a posé aucune zone d'entité.
   */
  listByAccountPerimeter(
    accountId: string,
    perimeter: ContactPerimeter,
  ): Promise<AccountContactsPerimeterResponse<Contact>> {
    return apiFetch<AccountContactsPerimeterResponse<Contact>>({
      path: `/contacts/account/${accountId}?perimeter=${perimeter}`,
    })
  },
  /**
   * #2120.30-38 — le chemin recommandé, classé CÔTÉ API. Les trois choix partent
   * chacun explicitement : une liste blanche qui en avalerait un changerait la
   * clé de cache sans changer l'URL, et l'ordre ne bougerait jamais.
   */
  rankByAccount(accountId: string, query: ContactRankingQuery = {}): Promise<ContactRankingResponse> {
    const params = new URLSearchParams()
    if (query.perimeter) params.set('perimeter', query.perimeter)
    if (query.subject) params.set('subject', query.subject)
    if (query.offer) params.set('offer', query.offer)
    const qs = params.toString()
    return apiFetch<ContactRankingResponse>({ path: `/contacts/account/${accountId}/ranking${qs ? `?${qs}` : ''}` })
  },
  /**
   * #2120.48 — « Confronter avec mon CRM », sur le dernier instantané déjà en
   * base (décision Louis 18/09/2026). Lecture pure, aucun appel au CRM.
   */
  crmConfrontation(accountId: string): Promise<CrmConfrontationResult> {
    return apiFetch<CrmConfrontationResult>({ path: `/contacts/account/${accountId}/crm-confrontation` })
  },
  /**
   * LOIC-FIX2 O.5 — #4114 : les paires de fiches PROBABLEMENT identiques d'un compte. Lecture pure : on propose,
   * on ne fusionne jamais.
   */
  duplicateProposals(accountId: string): Promise<DuplicateProposalsResult> {
    return apiFetch<DuplicateProposalsResult>({ path: `/contacts/account/${accountId}/duplicate-proposals` })
  },
  /**
   * #4114.4 — « ce sont les mêmes » (`same`) / « pas les mêmes » (`not_same`) sur une paire PROPOSÉE. Enregistre la
   * décision de l'humain ; ne fusionne JAMAIS.
   */
  decideDuplicate(
    accountId: string,
    body: { leftId: string; rightId: string; decision: 'same' | 'not_same' },
  ): Promise<{ decision: 'same' | 'not_same' }> {
    return apiFetch<{ decision: 'same' | 'not_same' }, typeof body>({
      path: `/contacts/account/${accountId}/duplicate-proposals/decision`,
      method: 'POST',
      body,
    })
  },
  /**
   * #2727 — « je tape un nom, je vois les homonymes, je choisis ». Recherche
   * GRATUITE (tier Apollo People-Search) : aucun crédit débité ici, le reveal
   * reste un geste payant séparé sur l'homonyme choisi.
   */
  searchByName(fullName: string, organizationName?: string): Promise<SearchPeopleByNameResult> {
    const params = new URLSearchParams({ fullName })
    if (organizationName?.trim()) params.set('organizationName', organizationName.trim())
    return apiFetch<SearchPeopleByNameResult>({ path: `/contacts/search-by-name?${params.toString()}` })
  },
  /** Bulk-create manually-imported (CSV) contacts on an account. */
  bulkImport(accountId: string, contacts: BulkImportContact[]): Promise<BulkImportContactsResponse> {
    return apiFetch<BulkImportContactsResponse, { contacts: BulkImportContact[] }>({
      path: `/accounts/${accountId}/contacts/bulk`,
      method: 'POST',
      body: { contacts },
    })
  },
  /**
   * #1995 — la fiche d'une personne que seul le CRM connecté connaît, créée sur
   * le CLIC de l'utilisateur depuis une carte de Laura. Le serveur refuse le
   * doublon (e-mail puis nom) et l'ambiguïté : les trois issues arrivent telles
   * quelles, une ambiguïté n'est pas une erreur.
   */
  createFromCrm(accountId: string, input: CreateContactFromCrmInput): Promise<CreateContactFromCrmResult> {
    return apiFetch<CreateContactFromCrmResult, CreateContactFromCrmInput>({
      path: `/accounts/${accountId}/contacts/from-crm`,
      method: 'POST',
      body: input,
    })
  },
  /** "Liste perso" — deterministically clean + classify a pasted list (family /
   *  decision level / relevance 1-5 / exclusion reason) for the rep to review
   *  before importing. Read-only: nothing is persisted. */
  classify(accountId: string, contacts: ClassifyContactInput[]): Promise<ClassifyContactsResponse> {
    return apiFetch<ClassifyContactsResponse, { contacts: ClassifyContactInput[] }>({
      path: `/accounts/${accountId}/contacts/classify`,
      method: 'POST',
      body: { contacts },
    })
  },
  getOne(id: string): Promise<Contact> {
    return apiFetch<Contact>({ path: `/contacts/${id}` })
  },
  /** Moteur de cadence multi-touch (Drive #8) — le calendrier de relance du
   *  contact (J+1 → J+3 → J+6 → J+9) + la prochaine action. */
  getCadence(id: string): Promise<ContactCadence> {
    return apiFetch<ContactCadence>({ path: `/contacts/${id}/cadence` })
  },
  /** #3712 — les dossiers associés à la personne (compte, entité, projets, besoins, missions). */
  getAssociations(id: string): Promise<ContactAssociations> {
    return apiFetch<ContactAssociations>({ path: `/contacts/${id}/associations` })
  },
  /**
   * #3219 (#190.2 côté contact, décision Louis 11/10) — le contrôle AVANT une
   * action : ce qui diffère selon la source ou le périmètre. Le MÊME calcul que
   * Laura lit (`get_contact_preflight`), jamais refait ici.
   */
  getPreflight(id: string): Promise<ContactPreflight> {
    return apiFetch<ContactPreflight>({ path: `/contacts/${id}/preflight` })
  },
  /** #3719.4 — où et quand la personne a été exportée vers un CRM (survit au rechargement). */
  getCrmExports(id: string): Promise<ContactCrmExports> {
    return apiFetch<ContactCrmExports>({ path: `/contacts/${id}/crm-exports` })
  },
  /** #3719.4 — consigne un export RÉUSSI ; une ligne par (contact, destination). */
  recordCrmExport(id: string, provider: string, body: RecordContactCrmExport): Promise<ContactCrmExports> {
    return apiFetch<ContactCrmExports, RecordContactCrmExport>({
      path: `/contacts/${id}/crm-exports/${provider}`,
      method: 'PUT',
      body,
    })
  },
  /** #3694.7 — le brief confirmé et le fil qui le porte, relus à la réouverture (y compris après rechargement). */
  getEngagementDraft(id: string, channel: EngagementDraftChannel): Promise<EngagementDraftSnapshot | null> {
    return apiFetch<EngagementDraftSnapshot | null>({ path: `/contacts/${id}/engagement-draft/${channel}` })
  },
  /** #3694.7 — enregistre le cliché courant (debounced côté appelant) : pas un historique, l'état du brouillon. */
  saveEngagementDraft(id: string, channel: EngagementDraftChannel, body: EngagementDraftSnapshot): Promise<null> {
    return apiFetch<null, EngagementDraftSnapshot>({
      path: `/contacts/${id}/engagement-draft/${channel}`,
      method: 'PUT',
      body,
    })
  },
  /** « Puis-je envoyer un email à ce contact ? » — l'opt-out vit côté serveur,
   *  le panneau d'approche l'interroge pour bloquer AVANT la rédaction. */
  getSendability(id: string): Promise<ContactSendability> {
    return apiFetch<ContactSendability>({ path: `/contacts/${id}/sendability` })
  },
  /** Lifecycle journal — l'état persisté du contact + l'historique de ses
   *  passages (détecté le … / vérifié le … / enrichi le …), source + date. */
  getLifecycle(id: string): Promise<ContactLifecycleHistory> {
    return apiFetch<ContactLifecycleHistory>({ path: `/contacts/${id}/lifecycle` })
  },
  /**
   * « Cette personne a-t-elle demandé qu'on cesse ? » — `null` quand non.
   *
   * `null` et non un objet à faux : « aucun refus » et « un refus levé » ne se
   * confondent pas, et le serveur tient déjà cette distinction.
   */
  getStop(id: string): Promise<ContactStop | null> {
    return apiFetch<ContactStop | null>({ path: `/contacts/${id}/stop` })
  },
  /**
   * Déclarer le refus. Sans levée : il n'existe aucune route pour le retirer
   * (décision D351 — défaire un refus est un geste dont le titulaire est la
   * personne, pas nous), donc aucun écran ne doit en proposer une.
   */
  recordStop(id: string, body: { reason: ContactStopReason; note?: string }): Promise<ContactStop> {
    return apiFetch<ContactStop, { reason: ContactStopReason; note?: string }>({
      path: `/contacts/${id}/stop`,
      method: 'POST',
      body,
    })
  },
  /**
   * #2373.9 — la preuve d'autorisation d'une introduction, dans le temps.
   * `granted: false` (un refus) est une réponse valide, pas moins qu'un accord.
   */
  getIntroductionAuthorizations(id: string): Promise<IntroductionAuthorizationItem[]> {
    return apiFetch<{ items: IntroductionAuthorizationItem[] }>({
      path: `/contacts/${id}/introduction-authorizations`,
    }).then(res => res.items)
  },
  recordIntroductionAuthorization(
    id: string,
    body: CreateIntroductionAuthorization,
  ): Promise<IntroductionAuthorizationItem> {
    return apiFetch<{ item: IntroductionAuthorizationItem }, CreateIntroductionAuthorization>({
      path: `/contacts/${id}/introduction-authorizations`,
      method: 'POST',
      body,
    }).then(res => res.item)
  },
  updateStatus(id: string, user_status: ContactStatus): Promise<Contact> {
    return apiFetch<Contact, { user_status: ContactStatus }>({
      path: `/contacts/${id}/status`,
      method: 'PATCH',
      body: { user_status },
    })
  },
  /**
   * #2160.58 — déclarer la confirmation positive « bon contact ». Symétrique
   * de `recordStop` : aucun corps, aucune levée exposée (c'est une
   * déclaration, pas une bascule).
   */
  confirmIdentity(id: string): Promise<Contact> {
    return apiFetch<Contact>({ path: `/contacts/${id}/identity-confirmed`, method: 'POST' })
  },
  /**
   * #2160.60 — « Autoriser la recommandation », sur la fiche : lève un doute
   * d'identité (`homonym_conflict` / `entity_mismatch`) à la porte
   * d'éligibilité du classement. Réversible via `revokeRecommendationAuthorization`.
   */
  authorizeRecommendation(id: string, reason: ContactRecommendationAuthorizableReason): Promise<Contact> {
    return apiFetch<Contact, { reason: ContactRecommendationAuthorizableReason }>({
      path: `/contacts/${id}/recommendation-authorization`,
      method: 'POST',
      body: { reason },
    })
  },
  revokeRecommendationAuthorization(id: string): Promise<Contact> {
    return apiFetch<Contact>({ path: `/contacts/${id}/recommendation-authorization`, method: 'DELETE' })
  },
  /**
   * #3942.2 — « Préparer un e-mail par personne » : écrit `email_message`
   * SANS envoyer. Statut préparé, jamais envoyé (doctrine : le copilote
   * prépare, le commercial envoie).
   */
  saveEmailDraft(
    id: string,
    draft: { subject?: string; body: string },
  ): Promise<Contact & { mailbox_draft?: ContactEmailDraftMailbox }> {
    // #4412 — `mailbox_draft` dit ce qui s'est passé chez le fournisseur (Gmail / Outlook).
    return apiFetch<Contact & { mailbox_draft?: ContactEmailDraftMailbox }, { subject?: string; body: string }>({
      path: `/contacts/${id}/email-draft`,
      method: 'PATCH',
      body: draft,
    })
  },
  /** Soft-hide (or un-hide) a contact from the default list. */
  setHidden(id: string, hidden: boolean): Promise<Contact> {
    return apiFetch<Contact, { hidden: boolean }>({
      path: `/contacts/${id}/hidden`,
      method: 'PATCH',
      body: { hidden },
    })
  },
  /**
   * Enrichit un contact — et attend le résultat, comme avant côté appelant.
   *
   * Ce qui a changé dessous : la cascade fournisseur (Apollo → SalesQL →
   * Dropcontact, 30 à 85 s) ne tient plus dans UNE requête HTTP laissée ouverte.
   * Le POST met en file et rend la main ; on suit ensuite un job côté serveur.
   * Le bénéfice n'est pas cosmétique — un proxy qui coupait, un redéploiement, un
   * onglet mis en veille faisaient perdre à l'utilisateur un résultat DÉJÀ payé.
   *
   * Les erreurs sortent inchangées : l'endpoint de suivi rejoue l'échec en statut
   * HTTP (402 crédits, 409 cooldown, 502 fournisseur…), donc `apiFetch` produit la
   * même `ApiError` — avec son `code` — que l'appel synchrone d'avant.
   */
  async enrich(
    id: string,
    body: {
      first_name: string
      last_name?: string
      organization_name: string
      force?: boolean
      /** #2988.1 — coordonnée seule (email pro OU téléphone pro) ; absent = les deux. */
      only?: EnrichmentCoordinate
    },
  ): Promise<EnrichContactResponse> {
    // 202 — le job est en file (ou déjà en vol si un clic précédent l'a lancé :
    // même contact ⇒ même job, jamais deux cascades payées en parallèle).
    await apiFetch<EnrichJobAccepted, typeof body>({
      path: `/contacts/${id}/enrich`,
      method: 'POST',
      body,
    })
    return pollEnrichment(id)
  },
  /** #AM.39 — les contacts dont un enrichissement attend ou tourne (index serveur, lecture seule). */
  enrichmentInFlight(): Promise<{ contacts: Array<{ contactId: string; only?: EnrichmentCoordinate }> }> {
    return apiFetch({ path: '/contacts/enrichment/in-flight' })
  },
  /** #4063.1 — état du job d'enrichissement en vol, sans rien lancer ni débiter. */
  enrichmentStatus(id: string): Promise<EnrichJobStatus<EnrichContactResponse>> {
    return apiFetch<EnrichJobStatus<EnrichContactResponse>>({ path: `/contacts/${id}/enrichment` })
  },
  /**
   * Palier 1 — sends the contact's drafted email via Resend.
   *
   * `draft` carries the copy the seller actually reviewed on screen (the
   * engagement panel generates live and never persists). Omitted, the server
   * falls back to the stored `email_message` written by the analysis.
   */
  sendEmail(
    id: string,
    draft?: ContactEmailDraft,
    channel?: ContactSendChannel,
    /** #3699.6 — les documents CHOISIS par le commercial (identifiants d'assets). */
    attachmentAssetIds: readonly string[] = [],
    /** #4546.5 — la boîte connectée CHOISIE parmi les siennes ; absente = la boîte par défaut d'avant. */
    senderConnectionId?: string,
  ): Promise<SendContactEmailResponse> {
    return apiFetch<
      SendContactEmailResponse,
      {
        draft?: ContactEmailDraft
        channel?: ContactSendChannel
        attachment_asset_ids?: string[]
        sender_connection_id?: string
      }
    >({
      path: `/contacts/${id}/send-email`,
      method: 'POST',
      body: {
        draft,
        ...(channel ? { channel } : {}),
        ...(attachmentAssetIds.length ? { attachment_asset_ids: [...attachmentAssetIds] } : {}),
        ...(senderConnectionId ? { sender_connection_id: senderConnectionId } : {}),
      },
    })
  },
  /** #3699.5 — la personne a VÉRIFIÉ sa boîte d'envoi après une tentative incertaine. */
  resolveSendAttempt(id: string, outcome: SendResolution['outcome']): Promise<{ contact_id: string; state: string }> {
    return apiFetch<{ contact_id: string; state: string }, SendResolution>({
      path: `/contacts/${id}/send-resolution`,
      method: 'POST',
      body: { outcome },
    })
  },
  /** #4418.1 — « Marquer envoyé » : le commercial a envoyé lui-même (déclaratif) ; planifie les relances. */
  declareSent(
    id: string,
    channel: 'email' | 'linkedin',
    sentOn?: string,
  ): Promise<{ contact_id: string; declared: true }> {
    return apiFetch<{ contact_id: string; declared: true }, { channel: 'email' | 'linkedin'; sent_on?: string }>({
      path: `/contacts/${id}/declare-sent`,
      method: 'POST',
      body: sentOn ? { channel, sent_on: sentOn } : { channel },
    })
  },
  /** Palier 1 « Envoie à tous ces gens » — bulk-sends the drafted email to many
   *  contacts. Opt-out / already-sent guards run server-side, per contact. */
  sendEmailBulk(contactIds: string[]): Promise<BulkSendEmailResponse> {
    return apiFetch<BulkSendEmailResponse, { contact_ids: string[] }>({
      path: '/contacts/send-email/bulk',
      method: 'POST',
      body: { contact_ids: contactIds },
    })
  },
  /**
   * #2964 (#2296.38-.41) — vérification FORCÉE d'une sélection (jusqu'à
   * `BULK_VERIFY_MAX_CONTACTS`) : met chaque contact en file d'enrichissement
   * avec `force: true`, un statut PAR CONTACT, jamais un total qui masquerait
   * lequel a échoué (#2296.39). Synchrone comme `sendEmailBulk` : le serveur
   * boucle contact par contact et rend les statuts de mise en file — pas un
   * job à suivre, la vérification elle-même reste asynchrone côté worker.
   */
  bulkVerify(contactIds: readonly string[]): Promise<{ outcomes: BulkVerifyOutcome[] }> {
    return apiFetch<{ outcomes: BulkVerifyOutcome[] }, { contact_ids: readonly string[] }>({
      path: '/contacts/bulk-verify',
      method: 'POST',
      body: { contact_ids: contactIds },
    })
  },
  /**
   * Attribue (ou libère, `assignedTo: null`) une SÉLECTION de contacts à un
   * membre de l'espace. Le serveur renvoie ce qu'il a réellement écrit et ce
   * qu'il a laissé en place — l'UI n'estime jamais le compteur elle-même.
   */
  assignBulk(contactIds: string[], assignedTo: string | null): Promise<ContactAssignmentResult> {
    return apiFetch<ContactAssignmentResult, AssignContactsInput>({
      path: '/contacts/assign',
      method: 'PATCH',
      body: { contact_ids: contactIds, assigned_to: assignedTo },
    })
  },
  /**
   * Écarter un contact, avec son motif (PDF 2, items 82-83).
   *
   * Le motif est obligatoire côté serveur : c'est le seul apprentissage que
   * produit un « non ». Les séquences en cours s'arrêtent, et la réponse dit
   * combien — sans quoi l'utilisateur ne saurait pas qu'un envoi programmé
   * vient d'être annulé.
   */
  exclude(id: string, reason: string): Promise<{ contact_id: string; cancelled_sequences: number }> {
    return apiFetch<{ contact_id: string; cancelled_sequences: number }, { reason: string }>({
      path: `/contacts/${id}/exclude`,
      method: 'POST',
      body: { reason },
    })
  },
  /**
   * #4928.5 — « Écarter les contacts de cette entité » en UN geste serveur : le compte est borné à l'espace et au
   * périmètre côté API (un refus remonte en erreur), chaque contact est archivé avec son motif, jamais supprimé.
   */
  excludeEntity(
    accountId: string,
    entity: string,
    reason: string,
  ): Promise<{ account_id: string; excluded: number; contact_ids: string[] }> {
    return apiFetch<
      { account_id: string; excluded: number; contact_ids: string[] },
      { entity: string; reason: string }
    >({
      path: `/contacts/account/${accountId}/exclude-entity`,
      method: 'POST',
      body: { entity, reason },
    })
  },
  /** #4928.5 — le geste inverse : réintègre les contacts écartés AVEC l'entité (jamais ceux écartés pour un autre motif). */
  restoreEntity(
    accountId: string,
    entity: string,
  ): Promise<{ account_id: string; restored: number; contact_ids: string[] }> {
    return apiFetch<{ account_id: string; restored: number; contact_ids: string[] }, { entity: string }>({
      path: `/contacts/account/${accountId}/restore-entity`,
      method: 'POST',
      body: { entity },
    })
  },
  restore(id: string): Promise<{ contact_id: string }> {
    return apiFetch<{ contact_id: string }>({ path: `/contacts/${id}/exclude`, method: 'DELETE' })
  },
  /** LUDOVIC-C LC.1 — remet les contacts DÉJÀ collectés du compte aux règles actuelles
   *  (homonymes archivés avec leur raison), sans recollecte ni crédit. */
  applyCurrentRules(accountId: string): Promise<{ account_id: string; archived: number; applied_at: string | null }> {
    return apiFetch<{ account_id: string; archived: number; applied_at: string | null }>({
      path: `/contacts/account/${accountId}/apply-current-rules`,
      method: 'POST',
    })
  },
  /**
   * #3871.1 (lot V11, 07/10) — l'utilisateur déclare qu'un contact a quitté
   * l'entreprise (carte `propose_contact_departure` dans la conversation
   * Laura). Archive (`historique`), jamais de suppression.
   */
  markDeparted(id: string): Promise<{ contact_id: string; lifecycle_state: string }> {
    return apiFetch<{ contact_id: string; lifecycle_state: string }>({
      path: `/contacts/${id}/departed`,
      method: 'POST',
    })
  },
  /**
   * #4418.1 — « Marquer envoyé » sur un message préparé au plan d'un contact : planifie les relances
   * J+3/J+6/J+9, DÉCLARATIF (rien n'est écrit comme preuve d'envoi sur la fiche).
   */
  declareTouch(id: string): Promise<{ contact_id: string }> {
    return apiFetch<{ contact_id: string }>({ path: `/contacts/${id}/declared-touch`, method: 'POST' })
  },
  /**
   * #2297 — effacer une personne (RGPD art. 17). IRRÉVERSIBLE : la fiche et
   * tout ce qui la nomme sont supprimés, une trace sans donnée personnelle
   * empêche qu'elle soit recollectée. `confirm: true` n'est envoyé qu'après la
   * confirmation explicite de l'écran (`ContactErasureCard`).
   */
  erase(id: string): Promise<PersonErasureResult> {
    return apiFetch<PersonErasureResult, { confirm: true }>({
      path: `/contacts/${id}/erasure`,
      method: 'POST',
      body: { confirm: true },
    })
  },
}

/**
 * Stable query keys.
 *  - `list` — prefix (2 segments) pour `invalidateQueries` ;
 *  - `useContacts` y ajoute `userId` puis `filters` (cf. `ContactsListQueryKey`).
 */
type ContactsListPrefixKey = readonly ['contacts', 'list']
export type ContactsListQueryKey = readonly ['contacts', 'list', string | undefined, ContactListQuery]

export const contactKeys = {
  all: ['contacts'] as const,
  list: ['contacts', 'list'] as ContactsListPrefixKey,
  stats: ['contacts', 'stats'] as const,
  deliverability: ['contacts', 'deliverability'] as const,
  followUpStats: ['contacts', 'follow-up-stats'] as const,
  byAccount: (accountId: string) => ['contacts', 'account', accountId] as const,
  // Sous `byAccount` : toute invalidation des contacts du compte relit aussi la vue par périmètre.
  perimeter: (accountId: string, mode: ContactPerimeter) =>
    ['contacts', 'account', accountId, 'perimeter', mode] as const,
  // Sous le préfixe `byAccount` : toute invalidation des contacts du compte
  // (enrichissement, statut, masquage) reclasse aussi le chemin recommandé.
  ranking: (accountId: string, query: ContactRankingQuery) =>
    [
      'contacts',
      'account',
      accountId,
      'ranking',
      query.perimeter ?? null,
      query.subject ?? null,
      query.offer ?? null,
    ] as const,
  detail: (id: string) => ['contact', id] as const,
  cadence: (id: string) => ['contact', id, 'cadence'] as const,
  // #3263.28 — triée : un même ensemble d'ids demandé dans un ordre différent
  // (deux écrans distincts) retrouve le MÊME cache plutôt qu'un second aller-retour.
  solicitations: (contactIds: readonly string[]) => ['contacts', 'solicitations', [...contactIds].sort()] as const,
  associations: (id: string) => ['contact', id, 'associations'] as const,
  crmExports: (id: string) => ['contact', id, 'crm-exports'] as const,
  preflight: (id: string) => ['contact', id, 'preflight'] as const,
  sendability: (id: string) => ['contact', id, 'sendability'] as const,
  lifecycle: (id: string) => ['contact', id, 'lifecycle'] as const,
  stop: (id: string) => ['contact', id, 'stop'] as const,
  introductionAuthorizations: (id: string) => ['contact', id, 'introduction-authorizations'] as const,
}
