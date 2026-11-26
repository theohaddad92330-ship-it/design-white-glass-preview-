import type {
  BidDecision,
  ProjectNeed,
  Rfp,
  RfpCompliance,
  RfpImportDraft,
  RfpImportPreview,
  RfpOwnerRole,
  RfpRequirement,
  RfpImportSession,
  RfpSourceDocumentFilesResponse,
  SaveRfpImportSession,
  SignedDownload,
  UpdateRfpRequirement,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * Une ligne de liste : le dossier sans ses exigences (l'API ne les envoie
 * pas), plus DEUX comptes réels (#2957, #2179.7-.12) — calculés côté service
 * avec la même fonction pure que la matrice de conformité d'un dossier
 * ouvert, jamais recalculés ici.
 */
export type RfpSummary = Pick<
  Rfp,
  'id' | 'title' | 'issuer' | 'status' | 'due_at' | 'lots' | 'account_id' | 'created_at' | 'updated_at'
> & {
  mandatoryUnanswered: number
  toValidateCount: number
  /** #2179.25 — le total d'exigences extraites (colonne « exigences » de la vue table). */
  requirementsCount: number
  /** #2179.26 — le total d'obligatoires (colonne « couverture »). */
  mandatoryTotal: number
}

export type RfpDetail = { rfp: Rfp & { source_text?: string | null }; compliance: RfpCompliance }

export type RfpCreateBody = {
  title: string
  text?: string
  fileBase64?: string
  fileName?: string
  accountId?: string
  /** #2180.2 / #2180.4 — au moins deux documents, regroupés dans UN dossier. */
  documents?: { text?: string; fileBase64?: string; fileName?: string }[]
}

export const rfpApi = {
  list(): Promise<{ rfps: RfpSummary[] }> {
    return apiFetch({ path: '/rfp' })
  },
  get(id: string): Promise<RfpDetail> {
    return apiFetch({ path: `/rfp/${id}` })
  },
  create(body: RfpCreateBody): Promise<RfpDetail> {
    return apiFetch({ path: '/rfp', method: 'POST', body })
  },
  /**
   * #2180.5 — analyse le ou les documents SANS rien écrire. L'écran de
   * preview (#2180.41-46) affiche `indicators`, puis laisse exclure un
   * document (#2180.49) ou en ajouter un (#2180.50) — chaque geste rappelle
   * `preview` avec la liste mise à jour.
   */
  preview(body: RfpCreateBody): Promise<RfpImportPreview> {
    return apiFetch({ path: '/rfp/preview', method: 'POST', body })
  },
  /**
   * #2180.6 — la SEULE écriture d'un import prévisualisé : exactement le
   * brouillon rendu par `preview`, jamais une ré-analyse.
   */
  /**
   * #2179.31 — `sourceNeedId` : le besoin dont le dossier est tiré, posé en
   * `need_id` côté serveur (après vérification dans l'espace).
   *
   * #2957 (#2180.54) — `sourceDocuments` : les MÊMES octets bruts déjà
   * envoyés à `preview` (qui n'écrit rien), RESSAISIS ici pour que `confirm`
   * reste la SEULE écriture, fichiers compris.
   */
  confirm(
    draft: RfpImportDraft,
    sourceNeedId?: string,
    sourceDocuments?: { text?: string; fileBase64?: string; fileName?: string }[],
  ): Promise<RfpDetail> {
    return apiFetch({
      path: '/rfp/confirm',
      method: 'POST',
      body: {
        draft,
        ...(sourceNeedId ? { sourceNeedId } : {}),
        ...(sourceDocuments && sourceDocuments.length > 0 ? { sourceDocuments } : {}),
      },
    })
  },
  /**
   * Transforme l'appel d'offres en besoin ouvert (#1097) : il entre dans la vue
   * transverse des besoins et devient de la matière pour le moteur de matching
   * du vivier — déterministe, explicable, sans crédit.
   *
   * Le projet est choisi par l'utilisateur ; les compétences ne sont PAS
   * dérivées du document (voir `needFromRfp` côté serveur).
   */
  createNeed(id: string, projectId: string): Promise<ProjectNeed> {
    return apiFetch({ path: `/rfp/${id}/need`, method: 'POST', body: { projectId } })
  },
  decide(id: string, verdict: 'bid' | 'no_bid'): Promise<{ rfp: RfpSummary }> {
    return apiFetch({ path: `/rfp/${id}/decision`, method: 'POST', body: { verdict } })
  },
  /** #2957 (#2181.47) — geste déclaratif, jamais une preuve d'envoi. */
  markSubmitted(id: string): Promise<{ rfp: RfpSummary }> {
    return apiFetch({ path: `/rfp/${id}/submitted`, method: 'POST' })
  },
  updateRequirement(id: string, requirementId: string, patch: UpdateRfpRequirement): Promise<RfpDetail> {
    return apiFetch({ path: `/rfp/${id}/requirements/${requirementId}`, method: 'PATCH', body: patch })
  },
  /** #2957 (#2181.40) — attribuer une section entière à un rôle. */
  assignSection(id: string, section: string | null, owner_role: RfpOwnerRole): Promise<RfpDetail> {
    return apiFetch({ path: `/rfp/${id}/sections/owner`, method: 'PATCH', body: { section, owner_role } })
  },
  /** #2957 (#2181.15) — commenter une exigence ; auteur et date posés par le serveur. */
  addComment(id: string, requirementId: string, body: string): Promise<RfpDetail> {
    return apiFetch({ path: `/rfp/${id}/requirements/${requirementId}/comments`, method: 'POST', body: { body } })
  },
  draft(id: string, requirementId: string, approvedSources: { title: string; content: string }[]): Promise<RfpDetail> {
    return apiFetch({
      path: `/rfp/${id}/requirements/${requirementId}/draft`,
      method: 'POST',
      body: { approvedSources },
    })
  },
  /** #2957 (#2180.53) — l'import EN COURS, à reprendre après une interruption (`null` = aucun). */
  importSession(): Promise<{ session: RfpImportSession | null }> {
    return apiFetch({ path: '/rfp/import-session' })
  },
  /** #2957 (#2180.53) — garde l'aperçu rendu ; jamais les octets des fichiers. */
  saveImportSession(body: SaveRfpImportSession): Promise<RfpImportSession> {
    return apiFetch({ path: '/rfp/import-session', method: 'PUT', body })
  },
  /** #2957 (#2180.53) — « Annuler l'import » : la session est archivée côté serveur. */
  cancelImportSession(): Promise<{ cancelled: true }> {
    return apiFetch({ path: '/rfp/import-session', method: 'DELETE' })
  },
  /** #2957 (#2180.54) — ce que le stockage porte pour CE dossier. */
  sourceDocuments(id: string): Promise<RfpSourceDocumentFilesResponse> {
    return apiFetch({ path: `/rfp/${id}/documents` })
  },
  /** #2957 (#2180.54) — une URL signée, au clic, jamais gardée. */
  downloadSourceDocument(id: string, objectId: string): Promise<SignedDownload> {
    return apiFetch({ path: `/rfp/${id}/documents/${objectId}/download` })
  },
}

export const rfpKeys = {
  list: ['rfp', 'list'] as const,
  importSession: ['rfp', 'import-session'] as const,
  detail: (id: string) => ['rfp', 'detail', id] as const,
  sourceDocuments: (id: string) => ['rfp', 'detail', id, 'documents'] as const,
}
