import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Not, Repository } from 'typeorm'
import { createHash } from 'node:crypto'
import { failure, success, type Result } from '@bellum/utils'
import {
  EMAIL_ATTACHMENT_MAX_COUNT,
  EMAIL_ATTACHMENT_MAX_TOTAL_BYTES,
  extensionMatchesFileSignature,
  outreachAssetGate,
  refuseEmailAttachments,
  type ContactAttachableDocument,
  type EmailAttachmentRefusal,
} from '@bellum/contracts'
import { OutreachAssetEntity } from '../../database/entities/outreach-asset.entity'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'
import { OUTREACH_ASSET_STORAGE, type OutreachAssetStorage } from './module-tokens'

/** Une pièce prête à partir : ce que le transport joint, et ce que la preuve d'envoi cite. */
type ResolvedEmailAttachment = {
  fileName: string
  contentType: string
  contentBase64: string
  byteSize: number
  /** L'empreinte des octets RÉELLEMENT relus pour partir — jamais celle d'un autre fichier. */
  sha256: string
}

type EmailAttachmentFailure = { code: 'attachment_refused'; message: string }

/**
 * #3699.6 — LES PIÈCES JOINTES D'UN ENVOI INDIVIDUEL, côté serveur.
 *
 * Le commercial CHOISIT les documents (la bibliothèque d'assets qui portent un
 * fichier réel) ; ce service ne choisit jamais à sa place — il dit ce qui est
 * joignable pour CE contact, puis, au moment de l'envoi, il relit, vérifie et
 * rend les octets. Le copilote ne joint rien seul.
 *
 * Ce qui est vérifié à l'envoi, sur ce qui est RELU du stockage (jamais sur
 * ce que le client affirme) :
 *  · l'asset existe DANS cet espace et porte un fichier ;
 *  · son droit d'usage le permet pour ce contact (`outreachAssetGate`,
 *    #2372.6 — « après intérêt confirmé ») ;
 *  · la signature des octets correspond à l'extension (même contrôle de forme
 *    que le dépôt), le type rangé est dans la liste, la taille totale et le
 *    nombre tiennent dans LE réglage (`refuseEmailAttachments`, GA-26) ;
 *  · l'empreinte relue égale l'empreinte du dépôt quand elle existe — un
 *    fichier altéré dans le magasin ne part pas sous le nom d'un autre.
 *
 * Toute pièce qui ne passe pas REFUSE l'envoi entier : jamais un e-mail qui
 * part sans la pièce que la personne a vue cochée. Le contenu n'est jamais
 * journalisé — ni nom, ni octet.
 */
@Injectable()
export class EmailAttachmentService {
  private readonly logger = new Logger(EmailAttachmentService.name)

  constructor(
    @InjectRepository(OutreachAssetEntity)
    private readonly assets: Repository<OutreachAssetEntity>,
    @Inject(OUTREACH_ASSET_STORAGE) private readonly storage: OutreachAssetStorage,
  ) {}

  /**
   * Les documents que la personne peut joindre à un e-mail pour CE contact.
   * Un asset SANS fichier ne fait aucune ligne (doctrine : on n'affiche pas ce
   * qu'on n'a pas) ; un asset retenu par son droit d'usage reste NOMMÉ, avec
   * sa raison — il ne disparaît pas en silence.
   */
  async attachableFor(workspaceId: string, contactId: string): Promise<ContactAttachableDocument[]> {
    const rows = await this.assets.find({
      where: { ...workspaceScopeWhere(workspaceId), storage_object_id: Not(IsNull()) },
      order: { created_at: 'ASC' },
    })
    if (rows.length === 0) return []
    const files = await this.storage.byIds(
      workspaceId,
      rows.map(row => row.storage_object_id).filter((id): id is string => Boolean(id)),
    )
    const interestConfirmed = rows.some(row => row.usage_rights !== 'always')
      ? await this.interestConfirmed(workspaceId, contactId)
      : false
    const documents: ContactAttachableDocument[] = []
    for (const row of rows) {
      const file = row.storage_object_id ? files.get(row.storage_object_id) : undefined
      if (!file) continue
      const gate = outreachAssetGate(row.usage_rights, interestConfirmed)
      documents.push({
        asset_id: row.id,
        title: row.title,
        file_name: file.fileName,
        content_type: file.contentType,
        byte_size: file.byteSize,
        blocked_reason: gate.ok ? null : gate.reason,
      })
    }
    return documents
  }

