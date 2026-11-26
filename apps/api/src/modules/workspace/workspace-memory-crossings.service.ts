import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  MEMORY_CROSSING_KINDS,
  MEMORY_POLICY_DEFAULTS,
  type MemoryBridgeAccount,
  type MemoryBridgeAccountList,
  type MemoryBridgeView,
  type MemoryCrossing,
  type MemoryCrossingKind,
  type MemoryCrossingSource,
  type MemoryObjectRef,
  type ObjectLabel,
  type RecordBridgeContact,
  type WorkspaceMemoryPolicy,
  type WorkspaceRole,
  needStillOpenSql,
  objectLabel,
  workspaceRoleSchema,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { WorkspaceBridgeContactEntity } from '../../database/entities/workspace-bridge-contact.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceContextService } from './workspace-context.service'
import { asDay } from '../../common/day'

/**
 * LA MÉMOIRE COLLECTIVE — la dérivation.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE FAIT, EN UNE PHRASE
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle répond à « ton espace sait-il déjà quelque chose sur ce compte, et qui
 * dois-je aller voir ? » — quatre croisements, dérivés à la lecture depuis des
 * tables qui existent déjà. **Rien n'est matérialisé** : un croisement n'a pas
 * de table, donc pas de fait périmé à purger, pas de deuxième vérité à
 * resynchroniser. La seule chose qui s'écrit est le journal de contribution,
 * quand quelqu'un dit « je l'ai contacté ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX RÈGLES QUI TIENNENT TOUT LE FICHIER
 * ─────────────────────────────────────────────────────────────────────────────
 * **1. Un croisement naît DANS un espace et y reste.** Chaque requête de ce
 * fichier commence par `workspace_id = $1`, et `workspaceId` n'est jamais un
 * paramètre d'entrée : il est résolu côté serveur par
 * {@link WorkspaceContextService.resolveActiveWorkspace}. Aucune ligne ici ne
 * peut lire deux espaces — les espaces sont des ESN, donc des concurrents
 * (GA-43).
 *
 * **2. Le CORPS des messages n'est jamais dans le rayon de la requête.** La
 * table `activities` porte `body` — le corps intégral des e-mails, stocké depuis
 * l'arbitrage du 16/08. Ce service **ne la lit pas**. Le signal « quelqu'un
 * travaille ce compte » se prend sur `user_actions`, qui enregistre le GESTE et
 * n'a aucune colonne de contenu. Ce n'est pas une précaution de style : c'est
 * la différence entre « on a décidé de ne pas exposer » et « il n'y a rien à
 * exposer ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE SOURCE QUI TOMBE N'EST PAS UNE ABSENCE DE CROISEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Chaque dérivation est isolée dans son `try`. Une requête qui échoue nomme sa
 * source dans `unreadableSources` plutôt que de rendre zéro croisement : les
 * deux se ressemblent à l'écran, et le second se lit « ton espace ne sait rien
 * de ce compte » — une phrase fausse et rassurante. C'est la leçon
 * d'`unreadableLayers` (`memory-ledger.ts`), appliquée telle quelle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE N'ÉCRIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucun `UPDATE`, aucune réattribution, aucune fusion. Le seul `INSERT` du
 * fichier écrit une ligne de journal qui ne change le portefeuille de personne.
 * « Aucune réattribution automatique » n'est pas un réglage laissé sur OFF :
 * c'est l'absence du code qui la ferait.
 */
@Injectable()
export class WorkspaceMemoryCrossingsService {
  private readonly logger = new Logger(WorkspaceMemoryCrossingsService.name)

  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
    @InjectRepository(WorkspaceBridgeContactEntity)
    private readonly bridges: Repository<WorkspaceBridgeContactEntity>,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /**
   * Les comptes de l'espace sur lesquels il y a de la matière — la porte
   * d'entrée de l'écran.
   *
   * Elle ne rend PAS les croisements eux-mêmes, seulement leurs NATURES : c'est
   * le même principe que le pont, appliqué à la liste. Le détail se lit une fois
   * qu'on a cliqué.
   */
  async listAccounts(userId: string): Promise<MemoryBridgeAccountList> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const unreadable = new Set<MemoryCrossingSource>()

