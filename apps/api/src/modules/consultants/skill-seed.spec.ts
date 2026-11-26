import { seedTypedSkills, skillSeedRows, stackWithSkill } from './skill-seed'

describe('skillSeedRows', () => {
  it('canonise les écritures libres et déduplique', () => {
    const rows = skillSeedRows(['Kubernetes', 'k8s', 'Terraform'])
    expect(rows.map(row => row.skill)).toEqual(['kubernetes', 'terraform'])
  })

  it('garde le libellé d’origine seulement quand il diffère du canonique', () => {
    const rows = skillSeedRows(['K8s', 'terraform'])
    expect(rows[0]).toEqual({ skill: 'kubernetes', rawLabel: 'K8s' })
    expect(rows[1]).toEqual({ skill: 'terraform', rawLabel: null })
  })

  it('garde une compétence absente du référentiel plutôt que de la jeter', () => {
    // Un outil interne ou une techno récente n'est dans aucun référentiel : ne
    // semer que le connu empêcherait le vivier de dire ce qu'il sait vraiment.
    const rows = skillSeedRows(['Outil maison Zephyr'])
    expect(rows).toEqual([{ skill: 'outil maison zephyr', rawLabel: 'Outil maison Zephyr' }])
  })

  it('ignore le vide, les blancs et ce qui n’est pas du texte', () => {
    expect(skillSeedRows(['  ', '', null as unknown as string, 42 as unknown as string])).toEqual([])
    expect(skillSeedRows(null)).toEqual([])
    expect(skillSeedRows(undefined)).toEqual([])
  })
})

describe('seedTypedSkills', () => {
  it('n’écrit rien quand la liste est vide', async () => {
    const query = jest.fn()
    await expect(
      seedTypedSkills({ query }, { consultantId: 'c1', workspaceId: null, stack: [], source: 'declared' }),
    ).resolves.toBe(0)
    expect(query).not.toHaveBeenCalled()
  })

  it('écrit un niveau inconnu et ne remplace jamais une ligne existante', async () => {
    const query = jest.fn().mockResolvedValue(undefined)
    const count = await seedTypedSkills(
      { query },
      { consultantId: 'c1', workspaceId: 'w1', stack: ['Kubernetes', 'Go'], source: 'cv' },
    )
    expect(count).toBe(2)
    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    // Les deux propriétés qui portent l'honnêteté du semis.
    expect(sql).toContain("'inconnu'")
    expect(sql).toContain('ON CONFLICT (consultant_id, skill) DO NOTHING')
    // Aucun DELETE : retirer un mot de la liste libre n'efface pas une
    // compétence prouvée en mission.
    expect(sql).not.toContain('DELETE')
    expect(params[0]).toBe('c1')
    expect(params[1]).toBe('w1')
    expect(params[2]).toEqual(['kubernetes', 'go'])
    expect(params[4]).toBe('cv')
  })
})

// KEVIN-FIX K.2 — une saisie d'un trait sème trois compétences ; ajouter « Vue » ensuite ne double rien.
describe('K.2 — liste libre découpée', () => {
  it('sème une compétence par morceau de « java spring vue »', () => {
    expect(skillSeedRows(['java spring vue']).map(row => row.skill)).toEqual(['java', 'spring', 'vue.js'])
  })

  it('ajouter « Vue » à « java spring vue » ne double rien et rend la liste découpée', () => {
    expect(stackWithSkill(['java spring vue'], 'Vue')).toEqual(['java', 'spring', 'vue'])
  })

  it('une liste déjà propre et complète : rien à écrire', () => {
    expect(stackWithSkill(['java', 'spring', 'vue'], 'Vue')).toBeNull()
  })
})
