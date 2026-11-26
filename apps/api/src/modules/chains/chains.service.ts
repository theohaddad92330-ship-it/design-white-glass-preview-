import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  chainFlowSteps,
  chainManualSteps,
  type Chain,
  // Le type du blocage vit dans le CONTRAT : « Aujourd'hui », Laura et cet
  // écran le lisent tous les trois, et une seconde définition ici divergerait
  // au premier champ ajouté.
  type ChainBlocker,
  type ChainKey,
  type ChainUndeterminedReason,
} from '@bellum/contracts'
import { ChainManualMarkEntity } from '../../database/entities/chain-manual-mark.entity'
import { CHAIN_CATALOG } from './chain-catalog'
import { CHAIN_PROJECTORS, findProjector, type ChainProjection } from './chain-projectors'

/**
 * LES PARCOURS, DÉRIVÉS DES OBJETS MÉTIER (#1503).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE SERVICE N'ÉCRIT PLUS
 * ─────────────────────────────────────────────────────────────────────────
 * `start`, `advance`, `abandon` ont disparu, et c'est le but du chantier : tant
 * qu'une position s'écrivait à la main, le produit portait deux vérités sur le
 * même dossier. Il n'y a plus rien à avancer — la position se CALCULE à chaque
 * lecture depuis le besoin, le compte, le projet ou la mission.
 *
 * La seule écriture qui reste est la checklist des gestes hors outil : badge
 * d'accès, VPN, contrat signé, soutenance. Aucune table ne les porte et il n'en
 * existera pas (décision D48) — une case cochée n'entre donc en concurrence avec
 * aucun état, et c'est ce qui la distingue d'une position écrite à la main.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE LE TABLEAU MESURE
 * ─────────────────────────────────────────────────────────────────────────
 * La durée est celle de l'OBJET (`moved_at`), plus celle d'une ligne de
 * parcours : « ce besoin n'a pas bougé depuis 9 jours » est vrai et vérifiable,
 * « l'étape dure 9 jours » ne l'était pas. L'écran nomme ce qui est mesuré.
 *
 * ⚠️ « Bloqué » et « décision attendue » restent le MÊME état, et pour la même
 * raison qu'avant : un dossier n'est arrêté que devant une porte sans réponse.
 * `stalled` mesure autre chose — l'immobilité, porte ou pas.
 */

/**
 * À partir de quand un dossier « n'avance plus » (#1504).
 *
 * Sept jours : une semaine ouvrée complète. Un dossier qui traverse une revue
 * hebdomadaire sans bouger a échappé au rythme de travail de l'équipe. Plus
 * court, tout clignote le mercredi ; plus long, on apprend le blocage trop tard.
 */
const STALLED_AFTER_DAYS = 7

/** Combien de blocages « Aujourd'hui » montre au maximum (#1506). */
const BLOCKER_LIMIT = 5

/**
 * LE CLOISONNEMENT DE PORTEFEUILLE (décision D5, `portfolioScopeFor` de
 * `@bellum/contracts`), appliqué à `blockers()` (LOT 15, arbitrage A).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────
 * L'outil de Laura dit au modèle « où est-ce que MES dossiers bloquent » —
 * mais `blockers()` n'a jamais pris d'identifiant utilisateur et agrège tout
 * l'espace. Sur un espace en visibilité `open` (le défaut assumé du produit,
 * voir `portfolio-visibility.ts`), c'est le comportement voulu : « Aujourd'hui »
 * et Laura montrent le portefeuille de l'équipe. Mais un espace qui a
 * explicitement CLOISONNÉ son portefeuille (`portfolio_visibility = restricted`)
 * voyait Laura ignorer ce réglage et rendre quand même les dossiers des
 * collègues, présentés comme « les tiens ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI SE COMPTE COMME « POSSÉDÉ », ET CE QUI NE SE COMPTE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Chaque type de sujet a son propre porteur : `accounts.assigned_to`,
 * `project_needs.owner_id`, `opportunities.owner_id`, `missions.owner_id` —
 * les mêmes colonnes que `portfolioScopeFor` fait respecter ailleurs
 * (`accounts.controller.ts`, `finance-scope.ts`). Le CONSULTANT n'y figure
 * pas : c'est une ressource PARTAGÉE de l'ESN, pas un dossier attribué à un
 * commercial — aucune colonne ne dit « à qui » il appartient, et lui appliquer
 * quand même le cloisonnement inventerait un porteur qui n'existe pas.
 *
 * ⚠️ Cette question — « à qui appartient ce SUJET » — est distincte de celle
 * que chaque projecteur répond déjà — « quel FAIT porte sa position ». Les
 * mêler ferait porter au SQL figé d'un projecteur (`chain-projectors.ts`,
 * un seul paramètre : l'espace) une deuxième responsabilité qu'il ne
 * documente pas.
 */
