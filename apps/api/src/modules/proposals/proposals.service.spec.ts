import { ProposalsService } from './proposals.service'

const WS = 'ws-1'
const OTHER_WS = 'ws-2'

const PROJECT = {
  id: 'proj-1',
  account_id: 'acc-1',
  label: 'Refonte du socle data',
  detail: 'Socle unifié',
  offer: 'TMA data',
  estimated_amount: '90000',
  btmmp: {
    budget: '100 k€',
    timing: 'T4',
    mission: 'Refonte',
    management: 'DSI',
    process: 'AO',
    nextStep: 'Soutenance',
  },
}

/** Un `SelectQueryBuilder` réduit à ce que le service en utilise. */
function fakeQueryBuilder(project: unknown) {
  const qb = {
    innerJoin: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    select: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    limit: jest.fn(() => qb),
    getOne: jest.fn().mockResolvedValue(project),
    getRawMany: jest.fn().mockResolvedValue([]),
  }
  return qb
}

function makeService(over: Record<string, unknown> = {}) {
  const qb = fakeQueryBuilder(over['project'] === undefined ? PROJECT : over['project'])
  const projects = { createQueryBuilder: jest.fn(() => qb) }
  const accounts = {
    findOne: jest.fn().mockResolvedValue({
      id: 'acc-1',
      company_name: 'Contoso',
      sector: 'Industrie',
      it_challenges: [{ title: 'Dette applicative', description: null }],
      raw_analysis: { risks: [{ risk: 'Fenêtre de bascule courte', probability: 'high', impact: 'high' }] },
    }),
  }
  const submissions = {
    // Deux appels distincts partagent ce mock : les positionnements retenus du
    // besoin (readTeam), puis l'historique de présentation ailleurs
    // (countPriorPresentations) — vide par défaut, un test dédié le couvre.
    find: jest
      .fn()
      .mockResolvedValueOnce([
        { consultant_id: 'c-1', proposed_rate_cents: '65000' },
        { consultant_id: 'c-2', proposed_rate_cents: '65000' },
      ])
      .mockResolvedValue([]),
  }
  const consultants = {
    find: jest.fn().mockResolvedValue([
      { id: 'c-1', full_name: 'A. Martin', availability: 'immediate' },
      { id: 'c-2', full_name: 'B. Durand', availability: 'inconnu' },
    ]),
  }
  const consultantSkills = {
    find: jest.fn().mockResolvedValue([
      { consultant_id: 'c-1', skill: 'kubernetes', raw_label: 'Kubernetes', source: 'mission' },
      { consultant_id: 'c-1', skill: 'go', raw_label: 'Go', source: 'cv' },
    ]),
  }
  const proofs = {
    find: jest.fn().mockResolvedValue([{ claim: 'Migration de 400 To en 6 mois', detail: 'industrie' }]),
  }
  const rfps = {
    find: jest.fn().mockResolvedValue([
      {
        requirements: [
          { text: 'ISO 27001', weight: 'mandatory', answer_status: 'to_produce', risk: 'Certificat expiré' },
          { text: 'Présentation du groupe', weight: 'informative', answer_status: 'to_produce', risk: null },
          { text: 'RGPD', weight: 'mandatory', answer_status: 'validated', risk: null },
        ],
      },
    ]),
  }
  const cvVersions = { find: jest.fn().mockResolvedValue([]) }

  const service = new ProposalsService(
    projects as never,
    accounts as never,
    submissions as never,
    consultants as never,
    consultantSkills as never,
    proofs as never,
    rfps as never,
    cvVersions as never,
  )
  return { service, qb, projects, accounts, submissions, consultants, consultantSkills, proofs, rfps, cvVersions }
}

