import {
  signedDownloadSchema,
  type ChatImageObjects,
  type ChatImageRegion,
  type MarketLocale,
  type RagDocumentPreview,
  type RagDocumentScope,
  type RagProcessingStatus,
  type RagZipIngestJobStart,
  type RagZipIngestJobStatus,
  type RagZipIngestReport,
  type SignedDownload,
  type WritableImportObject,
} from '@bellum/contracts'
import { followIngestZipJob } from './ingest-zip-job'
import { apiFetch } from '@/lib/api'

export type RagDocument = {
  id: string
  title: string | null
  category: string | null
  created_at: string
  user_id: string
  /** #3669.2 — absent/`null` = non évalué : l'écran n'affiche alors aucune ligne d'état. */
  processing_status?: RagProcessingStatus | null
  /**
   * #3623.4 (recette prod 09/10) — la PORTÉE voyageait déjà dans la réponse du
   * serveur (`rag.service.ts::listForWorkspace` la sélectionne) mais n'était
   * déclarée nulle part côté client : « Connaissances » l'affichait sans dire
   * à quel compte un document `account` était rattaché. Absent = API
   * antérieure au champ, jamais un document `workspace` deviné.
   */
  scope?: RagDocumentScope | null
  /** #3623.4 — le compte visé quand `scope === 'account'`. `null`/absent pour
   *  toute autre portée — jamais un compte deviné. */
  account_id?: string | null
}

export type IngestInput = {
  title: string
  category: string
  // Texte brut (txt/md/csv/json). Optionnel : un PDF passe par `fileB64` et le
  // texte est extrait serveur-side (IA, pypdf). Théo p.21.
  content?: string
  fileB64?: string
  filename?: string
  /**
   * #1954.7 — la PORTÉE du document (Louis, 12/09/2026). `workspace` (défaut)
   * ancre l'analyse de toute l'équipe, EXACTEMENT comme avant cette décision.
   * `conversation` : le document ne sert QU'AU FIL qui l'a déposé — jamais
   * listé dans `/knowledge`, jamais dans le RAG d'une analyse de compte,
   * jamais dans un autre fil. `conversationId` est obligatoire dans ce cas
   * (le serveur le refuse sinon — `ragIngestSchema`, `apps/api`).
   *
   * ⚠️ Optionnels : omis, le comportement reste celui d'avant au bit près —
   * aucun appelant existant n'est touché par ce lot. C'est l'écran du chat
   * (un autre lot) qui les enverra le jour où il proposera un choix de portée.
   */
  scope?: RagDocumentScope
  conversationId?: string
  /** #2779 — le compte visé quand `scope: 'account'` (vérifié côté serveur). */
  accountId?: string
  /**
   * #2861 (#2437.2, niveau SOURCE) — la langue ORIGINALE du document,
   * DÉCLARÉE par la personne qui dépose, jamais détectée. Omise = `NULL` en
   * base (« non mesuré »).
   */
  language?: MarketLocale
}

/**
 * #2667.1 — ce qu'une archive .zip jointe au chat demande au serveur : SES
 * octets, une fois — le dépliage (nombre d'entrées, taille décompressée,
 * chemins) est un refus SERVEUR (`RagZipIngestService`, `@bellum/contracts`),
 * jamais deviné ici.
 */
export type IngestZipInput = {
  fileB64: string
  filename: string
  category?: string
  scope?: RagDocumentScope
  conversationId?: string
  /** #2779 — le compte visé quand `scope: 'account'` (vérifié côté serveur). */
  accountId?: string
}

/** #2148.16 — ce qu'une pièce jointe de CONVERSATION (cas a) demande au
 *  serveur : les octets du fichier, une fois — jamais un titre, jamais une
 *  portée, puisque rien n'est ingéré. */
export type ExtractInput = {
  fileB64: string
  filename?: string
}

