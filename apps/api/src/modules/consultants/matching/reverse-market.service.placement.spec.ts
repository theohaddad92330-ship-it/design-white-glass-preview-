import { ReverseMarketService } from './reverse-market.service'

const CANDIDATE = {
  zones: ['Lyon'],
  skills: [{ term: 'Coordinateur de chantier' }, { term: 'travaux télécom' }, { term: 'pylônes' }],
  consentState: 'valid',
}

function build(offerDomain: string | undefined, opts: { demo?: boolean; zones?: string[] } = {}) {
  // La lecture des interlocuteurs connus passe par un QueryBuilder (pas de SQL brut sur `contacts`, GA-405).
  const contactRows = jest.fn().mockResolvedValue([])
  const qb: Record<string, jest.Mock> = {}
  for (const name of ['innerJoin', 'select', 'where', 'andWhere', 'orderBy']) qb[name] = jest.fn().mockReturnValue(qb)
  qb.getRawMany = contactRows
  const manager = { query: jest.fn().mockResolvedValue([]), getRepository: () => ({ createQueryBuilder: () => qb }) }
  const snapshots = { manager }
  const directory = { manager }
  const matching = {
    loadCandidates: jest.fn().mockResolvedValue([{ ...CANDIDATE, zones: opts.zones ?? CANDIDATE.zones }]),
  }
  const workspaceContext = { isDemoWorkspace: jest.fn().mockResolvedValue(opts.demo ?? false) }
  const settings = { maxRecruitersShownFor: jest.fn().mockResolvedValue(10) }
  const ia = {
    discoverSignals: jest.fn().mockResolvedValue({
      candidates: [
        {
          name: 'Acme Travaux',
          siren: '552100554',
          department: '69',
          signals: [{ type: 'hiring', label: 'Recrutement — Conducteur de travaux', date: '2026-10-10' }],
        },
        { name: 'Sans offre', siren: '111111111', department: '69', signals: [] },
      ],
    }),
  }
  const reader = { resolveProfileData: jest.fn().mockResolvedValue({ offerDomain }) }
  const service = new ReverseMarketService(
    matching as never,
    snapshots as never,
    directory as never,
    workspaceContext as never,
    settings as never,
    ia as never,
    reader as never,
  )
  return { service, manager, ia, reader, contactRows }
}

describe('LUD.4 — « Où placer ce profil ? » pour un CV non-IT', () => {
  it('un espace industriel : entreprises cibles du métier, sans technologie ni relevé IT', async () => {
    const { service, ia, contactRows } = build('industrial_engineering')
    contactRows.mockResolvedValueOnce([{ siren: '552100554', full_name: 'Jeanne Dupont', title: 'DRH' }])

    const out = await service.forTalent('c1', 'w1', 'u1')

    expect(ia.discoverSignals).toHaveBeenCalledTimes(1)
    const call = ia.discoverSignals.mock.calls[0][0]
    expect(call.filters).toMatchObject({ city: 'Lyon', sources: ['hiring'] })
    expect(call.filters.keywords).toBeUndefined() // aucune technologie dans la demande
    expect(call.profileData).toEqual({
      offerDomain: 'industrial_engineering',
      placedRoles: ['Coordinateur de chantier', 'travaux télécom', 'pylônes'],
    })
    expect(out?.demand).toEqual([])
    expect(out?.recruiters).toEqual([])
    expect(out?.unavailableReason).toBeNull()
    expect(out?.placementTargets?.searched).toEqual({
      roles: ['Coordinateur de chantier', 'travaux télécom', 'pylônes'],
      zones: ['Lyon'],
      offerDomain: 'industrial_engineering',
    })
    expect(out?.placementTargets?.companies).toEqual([
      {
        name: 'Acme Travaux',
        siren: '552100554',
        department: '69',
        offers: [{ label: 'Recrutement — Conducteur de travaux', date: '2026-10-10', url: null }],
        knownContacts: [{ name: 'Jeanne Dupont', title: 'DRH' }],
      },
    ])
  })

  it('rien trouvé : le dit en nommant le métier et la zone cherchés', async () => {
    const { service, ia } = build('industrial_engineering')
    ia.discoverSignals.mockResolvedValue({ candidates: [] })
    const out = await service.forTalent('c1', 'w1', 'u1')
    expect(out?.placementTargets?.companies).toEqual([])
    expect(out?.placementTargets?.searched.zones).toEqual(['Lyon'])
    expect(out?.placementTargets?.searched.roles).toContain('Coordinateur de chantier')
  })

  it('un espace IT : lecture d’avant, aucun appel aux signaux, pas de placementTargets', async () => {
    const { service, ia } = build('esn_it')
    const out = await service.forTalent('c1', 'w1', 'u1')
    expect(ia.discoverSignals).not.toHaveBeenCalled()
    expect(out?.placementTargets).toBeUndefined()
  })

  it('LUD.7 — la salle de démonstration garde ses relevés semés : aucun appel live', async () => {
    const { service, ia } = build('industrial_engineering', { demo: true })
    const out = await service.forTalent('c1', 'w1', 'u1')
    expect(ia.discoverSignals).not.toHaveBeenCalled()
    expect(out?.placementTargets).toBeUndefined()
  })

  it('un profil illisible retombe sur la lecture d’avant', async () => {
    const { service, ia, reader } = build('industrial_engineering')
    reader.resolveProfileData.mockRejectedValue(new Error('boom'))
    const out = await service.forTalent('c1', 'w1', 'u1')
    expect(ia.discoverSignals).not.toHaveBeenCalled()
    expect(out?.placementTargets).toBeUndefined()
  })
})
