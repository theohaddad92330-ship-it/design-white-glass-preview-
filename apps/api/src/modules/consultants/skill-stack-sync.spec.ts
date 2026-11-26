import { mergeStackWithSkills, runStackSyncCatchUp, syncStackFromSkills } from './skill-seed'

/**
 * #5016 — `consultant_skills` FAIT FOI ; `consultants.stack` s'y synchronise.
 * La liste libre et l'onglet « Compétences » lisaient deux sources qui
 * divergeaient (commit de CV : référentiel seul ; fiche : liste seule).
 */
describe('#5016 mergeStackWithSkills', () => {
  it('ajoute à la liste les compétences du référentiel qu’elle ne porte pas', () => {
    const merged = mergeStackWithSkills(
      ['Kubernetes'],
      [
        { skill: 'kubernetes', raw_label: 'Kubernetes' },
        { skill: 'terraform', raw_label: null },
      ],
    )
    expect(merged).toEqual(['Kubernetes', 'terraform'])
  })

  it('ne retire jamais un mot saisi à la main, même absent du référentiel', () => {
    expect(mergeStackWithSkills(['Outil maison Zephyr'], [{ skill: 'go', raw_label: null }])).toEqual([
      'Outil maison Zephyr',
      'go',
    ])
  })

  it('ne double pas une compétence écrite sous un autre libellé (K8s = Kubernetes)', () => {
    expect(mergeStackWithSkills(['K8s'], [{ skill: 'kubernetes', raw_label: 'Kubernetes' }])).toBeNull()
  })

  it('rend null quand rien ne change (idempotent)', () => {
    expect(mergeStackWithSkills(['Go'], [{ skill: 'go', raw_label: null }])).toBeNull()
    expect(mergeStackWithSkills(null, [])).toBeNull()
  })

  it('une liste vide + des compétences = la liste prend les compétences', () => {
    expect(mergeStackWithSkills(null, [{ skill: 'go', raw_label: null }])).toEqual(['go'])
  })
})

describe('#5016 syncStackFromSkills', () => {
  it('écrit la liste fusionnée, filtrée par espace, et la rend', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ stack: ['Go'], skills: [{ skill: 'rust', raw_label: null }] }])
      .mockResolvedValueOnce(undefined)
    const next = await syncStackFromSkills({ query }, { consultantId: 'c1', workspaceId: 'w1' })
    expect(next).toEqual(['Go', 'rust'])
    const [selectSql, selectParams] = query.mock.calls[0] as [string, unknown[]]
    expect(selectSql).toContain('workspace_id')
    expect(selectParams).toEqual(['c1', 'w1'])
    const [updateSql, updateParams] = query.mock.calls[1] as [string, unknown[]]
    expect(updateSql).toContain('UPDATE consultants')
    expect(updateSql).toContain('workspace_id')
    expect(updateParams).toEqual([['Go', 'rust'], 'c1', 'w1'])
  })

  it('n’écrit rien quand les deux sources concordent', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ stack: ['Go'], skills: [{ skill: 'go', raw_label: null }] }])
    await expect(syncStackFromSkills({ query }, { consultantId: 'c1', workspaceId: 'w1' })).resolves.toBeNull()
    expect(query).toHaveBeenCalledTimes(1)
  })
})

// #5016.3 — correction humaine gagne : ce que la personne a retiré ne revient pas.
describe('#5016.3 correction humaine gagne', () => {
  const edited = '2026-10-31T10:00:00.000Z'
  const before = '2026-10-30T10:00:00.000Z'
  const after = '2026-10-31T11:00:00.000Z'

  it('mergeStackWithSkills n’ajoute pas une compétence antérieure à la correction humaine', () => {
    const merged = mergeStackWithSkills(
      ['Go'],
      [
        { skill: 'rust', raw_label: null, created_at: before },
        { skill: 'terraform', raw_label: null, created_at: after },
      ],
      edited,
    )
    expect(merged).toEqual(['Go', 'terraform'])
  })

  it('sans marqueur, tout le référentiel est ajouté (comportement #5016.1)', () => {
    expect(mergeStackWithSkills(['Go'], [{ skill: 'rust', raw_label: null, created_at: before }], null)).toEqual([
      'Go',
      'rust',
    ])
  })

  it('syncStackFromSkills ne réécrit rien quand seule une compétence antérieure à la correction manque', async () => {
    const query = jest.fn().mockResolvedValueOnce([
      {
        stack: ['Go'],
        stack_edited_by_human_at: edited,
        skills: [{ skill: 'rust', raw_label: null, created_at: before }],
      },
    ])
    await expect(syncStackFromSkills({ query }, { consultantId: 'c1', workspaceId: 'w1' })).resolves.toBeNull()
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('le rattrapage saute toute fiche dont la stack a été corrigée à la main', async () => {
    const query = jest.fn().mockResolvedValue(undefined)
    query.mockResolvedValueOnce([
      {
        id: 'h',
        stack: ['Go'],
        stack_edited_by_human_at: edited,
        skills: [{ skill: 'rust', raw_label: null, created_at: before }],
      },
    ])
    const report = await runStackSyncCatchUp({ query }, { workspaceId: 'w1', apply: true })
    expect(report).toEqual({ examined: 1, divergent: 0, written: 0 })
    expect(query).toHaveBeenCalledTimes(1)
  })
})

describe('#5016 runStackSyncCatchUp', () => {
  const rows = [
    { id: 'a', stack: ['Go'], skills: [{ skill: 'go', raw_label: null }] },
    {
      id: 'b',
      stack: ['Go'],
      skills: [
        { skill: 'go', raw_label: null },
        { skill: 'rust', raw_label: null },
      ],
    },
    { id: 'c', stack: ['Zephyr'], skills: [] },
  ]

  it('en simulation : compte les fiches divergentes et n’écrit RIEN', async () => {
    const query = jest.fn().mockResolvedValueOnce(rows)
    const report = await runStackSyncCatchUp({ query }, { workspaceId: 'w1', apply: false })
    expect(report).toEqual({ examined: 3, divergent: 2, written: 0 })
    expect(query).toHaveBeenCalledTimes(1)
    expect((query.mock.calls[0] as [string, unknown[]])[1]).toEqual(['w1'])
  })

  it('avec --appliquer : sème le mot manquant au référentiel (déclaré) et complète la liste, sans rien retirer', async () => {
    const query = jest.fn().mockResolvedValue(undefined)
    query.mockResolvedValueOnce(rows)
    const report = await runStackSyncCatchUp({ query }, { workspaceId: 'w1', apply: true })
    expect(report).toEqual({ examined: 3, divergent: 2, written: 2 })
    const sqls = query.mock.calls.map(call => (call as [string])[0])
    expect(sqls.some(sql => sql.includes('DELETE'))).toBe(false)
    expect(sqls.filter(sql => sql.includes('UPDATE consultants'))).toHaveLength(1)
    expect(sqls.filter(sql => sql.includes('INSERT INTO consultant_skills'))).toHaveLength(1)
  })

  it('relancé sur des données déjà alignées : rien à faire', async () => {
    const query = jest.fn().mockResolvedValueOnce([rows[0]])
    await expect(runStackSyncCatchUp({ query }, { workspaceId: 'w1', apply: true })).resolves.toEqual({
      examined: 1,
      divergent: 0,
      written: 0,
    })
  })
})
