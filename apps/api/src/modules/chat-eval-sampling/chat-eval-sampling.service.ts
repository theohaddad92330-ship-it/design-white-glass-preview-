import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ChatEvalSampleEntity } from '../../database/entities/chat-eval-sample.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { anonymizeForEvalSample } from './chat-eval-anonymizer'

/**
 * #2899 / #2443.10 / #2278.9 — L'ÉCHANTILLONNAGE OPT-IN PAR ESPACE.
 *
 * Lire le réglage, le poser (l'autorisation vit au contrôleur), et verser un
 * tour de Laura ANONYMISÉ quand — et seulement quand — l'espace a coché. Décocher PURGE les
 * échantillons déjà versés : revenir sur son accord efface ce qu'il avait permis.
 *
 * `recordUserTurn` ne lève JAMAIS : l'échantillonnage ne doit pas pouvoir faire échouer un
 * message. Il ne lit AUCUN corps de message d'un espace qui n'a pas coché (la lecture du
 * réglage précède tout), et rien n'est échantillonné en salle de démonstration.
 */
@Injectable()
export class ChatEvalSamplingService {
  private readonly logger = new Logger(ChatEvalSamplingService.name)

  constructor(
    @InjectRepository(WorkspaceEntity) private readonly workspaces: Repository<WorkspaceEntity>,
    @InjectRepository(ChatEvalSampleEntity) private readonly samples: Repository<ChatEvalSampleEntity>,
  ) {}

  /**
   * Pose le réglage de l'espace. L'AUTORISATION (rôle, démo) est celle du contrôleur (GA-07 :
   * geste d'utilisateur). #4173 — horodate `chat_eval_sampling_chosen_at` à CHAQUE appel, dans
   * un sens ou dans l'autre : c'est ce qui protège ce choix d'un futur bascule de défaut
   * (une correction humaine gagne toujours, quelle que soit sa date).
   */
  async set(workspaceId: string, enabled: boolean): Promise<void> {
    await this.workspaces.update(
      { id: workspaceId },
      { chat_eval_sampling_enabled: enabled, chat_eval_sampling_chosen_at: new Date() },
    )
    // #2899 — décocher efface ce qui avait été versé.
    if (!enabled) await this.samples.delete({ workspace_id: workspaceId })
  }

  /** Faux sur une ligne introuvable ou une lecture ratée : le côté prudent est « ne rien verser ». */
  async isEnabled(workspaceId: string): Promise<boolean> {
    try {
      const row = await this.workspaces.findOne({ where: { id: workspaceId } })
      return row?.chat_eval_sampling_enabled === true
    } catch (error) {
      this.logger.warn('chat eval sampling flag unreadable', { error })
      return false
    }
  }

  /** Verse UN tour de l'utilisateur, anonymisé. Rend `true` si une ligne a été écrite. */
  async recordUserTurn(workspaceId: string, text: string, opts: { allowMessageBody?: boolean } = {}): Promise<boolean> {
    try {
      if (!(await this.isEnabled(workspaceId))) return false
      // #2958.98 — `allowMessageBody` n'est posé que par l'appelant qui a vérifié
      // `evalMayReadMessageBody` (utilisateur nommé, hors démo).
      const anonymized = anonymizeForEvalSample(text, opts)
      if (anonymized === null) return false
      await this.samples.insert({ workspace_id: workspaceId, anonymized_text: anonymized })
      return true
    } catch (error) {
      this.logger.warn('chat eval sample not recorded', { error })
      return false
    }
  }

  /**
   * #2899 / #2443.10 — LE LECTEUR des échantillons : le corpus « erreurs production anonymisées »
   * du chat (`chat_corpus_sources.py`) les REJOUE. Le texte et la date seulement — ni l'espace,
   * ni l'identifiant, ni une personne ne sortent (GA-43 : base commune, utilisateur anonymisé).
   * Une lecture en panne rend `[]`, jamais une erreur qui ferait tomber le rapport d'éval.
   */
  async listForReplay(limit?: number): Promise<ReplaySample[]> {
    const take = clampReplayLimit(limit)
    try {
      const rows = await this.samples.find({ order: { sampled_at: 'DESC' }, take })
      return rows.map(row => ({ text: row.anonymized_text, sampledAt: row.sampled_at.toISOString() }))
    } catch (error) {
      this.logger.warn('chat eval samples unreadable', { error })
      return []
    }
  }
}

export interface ReplaySample {
  text: string
  sampledAt: string
}

const DEFAULT_REPLAY_LIMIT = 100
const MAX_REPLAY_LIMIT = 500

function clampReplayLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_REPLAY_LIMIT
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_REPLAY_LIMIT)
}
