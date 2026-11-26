import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { SkillAliasProposalEntity } from '../../database/entities/skill-alias-proposal.entity'
import { canonicalSkill, normaliseSkillText } from './skill-referential'

type SkillAliasProposal = {
  id: string
  rawTerm: string
  canonicalTerm: string | null
  occurrences: number
  status: string
  createdAt: string
}

/**
 * Les alias de compétences d'un espace (PDF 3 §5.3, ticket BEL-ATS-204).
 *
 * Deux gestes, et la distinction entre les deux EST le ticket :
 *
 *  - **observer** : chaque terme écrit qui n'est pas dans le référentiel est
 *    noté. Aujourd'hui `canonicalSkill()` rend `null` en silence, et personne ne
 *    sait jamais quels mots le produit ne comprend pas — donc quels profils il
 *    ne trouve pas ;
 *  - **trancher** : un administrateur approuve ou rejette. Une proposition
 *    appliquée seule rapprocherait deux compétences que personne n'a validées,
 *    et le matching remonterait des profils sur un mot qu'ils n'ont jamais
 *    écrit.
 *
 * Rien n'est appliqué automatiquement, même sur cent occurrences. La fréquence
 * ORDONNE la file, elle ne décide pas.
 */
@Injectable()
export class SkillAliasService {
  private readonly logger = new Logger(SkillAliasService.name)

  constructor(
    @InjectRepository(SkillAliasProposalEntity)
    private readonly proposals: Repository<SkillAliasProposalEntity>,
  ) {}

  /**
   * Note un terme rencontré. Best-effort : une file d'enrichissement qui
   * ferait échouer une saisie de compétence serait pire que pas de file.
   */
  async observe(
    workspaceId: string | null,
    rawTerm: string,
    userId: string | null,
    canonicalHint?: string | null,
  ): Promise<void> {
    if (!workspaceId) return
    const normalised = normaliseSkillText(rawTerm)
    if (!normalised) return
    // Un terme DÉJÀ canonique n'a rien à apprendre à personne.
    if (canonicalSkill(normalised) === normalised) return

    try {
      await this.proposals.manager.query(
        `INSERT INTO skill_alias_proposals (workspace_id, raw_term, canonical_term, proposed_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (workspace_id, raw_term)
         DO UPDATE SET occurrences = skill_alias_proposals.occurrences + 1,
                       canonical_term = COALESCE(skill_alias_proposals.canonical_term, EXCLUDED.canonical_term)`,
        [workspaceId, normalised, canonicalHint ?? canonicalSkill(normalised) ?? null, userId],
      )
    } catch (error) {
      this.logger.warn(`Skill alias proposal not recorded for "${normalised}": ${String(error)}`)
    }
  }

  /** La file, les termes les plus fréquents d'abord. */
  async pending(workspaceId: string | null): Promise<SkillAliasProposal[]> {
    if (!workspaceId) return []
    const rows = await this.proposals.find({
      where: { workspace_id: workspaceId, status: 'pending' },
      order: { occurrences: 'DESC', created_at: 'ASC' },
      take: 100,
    })
    return rows.map(row => ({
      id: row.id,
      rawTerm: row.raw_term,
      canonicalTerm: row.canonical_term,
      occurrences: row.occurrences,
      status: row.status,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    }))
  }

  /**
   * Un administrateur tranche.
   *
   * `canonicalTerm` peut être corrigé au passage : c'est souvent là que la
   * bonne cible apparaît, quand quelqu'un qui connaît le métier regarde la
   * liste.
   */
  async decide(
    id: string,
    workspaceId: string | null,
    userId: string,
    decision: 'approved' | 'rejected',
    canonicalTerm?: string | null,
  ): Promise<SkillAliasProposal | null> {
    // #2671 — la borne d'espace est DANS la lecture, jamais un filtre posé
    // après. L'ancienne forme (`findOne({ where: { id } })` puis
    // `workspaceId && row.workspace_id !== workspaceId`) s'effondrait quand
    // `workspaceId` valait `null` : le premier terme falsy sautait la
    // comparaison et l'appelant tranchait la proposition de n'importe quel
    // espace. Sans espace résolu on ne tranche RIEN — comme `pending` et
    // `approvedAliases` ci-dessus, et comme le veut le finding pentest #2
    // (`consultant-scope.ts`).
    if (!workspaceId) return null
    const row = await this.proposals.findOne({ where: { id, workspace_id: workspaceId } })
    if (!row) return null
    row.status = decision
    row.decided_by = userId
    row.decided_at = new Date()
    if (decision === 'approved' && canonicalTerm) row.canonical_term = normaliseSkillText(canonicalTerm)
    const saved = await this.proposals.save(row)
    // Un alias approuvé alimente la bibliothèque PARTAGÉE (D18, réouverte le
    // 21/08). Best-effort : le partage est un bonus, jamais une condition de la
    // décision qu'on vient de prendre.
    if (decision === 'approved' && saved.canonical_term) {
      await this.shareApproved(saved.raw_term, saved.canonical_term)
    }
    return {
      id: saved.id,
      rawTerm: saved.raw_term,
      canonicalTerm: saved.canonical_term,
      occurrences: saved.occurrences,
      status: saved.status,
      createdAt: saved.created_at instanceof Date ? saved.created_at.toISOString() : String(saved.created_at),
    }
  }