  /** Relit, vérifie et rend les pièces choisies — ou refuse l'envoi entier, raison nommée. */
  async resolveForSend(
    workspaceId: string,
    contactId: string,
    assetIds: readonly string[],
  ): Promise<Result<ResolvedEmailAttachment[], EmailAttachmentFailure>> {
    const ids = [...new Set(assetIds)]
    if (ids.length === 0) return success([])
    if (ids.length > EMAIL_ATTACHMENT_MAX_COUNT) return refused(refusalMessage('too_many'))

    const rows = await this.assets.find({ where: ids.map(id => ({ id, ...workspaceScopeWhere(workspaceId) })) })
    const byId = new Map(rows.map(row => [row.id, row]))
    const chosen = ids.map(id => byId.get(id))
    if (chosen.some(row => !row)) return refused('Un document choisi est introuvable dans cet espace.')
    const assets = chosen as OutreachAssetEntity[]
    if (assets.some(row => !row.storage_object_id)) {
      return refused("Un document choisi n'a pas de fichier : il ne peut pas être joint.")
    }

    if (assets.some(row => row.usage_rights !== 'always')) {
      const interest = await this.interestConfirmed(workspaceId, contactId)
      const blocked = assets.find(row => !outreachAssetGate(row.usage_rights, interest).ok)
      if (blocked) {
        return refused(
          `« ${blocked.title} » ne se joint qu'après un intérêt confirmé de ce contact : retire-le, ou attends sa réponse.`,
        )
      }
    }

    const resolved: ResolvedEmailAttachment[] = []
    for (const asset of assets) {
      let file: Awaited<ReturnType<OutreachAssetStorage['readOutreachAssetFile']>>
      try {
        file = await this.storage.readOutreachAssetFile(workspaceId, asset.storage_object_id as string)
      } catch (cause) {
        this.logger.warn('Email attachment unreadable', { error: cause, workspaceId })
        return refused(`Le fichier de « ${asset.title} » est illisible pour l'instant : rien n'est parti.`)
      }
      const sha256 = createHash('sha256').update(file.bytes).digest('hex')
      if (!extensionMatchesFileSignature(lastExtension(file.fileName), file.bytes)) {
        return refused(`Le fichier de « ${asset.title} » ne correspond pas à son type : il ne peut pas partir.`)
      }
      if (file.sha256 && file.sha256 !== sha256) {
        return refused(`Le fichier de « ${asset.title} » a changé depuis son dépôt : redépose-le avant de l'envoyer.`)
      }
      resolved.push({
        fileName: file.fileName,
        contentType: file.contentType,
        contentBase64: file.bytes.toString('base64'),
        byteSize: file.bytes.byteLength,
        sha256,
      })
    }

    const refusal = refuseEmailAttachments(resolved)
    if (refusal) return refused(refusalMessage(refusal))
    return success(resolved)
  }

  /**
   * Un intérêt est confirmé quand une séquence de ce contact a reçu l'effet
   * `reply_positive` (#2381.6) — la MÊME preuve que lit
   * `OutreachMessageService.confirmedInterest`, bornée à l'espace.
   */
  private async interestConfirmed(workspaceId: string, contactId: string): Promise<boolean> {
    const rows = await this.assets.manager.query<{ found: number }[]>(
      `SELECT 1 AS found FROM outreach_transitions t
         JOIN outreach_sequences s ON s.id = t.subject_id
        WHERE s.contact_id = $1 AND s.workspace_id = $2
          AND t.subject_kind = 'sequence' AND t.cause = 'reply_positive' AND t.result = 'applied'
        LIMIT 1`,
      [contactId, workspaceId],
    )
    return rows.length > 0
  }
}

function refused(message: string): Result<never, EmailAttachmentFailure> {
  return failure({ code: 'attachment_refused', message })
}

function lastExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(dot + 1) : ''
}

function refusalMessage(refusal: EmailAttachmentRefusal): string {
  const megabytes = (EMAIL_ATTACHMENT_MAX_TOTAL_BYTES / (1024 * 1024)).toLocaleString('fr-FR')
  switch (refusal) {
    case 'too_many':
      return `${EMAIL_ATTACHMENT_MAX_COUNT} pièces jointes au plus par e-mail : retire-en une.`
    case 'too_large':
      return `Les pièces jointes dépassent ${megabytes} Mo au total : retire-en une, ou dépose une version allégée.`
    case 'type_refused':
      return "Un document choisi n'est pas d'un type qui se joint à un e-mail."
    case 'empty':
      return 'Un document choisi est vide : il ne peut pas être joint.'
  }
}
