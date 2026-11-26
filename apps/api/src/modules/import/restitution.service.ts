import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import {
  RESTITUTION_HORIZON_DAYS,
  detectQuestionnaireContradictions,
  type CockpitProvenance,
  type EsnAnswers,
  type RestitutionBlock,
  type RestitutionSummary,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ImportSessionEntity } from '../../database/entities/import-session.entity'

/**
 * LES CINQ BLOCS DE LA RESTITUTION D'IMPORT — #2080.3 / .4 / .6 / .7 / .8.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN SEUL LOT, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * Les cinq blocs se rendaient déjà, tous à `null`. Chacun demandait une
 * LECTURE, et la décision du 16/09/2026 les traite ensemble : cinq
 * branchements séparés auraient produit cinq façons de dire « je ne sais pas »,
 * et c'est exactement ce que ce panneau ne doit pas faire — il existe pour
 * prouver qu'on ne repart PAS de zéro.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CHAQUE BLOC MESURE, NOMMÉMENT
 * ─────────────────────────────────────────────────────────────────────────────
 *  · **relations** — les comptes de ton portefeuille qui portent déjà une
 *    mémoire de relation (`relationship_memory.relation`). C'est ce que l'ESN
 *    SAIT de ses comptes, pas ce que le marché fait.
 *  · **échéances** — ceux dont la prochaine revue tombe dans les
 *    {@link RESTITUTION_HORIZON_DAYS} prochains jours. La source est nommée :
 *    `relationship_memory.nextReviewAt`, et rien d'autre. Agréger une seconde
 *    table « parce qu'elle aussi porte des dates » donnerait un nombre vrai
 *    pour personne.
 *  · **rendez-vous** — TON agenda, sur la même fenêtre.
 *  · **données manquantes** — le LOT qui vient d'entrer, jamais le portefeuille
 *    entier : c'est ce que le panneau restitue, et c'est ce qu'on peut corriger
 *    tout de suite.
 *  · **contradictions** — le questionnaire avec LUI-MÊME
 *    (`detectQuestionnaireContradictions`). Pas un croisement de l'import avec
 *    le questionnaire : ce moteur-là n'existe pas, et on ne l'invente pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 « NON MESURÉ » N'EST JAMAIS « 0 »
 * ─────────────────────────────────────────────────────────────────────────────
 * Chaque bloc rend `value: null` quand il n'a pas pu lire, et sa provenance dit
 * alors `sources: []`. « Aucun rendez-vous cette semaine » et « ton agenda
 * n'est pas branché » appellent deux gestes opposés — les confondre en un zéro
 * est la faute que ce dépôt refuse partout ailleurs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ D58 — UN AGENDA EST PERSONNEL
 * ─────────────────────────────────────────────────────────────────────────────
 * La lecture d'agenda se fait pour l'utilisateur CONNECTÉ et pour lui seul, en
 * lecture, bornée à la fenêtre. Aucun agrégat vers un autre membre de l'espace :
 * le compte rendu ne dit jamais « ton collègue a trois rendez-vous ».
 *
 * ⚠️ GA-07 — les deux lectures qui sortent du module (agenda, réponses du
 * questionnaire) passent par des PORTS duck-typés, comme `ImportRowWriter` juste
 * à côté : ce fichier n'importe aucun service d'un autre module, et le câblage
 * vit dans `import.module.ts`, que le cliquet n'inspecte pas.
 */

/** L'agenda, vu d'ici : une fenêtre, des évènements. Rien d'autre. */
type RestitutionAgendaPort = {
  listEvents(userId: string, request: { from: string; to: string; limit?: number }): Promise<readonly unknown[]>
}

/** Les réponses déclarées du questionnaire, en lecture. */
type RestitutionAnswersPort = {
  getAnswers(userId: string): Promise<Partial<EsnAnswers>>
}

export const RESTITUTION_AGENDA_PORT = Symbol('RESTITUTION_AGENDA_PORT')
export const RESTITUTION_ANSWERS_PORT = Symbol('RESTITUTION_ANSWERS_PORT')

const DAY_MS = 24 * 60 * 60 * 1000
/** Les identifiants d'un lot partent par paquets : un `IN (…)` de 17 000 casse. */
const ID_CHUNK = 500
/** Un compte retiré du portefeuille ne compte dans aucun des deux blocs. */
const INACTIVE_STATUSES = new Set(['deleted', 'archived'])