export const ragApi = {
  list(): Promise<RagDocument[]> {
    return apiFetch<RagDocument[]>({ path: '/rag-documents' })
  },
  /**
   * #1954.19 — PRÉVISUALISER un document DÉJÀ attaché (menu de la carte de
   * pièce jointe, `Chat.tsx`) : un clic ouvre un aperçu de son contenu.
   */
  getContent(id: string): Promise<RagDocumentPreview> {
    // #3803 — `source` décrit l'original conservé (`null` = non conservé).
    return apiFetch<RagDocumentPreview>({ path: `/rag-documents/${id}` })
  },
  /** #3803 (3803.2) — les OCTETS de l'original, lus par la visionneuse. */
  getSourceBytes(id: string): Promise<ArrayBuffer> {
    return apiFetch<ArrayBuffer>({ path: `/rag-documents/${id}/source`, responseType: 'arrayBuffer' })
  },
  /** #3803 (3803.5) — « Télécharger l'original » : une URL signée de cinq minutes, demandée au clic. */
  getSourceLink(id: string): Promise<SignedDownload> {
    return apiFetch<SignedDownload>({ path: `/rag-documents/${id}/source/link` })
  },
  delete(id: string): Promise<void> {
    return apiFetch<void>({ path: `/rag-documents/${id}`, method: 'DELETE' })
  },
  /**
   * #1954.22 puis #2779 — changer la portée d'un document DÉJÀ attaché (menu
   * de la carte de pièce jointe, `Chat.tsx`), vers N'IMPORTE LAQUELLE des cinq
   * portées du contrat. `conversationId` est obligatoire quand `scope:
   * 'conversation'`, `accountId` quand `scope: 'account'` — le serveur les
   * refuse sinon (`ragScopeUpdateInputSchema`, `@bellum/contracts`), même
   * garde que `ingest`.
   */
  updateScope(
    id: string,
    scope: RagDocumentScope,
    targets: { conversationId?: string; accountId?: string } = {},
  ): Promise<void> {
    return apiFetch<void>({
      path: `/rag-documents/${id}/scope`,
      method: 'PATCH',
      body: {
        scope,
        ...(targets.conversationId ? { conversationId: targets.conversationId } : {}),
        ...(targets.accountId ? { accountId: targets.accountId } : {}),
      },
    })
  },
  /**
   * Ingest goes through the NestJS proxy (`POST /rag-documents/ingest`): it
   * authenticates the cookie, derives user_id from the JWT and forwards to the
   * IA embeddings endpoint with the internal secret. No more cross-origin,
   * un-authenticated call to the IA host.
   */
  /**
   * Rend l'IDENTIFIANT du document créé (pas `void`) et si l'extraction est
   * COMPLÈTE (#1954.16 / #1954.30).
   *
   * L'identifiant : sans lui, l'appelant sait que le dépôt a réussi mais ne
   * peut plus DÉSIGNER le document. C'est ce qui manquait au composeur du
   * copilote : le fichier partait bien dans la base, et rien ne pouvait
   * ensuite le rattacher au message que l'utilisateur écrivait juste après.
   * `id` vaut `null` quand la réponse ne le porte pas — l'ingestion a quand
   * même eu lieu, l'appelant se contente de ne pas pouvoir y référer.
   *
   * `partial` : un PDF où une page a un vrai texte et l'autre est un scan sans
   * calque texte reste ingéré (la page lisible sert), mais ce n'est jamais un
   * succès plein — la carte de la pièce doit le dire, pas prétendre « Prêt ».
   * `false` quand le serveur ne porte pas la clé (documents non-PDF, anciens
   * déploiements) : l'absence ne doit jamais se lire comme « partiel ».
   */
  async ingest(input: IngestInput): Promise<{
    id: string | null
    partial: boolean
    /** #2431.7 — le même contenu était DÉJÀ en base : `id` est celui du document existant, pas un nouveau. */
    duplicate: boolean
    suggestedObject: WritableImportObject | null
    /** #2850 (#2431.11, décision Louis 28/09) — non-`null` UNIQUEMENT quand la
     *  classification était en confiance HAUTE : une session d'import a été
     *  créée et SIMULÉE côté serveur (jamais appliquée) via la porte
     *  d'approbation existante de l'assistant d'import. `null` en confiance
     *  basse — reste une suggestion à revoir manuellement via Import. */
    pendingImportSessionId: string | null
  }> {
    const response = await apiFetch<{ success: boolean; data: Record<string, unknown> }>({
      path: '/rag-documents/ingest',
      method: 'POST',
      body: input,
    })
    const id = response?.data?.['id']
    const partial = response?.data?.['partial']
    // #2850 (#2431.2/.10, reste 27/09) — un fichier tabulaire dont les colonnes
    // matchent une source d'import connue (`chat-import-classifier.ts`, serveur) :
    // `null` reste le cas courant (RAG seul, comportement d'avant à l'octet).
    const suggestedObject = response?.data?.['suggestedImportObject']
    const pendingImportSessionId = response?.data?.['pendingImportSessionId']
    return {
      id: typeof id === 'string' && id ? id : null,
      partial: partial === true,
      duplicate: response?.data?.['duplicate'] === true,
      suggestedObject: typeof suggestedObject === 'string' ? (suggestedObject as WritableImportObject) : null,
      pendingImportSessionId: typeof pendingImportSessionId === 'string' ? pendingImportSessionId : null,
    }
  },
  /**
   * #2431.5 (reste, épopée #2886) — « Remplacer / actualiser » une source déjà
   * importée : ingère le NOUVEAU document (même corps qu'`ingest`) et lie
   * l'ANCIEN (`id`) au nouveau, côté serveur — l'ancien reste en base,
   * archivé, jamais supprimé.
   */
  async replace(id: string, input: IngestInput): Promise<{ id: string | null; partial: boolean }> {
    const response = await apiFetch<{ success: boolean; data: Record<string, unknown> }>({
      path: `/rag-documents/${id}/replace`,
      method: 'POST',
      body: input,
    })
    const newId = response?.data?.['id']
    const partial = response?.data?.['partial']
    return { id: typeof newId === 'string' && newId ? newId : null, partial: partial === true }
  },
  /**
   * #2667.1 — une archive .zip entière, dépliée CÔTÉ SERVEUR
   * (`RagZipIngestService`). Rend le sort de CHAQUE entrée — jamais un succès
   * ou un échec global qui cacherait lesquelles ont abouti.
   */
  async ingestZip(
    input: IngestZipInput,
    options: { onStatus?: (status: RagZipIngestJobStatus) => void } = {},
  ): Promise<RagZipIngestReport> {
    // #3623.11 / #3666.10 — le serveur met l'archive en file et rend un
    // identifiant ; on suit son statut jusqu'au rapport (mêmes appelants).
    const started = await apiFetch<RagZipIngestJobStart>({
      path: '/rag-documents/ingest/zip',
      method: 'POST',
      body: input,
    })
    return followIngestZipJob(
      () =>
        apiFetch<RagZipIngestJobStatus>({
          path: `/rag-documents/ingest/zip/${encodeURIComponent(started.jobId)}`,
        }),
      { onStatus: options.onStatus },
    )
  },
  /**
   * #2148.16 — LA PIÈCE JOINTE DE CONVERSATION (cas a) : le texte d'un fichier,
   * jamais une ligne de `rag_documents`. `ingest` ci-dessus reste le chemin
   * de la base de connaissance (cas b, geste explicite).
   *
   * #2876 (#2433.4) — pour une IMAGE, le serveur RANGE aussi l'image
   * elle-même (best-effort, domaine `chat_image_attachment`) et rend son
   * identifiant : `imageObjectId`, absent pour tout le reste (document non-
   * image, stockage désactivé côté serveur, salle de démonstration).
   */
  extract(input: ExtractInput): Promise<{
    text: string
    partial: boolean
    imageObjectId?: string
    /** #2433.4 — où chaque ligne a été lue dans l'image ; absent sans zone mesurée. */
    regions?: ChatImageRegion[]
    /** #2433.12 — bords du document et grille d'un tableau ; absent = rien mesuré. */
    objects?: ChatImageObjects
  }> {
    return apiFetch<{ text: string; partial: boolean; imageObjectId?: string }>({
      path: '/rag-documents/extract',
      method: 'POST',
      body: input,
    })
  },
  /**
   * #2876 (#2433.4) — RÉOUVRIR une image de chat rangée : une URL signée de
   * cinq minutes. Demandée au clic, jamais mise en cache (même discipline que
   * `fetchVoicePlayback`, #1939) — la preuve visuelle d'un message ENVOYÉ,
   * relue par n'importe quel membre de l'espace.
   */
  async getImageUrl(objectId: string): Promise<SignedDownload> {
    const response = await apiFetch<unknown>({ path: `/rag-documents/image/${encodeURIComponent(objectId)}` })
    return signedDownloadSchema.parse(response)
  },
}
