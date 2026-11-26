import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { ProductAnalyticsService } from '../analytics/product-analytics.service'
// Le même chiffrement AES-256-GCM que les autres liens CRM : même besoin
// (un secret d'accès au repos), même dérivation de clé, un seul endroit.
import { encryptToken } from '../crm/crm-token.crypto'
import { odooClientForConnection } from './odoo-connection'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'
import type { CrmActivityPage, CrmDealPage, CrmOwnerPage, CrmReadOptions } from '../crm/adapter/crm-read-types'
import type { CrmCompanyPage, CrmContactPage } from '../crm/hubspot.client'
import { OdooClient, type OdooCredentials, type OdooUpsertResult } from './odoo.client'
import type { OdooConnectDto, OdooExportContactDto } from './dto/odoo.dto'
import { CrmFirstImportEnqueuer } from '../crm-first-import/crm-first-import.enqueuer'

const PROVIDER = 'odoo' as const

/**
 * Le lien Odoo d'un espace.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI DISTINGUE ODOO DES TROIS AUTRES CRM DU PRODUIT
 * ─────────────────────────────────────────────────────────────────────────
 * HubSpot, Salesforce, Pipedrive et Attio se branchent par OAuth : un aller-
 * retour de navigateur, un `state` signé, un jeton qui se rafraîchit. Odoo,
 * non — il s'authentifie par **base + identifiant + clé d'API**, et une
 * instance peut être auto-hébergée à n'importe quelle adresse.
 *
 * Trois conséquences, chacune assumée ici :
 *
 *  1. **Pas de `state`, pas de `callback`, pas de redirection.** La connexion
 *     est un POST authentifié, pas un parcours de consentement. Il n'y a donc
 *     rien à signer : c'est le JWT de l'appelant qui prouve qui il est.
 *
 *  2. **Pas de rafraîchissement.** Une clé d'API Odoo n'expire pas ;
 *     `expires_at` et `refresh_token_enc` restent NULL. Ce n'est pas un champ
 *     oublié — le remplir avec une date inventée ferait croire à une
 *     reconnexion nécessaire qui n'existe pas.
 *
 *  3. **L'adresse est saisie**, donc c'est une porte SSRF. Le client la passe
 *     à `assertSafeOutboundUrl` À CHAQUE appel, pas seulement à la connexion :
 *     une entrée DNS peut changer de camp entre les deux.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ NON VÉRIFIÉ SUR UNE INSTANCE RÉELLE
 * ─────────────────────────────────────────────────────────────────────────
 * Voir l'entête de `odoo.client.ts`. Sans identifiants d'espace, ce service ne
 * fait **aucun appel réseau** : `getStatus` répond « non connecté » après une
 * seule lecture en base, et rien d'autre ne part. C'est le « sans clé = no-op
 * strict » du dépôt, appliqué à un connecteur qui se configure par espace et
 * non par variable d'environnement.
 */

export type OdooStatus = {
  /**
   * Odoo n'a PAS de configuration serveur : il n'y a pas de `ODOO_CLIENT_ID` à
   * poser. Le champ existe quand même parce que l'écran des intégrations le
   * lit pour toutes les cartes — le renvoyer à `true` en dur serait mentir sur
   * la nature du connecteur, alors on dit ce qui est vrai : il est toujours
   * disponible, ce qui manque éventuellement ce sont les identifiants.
   */
  configured: true
  connected: boolean
  provider?: 'odoo'
  /** Le nom de la base, ce que l'utilisateur reconnaît. */
  accountLabel?: string | null
  /** L'adresse de l'instance, pour qu'il vérifie qu'il a branché la bonne. */
  instanceUrl?: string | null
  connectedAt?: string
  /** Dernier usage RÉEL du lien. `null` tant qu'il n'a jamais servi. */
  lastUsedAt?: string | null
}

export type OdooConnectResult = { ok: true; accountLabel: string | null } | { ok: false; reason: string }

@Injectable()
export class OdooService {
  private readonly logger = new Logger(OdooService.name)

