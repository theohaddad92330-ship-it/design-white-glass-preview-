import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { randomBytes, createHash } from 'node:crypto'
import type { Repository } from 'typeorm'
import {
  STORED_EXTERNAL_CONTRACT_UPLOAD_ACCEPT,
  STORED_FILE_MAX_BYTES,
  legalContractUploadLinkExpiresAt,
  legalContractUploadLinkIsUsable,
  type CreatedLegalContractUploadLink,
  type DepositLegalContractUploadInput,
  type LegalContractUploadLink,
  type LegalContractUploadLinkPublicStatus,
} from '@bellum/contracts'
import { computeUrl } from '@bellum/http'
import { returnedRows } from '../../database/returned-rows'
import { InvoiceReadinessEntity } from '../../database/entities/invoice-readiness.entity'
import { StorageService } from '../storage/storage.service'

/** Préfixe non sensible — rend un jeton fuité greppable, même patron que
 *  `API_KEY_PREFIX` (`api-keys.service.ts`). */
const TOKEN_PREFIX = 'cup_'

interface LinkRow {
  id: string
  workspace_id: string
  contract_id: string
  mission_id: string
  mission_label: string | null
  created_at: string | Date
  expires_at: string | Date
  revoked_at: string | Date | null
  deposits: unknown
}

