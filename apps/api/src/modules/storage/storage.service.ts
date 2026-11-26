import { BadRequestException, Injectable, Logger, NotFoundException, PayloadTooLargeException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  STORAGE_WORKSPACE_QUOTA_BYTES,
  STORED_EXTERNAL_CONTRACT_UPLOAD_ACCEPT,
  STORED_FILE_ACCEPT,
  STORED_FILE_MAX_BYTES,
  STORED_FILE_SIGNED_URL_TTL_SECONDS,
  refuseStoredFile,
  storageObjectPath,
  storedFileContentTypeFor,
  storedFileRetentionUntil,
  type SignedDownload,
  type StorageDomain,
  type StoredFile,
  type StoredFileRefusal,
} from '@bellum/contracts'
import { createHash, randomUUID } from 'node:crypto'
import { StorageObjectEntity } from '../../database/entities/storage-object.entity'
import { StorageClient } from './storage.client'

/**
 * LE STOCKAGE DE FICHIERS — les règles (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE CLOISONNEMENT EST LA PREMIÈRE RÈGLE, PAS LA DERNIÈRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Il est écrit à trois endroits, et les trois sont nécessaires :
 *
 *  1. **dans le CHEMIN** — l'espace en est le premier segment, et le troisième
 *     est un identifiant tiré au hasard. Le chemin d'un objet ne se devine donc
 *     pas depuis celui d'un autre, même en connaissant l'espace et le nom ;
 *  2. **dans la LECTURE** — toute requête est bornée par `workspace_id`, et pas
 *     filtrée après coup. Un identifiant deviné ne trouve rien ;
 *  3. **au-dessus** — une URL n'est signée qu'après que l'APPELANT a vérifié le
 *     droit de lire l'objet PARENT (la note de frais, le document du besoin).
 *     Ce service ne connaît pas ces objets-là et n'a pas à les connaître : sa
 *     porte n'est atteignable que depuis un contrôleur qui a déjà tranché.
 *
 * ⚠️ Ce service ne prend AUCUNE décision de droit métier. Il ne sait pas ce
 * qu'est une note de frais. C'est ce qui lui permet de servir deux domaines
 * sans en connaître aucun — et ce qui interdit de lui confier la vérification.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucun antivirus, aucun OCR, aucune extraction. Un fichier est un fichier : on
 * le reçoit, on le range, on le rend, on l'oublie à la date dite. Le contenu
 * n'est jamais lu — ni par nous, ni par un modèle.
 *
 * ⚠️ #2438.7 (22/09/2026, tranché par Louis — decisions-louis-22-09-soir.md
 * §1) NUANCE cette règle, elle ne la renverse pas : `refuseStoredFile` vérifie
 * désormais la SIGNATURE des tout premiers octets contre l'extension
 * déclarée (`extensionMatchesFileSignature`, `@bellum/contracts`) — un
 * contrôle de FORME, pas une lecture de contenu métier. La détection de
 * macros, elle, exigerait un vrai parsing (ZIP/OLE) : délibérément PAS faite,
 * pour la même raison qui interdit l'OCR ici.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name)

  constructor(
    @InjectRepository(StorageObjectEntity) private readonly objects: Repository<StorageObjectEntity>,
    private readonly client: StorageClient,
  ) {}

  /**
   * Le quota d'un espace, en octets.
   *
   * ⚠️ La valeur vit à UN seul endroit (GA-26) : le défaut est celui des
   * contrats, que les DEUX côtés lisent, et l'environnement ne fait que le
   * déplacer. Une valeur illisible retombe sur le défaut, jamais sur une erreur
   * — un quota qu'on ne sait pas lire ne doit pas fermer le dépôt à tout le
   * monde.
   */
  quotaBytes(): number {
    const raw = Number(process.env['STORAGE_WORKSPACE_QUOTA_BYTES'])
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : STORAGE_WORKSPACE_QUOTA_BYTES
  }

  /**
   * Ce que cet espace occupe déjà, en octets.
   *
   * ⚠️ Le `COALESCE(…, 0)` est juste ICI, et c'est une exception qui se
   * justifie : un espace SANS aucun objet occupe réellement zéro octet —
   * l'absence de ligne EST la réponse, elle n'attend rien. Le même `COALESCE`
   * sur une valeur qu'on n'aurait pas su lire serait « un zéro qui ment ».
   */
  async usedBytes(workspaceId: string): Promise<number> {
    const [row] = await this.objects.manager.query<{ used: string | null }[]>(
      `SELECT COALESCE(SUM(byte_size), 0)::bigint AS used FROM storage_objects WHERE workspace_id = $1`,
      [workspaceId],
    )
    return Number(row?.used ?? 0)
  }

  /**
   * DÉPOSE un fichier.
   *
   * L'ordre des trois écritures n'est pas indifférent :
   *  1. les REFUS d'abord, avant tout octet transmis — un fichier de 40 Mo
   *     refusé après deux minutes d'envoi est une insulte à qui l'a déposé ;
   *  2. les OCTETS ensuite ;
   *  3. la LIGNE en dernier — et si elle ne s'écrit pas, **les octets
   *     repartent**. Sans ce retour en arrière, le quota d'un espace enflerait
   *     sans qu'aucune ligne ne le dise, et personne ne saurait quoi effacer.
   *
   * `today` est un PARAMÈTRE et non `new Date()` lu ici : l'échéance de
   * conservation doit être reproductible, et un test qui dépend de l'horloge du
   * serveur devient rouge un jour de plus dans le mois.
   */
  async put(input: {
    workspaceId: string
    domain: StorageDomain
    fileName: string
    /** Ce que le client DÉCLARE. Reçu pour ne casser personne, jamais cru. */
    contentType: string
    fileB64: string
    uploadedBy: string | null
    today: string
  }): Promise<StorageObjectRecord> {
    const bytes = Buffer.from(input.fileB64, 'base64')
    const refusal = refuseStoredFile({
      fileName: input.fileName,
      byteSize: bytes.byteLength,
      workspaceUsedBytes: await this.usedBytes(input.workspaceId),
      quotaBytes: this.quotaBytes(),
      // #1939 — le DOMAINE décide des types acceptés : audio pour un message
      // vocal, la liste des pièces pour les deux autres (inchangée pour eux).
      domain: input.domain,
      // #2438.7 — les octets sont déjà en main ICI (décodés juste au-dessus) :
      // la signature réelle du fichier est vérifiée contre son extension
      // déclarée, jamais son Content-Type affirmé par le client.
      bytes,
    })
    if (refusal) throw refusalError(refusal, this.quotaBytes(), input.domain)

    // Le type retenu est celui de l'EXTENSION. `refuseStoredFile` vient de
    // garantir qu'il existe — le `??` n'est là que parce que TypeScript ne peut
    // pas le savoir, et il ne s'exécute jamais.
    const contentType = storedFileContentTypeFor(input.domain, input.fileName) ?? 'application/octet-stream'
    const retentionUntil = storedFileRetentionUntil(input.domain, input.today)
    if (!retentionUntil) {
      // Une échéance qu'on ne sait pas calculer n'est PAS une échéance qu'on
      // invente : sans elle, le fichier serait gardé pour toujours ou effacé
      // trop tôt, et personne ne saurait lequel des deux.
      throw new BadRequestException(
        'La date de dépôt est illisible : l’échéance de conservation ne peut pas être posée.',
      )
    }

    const objectId = randomUUID()
    const objectPath = storageObjectPath({
      workspaceId: input.workspaceId,
      domain: input.domain,
      objectId,
      fileName: input.fileName,
    })
    // #2438.7 — L'EMPREINTE : un hachage ne LIT rien du contenu, il le résume.
    // Calculée une fois, ici, et CONSERVÉE — jamais recalculée à la lecture.
    const contentSha256 = createHash('sha256').update(bytes).digest('hex')

    await this.client.put(objectPath, bytes, contentType)
    try {
      const [row] = await this.objects.manager.query<{ id: string; created_at: string | Date }[]>(
        `INSERT INTO storage_objects (workspace_id, domain, object_path, file_name, content_type, byte_size, retention_until, uploaded_by, content_sha256)
         VALUES ($1, $2, $3, $4, $5, $6::bigint, $7::date, $8, $9)
         RETURNING id, created_at`,
        [
          input.workspaceId,
          input.domain,
          objectPath,
          input.fileName.trim(),
          contentType,
          bytes.byteLength,
          retentionUntil,
          input.uploadedBy,
          contentSha256,
        ],
      )
      if (!row) throw new Error('storage_objects: aucune ligne rendue par l’insertion')
      return {
        id: row.id,
        fileName: input.fileName.trim(),
        contentType,
        byteSize: bytes.byteLength,
        retentionUntil,
        uploadedAt: new Date(row.created_at).toISOString(),
        contentSha256,
      }
    } catch (error) {
      // ⚠️ Les octets repartent, PUIS l'erreur d'origine remonte telle quelle.
      // La masquer ferait chercher au mauvais endroit.
      await this.client.remove([objectPath])
      this.logger.error(`Dépôt annulé — les octets ont été retirés : ${objectPath}`, { error })
      throw error
    }
  }

  /**
   * L'URL de lecture d'un objet de CET espace. Cinq minutes.
   *
   * ⚠️ La borne d'espace est DANS la requête (`workspace_id = $2`), pas dans un
   * `if` qui suivrait : un identifiant deviné ne trouve rien, et le magasin
   * n'est même pas interrogé. C'est la différence entre « on refuse » et « rien
   * n'a pu fuiter ».
   */
  async signedUrlFor(workspaceId: string, objectId: string): Promise<SignedDownload> {
    const object = await this.findInWorkspace(workspaceId, objectId)
    const url = await this.client.signedUrl(object.object_path, STORED_FILE_SIGNED_URL_TTL_SECONDS)
    return {
      url,
      expiresAt: new Date(Date.now() + STORED_FILE_SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
      fileName: object.file_name,
    }
  }

  /**
   * EFFACE un objet de cet espace — les octets, puis la ligne.
   *
   * ⚠️ Cet ordre-là est le seul possible : la ligne PORTE le chemin. Effacée
   * d'abord, elle laisserait des octets que plus rien ne sait retrouver — ni
   * pour les rendre, ni pour les effacer. Le coût du bon ordre est un objet
   * effacé dont la ligne survivrait à un incident ; sa ligne pointe alors un
   * objet absent, ce que la lecture dit proprement.
   */
  async remove(workspaceId: string, objectId: string): Promise<void> {
    const object = await this.findInWorkspace(workspaceId, objectId)
    await this.client.remove([object.object_path])
    await this.objects.manager.query(`DELETE FROM storage_objects WHERE id = $1 AND workspace_id = $2`, [
      objectId,
      workspaceId,
    ])
  }

  /**
   * Les objets d'un espace, indexés par identifiant — pour joindre une liste de
   * pièces à ce qui est réellement rangé, en UNE requête.
   *
   * Un identifiant qui ne revient pas est ABSENT de la table : c'est une
   * réponse (« cette pièce est référencée, pas stockée »), pas un échec.
   */
  async byIds(workspaceId: string, objectIds: readonly string[]): Promise<Map<string, StorageObjectRecord>> {
    const ids = [...new Set(objectIds)]
    if (ids.length === 0) return new Map()
    const rows = await this.objects.manager.query<ObjectRow[]>(
      `SELECT id, object_path, file_name, content_type, byte_size, retention_until, created_at, content_sha256
         FROM storage_objects WHERE workspace_id = $1 AND id = ANY($2::uuid[])`,
      [workspaceId, ids],
    )
    return new Map(rows.map(row => [row.id, toRecord(row)]))
  }

  /**
   * LA PURGE des fichiers échus — la contrepartie de la conservation datée.
   *
   * Bornée par passage, et ce plafond n'est pas là pour ménager la base : il est
   * là pour qu'aucune instruction de ce dépôt ne soit une suppression de masse.
   * Un balayage quotidien borné met plusieurs jours à rattraper un arriéré, et
   * c'est exactement ce qu'on veut d'un geste irréversible — une fenêtre pendant
   * laquelle on peut encore l'arrêter.
   *
   * ⚠️ Les OCTETS partent avant les LIGNES, pour la raison écrite sur
   * {@link remove} : la ligne porte le chemin.
   *
   * ⚠️ La purge est INTER-ESPACES à dessein — c'est un balayage d'exploitation,
   * pas une lecture de locataire. Elle ne rend aucune donnée : elle compte.
   */
  async purgeExpired(today: string, limit: number): Promise<{ removed: number }> {
    const expired = await this.objects.manager.query<{ id: string; object_path: string }[]>(
      `SELECT id, object_path FROM storage_objects WHERE retention_until < $1::date ORDER BY retention_until LIMIT $2`,
      [today, limit],
    )
    if (expired.length === 0) return { removed: 0 }

    await this.client.remove(expired.map(row => row.object_path))
    await this.objects.manager.query(`DELETE FROM storage_objects WHERE id = ANY($1::uuid[])`, [
      expired.map(row => row.id),
    ])
    this.logger.log(`Purge de rétention : ${expired.length} fichier(s) échu(s) effacé(s).`)
    return { removed: expired.length }
  }

  /**
   * #1939.9 — EFFACE TOUT DE SUITE les enregistrements vocaux d'une personne
   * (décision Louis du 12/09 : « tout effacer tout de suite »).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE SEUL EFFACEMENT DE CE SERVICE QUI N'ATTEND PAS L'ÉCHÉANCE — D'OÙ SA FORME
   * ─────────────────────────────────────────────────────────────────────────
   * `purgeExpired` efface ce qui est ÉCHU, tous domaines confondus. Celui-ci
   * efface AVANT l'échéance, et il ne doit pouvoir atteindre QU'UN domaine : un
   * justificatif (10 ans, L123-22) ou une pièce d'affaire (5 ans, L110-4) portent
   * une obligation de conservation que la suppression d'un compte ne lève pas.
   * Le domaine est donc ÉCRIT dans chaque requête, jamais reçu en paramètre : la
   * méthode ne sait rien effacer d'autre, quel que soit son appelant
   * (`storage-voice.service.spec.ts`).
   *
   * Portée : `uploaded_by`, tous espaces confondus — c'est la voix d'une
   * PERSONNE, et elle part où qu'elle ait été déposée.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * SI LE MAGASIN REFUSE
   * ─────────────────────────────────────────────────────────────────────────
   * Les lignes ne sont PAS effacées : elles portent le seul chemin vers ces
   * octets, et les effacer laisserait une voix que plus rien ne sait retrouver —
   * conservée pour toujours. Elles passent ÉCHUES (`retention_until` = la veille)
   * : le balayage de la nuit les reprend par le chemin ordinaire. Le compte le
   * dit (`deferred`), il ne prétend pas avoir effacé.
   */
  async eraseVoiceMessagesUploadedBy(userId: string, today: string): Promise<{ erased: number; deferred: number }> {
    const rows = await this.objects.manager.query<{ id: string; object_path: string }[]>(
      `SELECT id, object_path FROM storage_objects WHERE domain = 'chat_voice_message' AND uploaded_by = $1`,
      [userId],
    )
    if (rows.length === 0) return { erased: 0, deferred: 0 }

    const ids = rows.map(row => row.id)
    const accepted = await this.client.remove(rows.map(row => row.object_path))
    if (!accepted) {
      await this.objects.manager.query(
        `UPDATE storage_objects SET retention_until = ($2::date - 1) WHERE id = ANY($1::uuid[]) AND domain = 'chat_voice_message'`,
        [ids, today],
      )
      // Un compte, jamais un chemin ni un identifiant de personne.
      this.logger.error(
        `Effacement de compte : ${rows.length} enregistrement(s) vocal(aux) refusé(s) par le stockage — repris par la purge de la nuit.`,
      )
      return { erased: 0, deferred: rows.length }
    }

    await this.objects.manager.query(
      `DELETE FROM storage_objects WHERE id = ANY($1::uuid[]) AND domain = 'chat_voice_message'`,
      [ids],
    )
    return { erased: rows.length, deferred: 0 }
  }

  /**
   * #2876 (#2433.4) — même geste que {@link eraseVoiceMessagesUploadedBy},
   * sur le domaine `chat_image_attachment` : une image jointe au chat peut
   * porter la donnée personnelle d'un tiers (capture d'écran CRM, photo),
   * jamais une pièce de l'entreprise — elle part TOUT DE SUITE à l'effacement
   * d'un compte, sans attendre ses 30 jours.
   *
   * Dupliquée plutôt que généralisée avec la méthode vocale (même raison
   * qu'elle-même donne pour ne pas prendre de domaine en paramètre) : le
   * domaine est ÉCRIT dans chaque requête, jamais reçu — la méthode ne sait
   * rien effacer d'autre, quel que soit son appelant.
   */
  async eraseChatImageAttachmentsUploadedBy(
    userId: string,
    today: string,
  ): Promise<{ erased: number; deferred: number }> {
    const rows = await this.objects.manager.query<{ id: string; object_path: string }[]>(
      `SELECT id, object_path FROM storage_objects WHERE domain = 'chat_image_attachment' AND uploaded_by = $1`,
      [userId],
    )
    if (rows.length === 0) return { erased: 0, deferred: 0 }

    const ids = rows.map(row => row.id)
    const accepted = await this.client.remove(rows.map(row => row.object_path))
    if (!accepted) {
      await this.objects.manager.query(
        `UPDATE storage_objects SET retention_until = ($2::date - 1) WHERE id = ANY($1::uuid[]) AND domain = 'chat_image_attachment'`,
        [ids, today],
      )
      this.logger.error(
        `Effacement de compte : ${rows.length} image(s) de chat refusée(s) par le stockage — reprise(s) par la purge de la nuit.`,
      )
      return { erased: 0, deferred: rows.length }
    }

    await this.objects.manager.query(
      `DELETE FROM storage_objects WHERE id = ANY($1::uuid[]) AND domain = 'chat_image_attachment'`,
      [ids],
    )
    return { erased: rows.length, deferred: 0 }
  }

  /**
   * #3803 (3803.2/3803.5) — les OCTETS de l'original d'un document, pour la
   * visionneuse. Servis par l'API et non par une URL signée : la politique de
   * sécurité de l'écran n'autorise aucune connexion vers le magasin, et une
   * grille ou un docx se lisent dans la page, pas dans un onglet.
   *
   * ⚠️ Bornée à l'ESPACE et au DOMAINE dans la requête même : cette porte ne
   * rend jamais un justificatif comptable ni l'objet d'un autre espace, quel
   * que soit l'identifiant reçu. L'appelant a déjà vérifié le droit de lire
   * le DOCUMENT parent (`RagService.sourceObjectIdForReader`).
   */
  async readRagDocumentSource(
    workspaceId: string,
    objectId: string,
  ): Promise<{ bytes: Buffer; fileName: string; contentType: string }> {
    const [row] = await this.objects.manager.query<
      { id: string; object_path: string; file_name: string; content_type: string }[]
    >(
      `SELECT id, object_path, file_name, content_type FROM storage_objects
         WHERE id = $1 AND workspace_id = $2 AND domain = 'rag_document_source'`,
      [objectId, workspaceId],
    )
    if (!row) throw new NotFoundException('Fichier introuvable dans cet espace.')
    const bytes = await this.client.get(row.object_path)
    return { bytes, fileName: row.file_name, contentType: row.content_type }
  }

  /**
   * #3699.6 — les OCTETS du fichier d'un asset outreach, pour les joindre à un
   * envoi individuel que le commercial a choisi. Même forme que
   * {@link readRagDocumentSource} : bornée à l'ESPACE et au DOMAINE dans la
   * requête même — cette porte ne rend jamais une pièce comptable ni l'objet
   * d'un autre espace. L'empreinte rangée revient avec les octets : la preuve
   * d'envoi la cite, elle ne la recalcule pas.
   */
  async readOutreachAssetFile(
    workspaceId: string,
    objectId: string,
  ): Promise<{ bytes: Buffer; fileName: string; contentType: string; byteSize: number; sha256: string | null }> {
    const [row] = await this.objects.manager.query<
      {
        id: string
        object_path: string
        file_name: string
        content_type: string
        byte_size: string | number
        content_sha256: string | null
      }[]
    >(
      `SELECT id, object_path, file_name, content_type, byte_size, content_sha256 FROM storage_objects
         WHERE id = $1 AND workspace_id = $2 AND domain = 'outreach_asset_file'`,
      [objectId, workspaceId],
    )
    if (!row) throw new NotFoundException('Fichier introuvable dans cet espace.')
    const bytes = await this.client.get(row.object_path)
    return {
      bytes,
      fileName: row.file_name,
      contentType: row.content_type,
      byteSize: Number(row.byte_size),
      sha256: row.content_sha256 ?? null,
    }
  }

  /**
   * #3803 (3803.1) — la rétention d'un original EST la vie de son document.
   * `RagService.deleteForUser` l'emporte tout de suite ; ce balayage rattrape
   * tout le reste (purge des fils orphelins, effacement RGPD, suppression
   * côté service IA) : un original qu'AUCUN document ne porte plus part.
   *
   * Un jour de grâce : l'original est rangé APRÈS l'ingestion, puis lié — un
   * objet de quelques secondes n'est pas orphelin, il est en cours de liaison.
   * Domaine ÉCRIT dans chaque requête, jamais reçu (même forme que
   * {@link eraseVoiceMessagesUploadedBy}). Borné par passage, comme
   * {@link purgeExpired}.
   */
  async purgeOrphanRagDocumentSources(limit: number): Promise<{ removed: number }> {
    const orphans = await this.objects.manager.query<{ id: string; object_path: string }[]>(
      `SELECT so.id, so.object_path FROM storage_objects so
         WHERE so.domain = 'rag_document_source'
           AND so.created_at < now() - interval '1 day'
           AND NOT EXISTS (SELECT 1 FROM rag_documents rd WHERE rd.source_object_id = so.id)
         ORDER BY so.created_at LIMIT $1`,
      [limit],
    )
    if (orphans.length === 0) return { removed: 0 }
    const accepted = await this.client.remove(orphans.map(row => row.object_path))
    // Un magasin qui refuse : les lignes RESTENT (elles portent le chemin), le
    // prochain passage reprend — jamais une ligne effacée devant des octets vivants.
    if (!accepted) return { removed: 0 }
    await this.objects.manager.query(
      `DELETE FROM storage_objects WHERE id = ANY($1::uuid[]) AND domain = 'rag_document_source'`,
      [orphans.map(row => row.id)],
    )
    this.logger.log(`Originaux de documents orphelins effacés : ${orphans.length}.`)
    return { removed: orphans.length }
  }

  /** La lecture BORNÉE par l'espace — le seul chemin vers un objet. */
  private async findInWorkspace(workspaceId: string, objectId: string): Promise<ObjectRow> {
    const [row] = await this.objects.manager.query<ObjectRow[]>(
      `SELECT id, object_path, file_name, content_type, byte_size, retention_until, created_at
         FROM storage_objects WHERE id = $1 AND workspace_id = $2`,
      [objectId, workspaceId],
    )
    // Défense en profondeur : l'objet d'un AUTRE espace n'existe pas ici, même
    // si son identifiant a été deviné. Et le message ne dit pas qu'il existe
    // ailleurs — un 404 bavard est un annuaire.
    if (!row) throw new NotFoundException('Fichier introuvable dans cet espace.')
    return row
  }
}

