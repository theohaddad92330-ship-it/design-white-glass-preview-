import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  AccountCrmExportsResponse,
  AccountCrmProvenance,
  CrmPushPreview,
  CrmPushRequest,
  CrmPushResult,
  CrmPushTargets,
  CrmWriteRequests,
  CrmWriteRequestView,
  DecideCrmWrite,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * Ce que le jeton CRM autorise vraiment — dérivé côté serveur des portées
 * ACCORDÉES au consentement, pas de celles qu'on a demandées. Un portail branché
 * avant l'ajout d'une portée garde sa concession étroite : la capacité reste
 * `false` et l'écran propose de reconnecter, plutôt que de laisser l'appel
 * échouer en « erreur interne » comme il le faisait.
 */
export type CrmCapabilities = {
  contactsRead: boolean
  contactsWrite: boolean
  companiesRead: boolean
  dealsRead: boolean
  /** #1934.18 — déplacer une affaire d'un stade à l'autre. Portée DÉDIÉE : un
   *  portail branché avant le 16/09/2026 ne l'a jamais accordée. */
  dealsWrite: boolean
  tasksWrite: boolean
  meetingsWrite: boolean
  notesWrite: boolean
}

export type CrmStatus = {
  configured: boolean
  connected: boolean
  provider?: 'hubspot'
  accountLabel?: string | null
  /**
   * Salle de démonstration : un connecteur CRM FICTIF est proposé pour montrer le geste d'export.
   * `connected` reste `false` (aucune connexion réelle, aucun jeton) — seule la carte d'export le lit.
   */
  demo?: boolean
  connectedAt?: string
  scopes?: string | null
  capabilities?: CrmCapabilities
}

/**
 * Le résultat d'une déconnexion CRM qui sait dire si le fournisseur a
 * confirmé la révocation server-side — la ligne locale, elle, est TOUJOURS
 * effacée. Forme partagée par les fournisseurs dont le `DELETE` la rend
 * (Salesforce, Pipedrive : commit d97ba6b1) au lieu d'un 204 vide.
 *
 * Un fournisseur qui rend encore ce 204 (HubSpot, Google, Microsoft, Notion,
 * Attio à ce jour — vérifié le 30/08/2026) garde `disconnect(): Promise<void>`
 * sans passer par ce type : `OAuthProviderCard` traite les deux formes, et
 * n'affiche jamais un avertissement que l'API n'a pas rendu.
 */
export type CrmDisconnectResult = { revoked: boolean; warning: string | null }

export type ExportContactInput = {
  email?: string
  firstName?: string
  lastName?: string
  company?: string
  jobTitle?: string
  phone?: string
  linkedinUrl?: string
}

/** Corps de `POST /crm/companies` (#2125.10) — miroir de `crmCreateCompanySchema` côté API. */
type CreateCompanyInput = {
  name: string
  domain?: string
  industry?: string
  city?: string
}

/** A contact read back from the connected CRM (`GET /crm/contacts`). */
export type CrmContact = {
  id: string
  email: string | null
  firstName: string | null
  lastName: string | null
  company: string | null
  jobTitle: string | null
  phone: string | null
}

/** A page of imported CRM contacts + the opaque cursor for the next page. */
export type CrmContactPage = {
  contacts: CrmContact[]
  nextAfter: string | null
}

/** Result of an upsert-by-email export: new record vs updated existing one. */
type CrmUpsertResult = { id: string; created: boolean }

/** A CRM contact already known at the target account (`GET /crm/presence`). */
type CrmPresenceContact = {
  id: string
  name: string | null
  email: string | null
  jobTitle: string | null
}

/** An OPEN deal / opportunity attached to the target account. */
type CrmPresenceDeal = {
  id: string
  name: string | null
  /** L'IDENTIFIANT interne du stade, tel que le CRM le rend — pas un libellé. */
  stage: string | null
  /** #1934.18 — le pipeline de l'affaire. Absent = inconnu. */
  pipeline?: string | null
  amount: number | null
}

