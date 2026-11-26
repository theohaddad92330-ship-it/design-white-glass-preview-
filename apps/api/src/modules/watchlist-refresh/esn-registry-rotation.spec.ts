import { EsnRegistryRotation, esnRereadPerNight } from './esn-registry-rotation'

// #3921.7 / #3915.15 (Louis 15/10/2026) — les ESN du référentiel se relisent PAR ROULEMENT nocturne, registre public seulement.
describe('esnRereadPerNight', () => {
  it('~30 par nuit par défaut ; 0 éteint ; une valeur illisible retombe sur le défaut', () => {
    expect(esnRereadPerNight(undefined)).toBe(30)
    expect(esnRereadPerNight('12')).toBe(12)
    expect(esnRereadPerNight('0')).toBe(0)
    expect(esnRereadPerNight('beaucoup')).toBe(30)
    expect(esnRereadPerNight('-4')).toBe(30)
    expect(esnRereadPerNight('9999')).toBe(100)
  })
})

describe('EsnRegistryRotation', () => {
  const build = (sirens: string[]) => {
    const query = jest.fn().mockResolvedValue(sirens.map(siren => ({ siren })))
    const watch = {
      collectSirene: jest.fn().mockResolvedValue({ configured: true, failed: false, openings: 0 }),
      collectBodacc: jest.fn().mockResolvedValue({ firstPass: false, failed: false, written: 0 }),
      syncEsnRisk: jest.fn().mockResolvedValue(null),
      syncEsnAwards: jest.fn().mockResolvedValue(0),
    }
    const service = new EsnRegistryRotation({ query } as never, watch as never)
    return { service, query, watch }
  }

  afterEach(() => {
    delete process.env['ESN_REGISTRY_REREAD_PER_NIGHT']
  })

  it('relit les plus anciennes d’abord (jamais relues en tête), bornées au lot de la nuit', async () => {
    const { service, query } = build([])
    await service.runNightly(new Date('2026-10-16T01:00:00Z'))
    const [sql, params] = query.mock.calls[0]!
    expect(sql).toContain('esn_directory')
    expect(sql).toContain('sirene_checked_at ASC NULLS FIRST')
    expect(sql).toContain('siren IS NOT NULL')
    expect(params).toEqual([30])
  })

  it('pour chaque SIREN : relevé Sirene, BODACC, puis le risque du référentiel — registres publics seulement', async () => {
    const { service, watch } = build(['552120222', '383474814'])
    const out = await service.runNightly(new Date('2026-10-16T01:00:00Z'))
    expect(watch.collectSirene).toHaveBeenCalledTimes(2)
    expect(watch.collectBodacc).toHaveBeenCalledWith('552120222', expect.any(Date))
    expect(watch.syncEsnRisk).toHaveBeenCalledWith('383474814', expect.any(Date))
    // #3921.10 — les marchés GAGNÉS (titulaire) sont comptés au référentiel par la même relecture.
    expect(watch.syncEsnAwards).toHaveBeenCalledWith('552120222', expect.any(Date))
    expect(watch.syncEsnAwards).toHaveBeenCalledTimes(2)
    expect(out).toEqual({ attempted: 2, failed: 0 })
  })

  it('une panne sur une ESN n’arrête pas le roulement et se compte', async () => {
    const { service, watch } = build(['552120222', '383474814'])
    watch.collectSirene.mockRejectedValueOnce(new Error('registre muet'))
    const out = await service.runNightly(new Date('2026-10-16T01:00:00Z'))
    expect(out).toEqual({ attempted: 2, failed: 1 })
    expect(watch.collectSirene).toHaveBeenCalledTimes(2)
  })

  it('SAIT DIRE NON — réglé à 0, aucune lecture et aucune requête', async () => {
    process.env['ESN_REGISTRY_REREAD_PER_NIGHT'] = '0'
    const { service, query, watch } = build(['552120222'])
    expect(await service.runNightly(new Date())).toEqual({ attempted: 0, failed: 0 })
    expect(query).not.toHaveBeenCalled()
    expect(watch.collectSirene).not.toHaveBeenCalled()
  })

  it('SAIT DIRE NON — ne lit que des SIREN valides (neuf chiffres)', async () => {
    const { service, watch } = build(['pas-un-siren', '552120222'])
    await service.runNightly(new Date())
    expect(watch.collectSirene).toHaveBeenCalledTimes(1)
  })
})
