import { createHash } from 'node:crypto'
import AdmZip from 'adm-zip'
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import {
  ragZipCapRefusalMessage,
  validateRagZipEntries,
  type RagDocumentScope,
  type RagZipEntryOutcome,
  type RagZipIngestReport,
} from '@bellum/contracts'
import { IaClient } from '../ia/ia.client'

/**
 * #2667.1 — retour Louis (20/09/2026) : « en pièces jointes on doit aussi
 * pouvoir donner des archives zip et tout ». Décision (QCM du 21/09) : le
 * .zip est déplié CÔTÉ SERVEUR, ses entrées lisibles deviennent des pièces
 * jointes.
 *
 * Aucune seconde route d'ingestion : ce service RÉUNIT les octets (dépaquetage
 * ZIP) et les fait traverser `IaClient.ragIngest`, qui porte SEUL l'extraction
 * de texte et l'écriture dans le magasin — exactement le chemin d'un dépôt
 * unitaire (`RagController.ingest`). Même forme que `CvBatchImportService`
 * (#2569.1), pour les CV : dépaqueter, ne rien recoder.
 *
 * Les plafonds (`validateRagZipEntries`, `@bellum/contracts`, pur et testé
 * sans zip réel) sont vérifiés AVANT toute ingestion : une archive qui les
 * dépasse, ou qui porte une entrée hostile (chemin hors archive, archive
 * imbriquée), est refusée EN BLOC — rien n'est ingéré. Un fichier illisible
 * DEDANS une archive par ailleurs saine, lui, n'arrête pas les autres (règle 1
 * de `cvBatch.ts`, appliquée ici côté serveur).
 */
@Injectable()
export class RagZipIngestService {
  private readonly logger = new Logger(RagZipIngestService.name)

  constructor(private readonly ia: IaClient) {}

  async ingestZip(
    userId: string,
    workspaceId: string,
    fileB64: string,
    options: { category?: string; scope?: RagDocumentScope; conversationId?: string; accountId?: string } = {},
    onProgress?: (progress: { processed: number; total: number }) => Promise<void> | void,
  ): Promise<RagZipIngestReport> {
    let zip: AdmZip
    try {
      zip = new AdmZip(Buffer.from(fileB64, 'base64'))
    } catch (error) {
      this.logger.warn(`ZIP RAG ingest: archive illisible (${(error as Error).message})`)
      throw new BadRequestException('Archive ZIP illisible ou corrompue.')
    }

    // Les répertoires et les fichiers techniques du système (métadonnées
    // macOS, `.DS_Store`) ne sont pas des pièces jointes — les compter comme
    // des échecs ferait croire à une archive bruitée qu'elle ne l'est pas
    // (même filtre que `CvBatchImportService.importZip`, #2569.1).
    const entries = zip
      .getEntries()
      .filter(entry => !entry.isDirectory)
      .filter(entry => !entry.entryName.startsWith('__MACOSX/'))
      .filter(entry => !entry.entryName.toLowerCase().endsWith('.ds_store'))

    // #2667.1 — la taille CUMULÉE se mesure sur l'en-tête ZIP
    // (`entry.header.size`, le poids une fois décompressé), jamais en
    // décompressant d'abord : une bombe zip ne doit pas avoir à être ouverte
    // pour être refusée.
    const refusal = validateRagZipEntries(
      // #2431.8 — bit 0 des drapeaux ZIP = entrée chiffrée (mot de passe).
      entries.map(entry => ({
        name: entry.entryName,
        decompressedSize: entry.header.size,
        encrypted: (entry.header.flags & 1) === 1,
      })),
    )
    if (refusal) throw new BadRequestException(ragZipCapRefusalMessage(refusal))

    const outcomes: RagZipEntryOutcome[] = []
    // #2431.7 / #2431.13 — dédoublonnage PAR EMPREINTE dans l'archive : deux
    // entrées aux octets identiques (une copie « cv (1).pdf ») ne s'ingèrent
    // qu'une fois ; la seconde est NOMMÉE doublon de la première dans le
    // rapport. Le contenu n'est jamais journalisé, seule l'empreinte sert.
    const firstBySha = new Map<string, string>()
    for (const entry of entries) {
      await onProgress?.({ processed: outcomes.length, total: entries.length }) // #3623.11
      // #2431.12 — une entrée indécompressable reste un échec NOMMÉ de SA
      // ligne, jamais une exception qui arrêterait le reste du lot.
      let data: Buffer
      try {
        data = entry.getData()
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Échec inconnu.'
        outcomes.push({ status: 'failed', file: entry.entryName, reason })
        continue
      }
      const sha = createHash('sha256').update(data).digest('hex')
      const original = firstBySha.get(sha)
      if (original !== undefined) {
        outcomes.push({ status: 'duplicate', file: entry.entryName, duplicateOf: original })
        continue
      }
      firstBySha.set(sha, entry.entryName)
      try {
        const envelope = await this.ia.ragIngest({
          userId,
          workspaceId,
          title: entry.entryName,
          fileB64: data.toString('base64'),
          filename: entry.entryName,
          category: options.category,
          scope: options.scope,
          conversationId: options.conversationId,
          accountId: options.accountId, // #2779
        })
        const id = envelope?.data?.['id']
        if (typeof id === 'string' && id && envelope.data['duplicate'] === true) {
          // #2431.7 (reste) — le service IA a reconnu ce contenu contre la
          // base EXISTANTE (`content_hash`), pas contre cette archive : même
          // empreinte, système différent du `duplicate` intra-archive
          // (`firstBySha` ci-dessus), qui n'a jamais atteint le service IA.
          outcomes.push({ status: 'duplicate_existing', file: entry.entryName, existingId: id })
        } else if (typeof id === 'string' && id) {
          outcomes.push({ status: 'ingested', file: entry.entryName, id, partial: envelope.data['partial'] === true })
        } else {
          // L'ingestion a répondu SANS identifiant : traité comme un échec
          // nommé plutôt que comme un succès silencieux — l'appelant ne peut
          // de toute façon pas s'y référer (même garde que `ragApi.ingest`).
          outcomes.push({
            status: 'failed',
            file: entry.entryName,
            reason: 'Le serveur n’a pas confirmé le dépôt.',
          })
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Échec inconnu.'
        outcomes.push({ status: 'failed', file: entry.entryName, reason })
      }
    }
    return { total: outcomes.length, outcomes }
  }
}