/**
 * #1934.18 — les pipelines d'affaires du CRM connecté, comme un ÉTAT.
 *
 * `unreadable` porte sa raison : une portée absente (reconnecter), une panne
 * (réessayer) ou un portail sans pipeline ne s'annoncent pas pareil.
 */
export type CrmDealPipelines =
  | { status: 'ready'; pipelines: Array<{ id: string; label: string; stages: Array<{ id: string; label: string }> }> }
  | { status: 'not_connected'; pipelines: [] }
  | { status: 'unreadable'; reason: string; pipelines: [] }

/**
 * Presence read-back (« as-tu déjà un contact chez ce groupe ? »). Mirrors the
 * API's `CrmPresence` shape. Honesty contract (JAMAIS de donnée inventée) :
 *   - no CRM connected → `provider: null`, `matched: false`, empty lists.
 */
export type CrmPresence = {
  provider: 'hubspot' | 'salesforce' | null
  matched: boolean
  contactsCount: number
  contacts: CrmPresenceContact[]
  openDeals: CrmPresenceDeal[]
  lastActivityAt: string | null
}

/** What the SPA anchors the presence match on. `account` (company name) is
 *  required; `domain` (a bare host, e.g. "acme.fr") sharpens it; `siren` is
 *  accepted for future FR-aware CRMs. */
type CrmPresenceQuery = {
  account?: string
  domain?: string
  siren?: string
}

/**
 * #2031.5 / #2045.5 — décision Louis 18/09/2026 : « PROPOSER sans remplir ».
 * Le vocabulaire BRUT (`industry`/`country`) des sociétés du CRM branché,
 * dans les mots DU CRM — jamais mappé vers le catalogue fermé du
 * questionnaire (`ESN_ANSWER_OPTIONS`). `provider: null` (aucun CRM connecté,
 * ou lecture non câblée pour ce fournisseur) : listes vides, no-op strict —
 * même contrat d'honnêteté que `CrmPresence` ci-dessus.
 */
export type CrmVocabulary = {
  provider: 'hubspot' | null
  industries: string[]
  countries: string[]
}

/**
 * #2045.5 (épopée #2859) — combien de contacts le CRM branché connaît, TOUS
 * comptes confondus. `total: null` = non mesuré (aucun CRM connecté, ou
 * lecture en échec) — jamais confondu avec un vrai zéro (gardes GA-18/GA-19).
 */
export type CrmNetworkSize = {
  provider: 'hubspot' | null
  total: number | null
}