  constructor(
    @InjectRepository(CrmConnectionEntity)
    private readonly connections: Repository<CrmConnectionEntity>,
    @InjectRepository(UserActionEntity)
    private readonly userActions: Repository<UserActionEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    @Optional() private readonly analytics?: ProductAnalyticsService,
    // SYNC-B — la première reprise part SEULE au branchement (best-effort, jamais bloquante).
    @Optional() private readonly firstImport?: CrmFirstImportEnqueuer,
  ) {}

  /**
   * L'état du lien pour l'espace de l'appelant.
   *
   * Aucun appel réseau : on ne « teste » pas la connexion à chaque affichage
   * d'écran. Un connecteur qui se vérifie à chaque rendu transforme une page
   * de réglages en sonde, et son échec en panne d'écran.
   */
  async getStatus(userId: string): Promise<OdooStatus> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const conn = await this.connections.findOne({
      where: { ...workspaceScopeWhere(workspaceId), provider: PROVIDER },
    })
    if (!conn) return { configured: true, connected: false }
    return {
      configured: true,
      connected: true,
      provider: PROVIDER,
      accountLabel: conn.account_label,
      instanceUrl: conn.instance_url,
      connectedAt: conn.created_at.toISOString(),
      lastUsedAt: conn.last_used_at ? conn.last_used_at.toISOString() : null,
    }
  }

  /**
   * Branche l'espace sur une instance.
   *
   * ⚠️ On AUTHENTIFIE avant d'enregistrer. Écrire d'abord et vérifier ensuite
   * laisserait en base un lien qui ne marche pas, et l'écran dirait « connecté »
   * à quelqu'un qui ne l'est pas — le défaut que ce dépôt appelle « un drapeau
   * allumé sans rien derrière ».
   */
  async connect(userId: string, dto: OdooConnectDto): Promise<OdooConnectResult> {
    const credentials: OdooCredentials = {
      baseUrl: dto.baseUrl.trim().replace(/\/+$/, ''),
      db: dto.db.trim(),
      login: dto.login.trim(),
      apiKey: dto.apiKey.trim(),
    }

    let identity
    try {
      identity = await new OdooClient(credentials).authenticate()
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown'
      // ⚠️ On journalise la RAISON sans jamais la clé : `credentials` ne passe
      // pas dans le logger, et le message d'Odoo ne la contient pas.
      this.logger.error('Odoo connect failed', { error, tags: { provider: PROVIDER } })
      return { ok: false, reason }
    }

    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const existing = await this.connections.findOne({
      where: { ...workspaceScopeWhere(workspaceId), provider: PROVIDER },
    })

    const row = this.connections.create({
      ...(existing ?? {}),
      user_id: userId,
      workspace_id: workspaceId,
      provider: PROVIDER,
      external_account_id: String(identity.uid),
      instance_url: credentials.baseUrl,
      account_label: credentials.db,
      access_token_enc: encryptToken(credentials.apiKey),
      // Une clé d'API ne se rafraîchit pas et n'expire pas : ces deux champs
      // restent VIDES plutôt que de porter une valeur inventée.
      refresh_token_enc: null,
      expires_at: null,
      refresh_failed_at: null,
      // Le « scope » d'Odoo est celui du compte utilisateur côté client : on ne
      // le connaît pas, et on ne le devine pas.
      scope: null,
    })
    await this.connections.save(row)

    // Le nom du fournisseur seulement — jamais l'adresse de l'instance ni la clé.
    void this.analytics?.track('integration_connected', {
      userId,
      workspaceId,
      properties: { provider: PROVIDER },
    })
    void this.firstImport?.enqueue({ userId, workspaceId, provider: 'odoo' })
    return { ok: true, accountLabel: credentials.db }
  }

  /**
   * Coupe le lien.
   *
   * Rien à révoquer côté serveur : une clé d'API Odoo se révoque depuis le
   * profil du compte, pas par une requête. On le DIT plutôt que de rendre un
   * 204 muet qui laisserait croire que la clé est morte — elle vaut toujours
   * tant que son propriétaire ne l'a pas retirée.
   */
  async disconnect(userId: string): Promise<{ removed: boolean; warning: string }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const result = await this.connections.delete({ ...workspaceScopeWhere(workspaceId), provider: PROVIDER })
    return {
      removed: (result.affected ?? 0) > 0,
      warning:
        "L'accès a été retiré de Bellum. La clé d'API reste valable tant que tu ne l'as pas supprimée depuis ton compte.",
    }
  }

  /** Le client prêt à l'emploi, ou une 404 explicite si l'espace n'est pas branché. */
  private async clientFor(userId: string): Promise<{ client: OdooClient; uid: number; row: CrmConnectionEntity }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const row = await this.connections.findOne({
      where: { ...workspaceScopeWhere(workspaceId), provider: PROVIDER },
    })
    if (!row || !row.instance_url || !row.external_account_id) {
      throw new NotFoundException('Aucune instance branchée sur cet espace.')
    }
    const uid = Number(row.external_account_id)
    if (!Number.isInteger(uid) || uid <= 0) {
      // Une ligne corrompue le DIT, plutôt que d'envoyer `NaN` au serveur et
      // de laisser Odoo répondre une erreur qui n'aidera personne.
      throw new BadRequestException('Le lien enregistré est incomplet — rebranche l’instance.')
    }
    const linked = odooClientForConnection(row)
    if (!linked) throw new BadRequestException('Le lien enregistré est incomplet — rebranche l’instance.')
    return { client: linked.client, uid, row }
  }

  /**
   * Pousse un contact vers l'instance.
   *
   * ⚠️ `last_used_at` n'est touché qu'APRÈS un aller-retour réussi : c'est le
   * dernier usage RÉEL du lien, ce que le registre d'outils affiche. Le poser
   * avant l'appel ferait d'une tentative échouée un « dernier usage », et le
   * registre annoncerait un connecteur vivant qui ne l'est pas.
   */
  async exportContact(userId: string, dto: OdooExportContactDto): Promise<OdooUpsertResult> {
    const { client, uid, row } = await this.clientFor(userId)
    const result = await client.upsertContact(uid, {
      name: dto.name,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      jobTitle: dto.jobTitle ?? null,
      companyName: dto.companyName ?? null,
    })

    row.last_used_at = new Date()
    await this.connections.save(row)

    await this.userActions.save(
      this.userActions.create({
        user_id: userId,
        workspace_id: row.workspace_id,
        action_type: 'crm_export',
        metadata: { provider: PROVIDER, action: result.action, partnerId: result.partnerId },
      }),
    )

    void this.analytics?.track('export_performed', {
      userId,
      workspaceId: row.workspace_id,
      properties: { destination: PROVIDER },
    })
    return result
  }

  /**
   * #4188 — retrouve la fiche société par son nom exact, ou crée-la. N'appeler
   * QUE derrière la porte (adaptateur commun, #4186). `last_used_at` après un
   * aller-retour réussi, comme l'export de contact.
   */
  async exportCompany(userId: string, input: { name: string; website?: string | null }): Promise<OdooUpsertResult> {
    const { client, uid, row } = await this.clientFor(userId)
    const result = await client.upsertCompanyPartner(uid, input)
    row.last_used_at = new Date()
    await this.connections.save(row)
    return result
  }

  // ---- #4189 — lecture commune (comptes, contacts, affaires, activités) -------------
  // Lecture seule (`search_read`) : ni `last_used_at` ni journal d'export — rien n'a été écrit.

  listCompanies(userId: string, opts: CrmReadOptions): Promise<CrmCompanyPage> {
    return this.clientFor(userId).then(({ client, uid }) => client.listCompanies(uid, opts))
  }

  listContacts(userId: string, opts: CrmReadOptions): Promise<CrmContactPage> {
    return this.clientFor(userId).then(({ client, uid }) => client.listContacts(uid, opts))
  }

  listDeals(userId: string, opts: CrmReadOptions): Promise<CrmDealPage> {
    return this.clientFor(userId).then(({ client, uid }) => client.listDeals(uid, opts))
  }

  listActivities(userId: string, opts: CrmReadOptions): Promise<CrmActivityPage> {
    return this.clientFor(userId).then(({ client, uid }) => client.listActivities(uid, opts))
  }

  listOwners(userId: string, opts: CrmReadOptions): Promise<CrmOwnerPage> {
    return this.clientFor(userId).then(({ client, uid }) => client.listOwners(uid, opts))
  }
}
