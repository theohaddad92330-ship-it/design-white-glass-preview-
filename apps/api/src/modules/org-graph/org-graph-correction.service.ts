import { HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { EntityManager, Repository } from 'typeorm'
import {
  ORG_CORRECTION_CLAIM_BY_FIELD,
  orgCorrectionChangesSharedGraph,
  orgCorrectionVisibilityFor,
  orgGraphCorrectionSchema,
  type OrgCorrectionClaim,
  type OrgCorrectionMotive,
  type OrgCorrectionScope,
  type OrgCorrectionVisibility,
  type OrgCorrectionField,
  type OrgCorrectionObjectType,
  type OrgCorrectionRequest,
  type OrgCorrectionResponse,
  type OrgCorrectionValue,
  type OrgGraph,
  type OrgGraphConflict,
  type OrgGraphCorrection,
  type OrgGraphInterveningCorrection,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { OrgGraphCorrectionEntity } from '../../database/entities/org-graph-correction.entity'
import { returnedCount, returnedRows } from '../../database/returned-rows'
import { applyOrgCorrections, invertCorrection, parseEdgeKey, type AppliedCorrection } from './org-graph-correction'
import { personKey } from './org-graph-declare'
import { contactRoleFromOrgRoles } from './org-graph-contact-role'
import { readStoredOrgGraph } from './org-graph-versioning'

/**
 * Le LEDGER de corrections et le VERROU OPTIMISTE (OrgGraph FINAL §7 ; v3 §8.3/§8.4).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE SERVICE APPORTE, ET CE QU'IL RÉUTILISE
 * ─────────────────────────────────────────────────────────────────────────────
 * Il réutilise `readStoredOrgGraph` (la lecture du blob), la colonne
 * `org_graph_version` posée par `OrgGraphVersioning` et la discipline de
 * re-validation de `applyDeclaredPeople`. Il n'invente que ce qui manquait :
 * l'HISTORIQUE d'une correction et le refus d'un écrasement silencieux.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE VERROU — pourquoi la comparaison JavaScript ne suffit PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le motif qui existait partout dans ce module est un read-then-write :
 *
 *     const account = await findOne(...)
 *     const next = (account.org_graph_version ?? 1) + 1
 *     await query('UPDATE accounts SET org_graph_version = $2 WHERE id = $1', ...)
 *
 * Entre la lecture et l'écriture, n'importe qui peut passer. Deux commerciaux
 * qui corrigent la même personne à la même seconde lisent tous deux la version
 * 8, écrivent tous deux la version 9, et la seconde écriture EFFACE la première
 * sans que personne ne le sache. C'est un *lost update*, et aucune comparaison
 * en JavaScript ne peut l'empêcher — l'intervalle qu'elle protège est
 * précisément celui qu'elle ne couvre pas.
 *
 * La garde est donc DANS le `WHERE` :
 *
 *     UPDATE accounts SET org_graph_version = $expected + 1, …
 *      WHERE id = $1 AND workspace_id = $2
 *        AND COALESCE(org_graph_version, 1) = $expected
 *
 * Zéro ligne touchée = quelqu'un est passé avant. C'est PostgreSQL qui tranche,
 * pas nous, et il le fait avec la même autorité pour deux replicas que pour
 * deux onglets. La comparaison en amont existe quand même : elle évite de
 * fabriquer un graphe entier pour rien et permet de rendre un diff complet.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE 409 DOIT DIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Conflit » tout court oblige l'utilisateur à recharger et à tout comparer de
 * tête. Le corps porte donc les deux versions ET les corrections intercalées —
 * qui, quel objet, quel champ, quand. Le `message` français est un repli ; c'est
 * `intervening` que l'écran doit rendre, dans SA langue.
 *
 * ⚠️ `by` vaut `null` quand le profil de l'auteur n'est plus lisible. On ne
 * nomme jamais quelqu'un qu'on ne connaît pas, et on n'écrit jamais un
 * identifiant technique à la place d'un humain.
 */
@Injectable()
export class OrgGraphCorrectionService {
  private readonly logger = new Logger(OrgGraphCorrectionService.name)

  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(OrgGraphCorrectionEntity)
    private readonly corrections: Repository<OrgGraphCorrectionEntity>,
  ) {}

  /**
   * Pose une correction. Rend la nouvelle version et les lignes de ledger
   * produites — une par champ RÉELLEMENT changé.
   *
   * Lève : 404 (dossier hors espace), 422 (pas d'organigramme, ou correction
   * inapplicable), 409 (conflit de version).
   */
  async applyCorrection(args: {
    workspaceId: string
    accountId: string
    userId: string
    request: OrgCorrectionRequest
  }): Promise<OrgCorrectionResponse> {
    const { workspaceId, accountId, userId } = args
    // #2126.36 / .37 — le contrat pose ces défauts ; un appelant qui contournerait
    // le parseur ne doit pas basculer pour autant une correction en « personnelle ».
    const request: OrgCorrectionRequest = {
      ...args.request,
      motive: args.request.motive ?? 'corrected',
      scope: args.request.scope ?? 'account',
    }
    const account = await this.accounts.findOne({ where: { id: accountId, workspace_id: workspaceId } })
    if (!account) throw new NotFoundException('Compte introuvable')

    const current = account.org_graph_version ?? 1
    if (request.expectedGraphVersion !== current) {
      throw await this.conflict(workspaceId, accountId, request.expectedGraphVersion, current)
    }

    const stored = readStoredOrgGraph(account.raw_analysis)
    if (!stored) {
      throw new HttpException(
        {
          message:
            "Ce dossier n'a pas encore d'organigramme : lance une analyse avant de corriger. Une correction se pose sur quelqu'un, pas dans le vide.",
          code: 'org_graph_absent',
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      )
    }

    const at = new Date().toISOString()
    const next = applyOrgCorrections(stored, {
      version: current + 1,
      objectType: request.objectType,
      objectId: request.objectId,
      claims: request.claims,
      at,
    })
    if (!next) {
      throw new HttpException(
        {
          message:
            "Cette correction ne s'applique pas à l'organigramme : la personne, l'entité ou le lien visé n'y est pas, ou le résultat serait incohérent. Rien n'a été enregistré.",
          code: 'org_correction_not_applicable',
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      )
    }

    // #2126.26-.30 / .44 — confirmer, pas pertinent, je ne sais pas, ajouter une
    // source, ou toute correction PERSONNELLE : une ligne au ledger, AUCUNE
    // réécriture du graphe partagé, aucune version avancée. Le calcul ci-dessus
    // n'a servi qu'à vérifier que la cible existe et à lire la valeur d'avant.
    if (!orgCorrectionChangesSharedGraph(request)) {
      const recorded = await this.recordWithoutRewrite({
        workspaceId,
        accountId,
        userId,
        version: current,
        request,
        applied: next.applied,
        at,
      })
      this.logger.log('Org graph correction recorded without rewrite', {
        accountId,
        motive: request.motive,
        scope: request.scope,
      })
      return { graphVersion: current, corrections: recorded, applied: false }
    }

    // Rien n'a changé : la valeur était déjà celle demandée. On ne bump pas une
    // version pour un non-geste — l'historique se remplirait de bruit et le
    // verrou ferait échouer les corrections des autres pour rien.
    if (next.applied.length === 0) {
      return { graphVersion: current, corrections: [], applied: false }
    }

    const written = await this.writeUnderLock({
      workspaceId,
      accountId,
      userId,
      expected: current,
      graph: next.graph,
      applied: next.applied,
      objectType: request.objectType,
      objectId: request.objectId,
      claims: request.claims,
      at,
      motive: request.motive,
      scope: request.scope,
    })
    if (!written) throw await this.conflict(workspaceId, accountId, request.expectedGraphVersion, null)

    this.logger.log('Org graph corrected', {
      accountId,
      graphVersion: current + 1,
      fields: next.applied.map(a => a.field),
    })
    return { graphVersion: current + 1, corrections: written, applied: true }
  }

  /**
   * Annule une correction. Sous le MÊME verrou : annuler est une écriture.
   *
   * La ligne d'origine n'est pas supprimée — elle reçoit sa pierre tombale
   * (`reverted_at`) — et l'annulation dépose SA propre ligne. L'histoire se lit
   * ainsi dans un seul sens, et on peut toujours expliquer pourquoi le graphe a
   * dit autre chose entre deux dates.
   */
  async revertCorrection(args: {
    workspaceId: string
    accountId: string
    userId: string
    correctionId: string
    expectedGraphVersion: number
  }): Promise<OrgCorrectionResponse> {
    const { workspaceId, accountId, userId, correctionId, expectedGraphVersion } = args
    const account = await this.accounts.findOne({ where: { id: accountId, workspace_id: workspaceId } })
    if (!account) throw new NotFoundException('Compte introuvable')

    const rows = returnedRows<LedgerRow>(
      await this.corrections.manager.query(
        `SELECT c.id, c.object_type, c.object_id, c.field, c.old_value, c.new_value,
                c.reason, c.evidence, c.graph_version_before, c.graph_version_after,
                c.user_id, c.created_at, c.reverted_at, c.motive, c.scope, c.visibility
           FROM org_graph_corrections c
          WHERE c.workspace_id = $1 AND c.account_id = $2 AND c.id = $3`,
        [workspaceId, accountId, correctionId],
      ),
    )
    const entry = rows[0]
    // #2126.44 — la ligne personnelle d'un autre n'existe pas pour l'appelant :
    // même réponse qu'une ligne absente, rien qui trahisse qu'elle est là.
    if (!entry || (entry.scope === 'personal' && entry.user_id !== userId)) {
      throw new NotFoundException('Correction introuvable')
    }
    if (entry.reverted_at) {
      throw new HttpException(
        { message: 'Cette correction a déjà été annulée.', code: 'org_correction_already_reverted' },
        HttpStatus.CONFLICT,
      )
    }

    const current = account.org_graph_version ?? 1
    // #2126.26-.30 — une ligne qui n'a rien réécrit s'annule par sa seule pierre
    // tombale : il n'y a aucune valeur à remettre, donc aucun verrou à prendre.
    if (!orgCorrectionChangesSharedGraph({ motive: entry.motive ?? 'corrected', scope: entry.scope ?? 'account' })) {
      // L'UPDATE est CONDITIONNEL : entre la lecture ci-dessus et cette écriture,
      // une autre annulation a pu poser la pierre tombale. Son `RETURNING id`
      // est là pour le dire, et il se LIT — une écriture qui n'a touché aucune
      // ligne ne rend pas « c'est fait ».
      const tombstoned = returnedCount(
        await this.corrections.manager.query(
          `UPDATE org_graph_corrections SET reverted_at = now()
          WHERE workspace_id = $1 AND account_id = $2 AND id = $3 AND reverted_at IS NULL
          RETURNING id`,
          [workspaceId, accountId, correctionId],
        ),
      )
      if (tombstoned === 0) {
        throw new HttpException(
          { message: 'Cette correction a déjà été annulée.', code: 'org_correction_already_reverted' },
          HttpStatus.CONFLICT,
        )
      }
      return { graphVersion: current, corrections: [], applied: false }
    }
    if (expectedGraphVersion !== current) {
      throw await this.conflict(workspaceId, accountId, expectedGraphVersion, current)
    }

    const stored = readStoredOrgGraph(account.raw_analysis)
    if (!stored) {
      throw new HttpException(
        { message: "Ce dossier n'a plus d'organigramme : il n'y a rien à annuler.", code: 'org_graph_absent' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      )
    }

    const claim = invertCorrection({
      field: entry.field,
      oldValue: entry.old_value,
      newValue: entry.new_value,
      evidence: entry.evidence,
      reason: entry.reason,
    })
    const at = new Date().toISOString()
    const next = applyOrgCorrections(stored, {
      version: current + 1,
      objectType: entry.object_type,
      objectId: entry.object_id,
      claims: [claim],
      at,
    })
    if (!next || next.applied.length === 0) {
      throw new HttpException(
        {
          message:
            "L'annulation ne s'applique pas : l'organigramme a changé de forme depuis. La correction reste dans l'historique.",
          code: 'org_correction_not_applicable',
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      )
    }

    const written = await this.writeUnderLock({
      workspaceId,
      accountId,
      userId,
      expected: current,
      graph: next.graph,
      applied: next.applied,
      objectType: entry.object_type,
      objectId: entry.object_id,
      claims: [claim],
      at,
      revertOf: correctionId,
      motive: entry.motive ?? 'corrected',
      scope: entry.scope ?? 'account',
    })
    if (!written) throw await this.conflict(workspaceId, accountId, expectedGraphVersion, null)

    this.logger.log('Org graph correction reverted', { accountId, correctionId, graphVersion: current + 1 })
    return { graphVersion: current + 1, corrections: written, applied: true }
  }

  /** L'historique du dossier, le plus récent d'abord. Les annulées comprises. */
  async listCorrections(args: {
    workspaceId: string
    accountId: string
    /** #2126.44 — l'appelant : il lit ses lignes personnelles, jamais celles des autres. */
    userId: string
  }): Promise<OrgGraphCorrection[]> {
    const rows = returnedRows<LedgerRow>(
      await this.corrections.manager.query(
        `SELECT c.id, c.object_type, c.object_id, c.field, c.old_value, c.new_value,
                c.reason, c.evidence, c.graph_version_before, c.graph_version_after,
                c.user_id, c.created_at, c.reverted_at, c.motive, c.scope, c.visibility
           FROM org_graph_corrections c
          WHERE c.workspace_id = $1 AND c.account_id = $2
            AND (c.scope <> 'personal' OR c.user_id = $3)
          ORDER BY c.graph_version_after DESC, c.created_at DESC`,
        [args.workspaceId, args.accountId, args.userId],
      ),
    )
    return rows.flatMap(row => {
      const parsed = orgGraphCorrectionSchema.safeParse(toContract(row, args))
      // Une ligne illisible ne fait pas échouer l'historique : on préfère
      // afficher ce qu'on sait lire plutôt que rien.
      return parsed.success ? [parsed.data] : []
    })
  }

  /**
   * #2126.26-.30 / .44 — déposer au ledger SANS réécrire le graphe partagé.
   *
   * Une correction personnelle garde SA valeur (son auteur la relit) ; un motif
   * qui ne réécrit pas (confirmer, pas pertinent, je ne sais pas, ajouter une
   * source) n'affirme aucune valeur nouvelle : il porte celle d'avant, quoi que
   * l'écran ait envoyé. La version d'avant et d'après sont la MÊME — la base le
   * tient (`org_graph_corrections_version_advances_check`).
   */
  private async recordWithoutRewrite(args: {
    workspaceId: string
    accountId: string
    userId: string
    version: number
    request: OrgCorrectionRequest
    applied: readonly AppliedCorrection[]
    at: string
  }): Promise<OrgGraphCorrection[]> {
    const { request } = args
    const visibility = orgCorrectionVisibilityFor(request.scope)
    const assertsValue = request.motive === 'corrected' || request.motive === 'obsolete'
    return this.accounts.manager.transaction(async (trx: EntityManager) => {
      const written: OrgGraphCorrection[] = []
      for (const claim of request.claims) {
        const oldValue = args.applied.find(change => change.field === claim.field)?.oldValue ?? claim.value
        const newValue = assertsValue ? claim.value : oldValue
        const inserted = returnedRows<{ id: string; created_at: string }>(
          await trx.query(
            `
            INSERT INTO org_graph_corrections
              (workspace_id, account_id, user_id, object_type, object_id, field,
               old_value, new_value, graph_version_before, graph_version_after, reason, evidence,
               motive, scope, visibility)
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12::jsonb, $13, $14, $15)
            RETURNING id, created_at
            `,
            [
              args.workspaceId,
              args.accountId,
              args.userId,
              request.objectType,
              request.objectId,
              claim.field,
              JSON.stringify(oldValue),
              JSON.stringify(newValue),
              args.version,
              args.version,
              claim.reason,
              JSON.stringify(claim.evidence),
              request.motive,
              request.scope,
              visibility,
            ],
          ),
        )
        written.push({
          id: inserted[0]?.id ?? '',
          workspaceId: args.workspaceId,
          accountId: args.accountId,
          graphVersionBefore: args.version,
          graphVersionAfter: args.version,
          objectType: request.objectType,
          objectId: request.objectId,
          field: claim.field,
          oldValue,
          newValue,
          reason: claim.reason,
          evidence: claim.evidence,
          userId: args.userId,
          createdAt: inserted[0]?.created_at ?? args.at,
          revertedAt: null,
          motive: request.motive,
          scope: request.scope,
          visibility,
        })
      }
      return written
    })
  }

  /**
   * L'écriture ATOMIQUE : le graphe, la version et le ledger, ou rien.
   *
   * Rend `null` quand l'UPDATE conditionnel n'a trouvé aucune ligne — c'est le
   * verrou qui a parlé, et l'appelant en fait un 409.
   *
   * ⚠️ V3 → V4, anticipé mais pas construit (ANALYSE-CRITIQUE §1.7, raison non
   * consignée avant le 30/08/2026). Sur un compte à plusieurs milliers de
   * personnes, `raw_analysis.org.orgGraph` peut peser plusieurs Mo — et cette
   * méthode réécrit tout le blob à CHAQUE correction, même pour un seul champ
   * d'une seule personne (`JSON.stringify(args.graph)` ci-dessous). Ce n'est
   * PAS un oubli : c'est un plan de scale, pas une contrainte immédiate. Le
   * volume réel en production n'a jamais été mesuré (`orggraph-final-2026-08-
   * 29.md`, D272), et normaliser en tables `org_*` avant d'avoir ce chiffre
   * reviendrait à deviner un seuil qui n'existe pas encore. Le jour où une
   * mesure réelle le dépasse, la bascule se fait ICI — le contrat
   * (`orgGraphSchema`) ne change pas, seul son support de stockage change.
   */
  private async writeUnderLock(args: {
    workspaceId: string
    accountId: string
    userId: string
    expected: number
    graph: OrgGraph
    applied: readonly AppliedCorrection[]
    objectType: OrgCorrectionObjectType
    objectId: string
    claims: readonly OrgCorrectionClaim[]
    at: string
    revertOf?: string
    motive?: OrgCorrectionMotive
    scope?: OrgCorrectionScope
  }): Promise<OrgGraphCorrection[] | null> {
    const motive = args.motive ?? 'corrected'
    const scope = args.scope ?? 'account'
    const visibility = orgCorrectionVisibilityFor(scope)
    const nextVersion = args.expected + 1
    return this.accounts.manager.transaction(async (trx: EntityManager) => {
      const updated = returnedRows<{ org_graph_version: number }>(
        await trx.query(
          `
          UPDATE accounts
          SET org_graph_version = $4,
              raw_analysis = COALESCE(raw_analysis, '{}'::jsonb)
                             || jsonb_build_object(
                                  'org',
                                  COALESCE(raw_analysis -> 'org', '{}'::jsonb) || jsonb_build_object('orgGraph', $5::jsonb)
                                )
          WHERE id = $1
            AND workspace_id = $2
            AND COALESCE(org_graph_version, 1) = $3
          RETURNING org_graph_version
          `,
          [args.accountId, args.workspaceId, args.expected, nextVersion, JSON.stringify(args.graph)],
        ),
      )
      // ⚠️ C'EST ICI que le lost update est empêché. Zéro ligne = quelqu'un est
      // passé entre notre lecture et notre écriture ; on ne réessaie PAS en
      // silence, on rend la main à l'humain avec le diff.
      if (updated.length === 0) return null

      const written: OrgGraphCorrection[] = []
      for (const change of args.applied) {
        const claim = args.claims.find(c => c.field === change.field)
        // La preuve d'un champ que le contrat a validé existe toujours ; le
        // repli n'est là que pour la reprise, où les claims viennent de la base.
        const evidence = claim?.evidence ?? {
          kind: 'workspace_user' as const,
          claim: ORG_CORRECTION_CLAIM_BY_FIELD[change.field],
        }
        const inserted = returnedRows<{ id: string; created_at: string }>(
          await trx.query(
            `
            INSERT INTO org_graph_corrections
              (workspace_id, account_id, user_id, object_type, object_id, field,
               old_value, new_value, graph_version_before, graph_version_after, reason, evidence,
               motive, scope, visibility)
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12::jsonb, $13, $14, $15)
            RETURNING id, created_at
            `,
            [
              args.workspaceId,
              args.accountId,
              args.userId,
              args.objectType,
              args.objectId,
              change.field,
              JSON.stringify(change.oldValue),
              JSON.stringify(change.newValue),
              args.expected,
              nextVersion,
              claim?.reason ?? 'Annulation',
              JSON.stringify(evidence),
              motive,
              scope,
              visibility,
            ],
          ),
        )
        written.push({
          id: inserted[0]?.id ?? '',
          workspaceId: args.workspaceId,
          accountId: args.accountId,
          graphVersionBefore: args.expected,
          graphVersionAfter: nextVersion,
          objectType: args.objectType,
          objectId: args.objectId,
          field: change.field,
          oldValue: change.oldValue,
          newValue: change.newValue,
          reason: claim?.reason ?? 'Annulation',
          evidence,
          userId: args.userId,
          createdAt: inserted[0]?.created_at ?? args.at,
          revertedAt: null,
          motive,
          scope,
          visibility,
        })
      }

      // #3423.7 — une correction humaine de RÔLE gagne partout : l'onglet
      // Contacts lit `contacts.decision_role`, colonne écrite une fois à
      // l'analyse que rien ne resynchronisait. Même transaction que le graphe.
      for (const change of args.applied) {
        if (change.field !== 'decisionRoles' || args.objectType !== 'person') continue
        await this.syncContactRole(trx, args, Array.isArray(change.newValue) ? change.newValue : [])
      }

      if (args.revertOf) {
        // La pierre tombale. Elle est posée DANS la même transaction : une
        // annulation appliquée au graphe mais non marquée serait rejouée par la
        // reprise après le prochain run, et le champ reviendrait tout seul.
        await trx.query(
          `UPDATE org_graph_corrections
              SET reverted_at = now()
            WHERE workspace_id = $1 AND account_id = $2 AND id = $3 AND reverted_at IS NULL`,
          [args.workspaceId, args.accountId, args.revertOf],
        )
      }

      return written
    })
  }

  /**
   * #3423.7 — recopie le rôle corrigé d'une personne du graphe sur SON contact.
   *
   * La jointure personne ↔ contact n'a pas d'identifiant commun (`OrgPerson`
   * ne porte pas de `contactId`) : elle se fait sur le nom normalisé
   * (`personKey`, la clé d'identité que les déclarations utilisent déjà), DANS
   * le compte. Un seul contact correspond → on écrit. Aucun, ou plusieurs
   * homonymes → on n'écrit RIEN et on le dit au journal : propager une
   * correction à la mauvaise personne serait un dégât nouveau.
   */
  private async syncContactRole(
    trx: EntityManager,
    args: { workspaceId: string; accountId: string; graph: OrgGraph; objectId: string },
    roles: readonly unknown[],
  ): Promise<void> {
    const person = args.graph.people.find(p => p.id === args.objectId)
    if (!person) return
    const key = personKey(person.fullName)
    const candidates = returnedRows<{ id: string; full_name: string }>(
      await trx.query(`SELECT id, full_name FROM contacts WHERE workspace_id = $1 AND account_id = $2`, [
        args.workspaceId,
        args.accountId,
      ]),
    ).filter(contact => personKey(contact.full_name) === key)
    if (candidates.length !== 1 || !candidates[0]) {
      this.logger.warn('Org graph role correction not synced to Contacts', {
        accountId: args.accountId,
        matches: candidates.length,
      })
      return
    }
    await trx.query(`UPDATE contacts SET decision_role = $3 WHERE id = $1 AND workspace_id = $2`, [
      candidates[0].id,
      args.workspaceId,
      contactRoleFromOrgRoles(roles),
    ])
  }

  /**
   * Fabrique le 409 avec son diff.
   *
   * `current` peut être inconnu (l'UPDATE conditionnel n'a rien touché sans
   * qu'on ait relu la ligne) : on le relit alors. Si on n'y arrive toujours
   * pas, on rend `yours + 1` — c'est le minimum VRAI (la base est en avance
   * d'au moins une version), jamais un chiffre inventé.
   */
  private async conflict(
    workspaceId: string,
    accountId: string,
    yours: number,
    current: number | null,
  ): Promise<HttpException> {
    let resolved = current
    if (resolved === null) {
      const account = await this.accounts.findOne({ where: { id: accountId, workspace_id: workspaceId } })
      resolved = account?.org_graph_version ?? yours + 1
    }
    if (resolved <= yours) resolved = yours + 1

    const intervening = await this.interveningSince(workspaceId, accountId, yours)
    const body: OrgGraphConflict & { code: string; message: string } = {
      error: 'graph_version_mismatch',
      code: 'graph_version_mismatch',
      yours,
      current: resolved,
      diffSummary: summarise(intervening),
      intervening,
      message:
        "L'organigramme a été corrigé entre-temps. Recharge le dossier avant de réappliquer ta correction — rien n'a été écrasé.",
    }
    return new HttpException(body, HttpStatus.CONFLICT)
  }

  /** Ce qui s'est intercalé depuis la version qu'on croyait courante. */
  private async interveningSince(
    workspaceId: string,
    accountId: string,
    yours: number,
  ): Promise<OrgGraphInterveningCorrection[]> {
    try {
      const rows = returnedRows<LedgerRow & { first_name: string | null; last_name: string | null }>(
        await this.corrections.manager.query(
          `SELECT c.object_type, c.object_id, c.field, c.graph_version_after, c.created_at,
                  p.first_name, p.last_name
             FROM org_graph_corrections c
             LEFT JOIN profiles p ON p.user_id = c.user_id
            WHERE c.workspace_id = $1 AND c.account_id = $2 AND c.graph_version_after > $3
              AND c.scope <> 'personal'
            ORDER BY c.graph_version_after DESC, c.created_at DESC
            LIMIT 10`,
          [workspaceId, accountId, yours],
        ),
      )
      return rows.map(row => ({
        objectType: row.object_type,
        objectId: row.object_id,
        field: row.field,
        // Jamais un identifiant technique à la place d'un nom, jamais
        // « undefined a modifié ».
        by: nameOf(row.first_name, row.last_name),
        at: typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString(),
      }))
    } catch (err) {
      // Le conflit reste un conflit même si on ne sait pas le raconter.
      this.logger.warn('Org graph conflict diff unavailable', {
        accountId,
        error: err instanceof Error ? err.message : String(err),
      })
      return []
    }
  }
}

type LedgerRow = {
  id: string
  object_type: OrgCorrectionObjectType
  object_id: string
  field: OrgCorrectionField
  old_value: OrgCorrectionValue
  new_value: OrgCorrectionValue
  reason: string
  evidence: OrgCorrectionClaim['evidence']
  graph_version_before: number
  graph_version_after: number
  user_id: string
  created_at: string | Date
  reverted_at: string | Date | null
  /** #2126.36 / .37 / .39 — absents d'une ligne antérieure à la migration = leurs défauts. */
  motive?: OrgCorrectionMotive
  scope?: OrgCorrectionScope
  visibility?: OrgCorrectionVisibility
}

function toContract(row: LedgerRow, scope: { workspaceId: string; accountId: string }): Record<string, unknown> {
  return {
    id: row.id,
    workspaceId: scope.workspaceId,
    accountId: scope.accountId,
    graphVersionBefore: row.graph_version_before,
    graphVersionAfter: row.graph_version_after,
    objectType: row.object_type,
    objectId: row.object_id,
    field: row.field,
    oldValue: row.old_value ?? null,
    newValue: row.new_value ?? null,
    reason: row.reason,
    evidence: row.evidence,
    userId: row.user_id,
    createdAt: iso(row.created_at),
    revertedAt: row.reverted_at ? iso(row.reverted_at) : null,
    motive: row.motive ?? 'corrected',
    scope: row.scope ?? 'account',
    visibility: row.visibility ?? 'workspace',
  }
}

function iso(value: string | Date): string {
  return typeof value === 'string' ? value : value.toISOString()
}

/** Le nom d'une personne, ou `null`. Jamais une moitié de nom présentée comme un nom. */
function nameOf(first: string | null, last: string | null): string | null {
  const full = [first, last].filter((part): part is string => Boolean(part && part.trim())).join(' ')
  return full.trim() ? full.trim() : null
}

/** Les libellés français des champs, pour la phrase de repli du 409. */
const FIELD_LABELS: Readonly<Record<OrgCorrectionField, string>> = {
  title: 'le titre',
  entityId: 'le rattachement',
  hierarchyLevel: 'le niveau',
  decisionRoles: 'les rôles de décision',
  reportsTo: 'le N+1',
  name: 'le nom',
  parentId: 'le rattachement',
  type: 'le type de lien',
  verified: 'la vérification du lien',
  presence: 'la présence du lien',
}

/**
 * La phrase de repli du 409, en français.
 *
 * Ce n'est PAS la vérité que l'écran doit rendre — `intervening` l'est, et il
 * se traduit. Cette phrase existe pour les appelants qui n'ont qu'un `message`
 * à afficher, et pour les journaux.
 */
function summarise(intervening: readonly OrgGraphInterveningCorrection[]): string {
  const first = intervening[0]
  if (!first) return "Une modification plus récente de l'organigramme existe."
  const who = first.by ?? 'Une autre personne'
  const what = FIELD_LABELS[first.field]
  const target = describeTarget(first)
  const more = intervening.length > 1 ? ` (et ${intervening.length - 1} autre${intervening.length > 2 ? 's' : ''})` : ''
  return `${who} a modifié ${what} de ${target}${more}.`
}

/**
 * Comment nommer l'objet corrigé dans la phrase.
 *
 * L'id est un slug déterministe (`p-julien-nicolas`) : on le rend lisible
 * plutôt que d'aller relire le graphe pour une phrase de repli. Un lien se dit
 * par ses deux extrémités.
 */
function describeTarget(entry: OrgGraphInterveningCorrection): string {
  if (entry.objectType === 'edge') {
    const key = parseEdgeKey(entry.objectId)
    return key ? `${humanise(key.fromId)} → ${humanise(key.toId)}` : 'un lien'
  }
  return humanise(entry.objectId)
}

/** `p-julien-nicolas` → `Julien Nicolas`. Le slug est déterministe, pas deviné. */
function humanise(id: string): string {
  const bare = id
    .replace(/^(?:p|e)-(?:declared-)?/, '')
    .replace(/-/g, ' ')
    .trim()
  if (!bare) return 'cet élément'
  return bare
    .split(' ')
    .map(word => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ')
}
