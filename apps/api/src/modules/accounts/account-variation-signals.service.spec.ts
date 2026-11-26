import { variationInputFromRecords, AccountVariationSignalsService } from './account-variation-signals.service'

const NOW = new Date('2026-10-15T12:00:00Z')

describe('variationInputFromRecords (#3920.10)', () => {
  it('lit les dates des signaux de recrutement et de marché public, ignore le reste', () => {
    const input = variationInputFromRecords(
      [
        { type: 'recrutement', date: '2026-10-01' },
        { type: 'recrutement', date: 'bientôt' },
        { type: 'marche_public', date: '2026-03-01' },
        { type: 'budget', date: '2026-09-01' },
      ],
      [],
      'Acme',
    )
    expect(input.jobOfferDates).toEqual(['2026-10-01'])
    expect(input.publicAwardDates).toEqual(['2026-03-01'])
  })

  it('aucune date lisible = source non lue (null), jamais une liste vide qui se lirait « zéro »', () => {
    const input = variationInputFromRecords([{ type: 'recrutement', date: null }], [], 'Acme')
    expect(input.jobOfferDates).toBeNull()
    expect(input.publicAwardDates).toBeNull()
    expect(input.itDecisionMakerMoveDates).toBeNull()
    expect(input.headcountObservations).toBeNull()
  })

  it('#3920.9 — les relevés Sirene deviennent des observations d’effectif (borne basse de tranche)', () => {
    const input = variationInputFromRecords([], [], 'Acme', [
      { observedOn: '2026-04-20', headcountRange: '12' },
      { observedOn: '2026-10-10', headcountRange: '21' },
    ])
    expect(input.headcountObservations).toEqual([
      { date: '2026-04-20', headcount: 20 },
      { date: '2026-10-10', headcount: 50 },
    ])
  })

  it('#3920.9 — tranche absente, NN ou « 0 salarié » : hors dénominateur, jamais un 0', () => {
    const input = variationInputFromRecords([], [], 'Acme', [
      { observedOn: '2026-04-20', headcountRange: null },
      { observedOn: '2026-05-20', headcountRange: 'NN' },
      { observedOn: '2026-06-20', headcountRange: '00' },
    ])
    expect(input.headcountObservations).toBeNull()
  })

  it('dossier absent ou illisible : tout est non lu', () => {
    expect(variationInputFromRecords(undefined, [], 'Acme').jobOfferDates).toBeNull()
  })
})

describe('AccountVariationSignalsService', () => {
  it('rend les quatre signaux, dont les non mesurés, et null hors espace', async () => {
    const accounts = { findOne: jest.fn() }
    const contacts = { find: jest.fn().mockResolvedValue([]) }
    const service = new AccountVariationSignalsService(accounts as never, contacts as never)
    accounts.findOne.mockResolvedValueOnce(null)
    expect(await service.signalsFor('a', 'w', NOW)).toBeNull()
    accounts.findOne.mockResolvedValueOnce({
      id: 'a',
      company_name: 'Acme',
      recent_signals: [{ type: 'recrutement', date: '2026-10-10' }],
    })
    const r = await service.signalsFor('a', 'w', NOW)
    expect(r?.map(s => s.key)).toEqual(['job_offers_mom', 'headcount_6m', 'public_awards_12m', 'it_moves_6m'])
    expect(r?.[0]).toMatchObject({ status: 'measured', current: 1 })
    expect(r?.[1]).toMatchObject({ status: 'not_measured', reason: 'no_history' })
    expect(accounts.findOne).toHaveBeenCalledWith({ where: { id: 'a', workspace_id: 'w' } })
  })
})

describe('AccountVariationSignalsService — relevés Sirene (#3920.9)', () => {
  it('lit sirene_snapshots du SIREN du compte et mesure la variation sur six mois', async () => {
    const accounts = {
      findOne: jest.fn().mockResolvedValue({ id: 'a', company_name: 'Acme', siren: '552081317', recent_signals: [] }),
    }
    const contacts = { find: jest.fn().mockResolvedValue([]) }
    const snapshots = {
      find: jest.fn().mockResolvedValue([
        { observed_on: '2026-04-15', headcount_range: '12' },
        { observed_on: '2026-10-10', headcount_range: '21' },
      ]),
    }
    const service = new AccountVariationSignalsService(accounts as never, contacts as never, snapshots as never)
    const r = await service.signalsFor('a', 'w', NOW)
    expect(snapshots.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ siren: '552081317' }) }),
    )
    expect(r?.[1]).toMatchObject({ key: 'headcount_6m', status: 'measured', current: 50, previous: 20 })
  })

  it('compte sans SIREN ou module de relevés absent : « non mesuré », aucune lecture', async () => {
    const accounts = {
      findOne: jest.fn().mockResolvedValue({ id: 'a', company_name: 'Acme', siren: null, recent_signals: [] }),
    }
    const contacts = { find: jest.fn().mockResolvedValue([]) }
    const snapshots = { find: jest.fn() }
    const withSnap = new AccountVariationSignalsService(accounts as never, contacts as never, snapshots as never)
    expect((await withSnap.signalsFor('a', 'w', NOW))?.[1]).toMatchObject({ status: 'not_measured' })
    expect(snapshots.find).not.toHaveBeenCalled()
    const without = new AccountVariationSignalsService(accounts as never, contacts as never)
    expect((await without.signalsFor('a', 'w', NOW))?.[1]).toMatchObject({ status: 'not_measured' })
  })
})

describe('Marchés publics gagnés — le compteur lit la même source que la liste (#3915.30)', () => {
  it('un marché attribué daté (awarded_contracts) compte, même sans signal marche_public', () => {
    const input = variationInputFromRecords([], [], 'Thales', [], {
      frozenAwardDates: ['2026-09-01'],
    })
    expect(input.publicAwardDates).toEqual(['2026-09-01'])
  })

  it('les annonces DECP relues en continu comptent aussi, sans doublon avec le figé', () => {
    const input = variationInputFromRecords([{ type: 'marche_public', date: '2026-09-01' }], [], 'Thales', [], {
      frozenAwardDates: ['2026-09-01'],
      registryAwardDates: ['2026-09-01', '2026-07-14'],
    })
    expect(input.publicAwardDates).toEqual(['2026-09-01', '2026-07-14'])
  })

  it('aucune attribution datée nulle part : null (« non mesuré »)', () => {
    expect(variationInputFromRecords([], [], 'Thales', [], { frozenAwardDates: [] }).publicAwardDates).toBeNull()
  })

  it('le service mesure Thales : attribution du 01/09/2026 dans les 12 mois', async () => {
    const accounts = {
      findOne: jest.fn().mockResolvedValue({
        id: 'a',
        company_name: 'Thales',
        siren: '552059024',
        recent_signals: [],
        raw_analysis: { awarded_contracts: [{ title: 'Marché X', notified_date: '2026-09-01' }] },
      }),
    }
    const contacts = { find: jest.fn().mockResolvedValue([]) }
    const service = new AccountVariationSignalsService(accounts as never, contacts as never)
    const r = await service.signalsFor('a', 'w', NOW)
    expect(r?.[2]).toMatchObject({ key: 'public_awards_12m', status: 'measured', current: 1 })
  })
})