  /**
   * Verse un alias approuvé dans la bibliothèque partagée entre espaces.
   *
   * Ce qui voyage est un couple de TERMES techniques et rien d'autre : ni
   * l'espace d'origine, ni un profil, ni un client. Un alias de compétence est
   * du vocabulaire de métier, et c'est ce qui rend le partage tenable.
   *
   * Le compteur monte à chaque espace qui approuve le MÊME rapprochement. Ce
   * n'est pas une statistique : c'est l'argument qu'on montrera à celui qui
   * décide ailleurs. Un rapprochement qu'une seule ESN a validé ne vaut pas
   * celui que douze ont validé.
   */
  private async shareApproved(rawTerm: string, canonicalTerm: string): Promise<void> {
    try {
      await this.proposals.manager.query(
        `INSERT INTO skill_alias_library (raw_term, canonical_term, workspaces_approved)
         VALUES ($1, $2, 1)
         ON CONFLICT (raw_term) DO UPDATE
           SET workspaces_approved = skill_alias_library.workspaces_approved + 1,
               updated_at = now()`,
        [rawTerm, canonicalTerm],
      )
    } catch (error) {
      this.logger.warn(`Alias non partagé (sans conséquence): ${String(error)}`)
    }
  }

  /**
   * Ce que d'autres espaces ont approuvé et que CELUI-CI n'a pas encore tranché.
   *
   * Rendu comme une SUGGESTION, jamais appliqué : le vocabulaire d'une ESN
   * cyber n'est pas celui d'une ESN data — « ELK » ne veut pas dire la même
   * chose chez l'une et chez l'autre. Imposer le rapprochement ferait remonter
   * des profils sur un mot qu'ils n'ont jamais écrit, ce que la règle des alias
   * approuvés existe précisément pour empêcher.
   */
  async librarySuggestions(
    workspaceId: string | null,
    limit = 20,
  ): Promise<{ rawTerm: string; canonicalTerm: string; workspacesApproved: number }[]> {
    if (!workspaceId) return []
    try {
      const rows = await this.proposals.manager.query<
        { raw_term: string; canonical_term: string; workspaces_approved: number }[]
      >(
        `SELECT l.raw_term, l.canonical_term, l.workspaces_approved
           FROM skill_alias_library l
          WHERE NOT EXISTS (
            SELECT 1 FROM skill_alias_proposals p
             WHERE p.workspace_id = $1 AND p.raw_term = l.raw_term
          )
          ORDER BY l.workspaces_approved DESC, l.raw_term ASC
          LIMIT $2`,
        [workspaceId, limit],
      )
      return rows.map(row => ({
        rawTerm: row.raw_term,
        canonicalTerm: row.canonical_term,
        workspacesApproved: Number(row.workspaces_approved),
      }))
    } catch (error) {
      this.logger.warn(`Bibliothèque d'alias illisible: ${String(error)}`)
      return []
    }
  }

  /**
   * Les alias APPROUVÉS d'un espace, prêts à être appliqués à une recherche.
   *
   * Rend une table `terme écrit → terme canonique`. Seuls les approuvés y
   * figurent : c'est ce qui garantit qu'aucun rapprochement non validé
   * n'atteint le matching.
   */
  async approvedAliases(workspaceId: string | null): Promise<Map<string, string>> {
    if (!workspaceId) return new Map()
    const rows = await this.proposals.find({ where: { workspace_id: workspaceId, status: 'approved' } })
    const table = new Map<string, string>()
    for (const row of rows) {
      if (row.canonical_term) table.set(row.raw_term, row.canonical_term)
    }
    return table
  }
}