function toView(row: LinkRow): LegalContractUploadLink {
  return {
    id: row.id,
    contractId: row.contract_id,
    missionId: row.mission_id,
    missionLabel: row.mission_label,
    createdAt: new Date(row.created_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
    deposits: Array.isArray(row.deposits) ? (row.deposits as LegalContractUploadLink['deposits']) : [],
  }
}

const LINK_SELECT_COLUMNS = `
  l.id, l.workspace_id, l.contract_id, l.mission_id, m.label AS mission_label,
  l.created_at, l.expires_at, l.revoked_at, l.deposits
`

/**
 * #2422.6 (épopée #2869, lot R24 07/10/2026) — LE LIEN SIGNÉ À PORTÉE LIMITÉE.
 *
 * Voir le docblock de `packages/contracts/src/schemas/legal-contract-upload-link.ts`
 * pour la décision et sa portée. Comme `LegalContractService`, ce service n'a
 * pas d'entité TypeORM dédiée : il emprunte le repository de
 * `InvoiceReadinessEntity` pour son seul accès à `manager.query`.
 */
@Injectable()
export class LegalContractUploadLinkService {
  constructor(
    @InjectRepository(InvoiceReadinessEntity)
    private readonly repo: Repository<InvoiceReadinessEntity>,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  private async assertContractInWorkspace(workspaceId: string, accountId: string, contractId: string): Promise<void> {
    const [row] = returnedRows<{ id: string }>(
      await this.repo.manager.query(
        `SELECT id FROM legal_contracts WHERE id = $1 AND account_id = $2 AND workspace_id = $3 LIMIT 1`,
        [contractId, accountId, workspaceId],
      ),
    )
    if (!row) throw new NotFoundException('Contrat introuvable dans cet espace')
  }

  hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex')
  }

  private absoluteUrl(token: string): string {
    const base = this.config.get<string>('frontendUrl', 'http://localhost:5173').replace(/\/+$/, '')
    const path = computeUrl({ template: '/depot-piece/{token}', variables: { token } })
    return `${base}${path}`
  }

  /**
   * Génère un lien — « une mission + un contrat », les DEUX du MÊME compte.
   * Le jeton brut n'est rendu QU'ICI, dans l'URL : seul son SHA-256 part en base.
   */
  async create(
    workspaceId: string,
    userId: string,
    accountId: string,
    contractId: string,
    missionId: string,
  ): Promise<CreatedLegalContractUploadLink> {
    await this.assertContractInWorkspace(workspaceId, accountId, contractId)
    const [mission] = returnedRows<{ id: string }>(
      await this.repo.manager.query(
        `SELECT id FROM missions WHERE id = $1 AND account_id = $2 AND workspace_id = $3 LIMIT 1`,
        [missionId, accountId, workspaceId],
      ),
    )
    if (!mission) throw new BadRequestException('Cette mission n’appartient pas au même compte que ce contrat')

    const rawToken = `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`
    const createdAt = new Date()
    const expiresAt = legalContractUploadLinkExpiresAt(createdAt)
    const [inserted] = returnedRows<{ id: string }>(
      await this.repo.manager.query(
        `INSERT INTO legal_contract_upload_links
           (workspace_id, contract_id, mission_id, token_hash, created_by, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [workspaceId, contractId, missionId, this.hashToken(rawToken), userId, createdAt, expiresAt],
      ),
    )
    const [row] = returnedRows<LinkRow>(
      await this.repo.manager.query(
        `SELECT ${LINK_SELECT_COLUMNS} FROM legal_contract_upload_links l
           LEFT JOIN missions m ON m.id = l.mission_id
          WHERE l.id = $1`,
        [inserted.id],
      ),
    )
    return { link: toView(row), url: this.absoluteUrl(rawToken) }
  }

  /** Les liens d'un contrat — révoqués compris, pour l'audit (même choix que `ApiKeysService.list`). */
  async list(workspaceId: string, accountId: string, contractId: string): Promise<LegalContractUploadLink[]> {
    await this.assertContractInWorkspace(workspaceId, accountId, contractId)
    const rows = returnedRows<LinkRow>(
      await this.repo.manager.query(
        `SELECT ${LINK_SELECT_COLUMNS} FROM legal_contract_upload_links l
           LEFT JOIN missions m ON m.id = l.mission_id
          WHERE l.contract_id = $1 AND l.workspace_id = $2
          ORDER BY l.created_at DESC`,
        [contractId, workspaceId],
      ),
    )
    return rows.map(toView)
  }

  /** Révoque — idempotent, même garde que `ApiKeysService.revoke`. */
  async revoke(workspaceId: string, accountId: string, contractId: string, linkId: string): Promise<void> {
    await this.assertContractInWorkspace(workspaceId, accountId, contractId)
    const [row] = returnedRows<{ id: string; revoked_at: string | Date | null }>(
      await this.repo.manager.query(
        `SELECT id, revoked_at FROM legal_contract_upload_links WHERE id = $1 AND contract_id = $2 AND workspace_id = $3`,
        [linkId, contractId, workspaceId],
      ),
    )
    if (!row) throw new NotFoundException('Lien introuvable dans cet espace')
    if (row.revoked_at) return
    await this.repo.manager.query(`UPDATE legal_contract_upload_links SET revoked_at = now() WHERE id = $1`, [linkId])
  }

  /**
   * La PORTE PUBLIQUE — résout par le jeton SEUL, jamais par un espace reçu de
   * l'appelant. Ne rend jamais le journal ni le tarif : juste de quoi confirmer
   * que le dépôt est au bon endroit (voir le docblock du schéma).
   */
  async resolvePublic(token: string): Promise<LegalContractUploadLinkPublicStatus> {
    const resolved = await this.findActiveRow(token)
    if (resolved.refusal) return { status: resolved.refusal }
    const { row } = resolved
    const [names] = returnedRows<{ contract_label: string; account_name: string }>(
      await this.repo.manager.query(
        `SELECT c.label AS contract_label, a.company_name AS account_name
           FROM legal_contracts c
           JOIN accounts a ON a.id = c.account_id
          WHERE c.id = $1`,
        [row.contract_id],
      ),
    )
    // Le contrat PARENT a disparu entre le dépôt du lien et sa résolution — un
    // lien qui ne nomme plus rien n'est pas un lien valide.
    if (!names) return { status: 'not_found' }
    return {
      status: 'valid',
      contractLabel: names.contract_label,
      missionLabel: row.mission_label,
      accountName: names.account_name,
      acceptedExtensions: STORED_EXTERNAL_CONTRACT_UPLOAD_ACCEPT,
      maxBytes: STORED_FILE_MAX_BYTES,
    }
  }

  /**
   * Le DÉPÔT public. `today` en paramètre (jamais `new Date()` lu ici) — même
   * raison que `StorageService.put` : une échéance de conservation reproductible.
   */
  async deposit(token: string, input: DepositLegalContractUploadInput, today: string): Promise<{ fileName: string }> {
    const resolved = await this.findActiveRow(token)
    if (resolved.refusal) throw new NotFoundException('Ce lien de dépôt n’est plus valide.')
    const { row } = resolved

    const stored = await this.storage.put({
      workspaceId: row.workspace_id,
      domain: 'legal_contract_external_upload',
      fileName: input.fileName,
      contentType: input.contentType,
      fileB64: input.fileB64,
      uploadedBy: null,
      today,
    })

    // #2422.6 — le JOURNAL DE DÉPÔT : une ligne par dépôt, jamais écrasée.
    await this.repo.manager.query(
      `UPDATE legal_contract_upload_links
          SET deposits = deposits || $1::jsonb
        WHERE id = $2`,
      [
        JSON.stringify([
          {
            fileName: stored.fileName,
            byteSize: stored.byteSize,
            contentType: stored.contentType,
            depositedAt: stored.uploadedAt,
          },
        ]),
        row.id,
      ],
    )
    return { fileName: stored.fileName }
  }

  /** La résolution PARTAGÉE par `resolvePublic` et `deposit` — jamais dupliquée. */
  private async findActiveRow(
    token: string,
  ): Promise<{ refusal?: undefined; row: LinkRow } | { refusal: 'not_found' | 'expired' | 'revoked' }> {
    const [row] = returnedRows<LinkRow>(
      await this.repo.manager.query(
        `SELECT ${LINK_SELECT_COLUMNS} FROM legal_contract_upload_links l
           LEFT JOIN missions m ON m.id = l.mission_id
          WHERE l.token_hash = $1`,
        [this.hashToken(token)],
      ),
    )
    if (!row) return { refusal: 'not_found' }
    const view = toView(row)
    if (view.revokedAt !== null) return { refusal: 'revoked' }
    if (!legalContractUploadLinkIsUsable({ expiresAt: view.expiresAt, revokedAt: view.revokedAt }, new Date())) {
      return { refusal: 'expired' }
    }
    return { row }
  }
}
