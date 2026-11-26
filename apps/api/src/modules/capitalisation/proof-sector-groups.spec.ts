import { CapitalisationService } from './capitalisation.service'

// #3181.2 (épopée #3247) — les secteurs où l'espace possède une preuve, en vocabulaire fermé.
describe('CapitalisationService.proofSectorGroups', () => {
  const build = (rows: { id: string; sector: string | null }[]) => {
    const service = Object.create(CapitalisationService.prototype) as CapitalisationService
    ;(service as unknown as { proofs: { find: jest.Mock } }).proofs = { find: jest.fn().mockResolvedValue(rows) }
    return service
  }

  it('range les secteurs lisibles en groupes, compte le reste à part', async () => {
    const service = build([
      { id: '1', sector: 'Banque' },
      { id: '2', sector: 'Assurance & mutuelles' },
      { id: '3', sector: 'Secteur exotique' },
      { id: '4', sector: null },
    ])

    expect(await service.proofSectorGroups('w-1')).toEqual({ groups: ['finance'], unclassified: 1 })
  })
})