export const crmApi = {
  status(): Promise<CrmStatus> {
    return apiFetch<CrmStatus>({ path: '/crm/status' })
  },
  /** « Déjà dans mon CRM ? » — asks the connected CRM whether the target account
   *  is already known. No CRM connected → `provider: null` (a clean no-op). */
  presence(query: CrmPresenceQuery): Promise<CrmPresence> {
    const params = new URLSearchParams()
    if (query.account) params.set('account', query.account)
    if (query.domain) params.set('domain', query.domain)
    if (query.siren) params.set('siren', query.siren)
    return apiFetch<CrmPresence>({ path: `/crm/presence?${params.toString()}` })
  },
  /** #1934.18 — les stades RÉELS du CRM. C'est d'ici que vient l'identifiant de
   *  stade qu'une proposition envoie, jamais du texte du modèle. */
  dealPipelines(): Promise<CrmDealPipelines> {
    return apiFetch<CrmDealPipelines>({ path: '/crm/deal-pipelines' })
  },
  /** #2031.5 / #2045.5 — le vocabulaire BRUT du CRM branché, pour la proposition
   *  du questionnaire d'entrée. Aucun CRM connecté → `provider: null` (no-op). */
  vocabulary(): Promise<CrmVocabulary> {
    return apiFetch<CrmVocabulary>({ path: '/crm/vocabulary' })
  },
  /** #2045.5 (épopée #2859) — le total PORTAIL du CRM branché, pour
   *  l'onboarding. Aucun CRM connecté → `provider: null` (no-op). */
  networkSize(): Promise<CrmNetworkSize> {
    return apiFetch<CrmNetworkSize>({ path: '/crm/network-size' })
  },
  /** Returns the HubSpot consent URL to redirect the browser to. */
  connectUrl(): Promise<{ url: string }> {
    return apiFetch<{ url: string }>({ path: '/crm/hubspot/connect' })
  },
  disconnect(): Promise<void> {
    return apiFetch<void>({ path: '/crm/hubspot', method: 'DELETE' })
  },
  /**
   * Upsert-by-email: push a Bellum contact into the CRM.
   *
   * #1959.4 / #1959.6 — `idempotencyKey` is HubSpot-only: this is the sole
   * export path whose server-side "gate" (`OutboundWriteService`) already
   * dedups by key. Salesforce's export schema is `.strict()` — sending the
   * same optional field there would REJECT the request instead of protecting
   * it, so it stays out of the shared `ExportContactInput` type.
   */
  exportContact(input: ExportContactInput & { idempotencyKey?: string }): Promise<CrmUpsertResult> {
    return apiFetch<CrmUpsertResult, ExportContactInput & { idempotencyKey?: string }>({
      path: '/crm/hubspot/export',
      method: 'POST',
      body: input,
    })
  },
  /** Import a page of the rep's existing CRM contacts (cursor-paginated). */
  listContacts(params: { limit?: number; after?: string } = {}): Promise<CrmContactPage> {
    const query = new URLSearchParams()
    if (params.limit) query.set('limit', String(params.limit))
    if (params.after) query.set('after', params.after)
    const qs = query.toString()
    return apiFetch<CrmContactPage>({ path: `/crm/contacts${qs ? `?${qs}` : ''}` })
  },
  /** Log an activity ("email envoyé depuis Bellum") onto a CRM contact's timeline. */
  logActivity(crmId: string, note: string): Promise<{ id: string }> {
    return apiFetch<{ id: string }, { note: string }>({
      path: `/crm/contacts/${crmId}/activity`,
      method: 'POST',
      body: { note },
    })
  },
  /**
   * #2125.10 — Crée la société dans le CRM connecté, ou rend celle qui existe
   * déjà (dédoublonnage par nom/domaine côté API, `CrmDepthService.createCompany`
   * — écrit le 16/09, sans appelant côté écran jusqu'ici).
   */
  createCompany(input: CreateCompanyInput): Promise<CrmUpsertResult> {
    return apiFetch<CrmUpsertResult, CreateCompanyInput>({
      path: '/crm/companies',
      method: 'POST',
      body: input,
    })
  },
}

/* -------------------------------------------------------------------------- */
/*  La porte de validation des écritures CRM (BEL-INT-603)                     */
/* -------------------------------------------------------------------------- */

/**
 * La file des écritures que le SYSTÈME veut faire dans ton CRM.
 *
 * La doctrine dit : geste d'utilisateur = auto-approuvé (le clic EST la
 * décision) ; geste de système = demande VISIBLE, prévisualisation FIGÉE,
 * expiration 3 jours. Les deux routes existaient ; **la moitié « visible »
 * n'avait aucun appelant**, et une note versée en fond attendait sans que
 * personne puisse la voir.
 */