const OWNER_SUBJECT_SQL: Partial<Record<Chain['subjectType'], string>> = {
  account: `SELECT id::text AS id FROM accounts
             WHERE workspace_id = $1 AND (assigned_to = $2 OR ($3 AND assigned_to IS NULL))`,
  need: `SELECT id::text AS id FROM project_needs
          WHERE workspace_id = $1 AND (owner_id = $2 OR ($3 AND owner_id IS NULL))`,
  project: `SELECT id::text AS id FROM opportunities
             WHERE workspace_id = $1 AND (owner_id = $2 OR ($3 AND owner_id IS NULL))`,
  mission: `SELECT id::text AS id FROM missions
             WHERE workspace_id = $1 AND (owner_id = $2 OR ($3 AND owner_id IS NULL))`,
}

/** Le même périmètre que rend `portfolioScopeFor` : `null` = tout l'espace. */
type OwnerScope = { ownerId: string; includeUnassigned: boolean } | null

type ChainLanePosition = {
  position: number
  count: number
  /**
   * Depuis combien de jours, en MÉDIANE, les dossiers de cette étape n'ont pas
   * bougé. `null` quand personne n'y est : « zéro jour d'attente » et « aucun
   * dossier ici » sont deux faits différents, et l'un des deux serait faux.
   */
  medianDaysAtPosition: number | null
  /** Combien y attendent une décision humaine. */
  awaiting: number
}

type ChainLane = {
  chain: Chain
  positions: ChainLanePosition[]
  gates: { afterPosition: number; waiting: number }[]
  total: number
  awaitingDecision: number
  stalled: number
  /** Les dossiers que le moteur ne sait PAS placer, par raison. Jamais masqués. */
  undetermined: { reason: ChainUndeterminedReason; count: number }[]
}

const DAY_MS = 86_400_000

const daysSince = (movedAt: string | null, now: number): number | null => {
  if (movedAt === null) return null
  const moved = new Date(movedAt).getTime()
  if (Number.isNaN(moved)) return null
  return Math.max(0, Math.round(((now - moved) / DAY_MS) * 10) / 10)
}

/** La médiane, pas la moyenne : un dossier oublié depuis huit mois déplacerait
 *  une moyenne au point de la rendre illisible pour les neuf autres. */
const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  const value = sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
  return Math.round(value * 10) / 10
}

@Injectable()
export class ChainsService {
  constructor(
    @InjectRepository(ChainManualMarkEntity)
    private readonly marks: Repository<ChainManualMarkEntity>,
  ) {}

  /** Le catalogue, tel quel. Il vit dans le code (décision D42). */
  catalog(): readonly Chain[] {
    return CHAIN_CATALOG
  }

  /**
   * Les dossiers d'UNE chaîne, dérivés de leurs objets.
   *
   * ⚠️ Une seule requête par chaîne, et elle ne prend qu'un paramètre :
   * l'espace. Le SQL est FIGÉ dans le projecteur — plus rien n'y est interpolé,
   * même pas un nom de table, ce que l'ancienne liste de sujets faisait encore.
   */
  private async projectionsOf(workspaceId: string, chainKey: ChainKey): Promise<ChainProjection[]> {
    const projector = findProjector(chainKey)
    if (!projector) return []
    const rows = await this.marks.manager.query<Record<string, unknown>[]>(projector.sql, [workspaceId])
    return projector.project(rows)
  }

