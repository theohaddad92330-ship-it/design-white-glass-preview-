import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { orgInferredReportings, orgReportingHypotheses } from '@bellum/contracts'
import type { OrgDeclaredPerson, OrgHierarchyRelation, OrgRejectedItem } from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { returnedRows } from '../../database/returned-rows'
import { applyDeclaredPeople, mergeDeclaredPeople, personKey } from './org-graph-declare'
import { computePathOrigin, readRelationshipState, recomputeRecommendedPath } from './org-graph-path'
import { applyRelationVerdict, type RelationVerdict } from './org-graph-verify'
import {
  applyOrgGraphCorrection,
  mergeRejectedItems,
  readStoredOrgGraph,
  rejectionFromFeedback,
} from './org-graph-versioning'

/** Ce qu'un run doit savoir du passé du graphe avant de le réassembler. */
type OrgGraphMemory = {
  /** Version du prochain graphe — jamais inférieure à la dernière connue. */
  graphVersion: number
  /** Éléments écartés à ne PAS réinjecter (p10 « rejeté + mémorisé »). */
  rejectedItems: OrgRejectedItem[]
}

/** Nombre de dossiers frères relus pour reconstituer la mémoire d'une entreprise. */
const MEMORY_FETCH_LIMIT = 20

/**
 * Versionnement + mémoire du graphe d'organigramme (Annexe Organigramme §5).
 *
 * Deux moments, deux méthodes :
 *
 * 1. {@link recordCorrection} — au moment où l'utilisateur corrige le dossier.
 *    La correction bump `org_graph_version`, mémorise l'élément écarté et
 *    ÉLAGUE le graphe déjà stocké : le contact signalé parti disparaît des 4
 *    vues immédiatement, sans full rerun.
 * 2. {@link memoryFor} — au moment de lancer le run suivant. Rend la version et
 *    l'ardoise des rejets à passer à l'assembleur IA, pour qu'il ne réinjecte
 *    pas ce qui a déjà été écarté.
 *
 * La mémoire suit l'ENTREPRISE dans le workspace, pas l'id de compte — un
 * nouveau run crée une nouvelle ligne `accounts`, exactement le raisonnement de
 * `AccountFeedbackService.directivesFor`. Best-effort de bout en bout : toute
 * erreur dégrade vers le comportement d'avant (version 1, aucune mémoire) — la
 * mémoire du graphe ne bloque JAMAIS un retour utilisateur ni un lancement.
 *
 * Module autonome (règle #7) : le retirer laisse le feedback et l'analyse
 * fonctionner, simplement sans versionnement.
 */
@Injectable()
export class OrgGraphVersionService {
  private readonly logger = new Logger(OrgGraphVersionService.name)

  constructor(
    // Repo direct (pas AccountsModule) : deux lectures + un UPDATE ciblé, et
    // surtout aucun cycle AccountFeedback → OrgGraph → Accounts → Analysis.
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
  ) {}

