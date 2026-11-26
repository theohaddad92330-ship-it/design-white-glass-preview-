/**
 * #4189 — les formes de la LECTURE commune, tous fournisseurs.
 *
 * Règle qui tient tout : un champ que le CRM ne rend pas est `null`, jamais une
 * valeur devinée (« non mesuré » n'est jamais « 0 »). Un objet que le CRM
 * n'expose pas n'a pas de méthode du tout (`CRM_PROVIDER_READ_SCOPE`).
 *
 * `after` est un curseur OPAQUE propre à chaque fournisseur ; `since` est une
 * date ISO — la lecture ne rend que ce qui a été modifié APRÈS (ou créé après,
 * pour un CRM sans date de modification : `CRM_INCREMENTAL_CURSOR`).
 */
export type CrmReadOptions = { limit: number; after?: string; since?: string }

/** Une affaire. `status` n'est renseigné que si le CRM le dit lui-même (jamais déduit d'un libellé d'étape). */
type CrmDealRecord = {
  id: string
  title: string | null
  amount: number | null
  /** `null` tant que la devise n'est pas rendue par le CRM (jamais supposée). */
  currency: string | null
  /** Le libellé d'étape tel que le CRM le nomme, ou `null`. */
  stage: string | null
  status: 'open' | 'won' | 'lost' | null
  closeDate: string | null
  /** #3918.8 — la date de CLÔTURE réelle rendue par le CRM (jamais l'échéance prévue `closeDate`). */
  closedAt?: string | null
  /** #3918.8 — la date de création rendue par le CRM. */
  createdAt?: string | null
  accountId: string | null
  accountName: string | null
  /** #4065.8 — l'interlocuteur PRINCIPAL de l'affaire, quand le CRM le rend ; sinon absent (jamais deviné). */
  contactName?: string | null
  modifiedAt: string | null
  // SYNC-A — ce que le MIROIR garde en plus (`crm_deals`), quand le CRM le rend ; absent = non lu.
  /** Le propriétaire (identifiant externe, cf. `owners`). */
  ownerId?: string | null
  pipelineId?: string | null
  /** L'identifiant d'étape (le libellé reste `stage`). */
  stageId?: string | null
  lostReason?: string | null
  /** Les personnes liées (identifiants externes). */
  contactIds?: string[]
  /** Le lien vers la fiche dans le CRM. */
  url?: string | null
  /** Les champs propres à l'espace (clé = nom d'API), tels que rendus. */
  customFields?: Record<string, unknown>
}
export type CrmDealPage = { deals: CrmDealRecord[]; nextAfter: string | null }

/** Une activité (tâche, rendez-vous, appel…). */
type CrmActivityRecord = {
  id: string
  subject: string | null
  /** Le type tel que le CRM le nomme (« call », « Task »…), ou `null`. */
  kind: string | null
  dueAt: string | null
  /** `null` quand le CRM ne dit pas si elle est faite. */
  done: boolean | null
  modifiedAt: string | null
  // SYNC-A — les liens et le propriétaire, quand le CRM les rend ; jamais le CORPS (doctrine c96).
  ownerId?: string | null
  /** La société liée (identifiant externe). */
  accountId?: string | null
  contactId?: string | null
  dealId?: string | null
  url?: string | null
}
export type CrmActivityPage = { activities: CrmActivityRecord[]; nextAfter: string | null }

/** Un propriétaire de fiches (utilisateur du CRM). */
type CrmOwnerRecord = { id: string; name: string | null; email: string | null }
export type CrmOwnerPage = { owners: CrmOwnerRecord[]; nextAfter: string | null }

/** SYNC-A — un pipeline d'affaires et ses étapes, dans l'ordre du CRM. */
type CrmPipelineRecord = {
  id: string
  label: string | null
  stages: Array<{ id: string; label: string | null; position: number | null; status: 'open' | 'won' | 'lost' | null }>
}
export type CrmPipelinePage = { pipelines: CrmPipelineRecord[]; nextAfter: string | null }
