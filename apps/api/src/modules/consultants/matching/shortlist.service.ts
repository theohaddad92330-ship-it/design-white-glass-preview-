import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { SHORTLIST_MAX, type MatchResult, type MatchRun, type Shortlist, type ShortlistEntry } from '@bellum/contracts'
import { ShortlistEntity, ShortlistEntryEntity } from '../../../database/entities/shortlist.entity'
import { CommercialTransitionsService } from '../../commercial-transitions/commercial-transitions.service'

/**
 * Créer, lire et DUPLIQUER une shortlist (PDF 4 §9).
 *
 * Rien ici ne modifie une shortlist existante, et c'est délibéré : le service
 * n'expose aucun `update`. Une shortlist figée dont on peut éditer le contenu
 * n'est pas figée, et le jour où quelqu'un ajoute la méthode « juste pour
 * corriger une faute », la trace de ce qui a été envoyé disparaît.
 */
@Injectable()
export class ShortlistService {
  constructor(
    @InjectRepository(ShortlistEntity) private readonly shortlists: Repository<ShortlistEntity>,
    @InjectRepository(ShortlistEntryEntity) private readonly entries: Repository<ShortlistEntryEntity>,
    private readonly commercialTransitions: CommercialTransitionsService,
  ) {}

  /**
   * Une shortlist à partir d'un classement.
   *
   * Le plafond est vérifié ICI et pas seulement au contrat : le contrat protège
   * l'appel HTTP, ce test protège tous les appels — y compris ceux qu'une
   * routine ferait demain.
   *
   * ⚠️ **Ce qui se fige en base ne dépend JAMAIS du droit de celui qui
   * déclenche** (D48 · 26/08/2026). Le TJM était écrit à `null` quand la
   * personne qui créait la shortlist n'avait pas `finance:read` — et
   * DÉFINITIVEMENT : un lecteur qui a le droit ne récupérait jamais le chiffre.
   * Ce n'était pas une rédaction d'affichage, c'était une perte de donnée à
   * l'écriture. La rédaction se fait à la LECTURE, où elle a un sens — c'est
   * déjà la règle du dépôt (`redactFinance` s'applique à la réponse, pas à
   * l'insertion). D'où l'absence de tout booléen de droit dans cette signature.
   */
  async create(input: {
    run: MatchRun
    consultantIds: string[]
    identities: Map<string, { fullName: string; title: string | null }>
    workspaceId: string | null
    userId: string
    /** Le TJM de chaque profil, en centimes. `null` = NON RENSEIGNÉ — la seule
     *  raison légitime d'une absence ici. */
    rates: Map<string, number | null>
  }): Promise<{ shortlist: Shortlist } | { refused: 'too_many' | 'not_in_run' }> {
    if (input.consultantIds.length > SHORTLIST_MAX) return { refused: 'too_many' }
    const byId = new Map<string, MatchResult>()
    for (const result of [
      ...input.run.recommended,
      ...input.run.borderline,
      ...input.run.notEvaluable,
      ...input.run.excluded,
    ]) {
      byId.set(result.consultantId, result)
    }
    const picked = input.consultantIds
      .map(id => byId.get(id))
      .filter((result): result is MatchResult => Boolean(result))
    if (picked.length !== input.consultantIds.length) return { refused: 'not_in_run' }

    const header = await this.shortlists.save(
      this.shortlists.create({
        workspace_id: input.workspaceId,
        need_id: input.run.need.needId,
        need_role: input.run.need.role,
        account_name: input.run.need.accountName,
        status: 'draft',
        source_run_id: input.run.runId,
        duplicated_from: null,
        created_by: input.userId,
        // #2320.17 — ce que le créateur a VU comme non évaluable au moment
        // de choisir, jamais recalculé plus tard (le run peut ne plus exister).
        reviewed_unknown_ids: input.run.notEvaluable.map(result => result.consultantId),
      }),
    )

    // #2320.1 (LOT r3, épopée #2967) — la shortlist entre dans le journal
    // APPEND-ONLY besoin→shortlist→positionnement→mission (#2320.23) dès sa
    // création : c'est le SEUL geste qui la fait exister, donc le seul état
    // `to_state` qu'elle porte pour l'instant (`status` ne bouge jamais
    // ensuite, `ShortlistService` n'expose aucun `update`).
    await this.commercialTransitions.record({
      workspaceId: input.workspaceId,
      subjectType: 'shortlist',
      subjectId: header.id,
      fromState: null,
      toState: header.status,
      actorId: input.userId,
      proof: null,
    })

    // ⚠️ Ceci n'est PAS une rédaction financière au sens de `redactFinance`
    // (D45), et le confondre serait une erreur dans les deux sens.
    //
    //  · le champ est le TJM du profil, c'est-à-dire un prix de VENTE. Ce que
    //    `finance:read` garde, c'est le COÛT et la MARGE — le TJM facturé sort
    //    sans le droit ailleurs dans le produit (le board rend `dailyRateCents`
    //    inconditionnellement). Le passer à `redactFinance` masquerait un
    //    chiffre que le produit montre exprès.
    //  · et ce n'est pas la forme d'une RÉPONSE qu'on décide ici : c'est le
    //    contenu du SNAPSHOT figé en base. Une shortlist est un document gelé ;
    //    ce qui n'y entre pas n'y entrera jamais, pour aucun lecteur.
    //
    // Le comportement est donc laissé tel quel, et la garde
    // `finance-redaction-single-path.spec.ts` le nomme comme exception.
    const snapshots = picked.map((result, index) =>
      buildEntry(result, index + 1, input.identities.get(result.consultantId), {
        dailyRateCents: input.rates.get(result.consultantId) ?? null,
      }),
    )
    await this.entries.save(
      snapshots.map(snapshot =>
        this.entries.create({
          shortlist_id: header.id,
          consultant_id: snapshot.consultantId,
          rank: snapshot.rank,
          snapshot,
        }),
      ),
    )
    return { shortlist: toWire(header, snapshots) }
  }