  /**
   * Enregistre une correction utilisateur sur le graphe d'un dossier. Rend la
   * nouvelle version, ou `null` si rien n'a pu être appliqué.
   *
   * TOUTE correction bump la version (p30) ; seules les corrections négatives
   * portant sur un contact écartent un nœud.
   */
  async recordCorrection(args: {
    accountId: string
    target: string
    targetRef: string
    verdict: string
  }): Promise<{ graphVersion: number; rejected: OrgRejectedItem | null } | null> {
    try {
      const account = await this.accounts.findOne({ where: { id: args.accountId } })
      if (!account) return null

      const rejection = rejectionFromFeedback(args)
      const graphVersion = (account.org_graph_version ?? 1) + 1
      const rejectedItems = mergeRejectedItems(account.org_rejected_items ?? [], rejection ? [rejection] : [])

      // Recalcul déterministe du graphe DÉJÀ affiché — pas d'attente du prochain
      // run pour que la correction se voie. `null` (dossier antérieur, blob sans
      // graphe, élagage qui casserait le contrat) = on ne touche pas au blob.
      const stored = readStoredOrgGraph(account.raw_analysis)
      const corrected = stored
        ? applyOrgGraphCorrection(stored, { version: graphVersion, rejections: rejectedItems })
        : null

      const updated = returnedRows<{ org_graph_version: number }>(
        await this.accounts.manager.query(
          `
        UPDATE accounts
        SET org_graph_version = $2,
            org_rejected_items = $3::jsonb,
            raw_analysis = CASE
              WHEN $4::jsonb IS NULL THEN raw_analysis
              ELSE COALESCE(raw_analysis, '{}'::jsonb)
                   || jsonb_build_object(
                        'org',
                        COALESCE(raw_analysis -> 'org', '{}'::jsonb) || jsonb_build_object('orgGraph', $4::jsonb)
                      )
            END
        WHERE id = $1
          AND COALESCE(org_graph_version, 1) = $5
        RETURNING org_graph_version
        `,
          [
            args.accountId,
            graphVersion,
            JSON.stringify(rejectedItems),
            corrected ? JSON.stringify(corrected) : null,
            graphVersion - 1,
          ],
        ),
      )
      // ⚠️ Zéro ligne = quelqu'un a écrit entre notre lecture et notre
      // écriture. On rend `null` — le contrat best-effort que l'appelant sait
      // déjà lire — plutôt que d'annoncer un succès qui a effacé son geste.
      if (updated.length === 0) {
        this.logger.warn('Org graph correction skipped — graph moved under us', { accountId: args.accountId })
        return null
      }

      this.logger.log('Org graph corrected', {
        accountId: args.accountId,
        graphVersion,
        rejectedSourceId: rejection?.sourceId ?? null,
        graphRewritten: corrected != null,
      })
      return { graphVersion, rejected: rejection }
    } catch (err) {
      this.logger.warn('Org graph correction failed — feedback kept, graph left as-is', {
        accountId: args.accountId,
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }

  /**
   * Déclarer des personnes qu'on connaît et que Bellum n'a pas trouvées (#1103).
   *
   * « Ici il faudrait pouvoir […] soit charger un organigramme si on en a un,
   * soit pouvoir décrire des éléments et ensuite ça intègre. »
   *
   * Deux écritures, et l'ordre compte : l'ARDOISE d'abord, le graphe ensuite.
   * L'ardoise est ce qui survit — chaque run réécrit `raw_analysis.org.orgGraph`
   * à neuf, si bien qu'une greffe posée sans ardoise disparaîtrait à la
   * réanalyse suivante, sans un mot. On aurait demandé du travail à quelqu'un
   * et on l'aurait jeté en silence.
   *
   * Un compte sans graphe stocké (dossier antérieur, analyse jamais aboutie)
   * garde quand même sa déclaration : elle sera greffée au premier graphe
   * écrit. Refuser ici perdrait une saisie pour une raison que personne ne
   * comprendrait à l'écran.
   *
   * La REGREFFE après un run ne vit pas ici mais dans
   * `AccountsService.applyOrgChart`, le seul endroit où le bloc `org` d'un run
   * atterrit — au même endroit que la remontée de l'ardoise des rejets, et pour
   * la même raison. Une méthode de regreffe posée ici n'aurait eu aucun
   * appelant : le « livré, testé, et que rien n'appelle » que ce dépôt passe
   * son temps à corriger.
   */
  async declarePeople(args: {
    accountId: string
    people: OrgDeclaredPerson[]
  }): Promise<{ graphVersion: number; declared: number; grafted: boolean } | null> {
    if (args.people.length === 0) return null
    try {
      const account = await this.accounts.findOne({ where: { id: args.accountId } })
      if (!account) return null

      const declared = mergeDeclaredPeople(account.org_declared_people ?? [], args.people)
      const graphVersion = (account.org_graph_version ?? 1) + 1
      const stored = readStoredOrgGraph(account.raw_analysis)
      const grafted = stored ? applyDeclaredPeople({ ...stored, graphVersion }, declared) : null

      const updated = returnedRows<{ org_graph_version: number }>(
        await this.accounts.manager.query(
          `
        UPDATE accounts
        SET org_graph_version = $2,
            org_declared_people = $3::jsonb,
            raw_analysis = CASE
              WHEN $4::jsonb IS NULL THEN raw_analysis
              ELSE COALESCE(raw_analysis, '{}'::jsonb)
                   || jsonb_build_object(
                        'org',
                        COALESCE(raw_analysis -> 'org', '{}'::jsonb) || jsonb_build_object('orgGraph', $4::jsonb)
                      )
            END
        WHERE id = $1
          AND COALESCE(org_graph_version, 1) = $5
        RETURNING org_graph_version
        `,
          [
            args.accountId,
            graphVersion,
            JSON.stringify(declared),
            grafted ? JSON.stringify(grafted) : null,
            graphVersion - 1,
          ],
        ),
      )
      if (updated.length === 0) {
        this.logger.warn('Org graph declaration skipped — graph moved under us', { accountId: args.accountId })
        return null
      }

      this.logger.log('Org graph people declared', {
        accountId: args.accountId,
        graphVersion,
        declared: declared.length,
        grafted: grafted != null,
      })
      return { graphVersion, declared: declared.length, grafted: grafted != null }
    } catch (err) {
      this.logger.warn('Org graph declaration failed — nothing written', {
        accountId: args.accountId,
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }

  /**
   * Retirer une déclaration.
   *
   * On retire de l'ARDOISE, et le nœud greffé disparaît à la prochaine
   * réapplication. On ne l'élague PAS du graphe stocké ici : élaguer
   * demanderait de savoir si la personne y était déjà avant d'être déclarée —
   * et si oui, la retirer effacerait une découverte du pipeline pour une raison
   * qui ne la concerne pas. Un rejet, lui, a son propre chemin.
   */
  async undeclarePerson(args: { accountId: string; fullName: string }): Promise<number | null> {
    try {
      const account = await this.accounts.findOne({ where: { id: args.accountId } })
      if (!account) return null
      const key = personKey(args.fullName)
      const declared = (account.org_declared_people ?? []).filter(p => personKey(p.fullName) !== key)
      await this.accounts.manager.query(`UPDATE accounts SET org_declared_people = $2::jsonb WHERE id = $1`, [
        args.accountId,
        JSON.stringify(declared),
      ])
      return declared.length
    } catch (err) {
      this.logger.warn('Org graph undeclare failed — ardoise left as-is', {
        accountId: args.accountId,
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }

  /**
   * « Recalculer le chemin » (annexe organigramme §6) — réordonne la séquence
   * d'approche À PARTIR du graphe déjà stocké : aucune recherche, aucun appel
   * IA, aucun crédit. Sert après une correction, un enrichissement ciblé ou un
   * changement d'état de la relation, quand seul l'ORDRE est périmé.
   *
   * Rend `null` — et ne touche à rien — quand il n'y a pas de graphe stocké,
   * aucun interlocuteur actionnable, ou que le recalcul violerait le contrat.
   * L'appelant transforme ce `null` en refus explicite : jamais un bouton qui
   * fait semblant d'avoir travaillé.
   */
  async recomputePath(accountId: string): Promise<{ graphVersion: number; steps: number } | null> {
    try {
      const account = await this.accounts.findOne({ where: { id: accountId } })
      if (!account) return null

      const stored = readStoredOrgGraph(account.raw_analysis)
      if (!stored) return null

      const graphVersion = (account.org_graph_version ?? 1) + 1
      const reordered = recomputeRecommendedPath(stored, {
        version: graphVersion,
        // L'état de la relation décide du garde-fou « le board n'est pas une
        // porte d'entrée à froid ». Illisible = froid, donc garde-fou actif.
        relationshipState: readRelationshipState(account.raw_analysis),
      })
      if (!reordered) return null

      // D'OÙ part le chemin, une fois l'ordre arrêté : la forme se lit sur la
      // PREMIÈRE étape, elle doit donc être calculée APRÈS le réordonnancement,
      // jamais avant — sinon elle décrirait le chemin précédent.
      const origin = computePathOrigin(reordered, {
        memory: account.relationship_memory,
        now: new Date(),
      })
      // `null` = aucune cible, donc aucune forme à écrire. On garde alors le
      // graphe réordonné tel quel plutôt que d'y poser une origine inventée.
      const next = origin ? { ...reordered, pathOrigin: origin } : reordered

      const updated = returnedRows<{ org_graph_version: number }>(
        await this.accounts.manager.query(
          `
        UPDATE accounts
        SET org_graph_version = $2,
            raw_analysis = COALESCE(raw_analysis, '{}'::jsonb)
                           || jsonb_build_object(
                                'org',
                                COALESCE(raw_analysis -> 'org', '{}'::jsonb) || jsonb_build_object('orgGraph', $3::jsonb)
                              )
        WHERE id = $1
          AND COALESCE(org_graph_version, 1) = $4
        RETURNING org_graph_version
        `,
          [accountId, graphVersion, JSON.stringify(next), graphVersion - 1],
        ),
      )
      if (updated.length === 0) {
        this.logger.warn('Org graph write skipped — graph moved under us', { accountId })
        return null
      }

      this.logger.log('Org graph path recomputed', {
        accountId,
        graphVersion,
        steps: next.recommendedPath.length,
      })
      return { graphVersion, steps: next.recommendedPath.length }
    } catch (err) {
      this.logger.warn('Org graph path recompute failed — graph left as-is', {
        accountId,
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }

  /**
   * Le lien à vérifier, tel que le graphe stocké le connaît : les deux noms et
   * le compte. `null` quand le lien n'existe pas, est déjà vérifié, ou que l'une
   * des extrémités n'est pas une personne nommée — dans tous ces cas il n'y a
   * rien à aller chercher sur le web.
   *
   * ⚠️ D360 — DEUX FORMES DE LIEN, PAS UNE. Un rattachement à vérifier vit
   * aujourd'hui SOIT comme `hierarchyEdge` (dossiers antérieurs, corrections
   * humaines), SOIT comme HYPOTHÈSE dans `influenceEdges` sous le topic
   * « rattachement hiérarchique » — et depuis le correctif P0 du 29/08 c'est la
   * seconde forme dans 100 % des dossiers réanalysés (mesuré le 30/08 :
   * `reports_to` produits par l'assembleur = 0). Ne chercher que la première
   * revenait à répondre 412 à tout clic sur l'écran d'arrivée.
   */
  async relationToVerify(
    accountId: string,
    edge: { fromId: string; toId: string; type: OrgHierarchyRelation },
  ): Promise<{ company: string; website: string | null; fromName: string; toName: string } | null> {
    try {
      const account = await this.accounts.findOne({ where: { id: accountId } })
      if (!account) return null
      const stored = readStoredOrgGraph(account.raw_analysis)
      if (!stored) return null

      const found = stored.hierarchyEdges.find(
        e => e.fromId === edge.fromId && e.toId === edge.toId && e.type === edge.type,
      )
      // Déjà vérifié : il est sourcé, il n'y a rien à revérifier.
      if (found?.verified) return null
      const supposed =
        edge.type === 'reports_to' &&
        // #4016 L4.2 — l'arête INFÉRÉE des intitulés (« probable ») se vérifie aussi.
        [...orgReportingHypotheses(stored), ...orgInferredReportings(stored)].some(
          h => h.fromId === edge.fromId && h.toId === edge.toId,
        )
      if (!found && !supposed) return null

      const fromName = stored.people.find(p => p.id === edge.fromId)?.fullName?.trim() ?? ''
      const toName = stored.people.find(p => p.id === edge.toId)?.fullName?.trim() ?? ''
      // Le vérificateur cherche DEUX NOMS DE PERSONNES sur une même page
      // (`build_verification_queries` rend une liste vide dès qu'il en manque
      // un) : une cible entité n'a rien à y chercher.
      if (!fromName || !toName) return null

      return {
        company: account.company_name ?? '',
        website: account.website ?? null,
        fromName,
        toName,
      }
    } catch (err) {
      this.logger.warn('Org graph relation lookup failed', {
        accountId,
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }

  /**
   * Écrit le verdict de vérification sur le lien. Bump de version comme toute
   * modification du graphe (p30). `null` = rien écrit : aucune preuve, lien
   * introuvable, déjà vérifié, ou graphe résultant invalide. On ne dégrade
   * JAMAIS un lien faute de preuve.
   */
  async applyRelationVerification(
    accountId: string,
    args: { fromId: string; toId: string; type: OrgHierarchyRelation; verdict: RelationVerdict },
  ): Promise<{ graphVersion: number; verified: boolean; confidence: number } | null> {
    try {
      const account = await this.accounts.findOne({ where: { id: accountId } })
      if (!account) return null
      const stored = readStoredOrgGraph(account.raw_analysis)
      if (!stored) return null

      const graphVersion = (account.org_graph_version ?? 1) + 1
      // La date de vérification est posée ICI, par le serveur : une date qui
      // viendrait de l'appelant se règle, et une vérification datée par celui
      // qui la demande n'est pas une vérification.
      const next = applyRelationVerdict(stored, { ...args, version: graphVersion, at: new Date().toISOString() })
      if (!next) return null

      const updated = returnedRows<{ org_graph_version: number }>(
        await this.accounts.manager.query(
          `
        UPDATE accounts
        SET org_graph_version = $2,
            raw_analysis = COALESCE(raw_analysis, '{}'::jsonb)
                           || jsonb_build_object(
                                'org',
                                COALESCE(raw_analysis -> 'org', '{}'::jsonb) || jsonb_build_object('orgGraph', $3::jsonb)
                              )
        WHERE id = $1
          AND COALESCE(org_graph_version, 1) = $4
        RETURNING org_graph_version
        `,
          [accountId, graphVersion, JSON.stringify(next), graphVersion - 1],
        ),
      )
      if (updated.length === 0) {
        this.logger.warn('Org graph write skipped — graph moved under us', { accountId })
        return null
      }

      this.logger.log('Org graph relation verified', {
        accountId,
        graphVersion,
        verified: args.verdict.verified,
      })
      return { graphVersion, verified: args.verdict.verified, confidence: args.verdict.confidence! }
    } catch (err) {
      this.logger.warn('Org graph relation verification failed — graph left as-is', {
        accountId,
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }

  /**
   * La mémoire du graphe pour un run à venir. Rend `{graphVersion: 1,
   * rejectedItems: []}` quand il n'y a rien à se rappeler — l'assemblage IA est
   * alors byte-identique à avant la feature.
   */
  async memoryFor(args: {
    accountId: string
    workspaceId: string | null
    companyName: string
  }): Promise<OrgGraphMemory> {
    const empty: OrgGraphMemory = { graphVersion: 1, rejectedItems: [] }
    try {
      const qb = this.accounts.createQueryBuilder('a')
      if (args.workspaceId && args.companyName.trim()) {
        qb.where('a.workspace_id = :ws', { ws: args.workspaceId }).andWhere('LOWER(a.company_name) = LOWER(:name)', {
          name: args.companyName,
        })
      } else {
        // Compte legacy sans workspace (ou nom vide) : mémoire du compte seul.
        qb.where('a.id = :id', { id: args.accountId })
      }
      const rows = await qb.orderBy('a.updated_at', 'DESC').limit(MEMORY_FETCH_LIMIT).getMany()
      if (rows.length === 0) return empty

      const graphVersion = Math.max(1, ...rows.map(r => r.org_graph_version ?? 1))
      const rejectedItems = rows.reduce<OrgRejectedItem[]>(
        (acc, row) => mergeRejectedItems(acc, Array.isArray(row.org_rejected_items) ? row.org_rejected_items : []),
        [],
      )
      return { graphVersion, rejectedItems }
    } catch (err) {
      this.logger.warn('Org graph memory lookup failed — running without memory', {
        accountId: args.accountId,
        error: err instanceof Error ? err.message : String(err),
      })
      return empty
    }
  }
}