    const accounts = await this.accountsWithMatter(workspaceId, userId, unreadable)
    return { accounts, unreadableSources: [...unreadable] }
  }

  /**
   * Ce que l'espace sait déjà de CE compte.
   *
   * ⚠️ L'ordre des croisements est celui de {@link MEMORY_CROSSING_KINDS} — un
   * tri par NATURE. Jamais par collègue : classer des collègues, même
   * implicitement par l'ordre d'une liste, est exactement ce que le §24 « Red
   * Team » de la doctrine interdit.
   */
  async view(userId: string, accountId: string): Promise<MemoryBridgeView> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)

    // #2532 — « rien de connu » n'est pas « introuvable ». Ces deux 404
    // gardent la MÊME forme (NotFoundException) côté appelant, et c'est
    // volontaire : ni « compte d'un autre espace » ni « compte sans nom
    // lisible » ne doivent se distinguer d'une réponse HTTP à l'extérieur —
    // sinon le premier cas cesserait de protéger la frontière d'espace
    // (GA-43). C'est à l'appelant (web) de traiter TOUT 404 de cette route
    // comme « rien de connu », jamais comme une panne — voir
    // `MemoryBridgeView.tsx`.
    const account = await this.accounts.findOne({
      where: { id: accountId, workspace_id: workspaceId },
      select: { id: true, company_name: true },
    })
    if (!account) throw new NotFoundException('Compte introuvable')

    const label = objectLabel('company_name', account.company_name)
    if (!label) throw new NotFoundException('Compte sans nom lisible')
    const subject: MemoryObjectRef = { kind: 'account', id: account.id, label }

    const unreadable = new Set<MemoryCrossingSource>()
    const crossings: MemoryCrossing[] = []

    for (const kind of MEMORY_CROSSING_KINDS) {
      const derived = await this.derive(kind, workspaceId, userId, subject, unreadable)
      if (derived) crossings.push(derived)
    }

    return {
      account: subject,
      crossings,
      policy: await this.policy(workspaceId),
      connections: await this.connections(workspaceId),
      unreadableSources: [...unreadable],
    }
  }

  /**
   * « J'ai contacté ce collègue. » Le SEUL chemin d'écriture de la mémoire
   * collective.
   *
   * Il n'écrit rien d'autre qu'une trace : pas de réattribution, pas de note,
   * pas de message. `ON CONFLICT DO NOTHING` sur l'index unique — trois clics ne
   * font pas trois mises en relation.
   */
  async recordContact(userId: string, body: RecordBridgeContact): Promise<{ recorded: boolean }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)

    // Le compte doit appartenir à l'espace : sans ce contrôle, un identifiant
    // deviné écrirait une ligne de journal pour un compte d'ailleurs.
    const owned = await this.accounts.count({ where: { id: body.accountId, workspace_id: workspaceId } })
    if (owned === 0) throw new NotFoundException('Compte introuvable')

    const rows = await this.bridges.manager.query<{ id: string }[]>(
      `INSERT INTO workspace_bridge_contacts
         (workspace_id, account_id, kind, from_user_id, to_user_id, bridged_month)
       VALUES ($1, $2, $3, $4, $5, date_trunc('month', now() AT TIME ZONE 'UTC')::date)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [workspaceId, body.accountId, body.kind, userId, body.colleagueUserId],
    )
    return { recorded: rows.length > 0 }
  }

  /* ──────────────────────────────────────────────────────────────────────────
   * LA POLITIQUE
   * ────────────────────────────────────────────────────────────────────────── */

  /**
   * Ce que l'espace a décidé.
   *
   * ⚠️ `restrictedAccounts` est LU sur `workspaces.portfolio_visibility`, le
   * réglage qui existe déjà et se modifie dans Équipe. Le recopier dans une
   * colonne à nous en aurait fait deux, qui divergent (GA-26). Les deux autres
   * valeurs viennent de {@link MEMORY_POLICY_DEFAULTS}, dont le commentaire dit
   * que leur seule source est la maquette.
   */
  private async policy(workspaceId: string): Promise<WorkspaceMemoryPolicy> {
    const workspace = await this.workspaces.findOne({
      where: { id: workspaceId },
      select: { id: true, portfolio_visibility: true },
    })
    return {
      sharingMode: 'bridge',
      ownerPriorityDays: MEMORY_POLICY_DEFAULTS.ownerPriorityDays,
      kAnonymityThreshold: MEMORY_POLICY_DEFAULTS.kAnonymityThreshold,
      morningBudget: MEMORY_POLICY_DEFAULTS.morningBudget,
      restrictedAccounts: workspace?.portfolio_visibility === 'restricted',
    }
  }

  /* ──────────────────────────────────────────────────────────────────────────
   * LA MESURE
   * ────────────────────────────────────────────────────────────────────────── */

  /**
   * « Ce mois-ci, Bellum a connecté N fois deux personnes de ton équipe. »
   *
   * ⚠️ Trois états, pas deux. Le journal vide POUR CET ESPACE rend `null` — « pas
   * assez d'historique pour mesurer » — et non `0`, qui se lirait « le produit
   * ne sert à rien ». Une fois qu'une ligne existe, `0` devient une mesure vraie
   * et s'affiche comme telle.
   *
   * ⚠️ Un COMPTE d'espace, jamais une ventilation par personne : le SQL n'a
   * aucun `GROUP BY user`, et il n'y a pas de variante qui en ait un.
   */
  private async connections(workspaceId: string): Promise<{
    connectionsThisMonth: number | null
    measuredSince: string | null
  }> {
    try {
      const rows = await this.bridges.manager.query<{ total: string; since: Date | null }[]>(
        `SELECT
           COUNT(*) FILTER (
             WHERE bridged_month = date_trunc('month', now() AT TIME ZONE 'UTC')::date
           )::text AS total,
           MIN(created_at) AS since
         FROM workspace_bridge_contacts
         WHERE workspace_id = $1`,
        [workspaceId],
      )
      const since = rows[0]?.since ?? null
      // Aucune ligne pour cet espace : rien n'a jamais été mesuré.
      if (!since) return { connectionsThisMonth: null, measuredSince: null }
      return { connectionsThisMonth: Number(rows[0]?.total ?? 0), measuredSince: since.toISOString() }
    } catch (error) {
      this.logger.error(`Mises en relation non comptables (${(error as Error).message})`, { error })
      return { connectionsThisMonth: null, measuredSince: null }
    }
  }

  /* ──────────────────────────────────────────────────────────────────────────
   * LES QUATRE DÉRIVATIONS
   * ────────────────────────────────────────────────────────────────────────── */

  private derive(
    kind: MemoryCrossingKind,
    workspaceId: string,
    userId: string,
    subject: MemoryObjectRef,
    unreadable: Set<MemoryCrossingSource>,
  ): Promise<MemoryCrossing | null> {
    switch (kind) {
      case 'openDoor':
        return this.guarded('missions', unreadable, () => this.openDoor(workspaceId, userId, subject))
      case 'prospectionCollision':
        return this.guarded('accountActivity', unreadable, () =>
          this.prospectionCollision(workspaceId, userId, subject),
        )
      case 'crossStaffing':
        return this.guarded('projectNeeds', unreadable, () => this.crossStaffing(workspaceId, userId, subject))
      case 'knownReferencing':
        return this.guarded('accessFacts', unreadable, () => this.knownReferencing(workspaceId, subject))
    }
  }

  /**
   * G1 — PORTE D'ENTRÉE DÉJÀ OUVERTE.
   *
   * « David a fait démarrer un consultant Java chez BNP en mars. La mission est
   * encore active. »
   *
   * Lit `missions` jointe à `mission_assignments` : une mission SANS consultant
   * affecté n'est pas une porte d'entrée, c'est un contrat. Le porteur est
   * `missions.owner_id` — l'affectation de l'entreprise, pas l'auteur de la
   * ligne (`user_id`, qui n'est qu'une attribution).
   *
   * ⚠️ `owner_id <> $3` : un pont vers soi-même n'est pas un pont. Une mission
   * qu'on porte déjà est visible sur l'écran du compte ; la répéter ici
   * enfreindrait « rien n'apparaît deux fois sous la même forme ».
   *
   * ⚠️ `status <> 'terminated'` : une mission INTERROMPUE avant son terme est le
   * contraire d'une porte ouverte. Une mission terminée normalement en reste
   * une, et `stillActive` dit laquelle des deux on regarde — le champ VARIE, il
   * n'est pas un `true` décoratif.
   */
  private async openDoor(
    workspaceId: string,
    userId: string,
    subject: MemoryObjectRef,
  ): Promise<MemoryCrossing | null> {
    const rows = await this.accounts.manager.query<
      {
        mission_id: string
        role_title: string | null
        label: string | null
        started_on: string | Date | null
        status: string
        owner_id: string
        first_name: string | null
        role: string | null
      }[]
    >(
      `SELECT m.id AS mission_id, m.role_title, m.label, m.started_on, m.status, m.owner_id,
              p.first_name, wm.role
       FROM missions m
       JOIN mission_assignments ma ON ma.mission_id = m.id
       LEFT JOIN profiles p ON p.user_id = m.owner_id
       LEFT JOIN workspace_members wm ON wm.workspace_id = m.workspace_id AND wm.user_id = m.owner_id
       WHERE m.workspace_id = $1
         AND m.account_id = $2
         AND m.owner_id IS NOT NULL
         AND m.owner_id <> $3
         AND m.status <> 'terminated'
       ORDER BY m.started_on DESC NULLS LAST
       LIMIT 1`,
      [workspaceId, subject.id, userId],
    )

    const row = rows[0]
    // `started_on` est une colonne `date` : en SQL brut, `pg` en rend un objet
    // `Date`. Composer une chaîne ISO à partir de cet objet donnait
    // `Invalid Date`, et le croisement disparaissait de l'écran en silence.
    const startedOn = asDay(row?.started_on)
    if (!row || !startedOn) return null

    // L'intitulé du POSTE d'abord — « Consultant Java » dit ce qui s'est passé ;
    // le libellé de la mission est le repli quand il n'y en a pas.
    const missionLabel = objectLabel('role_title', row.role_title) ?? objectLabel('label', row.label)
    if (!missionLabel) return null

    const colleague = this.colleague(row.owner_id, row.first_name, row.role)
    if (!colleague) return null

    return {
      kind: 'openDoor',
      circle: 'c2',
      subject,
      colleague,
      action: 'talkToOwnerFirst',
      observedAt: new Date(`${startedOn}T00:00:00.000Z`).toISOString(),
      expiresAt: null,
      provenance: 'missions',
      detail: {
        kind: 'openDoor',
        mission: { kind: 'mission', id: row.mission_id, label: missionLabel },
        startedOn,
        stillActive: MISSION_RUNNING_STATUSES.includes(row.status),
      },
    }
  }

  /**
   * G4 — COLLISION DE PROSPECTION.
   *
   * « Sarah prépare aussi une approche sur BNP cette semaine. »
   *
   * ⚠️ Lit `user_actions` — le GESTE — et **jamais `activities`**, qui porte le
   * corps des e-mails. La collision se prouve par « quelqu'un a agi sur ce
   * compte », pas par ce qu'il a écrit. La table lue n'a aucune colonne de
   * contenu : il n'y a rien à filtrer, donc rien à oublier de filtrer.
   *
   * ⚠️ La fenêtre est {@link MEMORY_POLICY_DEFAULTS.ownerPriorityDays} — les
   * 7 jours du panneau de politique. C'est le même nombre parce que c'est la
   * même idée : pendant la fenêtre de priorité du porteur, une seconde approche
   * est une collision à signaler. Le réglage vit à un seul endroit, et il est
   * LU ici plutôt que réécrit (GA-26).
   *
   * ⚠️ `ORDER BY … DESC LIMIT 1` rend le collègue le plus RÉCENT, pas le plus
   * ACTIF. On ne compte pas les touches de quelqu'un, et on n'en dresse pas la
   * liste : ce serait un classement entre pairs.
   */
  private async prospectionCollision(
    workspaceId: string,
    userId: string,
    subject: MemoryObjectRef,
  ): Promise<MemoryCrossing | null> {
    const rows = await this.accounts.manager.query<
      { user_id: string; last_touch: Date; first_name: string | null; role: string | null }[]
    >(
      `SELECT ua.user_id, MAX(ua.created_at) AS last_touch, p.first_name, wm.role
       FROM user_actions ua
       LEFT JOIN profiles p ON p.user_id = ua.user_id
       LEFT JOIN workspace_members wm ON wm.workspace_id = ua.workspace_id AND wm.user_id = ua.user_id
       WHERE ua.workspace_id = $1
         AND ua.account_id = $2
         AND ua.user_id <> $3
         AND ua.created_at >= now() - make_interval(days => $4::int)
       GROUP BY ua.user_id, p.first_name, wm.role
       ORDER BY last_touch DESC
       LIMIT 1`,
      [workspaceId, subject.id, userId, MEMORY_POLICY_DEFAULTS.ownerPriorityDays],
    )

    const row = rows[0]
    if (!row) return null

    const colleague = this.colleague(row.user_id, row.first_name, row.role)
    if (!colleague) return null

    const lastTouch = new Date(row.last_touch)
    return {
      kind: 'prospectionCollision',
      circle: 'c2',
      subject,
      colleague,
      action: 'coordinateOrArbitrate',
      observedAt: lastTouch.toISOString(),
      expiresAt: null,
      provenance: 'accountActivity',
      detail: {
        kind: 'prospectionCollision',
        lastTouchOn: lastTouch.toISOString().slice(0, 10),
        withinDays: MEMORY_POLICY_DEFAULTS.ownerPriorityDays,
      },
    }
  }

  /**
   * G9 — INTERCONTRAT QUI MATCHE.
   *
   * « Ton consultant Mehdi correspond au besoin Data ouvert par Sarah. »
   *
   * Trois conditions, et « correspond » a une définition écrite plutôt qu'un
   * score :
   *
   *  1. le consultant est à MOI (`consultants.user_id = $3`) ;
   *  2. il est DÉCLARÉ disponible — `immediate` ou `sous_1_mois`. `inconnu`
   *     n'est jamais présenté comme disponible (c'est la règle de l'entité) ;
   *  3. **au moins une compétence du besoin est dans sa stack.** L'intersection
   *     est le fait ; elle n'est ni notée ni pondérée. Un score de matching
   *     existe ailleurs dans le produit et se calcule sur l'écran du besoin —
   *     le refaire ici en donnerait un deuxième, qui divergerait.
   *
   * ⚠️ Le besoin doit être OUVERT selon `needStillOpenSql`, la définition
   * unique du contrat (GA-62). L'écrire à la main ici aurait fait une cinquième
   * liste de statuts, avec un cinquième contenu.
   *
   * ⚠️ Aucun critère protégé n'entre dans la sélection ni dans le tri (GA-06) :
   * ni photo, ni âge, ni origine, ni adresse. Le consultant n'est pas classé —
   * on en prend UN, le plus récemment disponible.
   */
  private async crossStaffing(
    workspaceId: string,
    userId: string,
    subject: MemoryObjectRef,
  ): Promise<MemoryCrossing | null> {
    const rows = await this.accounts.manager.query<
      {
        consultant_id: string
        full_name: string | null
        need_id: string
        title: string
        owner_id: string
        first_name: string | null
        role: string | null
        detected_at: Date | null
      }[]
    >(
      `SELECT c.id AS consultant_id, c.full_name,
              n.id AS need_id, n.title, n.owner_id, n.detected_at,
              p.first_name, wm.role
       -- #2558.1 — un besoin existe sans projet : le croisement se fait sur le
       -- COMPTE du besoin. En passant par le projet, un collègue qui cherche
       -- un profil sur une mission de régie n'était croisé avec personne.
       FROM project_needs n
       JOIN consultants c ON c.workspace_id = n.workspace_id
       LEFT JOIN profiles p ON p.user_id = n.owner_id
       LEFT JOIN workspace_members wm ON wm.workspace_id = n.workspace_id AND wm.user_id = n.owner_id
       WHERE n.workspace_id = $1
         AND n.account_id = $2
         AND n.owner_id IS NOT NULL
         AND n.owner_id <> $3
         AND ${needStillOpenSql('n.status')}
         AND c.user_id = $3
         AND c.availability IN ('immediate', 'sous_1_mois')
         AND EXISTS (
           SELECT 1
           FROM jsonb_array_elements(n.skills) AS required
           JOIN unnest(c.stack) AS owned ON lower(owned) = lower(required->>'term')
         )
       ORDER BY n.detected_at DESC NULLS LAST
       LIMIT 1`,
      [workspaceId, subject.id, userId],
    )

    const row = rows[0]
    if (!row) return null

    const consultantLabel = objectLabel('full_name', row.full_name)
    const needLabel = objectLabel('title', row.title)
    if (!consultantLabel || !needLabel) return null

    const colleague = this.colleague(row.owner_id, row.first_name, row.role)
    if (!colleague) return null

    return {
      kind: 'crossStaffing',
      circle: 'c2',
      subject,
      colleague,
      action: 'introduceBothOwners',
      observedAt: (row.detected_at ?? new Date()).toISOString(),
      expiresAt: null,
      provenance: 'projectNeeds',
      detail: {
        kind: 'crossStaffing',
        consultant: { kind: 'consultant', id: row.consultant_id, label: consultantLabel },
        need: { kind: 'need', id: row.need_id, label: needLabel },
      },
    }
  }

  /**
   * G11 — RÉFÉRENCEMENT DÉJÀ CONNU.
   *
   * « L'espace est référencé rang 2 sur ce périmètre depuis 2024. »
   *
   * Lit `access_facts` de nature `mode` — le MODE D'ENTRÉE chez ce compte, l'un
   * des sept du tome 1 §7. Deux d'entre eux disent un référencement, et le rang
   * se DÉDUIT du mode plutôt que d'être lu dans un texte :
   * `direct_reference` = rang 1, `rang2_soustraitance` = rang 2. Un rang lu dans
   * `access_facts.detail` (champ libre) aurait été un rang deviné.
   *
   * ⚠️ Le collègue est un RÔLE, pas une personne : « passer par le canal cadre »
   * s'adresse à une fonction. Nommer quelqu'un ici aurait demandé d'inventer
   * qui, dans l'espace, tient les accords-cadres — une donnée fictive.
   *
   * ⚠️ `sinceYear` est `null` quand le fait n'a pas de date d'observation. Une
   * année inventée serait pire qu'une année absente : « depuis 2024 » est une
   * information qu'un commercial répétera au client.
   */
  private async knownReferencing(workspaceId: string, subject: MemoryObjectRef): Promise<MemoryCrossing | null> {
    const rows = await this.accounts.manager.query<{ value: string; observed_at: Date | null; created_at: Date }[]>(
      `SELECT af.value, af.observed_at, af.created_at
       FROM access_facts af
       WHERE af.workspace_id = $1
         AND af.account_id = $2
         AND af.kind = 'mode'
         AND af.value IN ('direct_reference', 'rang2_soustraitance')
       ORDER BY af.observed_at DESC NULLS LAST
       LIMIT 1`,
      [workspaceId, subject.id],
    )

    const row = rows[0]
    if (!row) return null

    const observedAt = row.observed_at ?? null
    return {
      kind: 'knownReferencing',
      circle: 'c1',
      subject,
      colleague: { kind: 'role', role: 'sales_ops' },
      action: 'useFrameworkChannel',
      observedAt: (observedAt ?? row.created_at).toISOString(),
      expiresAt: null,
      provenance: 'accessFacts',
      detail: {
        kind: 'knownReferencing',
        rank: REFERENCING_RANK_BY_MODE[row.value] ?? null,
        sinceYear: observedAt ? observedAt.getUTCFullYear() : null,
      },
    }
  }

  /* ──────────────────────────────────────────────────────────────────────────
   * OUTILS
   * ────────────────────────────────────────────────────────────────────────── */

  /**
   * La liste des comptes qui ont de la matière.
   *
   * Elle ne dérive PAS les quatre croisements sur tous les comptes de l'espace —
   * ce serait quatre requêtes par compte. Elle demande à chaque source la liste
   * des comptes qu'elle concerne, en une requête par source, puis assemble.
   */
  private async accountsWithMatter(
    workspaceId: string,
    userId: string,
    unreadable: Set<MemoryCrossingSource>,
  ): Promise<MemoryBridgeAccount[]> {
    const byAccount = new Map<string, { label: ObjectLabel; kinds: Set<MemoryCrossingKind> }>()

    const collect = async (
      kind: MemoryCrossingKind,
      source: MemoryCrossingSource,
      sql: string,
      params: unknown[],
    ): Promise<void> => {
      const rows = await this.guarded(source, unreadable, () =>
        this.accounts.manager.query<{ account_id: string; company_name: string }[]>(sql, params),
      )
      for (const row of rows ?? []) {
        const label = objectLabel('company_name', row.company_name)
        if (!label) continue
        const entry = byAccount.get(row.account_id) ?? { label, kinds: new Set<MemoryCrossingKind>() }
        entry.kinds.add(kind)
        byAccount.set(row.account_id, entry)
      }
    }

    await collect(
      'openDoor',
      'missions',
      `SELECT DISTINCT m.account_id, a.company_name
       FROM missions m
       JOIN accounts a ON a.id = m.account_id AND a.workspace_id = m.workspace_id
       JOIN mission_assignments ma ON ma.mission_id = m.id
       WHERE m.workspace_id = $1 AND m.owner_id IS NOT NULL AND m.owner_id <> $2 AND m.status <> 'terminated'`,
      [workspaceId, userId],
    )
    await collect(
      'prospectionCollision',
      'accountActivity',
      `SELECT DISTINCT ua.account_id, a.company_name
       FROM user_actions ua
       JOIN accounts a ON a.id = ua.account_id AND a.workspace_id = ua.workspace_id
       WHERE ua.workspace_id = $1
         AND ua.account_id IS NOT NULL
         AND ua.user_id <> $2
         AND ua.created_at >= now() - make_interval(days => $3::int)`,
      [workspaceId, userId, MEMORY_POLICY_DEFAULTS.ownerPriorityDays],
    )
    await collect(
      'crossStaffing',
      'projectNeeds',
      // #2558.1 — même croisement, même raison : le compte est sur le besoin.
      `SELECT DISTINCT n.account_id, a.company_name
       FROM project_needs n
       JOIN accounts a ON a.id = n.account_id AND a.workspace_id = n.workspace_id
       JOIN consultants c ON c.workspace_id = n.workspace_id
       WHERE n.workspace_id = $1
         AND n.owner_id IS NOT NULL
         AND n.owner_id <> $2
         AND ${needStillOpenSql('n.status')}
         AND c.user_id = $2
         AND c.availability IN ('immediate', 'sous_1_mois')
         AND EXISTS (
           SELECT 1
           FROM jsonb_array_elements(n.skills) AS required
           JOIN unnest(c.stack) AS owned ON lower(owned) = lower(required->>'term')
         )`,
      [workspaceId, userId],
    )
    await collect(
      'knownReferencing',
      'accessFacts',
      `SELECT DISTINCT af.account_id, a.company_name
       FROM access_facts af
       JOIN accounts a ON a.id = af.account_id AND a.workspace_id = af.workspace_id
       WHERE af.workspace_id = $1
         AND af.kind = 'mode'
         AND af.value IN ('direct_reference', 'rang2_soustraitance')`,
      [workspaceId],
    )

    return [...byAccount.entries()]
      .map(([id, entry]) => ({
        account: { kind: 'account' as const, id, label: entry.label },
        // L'ordre des natures est celui du contrat, jamais celui de découverte :
        // deux visites ne doivent pas ranger les puces différemment.
        kinds: MEMORY_CROSSING_KINDS.filter(kind => entry.kinds.has(kind)),
      }))
      .sort((left, right) => left.account.label.localeCompare(right.account.label))
  }

  /**
   * Isole une source. Un échec la NOMME au lieu de rendre « rien à signaler ».
   *
   * `error` et non `warn` : une source tombée sur cet écran doit remonter à la
   * supervision — l'utilisateur, lui, voit qu'elle est tombée.
   */
  private async guarded<T>(
    source: MemoryCrossingSource,
    unreadable: Set<MemoryCrossingSource>,
    run: () => Promise<T>,
  ): Promise<T | null> {
    try {
      return await run()
    } catch (error) {
      unreadable.add(source)
      this.logger.error(`Croisement illisible sur ${source} (${(error as Error).message})`, { error })
      return null
    }
  }

  /**
   * Le collègue à contacter — son prénom et son rôle, rien d'autre.
   *
   * Rend `null` quand l'un des deux manque : une carte qui dirait « contacter »
   * sans savoir qui n'est pas un pont. Et **aucun critère protégé** n'entre ici
   * (GA-06) — le type ne pourrait de toute façon pas en porter.
   */
  private colleague(
    userId: string,
    firstName: string | null,
    role: string | null,
  ): { kind: 'member'; userId: string; displayName: ObjectLabel; role: WorkspaceRole } | null {
    const displayName = objectLabel('first_name', firstName)
    const parsedRole = workspaceRoleSchema.safeParse(role)
    if (!displayName || !parsedRole.success) return null
    return { kind: 'member', userId, displayName, role: parsedRole.data }
  }
}

/**
 * Ce qui compte comme une mission qui COURT encore.
 *
 * Les trois premiers reprennent, mot pour mot, ce que trois requêtes du dépôt
 * écrivent déjà (`interventions.sweeper.ts`, `playbook-targets.service.ts`).
 * `renewed` s'y ajoute : une mission reconduite court, et l'oublier ferait dire
 * « la mission est terminée » d'une mission qui vient d'être prolongée.
 */
const MISSION_RUNNING_STATUSES: readonly string[] = ['active', 'onboarding', 'paused', 'renewed']

/**
 * Le rang que chaque mode d'entrée DIT. Les cinq autres modes du tome 1 §7 ne
 * disent pas de rang — ils ne sont donc pas ici, et un mode absent rend `null`
 * plutôt qu'un rang inventé.
 */
const REFERENCING_RANK_BY_MODE: Readonly<Record<string, number>> = {
  direct_reference: 1,
  rang2_soustraitance: 2,
}
