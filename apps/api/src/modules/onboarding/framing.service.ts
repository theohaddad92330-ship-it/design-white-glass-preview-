import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { FramingDecision, FramingOrientationId, FramingStateResponse } from '@bellum/contracts'
import { Repository } from 'typeorm'
import { FramingDecisionEntity } from '../../database/entities/framing-decision.entity'
import { UserOnboardingStateEntity } from '../../database/entities/user-onboarding-state.entity'

/**
 * Théo O onboarding-relecture.N1/N2 — ce que la personne a DÉCIDÉ de son cadrage.
 *
 * - une décision par orientation (retenir · plus tard · ne pas retenir) ;
 * - la validation explicite, horodatée, avec l'empreinte des réponses relues.
 *
 * ⚠️ Valider n'autorise RIEN : ni accès à de nouvelles données, ni dépense, ni
 * envoi. Cette classe n'appelle aucun service qui fasse l'un des trois — elle
 * n'écrit que ces deux faits, et l'écran le dit en toutes lettres.
 */
@Injectable()
export class FramingService {
  constructor(
    @InjectRepository(FramingDecisionEntity)
    private readonly decisions: Repository<FramingDecisionEntity>,
    @InjectRepository(UserOnboardingStateEntity)
    private readonly states: Repository<UserOnboardingStateEntity>,
  ) {}

  async getState(userId: string): Promise<FramingStateResponse> {
    const [rows, state] = await Promise.all([
      this.decisions.find({ where: { user_id: userId } }),
      this.states.findOne({ where: { user_id: userId } }),
    ])
    const decisions: FramingStateResponse['decisions'] = {}
    for (const row of rows) decisions[row.strategy_key] = row.decision
    return {
      decisions,
      validated_at: state?.framing_validated_at?.toISOString() ?? null,
      validated_digest: state?.framing_validated_digest ?? null,
    }
  }

  async saveDecision(
    userId: string,
    orientation: FramingOrientationId,
    decision: FramingDecision,
  ): Promise<FramingStateResponse> {
    const existing = await this.decisions.findOne({ where: { user_id: userId, strategy_key: orientation } })
    const row = existing ?? this.decisions.create({ user_id: userId, strategy_key: orientation })
    row.decision = decision
    row.decided_at = new Date()
    await this.decisions.save(row)
    return this.getState(userId)
  }

  async validate(userId: string, digest: string): Promise<FramingStateResponse> {
    const state = await this.states.findOne({ where: { user_id: userId } })
    if (!state)
      throw new NotFoundException('Le questionnaire n’est pas démarré : il n’y a pas encore de cadrage à valider.')
    state.framing_validated_at = new Date()
    state.framing_validated_digest = digest
    await this.states.save(state)
    return this.getState(userId)
  }
}
