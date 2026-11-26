import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { MissionRisk, SetMissionRiskResolutionRequest, UpdateMissionRequest } from '@bellum/contracts'
import { toast } from 'sonner'
import { contactKeys, contactsApi } from '@/features/contacts/api'
import { i18n } from '@/i18n'
import { apiFetch } from '@/lib/api'
import { queryKeys } from '@/lib/api/query-keys'

/**
 * LE PANNEAU LATÉRAL DE PLANIFICATION — entité cliente et trois contacts
 * (PDF-22 §7, l.112-124), servis par `GET /delivery/missions/:id/panel`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER, ET PAS `api.ts`
 * ─────────────────────────────────────────────────────────────────────────
 * `api.ts` sert déjà les quatre lectures que `MissionDetailTabs` interroge
 * (`useMissionAssignments`, `useMissionTerms`, `useMissionScores`,
 * `TimelinePanel`) — GA-83 vérifie qu'aucun HÔTE du tiroir/dossier ne les
 * refait. Ce panneau est une TROISIÈME forme, pour un AUTRE contenu : elle ne
 * monte jamais `MissionDetailTabs` et ne relit AUCUNE des quatre routes —
 * elle sert l'entité cliente et les trois contacts, qu'aucun écran ne
 * servait avant ce lot.
 *
 * Les CONDITIONS FINANCIÈRES (TJM freelance, bon de commande, préférences de
 * facturation) ne sont PAS lues ici : ce panneau réutilise `useMissionTerms`,
 * DÉJÀ exporté par `api.ts` — les relire par une route à soi aurait été
 * exactement le défaut que GA-83 existe pour empêcher, une deuxième vérité
 * sur le même bon de commande.
 */

export type MissionEntitySummary = { name: string; address: string | null; siren: string | null }

/** Un contact de délivrance — nom et moyen de contact, jamais un critère
 *  protégé. `phone: null` sur le chargé d'affaires : `profiles` n'en porte
 *  pas, ce n'est jamais une valeur inventée pour remplir la même forme. */
export type MissionDeliveryContact = { name: string | null; email: string | null; phone: string | null }

/**
 * #2561 — le deal CRM rattaché à la mission (`missions.crm_deal_id` →
 * `crm_deal_facts`), miroir EXACT de `LinkedCrmDeal` côté API
 * (`staffing.service.ts`). `provider` est l'identifiant technique SEUL
 * (`'hubspot'`…) — jamais un nom : c'est `clientToolName` (`@bellum/contracts`)
 * qui le résout à l'écran, jamais un littéral ici.
 */
export type LinkedCrmDeal = {
  provider: string
  dealId: string
  name: string | null
  stage: string | null
  stageLabel: string | null
  amount: string | null
  isClosed: boolean
  isWon: boolean | null
}

export type MissionContactsPanel = {
  entity: MissionEntitySummary | null
  consultant: MissionDeliveryContact | null
  businessManager: MissionDeliveryContact | null
  craValidator: MissionDeliveryContact | null
  /** #2836 — le manager client : le contact, chez le client, qui encadre le
   *  consultant. `null` = non désigné. */
  clientManager: MissionDeliveryContact | null
  /** #2836 — l'identifiant désigné, d'où part le sélecteur. */
  clientManagerContactId: string | null
  billingRecipientEmail: string | null
  crmDeal: LinkedCrmDeal | null
}

export const missionPanelKeys = {
  panel: (id: string) => ['missions', id, 'panel'] as const,
}

const missionPanelApi = {
  panel(id: string): Promise<MissionContactsPanel> {
    return apiFetch<MissionContactsPanel>({ path: `/delivery/missions/${id}/panel` })
  },
  /**
   * RÉPARER la fiche — contact de facturation, dates, TJM vendu.
   *
   * Route distincte du contact CRA, et c'est le point : le contact CRA VALIDE
   * le relevé, le contact de facturation REÇOIT la facture. Les confondre
   * enverrait la facture à qui pointe les jours.
   */
  update(id: string, body: UpdateMissionRequest): Promise<unknown> {
    return apiFetch<unknown, UpdateMissionRequest>({
      path: `/delivery/missions/${id}`,
      method: 'PATCH',
      body,
    })
  },
  setCraContact(id: string, contactId: string | null): Promise<{ contactId: string | null }> {
    return apiFetch<{ contactId: string | null }, { contactId: string | null }>({
      path: `/delivery/missions/${id}/cra-contact`,
      method: 'PATCH',
      body: { contactId },
    })
  },
  /** #2836 — « Désigner le manager client ». Route à part du contact CRA :
   *  qui ENCADRE le consultant n'est pas qui VALIDE le relevé. */
  setClientManager(id: string, contactId: string | null): Promise<{ contactId: string | null }> {
    return apiFetch<{ contactId: string | null }, { contactId: string | null }>({
      path: `/delivery/missions/${id}/client-manager`,
      method: 'PATCH',
      body: { contactId },
    })
  },
  /** #2411.11 (reste, épopée #2881) — « Marquer comme traité » / « Ré-ouvrir »
   *  un risque déjà CALCULÉ (`mission.risks`) : jamais le risque lui-même. */
  setRiskResolution(id: string, risk: MissionRisk, resolved: boolean): Promise<unknown> {
    return apiFetch<unknown, SetMissionRiskResolutionRequest>({
      path: `/delivery/missions/${id}/risks/${risk}`,
      method: 'PATCH',
      body: { resolved },
    })
  },
}