export const crmWriteApi = {
  pending(): Promise<CrmWriteRequests> {
    return apiFetch<CrmWriteRequests>({ path: '/crm/write-requests' })
  },
  decide(id: string, approve: boolean): Promise<CrmWriteRequestView> {
    return apiFetch<CrmWriteRequestView, DecideCrmWrite>({
      path: `/crm/write-requests/${id}/decide`,
      method: 'POST',
      body: { approve },
    })
  },
  /**
   * MODIFIER — c'est-à-dire créer une demande NEUVE, figée, qui remplace
   * l'ancienne (#1498).
   *
   * ⚠️ `changes` porte des CLÉS de charge utile, pas des libellés : c'est
   * pourquoi chaque ligne de prévisualisation expose désormais sa clé. Sans
   * elle, une ligne corrigée à l'écran n'a aucun moyen de retrouver le champ
   * qu'elle écrit.
   */
  revise(id: string, changes: Record<string, string>): Promise<CrmWriteRequestView> {
    return apiFetch<CrmWriteRequestView, { changes: Record<string, string> }>({
      path: `/crm/write-requests/${id}/revise`,
      method: 'POST',
      body: { changes },
    })
  },
  /** #2864 — confier à un collègue du même espace (`null` = retirer). */
  assign(id: string, assigneeId: string | null): Promise<CrmWriteRequestView> {
    return apiFetch<CrmWriteRequestView, { assigneeId: string | null }>({
      path: `/crm/write-requests/${id}/assign`,
      method: 'POST',
      body: { assigneeId },
    })
  },
  /** #2856 — reporter jusqu'à cette date (`null` réveille la demande). */
  snooze(id: string, until: string | null): Promise<CrmWriteRequestView> {
    return apiFetch<CrmWriteRequestView, { until: string | null }>({
      path: `/crm/write-requests/${id}/snooze`,
      method: 'POST',
      body: { until },
    })
  },
  /**
   * #2854 (#2201.32) — « Annuler le lot » : refuse chaque demande de la
   * sélection. Chaque issue est rendue séparément — jamais un succès global
   * qui couvrirait un échec partiel.
   */
  bulkReject(ids: string[]): Promise<{ succeeded: string[]; failed: Array<{ id: string; reason: string }> }> {
    return apiFetch<{ succeeded: string[]; failed: Array<{ id: string; reason: string }> }, { ids: string[] }>({
      path: '/crm/write-requests/bulk-reject',
      method: 'POST',
      body: { ids },
    })
  },
  /**
   * #2854 (#2201.9) — « Fusion file unique : actions en masse ». Dépose
   * PLUSIEURS propositions typées sous un `batchId` partagé
   * (`CrmService.proposeBatch`, déjà là). Chaque item passe par SA propre
   * validation (`proposeDealStage`/`proposeCreateDeal`) — jamais un
   * `kind`/`payload` libre — et reste PROPOSÉ : rien ne part avant que
   * quelqu'un le valide dans la file « À valider ».
   */
  proposeDealsBatch(items: ProposeDealsBatchItem[]): Promise<ProposeDealsBatchResult> {
    return apiFetch<ProposeDealsBatchResult, { items: ProposeDealsBatchItem[] }>({
      path: '/crm/deals/propose-batch',
      method: 'POST',
      body: { items },
    })
  },
}

/**
 * #2854 (#2201.9) — un item TYPÉ du lot, jamais un `kind`/`payload` libre.
 * Non exporté : seul ce fichier le consomme (`lint:exports:types`, knip).
 */
type ProposeDealsBatchItem =
  | { kind: 'deal_stage'; dealId: string; stageId: string; rationale?: string; idempotencyKey?: string | null }
  | { kind: 'create_deal'; title: string; accountName?: string; idempotencyKey?: string | null }

type ProposeDealsBatchResult = {
  batchId: string | null
  results: Array<
    | { kind: 'deal_stage' | 'create_deal'; ok: true; requestId: string; pending: boolean }
    | { kind: 'deal_stage' | 'create_deal'; ok: false; reason: string }
  >
}

export const crmWriteKeys = { pending: ['crm', 'write-requests'] as const }

export function useCrmWriteRequests() {
  const { user } = useSession()
  return useQuery<CrmWriteRequests>({
    queryKey: [...crmWriteKeys.pending, user?.id],
    queryFn: crmWriteApi.pending,
    enabled: !!user,
    staleTime: 30_000,
  })
}