  /**
   * Les identifiants de sujets que CET utilisateur porte, pour un type de
   * sujet — ou `null` quand ce type n'a pas de porteur (le consultant).
   *
   * Une requête à part, jamais une clause ajoutée au SQL du projecteur : ce
   * dernier reste figé à un seul paramètre (l'espace), et cette question —
   * « à qui » — n'est posée que quand un `scope` est effectivement demandé.
   */
  private async ownedSubjectIds(
    workspaceId: string,
    subjectType: Chain['subjectType'],
    scope: { ownerId: string; includeUnassigned: boolean },
  ): Promise<Set<string> | null> {
    const sql = OWNER_SUBJECT_SQL[subjectType]
    if (!sql) return null
    const rows = await this.marks.manager.query<{ id: string }[]>(sql, [
      workspaceId,
      scope.ownerId,
      scope.includeUnassigned,
    ])
    return new Set(rows.map(row => row.id))
  }

  /** LA VUE MANAGER (#1504), calculée et non plus stockée. */
  async board(workspaceId: string): Promise<ChainLane[]> {
    const now = Date.now()
    const lanes: ChainLane[] = []

    for (const projector of CHAIN_PROJECTORS) {
      const chain = CHAIN_CATALOG.find(entry => entry.key === projector.chainKey)
      if (!chain) continue
      const projections = await this.projectionsOf(workspaceId, projector.chainKey)
      lanes.push(this.laneOf(chain, projections, now))
    }
    return lanes
  }

  /** PURE une fois les lignes lues — c'est ce qui la rend testable sans base. */
  private laneOf(chain: Chain, projections: readonly ChainProjection[], now: number): ChainLane {
    const flow = chainFlowSteps(chain)
    const placed = projections.filter(entry => entry.derivation.kind === 'at')

    const positions = flow.map(step => {
      const own = placed.filter(entry => entry.derivation.kind === 'at' && entry.derivation.position === step.position)
      const ages = own.map(entry => daysSince(entry.movedAt, now)).filter((value): value is number => value !== null)
      return {
        position: step.position,
        count: own.length,
        medianDaysAtPosition: median(ages),
        awaiting: own.filter(entry => entry.derivation.kind === 'at' && entry.derivation.blockedGate !== null).length,
      }
    })

    const gates = chain.gates.map(gate => ({
      afterPosition: gate.afterPosition,
      waiting: placed.filter(entry => entry.derivation.kind === 'at' && entry.derivation.blockedGate === gate.gate)
        .length,
    }))

    // Les raisons se comptent, elles ne se résument pas à un total : « je n'ai
    // rien lu » et « j'ai lu un état que je ne sais pas placer » ne se réparent
    // pas pareil.
    const undeterminedBy = new Map<ChainUndeterminedReason, number>()
    for (const entry of projections) {
      if (entry.derivation.kind !== 'undetermined') continue
      undeterminedBy.set(entry.derivation.reason, (undeterminedBy.get(entry.derivation.reason) ?? 0) + 1)
    }

    return {
      chain,
      positions,
      gates,
      total: placed.length,
      awaitingDecision: placed.filter(entry => entry.derivation.kind === 'at' && entry.derivation.blockedGate !== null)
        .length,
      stalled: placed.filter(entry => (daysSince(entry.movedAt, now) ?? 0) > STALLED_AFTER_DAYS).length,
      undetermined: [...undeterminedBy.entries()].map(([reason, count]) => ({ reason, count })),
    }
  }

  /** Les dossiers arrêtés à une position — le clic du §6.3. */
  async atPosition(
    workspaceId: string,
    chainKey: ChainKey,
    position: number,
  ): Promise<(ChainProjection & { days: number | null })[]> {
    const now = Date.now()
    const projections = await this.projectionsOf(workspaceId, chainKey)
    return projections
      .filter(entry => entry.derivation.kind === 'at' && entry.derivation.position === position)
      .map(entry => ({ ...entry, days: daysSince(entry.movedAt, now) }))
      .sort((left, right) => (right.days ?? 0) - (left.days ?? 0))
  }