/** Un bloc non mesuré : `null`, et une provenance qui dit qu'on n'a rien lu. */
function unmeasured(computedAt: string, windowDays: number | null = null): RestitutionBlock {
  return {
    value: null,
    provenance: { sources: [], window_days: windowDays, population: null, computed_at: computedAt },
  }
}

function measured(
  value: number,
  provenance: Omit<CockpitProvenance, 'computed_at'>,
  computedAt: string,
): RestitutionBlock {
  return { value, provenance: { ...provenance, computed_at: computedAt } }
}

/** Une date ISO lisible, ou `null`. Une chaîne illisible n'est pas une date. */
function parseIso(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  const at = Date.parse(value)
  return Number.isNaN(at) ? null : at
}

@Injectable()
export class RestitutionService {
  private readonly logger = new Logger(RestitutionService.name)

  constructor(
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(ImportSessionEntity) private readonly sessions: Repository<ImportSessionEntity>,
    // Les deux ports sont `@Optional()` : un déploiement où l'agenda ou le
    // questionnaire n'est pas câblé rend « non mesuré », jamais un zéro.
    @Optional() @Inject(RESTITUTION_AGENDA_PORT) private readonly agenda?: RestitutionAgendaPort,
    @Optional() @Inject(RESTITUTION_ANSWERS_PORT) private readonly answers?: RestitutionAnswersPort,
  ) {}

  async summary(
    userId: string,
    workspaceId: string,
    sessionId: string | undefined,
    now: Date = new Date(),
  ): Promise<RestitutionSummary> {
    const computedAt = now.toISOString()
    const [portfolio, meetings, missingData, contradictions] = await Promise.all([
      this.portfolioBlocks(workspaceId, now, computedAt),
      this.meetingsBlock(userId, now, computedAt),
      this.missingDataBlock(workspaceId, sessionId, computedAt),
      this.contradictionsBlock(userId, computedAt),
    ])
    return { ...portfolio, meetings, missing_data: missingData, contradictions }
  }

  /**
   * Relations connues et prochaines revues — UNE lecture pour les deux blocs.
   *
   * Deux requêtes sur la même table, au même instant, pourraient rendre deux
   * populations différentes : le dénominateur affiché ne vaudrait alors pour
   * aucun des deux nombres.
   */
  private async portfolioBlocks(
    workspaceId: string,
    now: Date,
    computedAt: string,
  ): Promise<Pick<RestitutionSummary, 'relations' | 'upcoming'>> {
    try {
      const rows = await this.accounts.find({
        where: { workspace_id: workspaceId },
        select: ['id', 'status', 'relationship_memory'],
      })
      const active = rows.filter(row => !INACTIVE_STATUSES.has(row?.status ?? ''))
      const population = active.length

      const relations = active.filter(row => (row?.relationship_memory?.relation ?? '').trim() !== '').length

      const horizon = now.getTime() + RESTITUTION_HORIZON_DAYS * DAY_MS
      const upcoming = active.filter(row => {
        const at = parseIso(row?.relationship_memory?.nextReviewAt)
        return at !== null && at >= now.getTime() && at <= horizon
      }).length

      return {
        relations: measured(relations, { sources: ['bellum'], window_days: null, population }, computedAt),
        upcoming: measured(
          upcoming,
          { sources: ['bellum'], window_days: RESTITUTION_HORIZON_DAYS, population },
          computedAt,
        ),
      }
    } catch (error) {
      this.logger.warn('Restitution : lecture du portefeuille en échec — blocs non mesurés', { error })
      return { relations: unmeasured(computedAt), upcoming: unmeasured(computedAt, RESTITUTION_HORIZON_DAYS) }
    }
  }