/**
 * Trancher. Rien n'est patché optimistiquement : une demande peut avoir EXPIRÉ
 * entre l'affichage et le clic, et le serveur la refuse alors en le disant. La
 * retirer de l'écran avant sa réponse ferait croire à une décision qui n'a pas
 * eu lieu.
 */
export function useDecideCrmWrite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => crmWriteApi.decide(id, approve),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: crmWriteKeys.pending })
    },
  })
}

/**
 * Corriger avant d'autoriser. La demande d'origine passe en « remplacée » et
 * une neuve prend sa place — la prévisualisation reste donc figée, ce qui est
 * la règle qui rend cette file sûre.
 */
export function useReviseCrmWrite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: Record<string, string> }) => crmWriteApi.revise(id, changes),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: crmWriteKeys.pending })
    },
  })
}

/** #2864 — reste du lot précédent : confier une écriture CRM à un collègue. */
export function useAssignCrmWrite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, assigneeId }: { id: string; assigneeId: string | null }) => crmWriteApi.assign(id, assigneeId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: crmWriteKeys.pending })
    },
  })
}

/** #2856 — reste du lot précédent : reporter une écriture CRM en attente. */
export function useSnoozeCrmWrite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, until }: { id: string; until: string | null }) => crmWriteApi.snooze(id, until),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: crmWriteKeys.pending })
    },
  })
}

/** #2854 (#2201.32) — annuler une sélection de demandes en attente. */
export function useBulkRejectCrmWrite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => crmWriteApi.bulkReject(ids),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: crmWriteKeys.pending })
    },
  })
}

/**
 * #2854 (#2201.9) — proposer plusieurs changements de stade en un seul lot.
 * Le lot est PROPOSÉ, jamais exécuté ici : chaque item redevient une demande
 * `pending` dans la file « À valider », comme une proposition seule.
 */
export function useProposeDealsBatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (items: ProposeDealsBatchItem[]) => crmWriteApi.proposeDealsBatch(items),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: crmWriteKeys.pending })
    },
  })
}

/**
 * #4188 — envoyer un compte et ses contacts vers le CRM branché, unitaire et en
 * lot. Deux temps : la prévisualisation (rien n'est écrit), puis l'envoi validé,
 * chaque élément par la porte commune (#4186).
 */
export const crmPushApi = {
  preview(body: CrmPushRequest): Promise<CrmPushPreview> {
    return apiFetch<CrmPushPreview, CrmPushRequest>({ path: '/crm/push/preview', method: 'POST', body })
  },
  push(body: CrmPushRequest): Promise<CrmPushResult> {
    return apiFetch<CrmPushResult, CrmPushRequest>({ path: '/crm/push', method: 'POST', body })
  },
  /** Les CRM branchés vers lesquels la fenêtre propose d'envoyer (le principal, les autres, les lectures seules). */
  targets(): Promise<CrmPushTargets> {
    return apiFetch<CrmPushTargets>({ path: '/crm/push/targets' })
  },
  accountExports(accountId: string): Promise<AccountCrmExportsResponse> {
    return apiFetch<AccountCrmExportsResponse>({ path: `/crm/push/accounts/${encodeURIComponent(accountId)}` })
  },
  /** #4295.23 — retour arrière d'une fusion compte-CRM ↔ compte-analyse (réservé à `integrations:manage`). */
  undoFusion(fusionId: string): Promise<{ restored: boolean }> {
    return apiFetch<{ restored: boolean }>({
      path: `/accounts/crm-fusions/${encodeURIComponent(fusionId)}/undo`,
      method: 'POST',
    })
  },
  /** #4459.2 — « Déjà dans ton CRM » / « Apporté par Bellum », contact par contact. */
  accountProvenance(accountId: string): Promise<AccountCrmProvenance> {
    return apiFetch<AccountCrmProvenance>({
      path: `/crm/push/accounts/${encodeURIComponent(accountId)}/provenance`,
    })
  },
}
