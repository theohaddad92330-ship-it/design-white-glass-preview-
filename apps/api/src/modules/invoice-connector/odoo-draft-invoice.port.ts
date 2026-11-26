import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { dispatchFailureOutcome } from '@bellum/contracts'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import { decryptToken } from '../crm/crm-token.crypto'
import { OdooCallError, OdooClient } from '../odoo/odoo.client'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'
import {
  RetainedInvoiceConnectorPort,
  type InvoiceConnectorPayload,
  type InvoiceConnectorPort,
  type InvoiceConnectorWriteOutcome,
} from './invoice-connector.port'

const PROVIDER = 'odoo'

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : 'Erreur inconnue.'
}

/**
 * #2565.10 — un dépôt a-t-il pu avoir lieu ? La seule question qui décide
 * entre `failed` (rejouable) et `unknown` (un humain vérifie dans Odoo).
 *
 *  · `rpc` — Odoo a RÉPONDU une erreur : l'appel `execute_kw` s'exécute dans
 *    une transaction annulée sur exception, rien n'est enregistré → `failed`.
 *  · `http` 5xx — une PASSERELLE a répondu (Odoo, lui, répond 200 même en
 *    erreur) ; l'instance derrière a pu appliquer le `create` → `unknown`.
 *    Un 4xx refuse la requête avant qu'elle n'atteigne Odoo → `failed`.
 *  · `empty` — une réponse sans identifiant après un `create` → `unknown`.
 *  · le reste (timeout, socket coupée…) — `dispatchFailureOutcome`, le
 *    classement unique du dépôt : un timeout est `unknown`, jamais `failed`.
 *
 * NON VÉRIFIÉ sur une instance réelle : l'annulation de la transaction sur
 * erreur est le comportement du serveur Odoo publié, pas une observation.
 */
function createFailureOutcome(error: unknown): 'failed' | 'unknown' {
  if (error instanceof OdooCallError) {
    if (error.kind === 'rpc') return 'failed'
    if (error.kind === 'http') return error.status !== null && error.status >= 500 ? 'unknown' : 'failed'
    return 'unknown'
  }
  return dispatchFailureOutcome(error)
}

/** Le libellé de la ligne : la mission et le mois couvert, rien d'inventé. */
function lineLabel(payload: InvoiceConnectorPayload): string {
  const month = payload.periodMonth.slice(0, 7)
  return payload.missionLabel ? `${payload.missionLabel} — ${month}` : month
}

/**
 * #2565.10 — L'ADAPTATEUR ODOO : un BROUILLON de facture client, et rien de plus.
 *
 * Branché à UN seul endroit (`invoice-connector.module.ts`, GA-26). Il traite
 * l'outil `odoo` et délègue tout autre outil à `RetainedInvoiceConnectorPort`,
 * dont le refus honnête reste inchangé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL FAIT, DANS L'ORDRE
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Les faits manquants refusent AVANT tout appel : pas de compte nommé, pas de
 *    jours, pas de TJM → `failed`, nommé. Un `null` ne devient jamais `0`.
 * 2. Le lien est celui de l'ESPACE (`crm_connections`, provider `odoo`) — la
 *    même lecture que `OdooService.clientFor` : `uid` enregistré à la
 *    connexion, clé d'API déchiffrée. Sans lien (c'est le cas de la
 *    démonstration, `crm_connections` vide à dessein) : `failed`, zéro appel.
 * 3. Le client se RETROUVE (`res.partner`, société, nom exact). Aucun →
 *    erreur nommée ; plusieurs → erreur nommée. Jamais un partenaire créé.
 * 4. UN `create` sur `account.move`, en brouillon (`OdooClient.
 *    createDraftCustomerInvoice`, qui porte la source de chaque champ). Jamais
 *    `action_post`, jamais d'envoi : l'utilisateur valide lui-même dans Odoo.
 *
 * Toute erreur AVANT le `create` est `failed` : une recherche ne crée rien.
 * Seul le `create` peut produire `unknown`.
 *
 * « Odoo » se nomme dans les messages : c'est l'outil que l'ESPACE a branché,
 * pas un fournisseur de Bellum (doctrine « on nomme ce que l'espace a BRANCHÉ »).
 */
@Injectable()
export class OdooDraftInvoiceConnectorPort implements InvoiceConnectorPort {
  private readonly logger = new Logger(OdooDraftInvoiceConnectorPort.name)
  private readonly retained = new RetainedInvoiceConnectorPort()