/**
 * Un objet rangé, tel que l'API le manipule. Le CHEMIN n'en fait pas partie :
 * il ne sort jamais vers un client.
 *
 * NON exporté : il n'est nommé que dans ce fichier — les appelants le reçoivent
 * par inférence, depuis `put`, `byIds` ou `toStoredFile`. L'exporter inviterait
 * à le recopier ailleurs (règle du dépôt : jamais de type exporté qui n'est
 * consommé que chez lui).
 */
type StorageObjectRecord = {
  id: string
  fileName: string
  contentType: string
  byteSize: number
  retentionUntil: string
  uploadedAt: string
  /** #2438.7 — l'empreinte posée au dépôt ; `null` sur une ligne antérieure ou non relue. */
  contentSha256?: string | null
}

/**
 * Le passage de l'objet rangé au fichier que l'ÉCRAN reçoit.
 *
 * `downloadPath` est fourni par le DOMAINE, parce que la porte dépend de
 * l'objet parent : un justificatif s'ouvre par la note de frais, une pièce
 * d'affaire par le besoin. Le stockage ne connaît ni l'un ni l'autre.
 */
export function toStoredFile(record: StorageObjectRecord, downloadPath: string): StoredFile {
  return {
    id: record.id,
    fileName: record.fileName,
    contentType: record.contentType,
    byteSize: record.byteSize,
    retentionUntil: record.retentionUntil,
    uploadedAt: record.uploadedAt,
    downloadPath,
  }
}

