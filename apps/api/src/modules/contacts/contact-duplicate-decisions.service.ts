import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ContactDuplicateDecisionEntity } from '../../database/entities/contact-duplicate-decision.entity'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'

export type DuplicateDecision = 'same' | 'not_same'
type PairLike = { left: { id: string }; right: { id: string } }

/** Ordre normalisé d'une paire : le plus petit identifiant à gauche (une paire = une ligne). */
export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

/**
 * #4114.4 — « ce sont les mêmes » / « pas les mêmes » sur une paire de personnes PROPOSÉE.
 * Doctrine : on PROPOSE, on ne fusionne JAMAIS — aucune fiche n'est touchée ici, seulement la décision humaine
 * est enregistrée. Les droits (espace, périmètre BU) sont ceux de la lecture des propositions : le contrôleur
 * (GA-07 : l'orchestration vit au bord) passe les propositions que CET utilisateur voit, et la paire décidée doit
 * en faire partie, sinon 404 — un utilisateur d'un autre espace ne voit ni ne décide aucune paire.
 */
@Injectable()
export class ContactDuplicateDecisionsService {
  constructor(
    @InjectRepository(ContactDuplicateDecisionEntity)
    private readonly decisions: Repository<ContactDuplicateDecisionEntity>,
  ) {}

  /** Retire les paires écartées (« pas les mêmes ») et marque celles déjà confirmées. */
  async overlay<P extends PairLike>(
    workspaceId: string,
    accountId: string,
    pairs: P[],
  ): Promise<Array<P & { decision: 'same' | null }>> {
    if (pairs.length === 0) return []
    const rows = await this.decisions.find({ where: { ...workspaceScopeWhere(workspaceId), account_id: accountId } })
    const byPair = new Map(rows.map(row => [`${row.left_contact_id}|${row.right_contact_id}`, row.decision]))
    const out: Array<P & { decision: 'same' | null }> = []
    for (const pair of pairs) {
      const [left, right] = orderedPair(pair.left.id, pair.right.id)
      const decision = byPair.get(`${left}|${right}`)
      if (decision === 'not_same') continue
      out.push({ ...pair, decision: decision === 'same' ? 'same' : null })
    }
    return out
  }

  /** Les paires que l'humain a écartées (« pas les mêmes »), en clés `a|b` ordonnées — jamais reproposées ni regroupées. */
  async rejectedPairKeys(workspaceId: string, accountId: string): Promise<Set<string>> {
    const rows = await this.decisions.find({ where: { ...workspaceScopeWhere(workspaceId), account_id: accountId } })
    return new Set(
      rows.filter(row => row.decision === 'not_same').map(row => `${row.left_contact_id}|${row.right_contact_id}`),
    )
  }

  async record(
    workspaceId: string,
    userId: string,
    accountId: string,
    visiblePairs: PairLike[],
    leftId: string,
    rightId: string,
    decision: DuplicateDecision,
  ): Promise<{ decision: DuplicateDecision }> {
    const [left, right] = orderedPair(leftId, rightId)
    const proposed = visiblePairs.some(pair => {
      const [l, r] = orderedPair(pair.left.id, pair.right.id)
      return l === left && r === right
    })
    if (!proposed) throw new NotFoundException('Paire de doublons introuvable')
    // Une correction humaine gagne toujours : la dernière décision remplace la précédente.
    await this.decisions.upsert(
      {
        workspace_id: workspaceId,
        account_id: accountId,
        left_contact_id: left,
        right_contact_id: right,
        decision,
        user_id: userId,
        decided_at: new Date(),
      },
      ['workspace_id', 'left_contact_id', 'right_contact_id'],
    )
    return { decision }
  }
}