  constructor(
    @InjectRepository(CrmConnectionEntity)
    private readonly connections: Repository<CrmConnectionEntity>,
  ) {}

  async createInvoice(input: {
    provider: string
    workspaceId: string
    payload: Readonly<InvoiceConnectorPayload>
  }): Promise<InvoiceConnectorWriteOutcome> {
    if (input.provider !== PROVIDER) return this.retained.createInvoice(input)

    const { payload } = input
    const accountName = payload.accountName?.trim() ?? ''
    if (!accountName) {
      return {
        ok: false,
        outcome: 'failed',
        detail:
          "Cette mission n'a pas de compte client nommé : impossible de retrouver le client dans Odoo sans deviner.",
      }
    }
    const days = payload.days
    const rateCents = payload.dailyRateCents
    if (days === null || !(days > 0) || rateCents === null || !(rateCents > 0)) {
      return {
        ok: false,
        outcome: 'failed',
        detail: 'Jours ou TJM absents pour ce mois : la ligne de facture ne s’écrit pas sans eux.',
      }
    }

    // ── 2. Le lien de l'espace. Toute erreur ici : rien n'est parti. ─────────
    let client: OdooClient
    let uid: number
    try {
      const row = await this.connections.findOne({
        where: { ...workspaceScopeWhere(input.workspaceId), provider: PROVIDER },
      })
      if (!row || !row.instance_url || !row.external_account_id) {
        return { ok: false, outcome: 'failed', detail: 'Aucune instance Odoo branchée sur cet espace.' }
      }
      uid = Number(row.external_account_id)
      if (!Number.isInteger(uid) || uid <= 0) {
        return {
          ok: false,
          outcome: 'failed',
          detail: 'Le lien Odoo enregistré est incomplet — rebranche l’instance dans Réglages › Intégrations.',
        }
      }
      client = new OdooClient({
        baseUrl: row.instance_url,
        db: row.account_label ?? '',
        login: '',
        apiKey: decryptToken(row.access_token_enc),
      })
    } catch (error) {
      return { ok: false, outcome: 'failed', detail: `Le lien Odoo n’a pas pu être lu : ${messageOf(error)}` }
    }

    // ── 3. Le client se RETROUVE. Une recherche ne crée rien : `failed`. ─────
    let partnerIds: number[]
    try {
      partnerIds = await client.findCompanyPartnerIdsByName(uid, accountName)
    } catch (error) {
      return {
        ok: false,
        outcome: 'failed',
        detail: `Odoo n’a pas pu être interrogé pour retrouver le client : ${messageOf(error)}`,
      }
    }
    if (partnerIds.length === 0) {
      return {
        ok: false,
        outcome: 'failed',
        detail:
          `Aucune fiche client « ${accountName} » (société) dans Odoo. Crée-la ou corrige son nom dans Odoo, ` +
          'puis réessaie : on ne crée jamais un client à ta place.',
      }
    }
    if (partnerIds.length > 1) {
      return {
        ok: false,
        outcome: 'failed',
        detail:
          `Plusieurs fiches client « ${accountName} » (société) dans Odoo : impossible de choisir sans deviner. ` +
          'Fusionne-les ou renomme-les dans Odoo, puis réessaie.',
      }
    }
    const partnerId = partnerIds[0] as number

    // ── 4. UN create, en brouillon. Seul appel qui peut rendre `unknown`. ────
    try {
      const moveId = await client.createDraftCustomerInvoice(uid, {
        partnerId,
        lines: [{ label: lineLabel(payload), quantity: days, unitPrice: rateCents / 100 }],
      })
      return { ok: true, reference: String(moveId) }
    } catch (error) {
      const outcome = createFailureOutcome(error)
      if (outcome === 'unknown') {
        this.logger.warn('Brouillon Odoo SANS RÉPONSE — il a peut-être été créé, aucune reprise automatique', {
          tags: { provider: PROVIDER },
        })
        return {
          ok: false,
          outcome,
          detail:
            `Pas de réponse d’Odoo au dépôt du brouillon (${messageOf(error)}) : il a peut-être été créé. ` +
            'Vérifie dans Odoo avant toute nouvelle tentative.',
        }
      }
      return { ok: false, outcome, detail: `Odoo a refusé le brouillon : ${messageOf(error)}` }
    }
  }
}