  /**
   * Les rendez-vous de la fenêtre, dans l'agenda de la personne connectée.
   *
   * Un agenda non branché lève côté service : c'est « non mesuré », et surtout
   * pas « zéro rendez-vous ». Le produit a déjà écrit cette distinction une
   * fois (`listEventsDetailed` fait voyager les sources indisponibles avec les
   * évènements), on ne la perd pas ici.
   */
  private async meetingsBlock(userId: string, now: Date, computedAt: string): Promise<RestitutionBlock> {
    if (!this.agenda) return unmeasured(computedAt, RESTITUTION_HORIZON_DAYS)
    try {
      const events = await this.agenda.listEvents(userId, {
        from: now.toISOString(),
        to: new Date(now.getTime() + RESTITUTION_HORIZON_DAYS * DAY_MS).toISOString(),
        limit: 250,
      })
      return measured(
        events.length,
        { sources: ['calendar'], window_days: RESTITUTION_HORIZON_DAYS, population: null },
        computedAt,
      )
    } catch (error) {
      // Pas d'agenda branché, ou une source qui n'a pas répondu. Les deux se
      // disent de la même façon : on ne sait pas.
      this.logger.debug?.('Restitution : agenda illisible — bloc non mesuré', { error })
      return unmeasured(computedAt, RESTITUTION_HORIZON_DAYS)
    }
  }

  /**
   * #2080.7 — une donnée manquante se NOMME, elle ne vaut pas 0.
   *
   * Le compte porte sur le LOT qui vient d'entrer, pas sur le portefeuille : les
   * deux nombres sont vrais et ne disent pas la même chose, et seul le premier
   * désigne quelque chose que l'utilisateur peut corriger dans la minute. Sans
   * session, il n'y a pas de lot — donc rien de mesuré, et surtout pas zéro.
   *
   * Ce qui manque est nommé par objet : un compte sans SIREN NI site web ne se
   * recoupe à aucun registre ; une personne sans e-mail NI téléphone ne se
   * joint pas. Un seul des deux suffit — exiger les deux compterait comme
   * « incomplet » un compte parfaitement utilisable.
   */
  private async missingDataBlock(
    workspaceId: string,
    sessionId: string | undefined,
    computedAt: string,
  ): Promise<RestitutionBlock> {
    if (!sessionId) return unmeasured(computedAt)
    try {
      const session = await this.sessions.findOne({ where: { id: sessionId, workspace_id: workspaceId } })
      const ids = (session?.snapshot ?? []).map(row => row?.id).filter((id): id is string => typeof id === 'string')
      if (!session || ids.length === 0) return unmeasured(computedAt)

      if (session.object_type === 'account') {
        const rows = await this.byChunks(ids, chunk =>
          this.accounts.find({
            where: { id: In(chunk), workspace_id: workspaceId },
            select: ['id', 'siren', 'website'],
          }),
        )
        const missing = rows.filter(row => !(row?.siren ?? '').trim() && !(row?.website ?? '').trim()).length
        return measured(missing, { sources: ['bellum'], window_days: null, population: rows.length }, computedAt)
      }

      if (session.object_type === 'contact') {
        const rows = await this.byChunks(ids, chunk =>
          this.contacts.find({ where: { id: In(chunk), workspace_id: workspaceId }, select: ['id', 'email', 'phone'] }),
        )
        const missing = rows.filter(row => !(row?.email ?? '').trim() && !(row?.phone ?? '').trim()).length
        return measured(missing, { sources: ['bellum'], window_days: null, population: rows.length }, computedAt)
      }

      // Un autre objet importable existe (`project`) et n'a pas de champ dont
      // l'absence empêche de travailler. Inventer un critère pour remplir le
      // bloc serait pire que de dire qu'on n'a pas mesuré.
      return unmeasured(computedAt)
    } catch (error) {
      this.logger.warn('Restitution : lecture du lot importé en échec — bloc non mesuré', { error })
      return unmeasured(computedAt)
    }
  }

  /** #2080.8 — le questionnaire avec LUI-MÊME, par le moteur qui existe déjà. */
  private async contradictionsBlock(userId: string, computedAt: string): Promise<RestitutionBlock> {
    if (!this.answers) return unmeasured(computedAt)
    try {
      const answers = await this.answers.getAnswers(userId)
      return measured(
        detectQuestionnaireContradictions(answers ?? {}).length,
        { sources: ['bellum'], window_days: null, population: null },
        computedAt,
      )
    } catch (error) {
      this.logger.warn('Restitution : réponses du questionnaire illisibles — bloc non mesuré', { error })
      return unmeasured(computedAt)
    }
  }

  private async byChunks<T>(ids: readonly string[], read: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
    const out: T[] = []
    for (let index = 0; index < ids.length; index += ID_CHUNK) {
      out.push(...(await read(ids.slice(index, index + ID_CHUNK))))
    }
    return out
  }
}