  async listForNeed(needId: string, workspaceId: string | null): Promise<Shortlist[]> {
    const headers = await this.shortlists
      .createQueryBuilder('s')
      .where('s.need_id = :needId', { needId })
      .andWhere(workspaceId ? 's.workspace_id = :workspaceId' : 's.workspace_id IS NULL', { workspaceId })
      .orderBy('s.created_at', 'DESC')
      .limit(50)
      .getMany()
    if (headers.length === 0) return []
    const rows = await this.entries
      .createQueryBuilder('e')
      .where('e.shortlist_id IN (:...ids)', { ids: headers.map(header => header.id) })
      .orderBy('e.rank', 'ASC')
      .getMany()
    const byList = new Map<string, ShortlistEntry[]>()
    for (const row of rows) {
      const list = byList.get(row.shortlist_id) ?? []
      list.push(row.snapshot)
      byList.set(row.shortlist_id, list)
    }
    return headers.map(header => toWire(header, byList.get(header.id) ?? []))
  }

  async findOne(id: string, workspaceId: string | null): Promise<Shortlist | null> {
    const header = await this.shortlists
      .createQueryBuilder('s')
      .where('s.id = :id', { id })
      .andWhere(workspaceId ? 's.workspace_id = :workspaceId' : 's.workspace_id IS NULL', { workspaceId })
      .getOne()
    if (!header) return null
    const rows = await this.entries
      .createQueryBuilder('e')
      .where('e.shortlist_id = :id', { id })
      .orderBy('e.rank', 'ASC')
      .getMany()
    return toWire(
      header,
      rows.map(row => row.snapshot),
    )
  }

  /**
   * Dupliquer — la SEULE façon de modifier.
   *
   * La copie repart des fiches courtes figées, pas du vivier : on ampute ou on
   * réordonne ce qui a été proposé, on ne le remplace pas par ce qui est vrai
   * aujourd'hui. Sinon dupliquer changerait le contenu à l'insu de tout le monde.
   */
  async duplicate(id: string, workspaceId: string | null, userId: string, keep?: string[]): Promise<Shortlist | null> {
    const source = await this.findOne(id, workspaceId)
    if (!source) return null
    const kept =
      keep && keep.length > 0 ? source.entries.filter(entry => keep.includes(entry.consultantId)) : source.entries
    const header = await this.shortlists.save(
      this.shortlists.create({
        workspace_id: workspaceId,
        need_id: source.needId,
        need_role: source.needRole,
        account_name: source.accountName,
        status: 'draft',
        source_run_id: source.sourceRunId,
        duplicated_from: source.id,
        created_by: userId,
      }),
    )
    const snapshots = kept.slice(0, SHORTLIST_MAX).map((entry, index) => ({ ...entry, rank: index + 1 }))
    if (snapshots.length > 0) {
      await this.entries.save(
        snapshots.map(snapshot =>
          this.entries.create({
            shortlist_id: header.id,
            consultant_id: snapshot.consultantId,
            rank: snapshot.rank,
            snapshot,
          }),
        ),
      )
    }
    return toWire(header, snapshots)
  }
}

/**
 * La fiche courte d'un profil : compétences retenues, disponibilité, TJM, trois preuves.
 *
 * Trois preuves au plus — au-delà personne ne lit — et une liste plus courte
 * quand il n'y en a pas trois, plutôt qu'une phrase de remplissage.
 */
export function buildEntry(
  result: MatchResult,
  rank: number,
  identity: { fullName: string; title: string | null } | undefined,
  options: { dailyRateCents: number | null },
): ShortlistEntry {
  const matched = result.skills.filter(skill => skill.status === 'matched')
  const availability = result.axes.find(axis => axis.axis === 'availability')
  return {
    consultantId: result.consultantId,
    fullName: identity?.fullName ?? '',
    title: identity?.title ?? null,
    rank,
    correspondenceScore: result.correspondenceScore,
    pushableScore: result.pushableScore,
    skills: matched.map(skill => ({ label: skill.label, level: skill.level, source: skill.source })),
    availability: availability?.detail ?? 'disponibilité non renseignée',
    dailyRateCents: options.dailyRateCents,
    proofs: matched
      .map(skill => skill.proof)
      .filter((proof): proof is string => Boolean(proof))
      .slice(0, 3),
    gaps: result.gaps,
  }
}

function toWire(header: ShortlistEntity, entries: ShortlistEntry[]): Shortlist {
  return {
    id: header.id,
    needId: header.need_id,
    needRole: header.need_role,
    accountName: header.account_name,
    status: header.status as Shortlist['status'],
    sourceRunId: header.source_run_id,
    duplicatedFrom: header.duplicated_from,
    entries,
    reviewedUnknownIds: header.reviewed_unknown_ids,
    createdAt: header.created_at.toISOString(),
    createdBy: header.created_by,
  }
}
