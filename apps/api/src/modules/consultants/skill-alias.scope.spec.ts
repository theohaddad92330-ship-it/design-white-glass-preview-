import type { Repository } from 'typeorm'
import type { SkillAliasProposalEntity } from '../../database/entities/skill-alias-proposal.entity'
import { SkillAliasService } from './skill-alias.service'

/**
 * #2671 — LE JUMEAU : `SkillAliasService.decide` lisait sa proposition par
 * `findOne({ where: { id } })` NU, puis filtrait après coup avec
 * `workspaceId && row.workspace_id !== workspaceId`.
 *
 * Ce prédicat s'EFFONDRE quand `workspaceId` vaut `null` : le premier terme est
 * falsy, la comparaison n'est jamais évaluée, et l'appelant tranche alors la
 * proposition de N'IMPORTE QUEL espace — il écrit `status`, `decided_by`,
 * `canonical_term`, et verse l'alias dans la bibliothèque partagée. C'est
 * exactement la forme du finding pentest #2 documentée dans
 * `consultant-scope.ts`, et l'inverse de ce que font les DEUX voisines du même
 * fichier (`pending`, `approvedAliases`), qui rendent vide sans espace.
 *
 * La route est atteignable depuis un JWT utilisateur : `PUT
 * /talents/skill-aliases/:id` (`talent.controller.ts`, `JwtGuard`), et l'`id`
 * vient du client (`@Param('id', ParseUUIDPipe)`).
 *
 * La barrière doit être DANS la requête, pas après : un dépôt qui honore son
 * `where` rend `null`, et la fonction ne touche jamais la ligne d'à côté.
 */
describe('SkillAliasService.decide — cloisonnement d’espace (#2671)', () => {
  const rowOf = (id: string, workspaceId: string): SkillAliasProposalEntity =>
    ({
      id,
      workspace_id: workspaceId,
      raw_term: 'kube',
      canonical_term: 'kubernetes',
      status: 'pending',
      occurrences: 3,
      proposed_by: null,
      decided_by: null,
      decided_at: null,
      created_at: new Date('2026-09-01T10:00:00.000Z'),
    }) as SkillAliasProposalEntity

  /** Un dépôt qui HONORE son `where` : toutes les clés doivent correspondre. */
  function repoWith(rows: SkillAliasProposalEntity[]) {
    const wheres: Record<string, unknown>[] = []
    const findOne = jest.fn(async (options: { where: Record<string, unknown> }) => {
      wheres.push(options.where)
      const match = rows.find(row =>
        Object.entries(options.where).every(
          ([key, value]) => (row as unknown as Record<string, unknown>)[key] === value,
        ),
      )
      return match ?? null
    })
    const save = jest.fn(async (row: SkillAliasProposalEntity) => row)
    const query = jest.fn(async () => [])
    const repo = { findOne, save, manager: { query } } as unknown as Repository<SkillAliasProposalEntity>
    return { repo, findOne, save, query, wheres }
  }

  it('sans espace résolu, ne tranche RIEN — l’absence d’espace n’est pas un passe-partout', async () => {
    const { repo, save } = repoWith([rowOf('prop-1', 'ws-B')])
    const service = new SkillAliasService(repo)

    await expect(service.decide('prop-1', null, 'user-intrus', 'approved', 'kubernetes')).resolves.toBeNull()
    // Rien n'a été écrit sur la proposition d'un autre espace.
    expect(save).not.toHaveBeenCalled()
  })

  it('la borne d’espace est DANS la lecture — une proposition d’un autre espace ne remonte pas', async () => {
    const { repo, save, wheres } = repoWith([rowOf('prop-1', 'ws-B')])
    const service = new SkillAliasService(repo)

    await expect(service.decide('prop-1', 'ws-A', 'user-1', 'approved', 'kubernetes')).resolves.toBeNull()
    expect(save).not.toHaveBeenCalled()
    // La preuve que le refus vient de la REQUÊTE et non d'un filtre a posteriori.
    expect(wheres).toEqual([{ id: 'prop-1', workspace_id: 'ws-A' }])
  })

  it('sait dire OUI — le cas normal tranche toujours et partage l’alias approuvé', async () => {
    const { repo, save, query } = repoWith([rowOf('prop-1', 'ws-A')])
    const service = new SkillAliasService(repo)

    const decided = await service.decide('prop-1', 'ws-A', 'user-1', 'approved', 'Kubernetes')

    expect(decided).toMatchObject({ id: 'prop-1', status: 'approved', canonicalTerm: 'kubernetes' })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]?.[0]).toMatchObject({ status: 'approved', decided_by: 'user-1' })
    // La bibliothèque partagée reste alimentée : le correctif borne la lecture,
    // il ne retire aucune capacité au cas légitime.
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('un rejet du bon espace passe aussi — et ne partage rien', async () => {
    const { repo, save, query } = repoWith([rowOf('prop-1', 'ws-A')])
    const service = new SkillAliasService(repo)

    const decided = await service.decide('prop-1', 'ws-A', 'user-1', 'rejected')

    expect(decided).toMatchObject({ id: 'prop-1', status: 'rejected' })
    expect(save).toHaveBeenCalledTimes(1)
    expect(query).not.toHaveBeenCalled()
  })
})