export function useMissionPanel(missionId: string | undefined) {
  return useQuery({
    queryKey: missionPanelKeys.panel(missionId ?? 'none'),
    queryFn: () => missionPanelApi.panel(missionId as string),
    enabled: Boolean(missionId),
    staleTime: 0,
  })
}

/** « Changer le contact CRA ». Invalide le panneau — jamais `['missions']`
 *  en entier : ce geste ne bouge ni la frise, ni les conditions commerciales. */
export function useSetCraContact(missionId: string) {
  const qc = useQueryClient()
  return useMutation<{ contactId: string | null }, Error, string | null>({
    mutationFn: contactId => missionPanelApi.setCraContact(missionId, contactId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: missionPanelKeys.panel(missionId) })
      toast.success(i18n.t('accountMissions:planningPanel.contacts.craContactSaved'))
    },
    onError: (error: Error) =>
      toast.error(error.message || i18n.t('accountMissions:planningPanel.contacts.craContactError')),
  })
}

/** #2836 — « Désigner le manager client ». Invalide le panneau ET le résumé
 *  des missions du compte, qui nomme le manager client sur chaque ligne. */
export function useSetClientManager(missionId: string, accountId: string) {
  const qc = useQueryClient()
  return useMutation<{ contactId: string | null }, Error, string | null>({
    mutationFn: contactId => missionPanelApi.setClientManager(missionId, contactId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: missionPanelKeys.panel(missionId) })
      qc.invalidateQueries({ queryKey: queryKeys.accounts.missions(accountId) })
      toast.success(i18n.t('accountMissions:planningPanel.contacts.clientManagerSaved'))
    },
    onError: (error: Error) =>
      toast.error(error.message || i18n.t('accountMissions:planningPanel.contacts.clientManagerError')),
  })
}

/**
 * #2411.11 (reste, épopée #2881) — « Marquer comme traité » un risque de
 * mission déjà CALCULÉ. Invalide `['missions']` — jamais le panneau seul : le
 * badge du risque vit dans la LISTE des missions (`MissionRisks.tsx`), lue par
 * `GET /delivery/missions`, qui applique le filtre de résolution. Un panneau
 * à jour au-dessus d'une liste périmée reposerait la même question que
 * `useSetClientManager` a déjà tranchée.
 *
 * `resolved` reste fixé à `true` : AUCUN écran ne ré-ouvre encore un risque
 * traité (le geste inverse existe côté API — `setRiskResolution(id, risk,
 * false)` — pour le jour où un écran le demandera, jamais deviné ici).
 */
export function useResolveMissionRisk(missionId: string) {
  const qc = useQueryClient()
  return useMutation<unknown, Error, MissionRisk>({
    mutationFn: risk => missionPanelApi.setRiskResolution(missionId, risk, true),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['missions'] })
      toast.success(i18n.t('accountMissions:planningPanel.nextStep.resolvedSaved'))
    },
    onError: (error: Error) =>
      toast.error(error.message || i18n.t('accountMissions:planningPanel.nextStep.resolveError')),
  })
}

/**
 * « Compléter la fiche » — le chemin d'écriture que trois bloqueurs de
 * facturation nommaient sans qu'il existe (`missing_billing_contact`,
 * `missing_rate`, `missing_start_date`).
 *
 * Invalide le panneau ET la liste des missions : le TJM et les dates
 * s'affichent dans les deux, et un panneau à jour au-dessus d'un tableau
 * périmé est la manière la plus sûre de faire douter des deux.
 */
export function useUpdateMission(missionId: string) {
  const qc = useQueryClient()
  return useMutation<unknown, Error, UpdateMissionRequest>({
    mutationFn: body => missionPanelApi.update(missionId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: missionPanelKeys.panel(missionId) })
      qc.invalidateQueries({ queryKey: ['missions'] })
      // #2194.44 — GÉNÉRIQUE à dessein : ce hook écrit indifféremment les
      // dates (`MissionDateField`), la société porteuse (`BillingEntityRow`),
      // le contact de facturation (`BillingContactPicker`) ou, depuis le
      // glissement d'une barre sur le Gantt, les dates de la mission. Un
      // texte nommé « contact de facturation » se lisait faux sur les trois
      // autres champs — CE toast est celui qu'ils portaient déjà, corrigé
      // pour dire ce qui est vrai dans tous les cas, plutôt qu'un cinquième
      // texte pour un cinquième appelant.
      toast.success(i18n.t('accountMissions:planningPanel.contacts.updateSaved'))
    },
    onError: (error: Error) =>
      toast.error(error.message || i18n.t('accountMissions:planningPanel.contacts.updateError')),
  })
}

/**
 * Les contacts du compte, pour le geste « Changer le contact CRA ».
 *
 * Réutilise la clé ET l'appel du module contacts (`contactKeys.byAccount`,
 * `contactsApi.listByAccount`) — jamais recopiés : un second endroit qui
 * construirait la même clé diverge le jour où l'un des deux change de forme.
 */
export function useAccountContacts(accountId: string | undefined) {
  return useQuery({
    queryKey: contactKeys.byAccount(accountId ?? 'none'),
    queryFn: () => contactsApi.listByAccount(accountId as string),
    enabled: Boolean(accountId),
  })
}