  /** Les dossiers que le moteur ne sait pas placer — l'écran les NOMME (#1507 §6). */
  async undetermined(workspaceId: string, chainKey: ChainKey): Promise<(ChainProjection & { days: number | null })[]> {
    const now = Date.now()
    const projections = await this.projectionsOf(workspaceId, chainKey)
    return projections
      .filter(entry => entry.derivation.kind === 'undetermined')
      .map(entry => ({ ...entry, days: daysSince(entry.movedAt, now) }))
  }

  /**
   * LE PARCOURS D'UN DOSSIER, là où l'utilisateur travaille (#1505).
   *
   * Une fiche Besoin, Projet ou Mission n'a pas à envoyer quelqu'un sur
   * `/actions/chaines` pour savoir où en est ce qu'il a sous les yeux. C'est une
   * LECTURE dérivée, jamais une seconde barre de statut modifiable — la fiche ne
   * peut rien y écrire, et il n'existe aucune route pour le faire.
   */
  async forSubject(
    workspaceId: string,
    subjectType: Chain['subjectType'],
    subjectId: string,
  ): Promise<
    {
      chain: Chain
      projection: ChainProjection
      days: number | null
      manual: { position: number; markedAt: string | null }[]
    }[]
  > {
    const now = Date.now()
    const found: {
      chain: Chain
      projection: ChainProjection
      days: number | null
      manual: { position: number; markedAt: string | null }[]
    }[] = []

    for (const chain of CHAIN_CATALOG) {
      if (chain.subjectType !== subjectType) continue
      const projections = await this.projectionsOf(workspaceId, chain.key)
      const projection = projections.find(entry => entry.subjectId === subjectId)
      if (!projection) continue
      found.push({
        chain,
        projection,
        days: daysSince(projection.movedAt, now),
        manual: await this.manualMarks(workspaceId, chain.key, subjectId),
      })
    }
    return found
  }