describe('ProposalsService', () => {
  it('cloisonne CHAQUE lecture par l’espace de l’appelant', async () => {
    const { service, qb, accounts, submissions, consultants, consultantSkills, proofs, rfps } = makeService()
    await service.buildForProject('proj-1', WS)

    // Le besoin : le prédicat de `ProjectsService.updateBtmmp`, repris tel quel
    // (le roll-out user_id → workspace_id laisse des lignes rattachées au seul
    // compte ; un `o.workspace_id = :ws` sec les rendrait invisibles).
    expect(qb.where).toHaveBeenCalledWith('(o.workspace_id = :workspaceId OR a.workspace_id = :workspaceId)', {
      workspaceId: WS,
    })

    for (const repo of [accounts.findOne, submissions.find, consultants.find, consultantSkills.find, rfps.find]) {
      const where = (repo.mock.calls[0]?.[0] as { where: Record<string, unknown> }).where
      expect(where).toMatchObject({ workspace_id: WS })
    }
    // `proofs` lit deux branches (preuve du compte, preuve de l'ESN) : les DEUX
    // portent le cloisonnement, sinon la seconde ouvrirait la porte.
    const proofWhere = (proofs.find.mock.calls[0]?.[0] as { where: Record<string, unknown>[] }).where
    expect(proofWhere.every(branch => branch['workspace_id'] === WS)).toBe(true)
    expect(proofWhere.every(branch => branch['scope'] === 'client_safe')).toBe(true)
  })

  it('rend `null` — donc 404 — quand le besoin n’est pas dans l’espace', async () => {
    const { service, accounts } = makeService({ project: null })
    await expect(service.buildForProject('proj-1', OTHER_WS)).resolves.toBeNull()
    // Et surtout : plus rien n'est lu APRÈS le refus.
    expect(accounts.findOne).not.toHaveBeenCalled()
  })

  it('ne retient que les positionnements encore en jeu', async () => {
    const { service, submissions } = makeService()
    await service.buildForProject('proj-1', WS)

    const where = (submissions.find.mock.calls[0]?.[0] as { where: { stage: { _value: string[] } } }).where
    // `rejected` et `withdrawn` sont absents : les remettre dans une
    // proposition annoncerait une personne dont un des deux camps ne veut plus.
    expect(where.stage._value).toEqual(['shortlisted', 'submitted', 'interview', 'accepted'])
  })

  it('assemble un plan complet à partir des vraies lignes', async () => {
    const { service } = makeService()
    const view = await service.buildForProject('proj-1', WS)

    expect(view?.project).toEqual({
      id: 'proj-1',
      label: 'Refonte du socle data',
      accountId: 'acc-1',
      accountName: 'Contoso',
    })
    const sections = view?.outline.sections ?? []
    expect(sections.map(section => section.key)).toEqual([
      'context',
      'scope',
      'approach',
      'team',
      'schedule',
      'pricing',
      'references',
      'risks',
      'objections',
      'validation',
    ])

    // L'équipe : B. Durand est `inconnu`, donc sa disponibilité est à confirmer,
    // et il n'a aucune compétence démontrée. Les deux sont DITS.
    const team = sections.find(section => section.key === 'team')
    expect(team?.state).toBe('partial')
    expect(team?.gaps.join(' ')).toContain('B. Durand')
    expect(team?.content).toEqual(['A. Martin — Kubernetes', 'B. Durand'])

    // La tarification : un seul tarif proposé sur le besoin, donc un TJM.
    expect(sections.find(section => section.key === 'pricing')?.content).toEqual([
      'Montant estimé : 90000 €',
      'TJM : 650 €',
      '100 k€',
    ])
  })

  it('reprend le LIBELLÉ d’un risque, jamais sa probabilité', async () => {
    const { service } = makeService()
    const view = await service.buildForProject('proj-1', WS)
    const risks = view?.outline.sections.find(section => section.key === 'risks')

    expect(risks?.content).toContain('Fenêtre de bascule courte')
    // Le produit n'affiche AUCUNE probabilité, et une proposition commerciale
    // est le dernier endroit où en faire apparaître une.
    expect(JSON.stringify(risks)).not.toContain('high')
  })

  describe('dossier de compétences, consentement et historique (BEL-SC-239)', () => {
    it('lit la version de dossier la plus RÉCENTE pour CE besoin, et son diff', async () => {
      const { service, cvVersions } = makeService()
      cvVersions.find.mockResolvedValue([
        {
          consultant_id: 'c-1',
          status: 'validated',
          changes: [{ before: 'a', after: 'b', reason: 'c', sourceProof: null }],
          generated_at: new Date('2026-09-20'),
        },
      ])
      const view = await service.buildForProject('proj-1', WS)
      const team = view?.outline.sections.find(section => section.key === 'team')
      expect(team?.content).toContain('A. Martin — Kubernetes · CV adapté (validé, 1 modification(s) tracée(s))')
    })

    it('annonce un consentement expiré comme un manque de l’équipe', async () => {
      const { service, consultants } = makeService()
      consultants.find.mockResolvedValue([
        {
          id: 'c-1',
          full_name: 'A. Martin',
          availability: 'immediate',
          consent_given_at: new Date('2020-01-01'),
          consent_expires_at: new Date('2020-06-01'),
        },
        { id: 'c-2', full_name: 'B. Durand', availability: 'inconnu' },
      ])
      const view = await service.buildForProject('proj-1', WS)
      const team = view?.outline.sections.find(section => section.key === 'team')
      expect(team?.gaps.join(' ')).toContain('Consentement expiré, à régulariser avant envoi : A. Martin')
    })

    it('compte l’historique de présentation ailleurs, sans compter le besoin courant', async () => {
      const { service, submissions } = makeService()
      submissions.find
        .mockReset()
        .mockResolvedValueOnce([
          { consultant_id: 'c-1', proposed_rate_cents: '65000' },
          { consultant_id: 'c-2', proposed_rate_cents: '65000' },
        ])
        .mockResolvedValueOnce([{ consultant_id: 'c-1' }, { consultant_id: 'c-1' }])
      const view = await service.buildForProject('proj-1', WS)
      const team = view?.outline.sections.find(section => section.key === 'team')
      expect(team?.content).toContain('A. Martin — Kubernetes · déjà présenté ailleurs (2)')
    })
  })

  it('ne compte comme exigence ouverte que ce que la règle de conformité compte', async () => {
    const { service } = makeService()
    const view = await service.buildForProject('proj-1', WS)
    const risks = view?.outline.sections.find(section => section.key === 'risks')?.content ?? []

    expect(risks).toContain('Exigence non couverte : ISO 27001')
    // `informative` n'engage à rien ; `validated` est répondu. Ni l'un ni
    // l'autre n'est un manque (`computeRfpCompliance`).
    expect(risks.join(' ')).not.toContain('Présentation du groupe')
    expect(risks.join(' ')).not.toContain('RGPD')
  })
})
