import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { LessThan, Repository } from 'typeorm'
import { CreditReservationEntity } from '../../database/entities/credit-reservation.entity'
import { RESERVATION_TTL_MS } from '../credits/credit-reservation.rules'

/**
 * Réserver un crédit avant de le dépenser (addendum final p24).
 *
 * Jusqu'ici deux comportements coexistaient, mauvais l'un comme l'autre :
 *
 *  - débiter d'abord puis rembourser sur échec — le solde ment pendant l'appel,
 *    et le remboursement peut échouer à son tour (on a alors facturé du vide) ;
 *  - débiter à la fin — le run découvre à l'arrivée que le solde est vide, après
 *    avoir déjà écrit dans le CRM et envoyé un email.
 *
 * La réservation supprime les deux : le solde ANNONCÉ tient compte de ce qui est
 * en vol. C'est ce qui permet à un run de vingt contacts de dire honnêtement,
 * avant de partir, qu'il n'ira pas au bout.
 *
 * Le débit RÉEL reste chez `CreditsService` — cette classe ne touche pas le
 * ledger. Elle tient le registre de ce qui est promis, et c'est l'appelant qui,
 * au moment du succès, consomme pour de bon.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OÙ SE LIT CE REGISTRE — et pourquoi `pending()` n'est plus ici
 * ─────────────────────────────────────────────────────────────────────────────
 * Une méthode `pending(workspaceId)` a vécu ici pendant des semaines SANS AUCUN
 * APPELANT, à côté d'un index Postgres (`credit_reservations_live_idx`) créé
 * pour une requête que personne ne lançait. Elle n'a pas été rebranchée telle
 * quelle : elle était dans le mauvais module.
 *
 * « Ce qui est en vol » ne sert qu'à une chose — le RETRANCHER du solde. Or le
 * solde appartient à la facturation, qui seule connaît le pool. La lecture vit
 * donc dans `CreditsService.getCredits`, et la DÉRIVATION (qu'est-ce qu'une
 * réservation vivante, combien elle pèse) vit une seule fois, dans le contrat
 * partagé {@link ../credits/credit-reservation.rules}, que les deux côtés
 * appliquent. Ce module garde ce qu'il est seul à pouvoir faire : ÉCRIRE.
 */

@Injectable()
export class CreditReservationService {
  private readonly logger = new Logger(CreditReservationService.name)

  constructor(
    @InjectRepository(CreditReservationEntity)
    private readonly reservations: Repository<CreditReservationEntity>,
  ) {}

  /**
   * Réserve `amount` crédits pour `reference`.
   *
   * Idempotent par référence : rappeler la méthode pour un run déjà réservé rend
   * la réservation existante plutôt que d'en empiler une seconde. Sans cela, un
   * retry de la file gèlerait deux fois le même coût.
   *
   * ⚠️ Le `findOne` ne SUFFIT PAS, et c'est le cœur du sujet : deux appels
   * simultanés lisent tous les deux une table vide avant que l'un n'écrive. La
   * promesse d'idempotence est donc tenue par la BASE — l'index unique partiel
   * `credit_reservations_live_reference_idx` (une seule ligne `reserved` par
   * référence). Ici on rattrape la violation et on rend la ligne du gagnant :
   * une course n'est pas une erreur, c'est le cas normal d'un double clic.
   */
  async reserve(input: {
    workspaceId: string
    userId: string
    kind: 'analysis' | 'enrichment'
    amount: number
    reference: string
  }): Promise<CreditReservationEntity> {
    const existing = await this.findLive(input.workspaceId, input.reference)
    if (existing) return existing

    try {
      return await this.reservations.save(
        this.reservations.create({
          workspace_id: input.workspaceId,
          user_id: input.userId,
          kind: input.kind,
          amount: input.amount,
          state: 'reserved',
          reference: input.reference,
          expires_at: new Date(Date.now() + RESERVATION_TTL_MS),
          settled_at: null,
        }),
      )
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      // L'autre appel a gagné la course : sa ligne est la bonne. La relire est la
      // seule réponse juste — inventer un objet ferait croire à une seconde
      // réservation, et propager l'erreur ferait échouer un run parfaitement sain.
      const winner = await this.findLive(input.workspaceId, input.reference)
      if (winner) return winner
      // La ligne a disparu entre la violation et la relecture (soldée dans
      // l'intervalle). Rien à rattraper : on laisse remonter plutôt que de
      // rendre une réservation qui n'existe pas.
      throw error
    }
  }

  /**
   * Solde la réservation : `consumed` quand la dépense a bien eu lieu,
   * `released` quand l'action n'est finalement pas partie.
   *
   * Solder une réservation déjà soldée est un no-op silencieux — c'est le cas
   * normal d'un retry, pas une anomalie à signaler. La condition `state:
   * 'reserved'` est ce qui le garantit : un second solde ne matche plus rien.
   *
   * R4 (revue de sécurité, 13/09/2026) — scopé à l'ESPACE. L'index unique est
   * `(workspace_id, reference)` : deux espaces peuvent tenir une réservation
   * vivante sous la même référence, et un solde par la seule référence les
   * soldait toutes les deux.
   */
  async settle(workspaceId: string, reference: string, outcome: 'consumed' | 'released'): Promise<void> {
    await this.reservations.update(
      { workspace_id: workspaceId, reference, state: 'reserved' },
      { state: outcome, settled_at: new Date() },
    )
  }

  /**
   * Libère les réservations périmées d'un espace.
   *
   * Appelé au fil de l'eau plutôt que par un cron : le balayage est trivial, et
   * le faire au moment où l'espace REPART pour un run garantit que la table ne
   * traîne pas les fantômes du run précédent. Un cron toutes les heures les
   * laisserait cinquante-neuf minutes de plus.
   *
   * ⚠️ Ce balayage est de l'HYGIÈNE, pas une condition de justesse : le solde
   * annoncé exclut déjà les réservations périmées par leur date
   * (`liveReservedTotal`). Un balayage qui n'a pas tourné ne gèle donc aucun
   * crédit — il laisse seulement des lignes `reserved` mortes dans l'index.
   */
  async sweepExpired(workspaceId: string): Promise<number> {
    const result = await this.reservations.update(
      { workspace_id: workspaceId, state: 'reserved', expires_at: LessThan(new Date()) },
      { state: 'expired', settled_at: new Date() },
    )
    const swept = result.affected ?? 0
    if (swept > 0) {
      this.logger.warn('Réservations de crédits périmées libérées', {
        tags: { 'action_os.swept': String(swept) },
      })
    }
    return swept
  }

  /** La réservation encore `reserved` de cette référence, s'il y en a une. */
  private async findLive(workspaceId: string, reference: string): Promise<CreditReservationEntity | null> {
    return this.reservations.findOne({
      where: { workspace_id: workspaceId, reference, state: 'reserved' },
    })
  }
}

/** `23505` = violation d'unicité côté Postgres. Le code voyage sur l'erreur du
 *  driver ; TypeORM l'expose tel quel sur `QueryFailedError`. */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const code = (error as { code?: unknown; driverError?: { code?: unknown } }).code
  const driverCode = (error as { driverError?: { code?: unknown } }).driverError?.code
  return code === '23505' || driverCode === '23505'
}