  /**
   * LES BLOCAGES, pour « Aujourd'hui » et pour Laura (#1506).
   *
   * Regroupés par (parcours, étape) : « 3 dossiers attendent un retour client
   * depuis plus de 7 jours » est actionnable, trois lignes séparées ne le sont
   * pas. Un dossier compte comme bloqué s'il attend une DÉCISION, ou s'il n'a
   * pas bougé depuis plus d'une semaine — les deux sont vérifiables sur l'objet.
   *
   * ⚠️ Rien n'est envoyé, rien n'est créé : cette lecture PROPOSE au commercial
   * d'ouvrir le bon dossier. « Ne jamais envoyer une action automatiquement
   * parce qu'une étape est bloquée » est le §6 de #1507.
   *
   * `scope` (LOT 15, arbitrage A) : `null` (le défaut) rend tout l'espace,
   * inchangé. Un scope non nul ne garde que ce que `scope.ownerId` porte —
   * plus ce que personne ne porte si `includeUnassigned` — sur les types de
   * sujet qui ont un porteur (voir `OWNER_SUBJECT_SQL`).
   */
  async blockers(workspaceId: string, limit = BLOCKER_LIMIT, scope: OwnerScope = null): Promise<ChainBlocker[]> {
    const now = Date.now()
    const grouped = new Map<string, ChainBlocker>()
    // Un Set par TYPE de sujet, calculé au plus une fois par appel — plusieurs
    // chaînes partagent le même type (trois chaînes sont sur `account`).
    const ownedCache = new Map<Chain['subjectType'], Set<string> | null>()

    for (const chain of CHAIN_CATALOG) {
      const flow = chainFlowSteps(chain)
      const projections = await this.projectionsOf(workspaceId, chain.key)
      let owned: Set<string> | null = null
      if (scope) {
        if (!ownedCache.has(chain.subjectType)) {
          ownedCache.set(chain.subjectType, await this.ownedSubjectIds(workspaceId, chain.subjectType, scope))
        }
        owned = ownedCache.get(chain.subjectType) ?? null
      }
      for (const entry of projections) {
        if (entry.derivation.kind !== 'at') continue
        // `owned === null` veut dire soit « aucun scope demandé », soit « ce
        // type de sujet n'a pas de porteur » (le consultant) — les deux ne
        // filtrent rien. Un Set VIDE, lui, exclut tout : c'est le cas normal
        // d'un commercial à qui rien n'est attribué sur ce type de sujet.
        if (owned && !owned.has(entry.subjectId)) continue
        // La position est extraite AVANT toute autre lecture : TypeScript ne
        // garde pas la réduction d'une union à travers plusieurs accès à la
        // même propriété quand une fonction s'intercale.
        const position = entry.derivation.position
        const days = daysSince(entry.movedAt, now)
        const gate = entry.derivation.blockedGate
        const stuck = gate !== null || (days !== null && days > STALLED_AFTER_DAYS)
        if (!stuck) continue

        const key = `${chain.key}:${position}:${gate ?? ''}`
        const existing = grouped.get(key)
        if (existing) {
          existing.count += 1
          existing.oldestDays = Math.max(existing.oldestDays, days ?? 0)
          if (existing.sample.length < 3) {
            existing.sample.push({ subjectId: entry.subjectId, label: entry.label, days: days ?? 0 })
          }
          continue
        }
        grouped.set(key, {
          chainKey: chain.key,
          subjectType: chain.subjectType,
          position,
          // Les libellés viennent du catalogue, dans les deux langues : le
          // lecteur n'a rien à re-résoudre, et le moteur ne parle toujours
          // aucune langue à lui seul.
          chainLabel: chain.label,
          stepLabel: flow.find(step => step.position === position)?.label ?? chain.label,
          gate,
          count: 1,
          oldestDays: days ?? 0,
          sample: [{ subjectId: entry.subjectId, label: entry.label, days: days ?? 0 }],
        })
      }
    }

    return [...grouped.values()]
      .sort((left, right) => right.count - left.count || right.oldestDays - left.oldestDays)
      .slice(0, limit)
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * LA CHECKLIST DES GESTES HORS OUTIL
   * ───────────────────────────────────────────────────────────────────────── */

  /** Ce qui est coché sur ce dossier. */
  async manualMarks(
    workspaceId: string,
    chainKey: ChainKey,
    subjectId: string,
  ): Promise<{ position: number; markedAt: string | null }[]> {
    const rows = await this.marks.find({
      where: { workspace_id: workspaceId, chain_key: chainKey, subject_id: subjectId },
      order: { position: 'ASC' },
    })
    return rows.map(row => ({ position: row.position, markedAt: row.marked_at?.toISOString() ?? null }))
  }

  /**
   * Coche ou décoche un geste hors outil.
   *
   * ⚠️ Seule une étape RÉELLEMENT hors outil s'accepte. Cocher une étape du flux
   * dérivé recréerait exactement ce que ce chantier supprime : une position
   * écrite à la main à côté de celle que les objets disent. La porte est ici,
   * pas dans l'écran — un écran ne garde rien.
   */
  async toggleManualMark(
    workspaceId: string,
    userId: string,
    chainKey: ChainKey,
    subjectId: string,
    position: number,
    marked: boolean,
  ): Promise<{ position: number; marked: boolean }> {
    const chain = CHAIN_CATALOG.find(entry => entry.key === chainKey)
    const allowed = chain ? chainManualSteps(chain).some(step => step.position === position) : false
    if (!allowed) {
      throw new Error(`La position ${position} de ${chainKey} n’est pas un geste hors outil.`)
    }

    if (!marked) {
      await this.marks.delete({ workspace_id: workspaceId, chain_key: chainKey, subject_id: subjectId, position })
      return { position, marked: false }
    }

    await this.marks.manager.query(
      `INSERT INTO chain_manual_marks (workspace_id, chain_key, subject_id, position, marked_by)
            VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (workspace_id, chain_key, subject_id, position) DO NOTHING`,
      [workspaceId, chainKey, subjectId, position, userId],
    )
    return { position, marked: true }
  }
}