type ObjectRow = {
  id: string
  object_path: string
  file_name: string
  content_type: string
  byte_size: string | number
  retention_until: string | Date
  created_at: string | Date
  content_sha256?: string | null
}

function toRecord(row: ObjectRow): StorageObjectRecord {
  return {
    id: row.id,
    fileName: row.file_name,
    contentType: row.content_type,
    byteSize: Number(row.byte_size),
    retentionUntil:
      typeof row.retention_until === 'string'
        ? row.retention_until.slice(0, 10)
        : row.retention_until.toISOString().slice(0, 10),
    uploadedAt: new Date(row.created_at).toISOString(),
    contentSha256: row.content_sha256 ?? null,
  }
}

/**
 * Le message d'un refus. UN seul endroit, pour que l'écran et le serveur disent
 * la même chose — et pour qu'aucun refus ne sorte muet.
 *
 * ⚠️ `too_large` sort en 413 et les autres en 400 : le premier est une propriété
 * de la REQUÊTE (une passerelle peut le trancher avant nous), les autres une
 * propriété de son CONTENU.
 */
function refusalError(refusal: StoredFileRefusal, quotaBytes: number, domain: StorageDomain): Error {
  const megabytes = Math.round(STORED_FILE_MAX_BYTES / (1024 * 1024))
  const gigabytes = Math.round((quotaBytes / (1024 * 1024 * 1024)) * 10) / 10
  switch (refusal) {
    case 'name_missing':
      return new BadRequestException('Ce fichier n’a pas de nom : renomme-le avant de le déposer.')
    case 'empty':
      return new BadRequestException('Ce fichier est vide — il ne contient aucun octet, il n’y a rien à ranger.')
    case 'too_large':
      return new PayloadTooLargeException(
        `Ce fichier dépasse ${megabytes} Mo. Compresse-le, ou dépose une version allégée.`,
      )
    case 'type_refused':
      // #1939 — la liste des formats de PIÈCES ne se lit pas à qui dépose un
      // message vocal : elle lui ferait chercher un PDF.
      if (domain === 'chat_voice_message') {
        return new BadRequestException('Ce format audio n’est pas accepté pour un message vocal.')
      }
      // #2422.6 — un contact externe ne dépose qu'une pièce de contrat
      // (PDF/image/docx) : lui citer xlsx/csv/txt lui ferait chercher un format
      // que cette porte refuse de toute façon.
      if (domain === 'legal_contract_external_upload') {
        return new BadRequestException(
          `Ce type de fichier n’est pas accepté. Formats acceptés : ${STORED_EXTERNAL_CONTRACT_UPLOAD_ACCEPT}.`,
        )
      }
      return new BadRequestException(`Ce type de fichier n’est pas accepté. Formats acceptés : ${STORED_FILE_ACCEPT}.`)
    case 'content_mismatch':
      // #2438.7 — l'extension déclarée ne correspond pas aux premiers octets
      // du fichier (ex. un exécutable renommé `.pdf`).
      return new BadRequestException(
        'Le contenu de ce fichier ne correspond pas à son extension. Vérifie qu’il n’a pas été renommé par erreur.',
      )
    case 'quota_exceeded':
      return new BadRequestException(
        `L’espace de stockage de cet espace de travail est plein (${gigabytes} Go). Supprime des fichiers échus, ou demande une extension.`,
      )
  }
}
