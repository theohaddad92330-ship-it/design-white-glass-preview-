import { BadRequestException } from '@nestjs/common'
import ExcelJS from 'exceljs'
import { EsnTargetPersonasService } from './esn-target-personas.service'

/** #3754.1/.2 — réimport = remplacement de l'espace ; niveaux 1-2 → decision_maker_personas. */
function build(existingPersonas: string[] = []) {
  const manager = { delete: jest.fn(async () => undefined), insert: jest.fn(async () => undefined) }
  const dataSource = { transaction: jest.fn(async (cb: (m: typeof manager) => Promise<void>) => cb(manager)) }
  const repo = { find: jest.fn(async () => []) }
  const resolver = { resolveContext: jest.fn(async () => ({ workspaceId: 'ws-1' })) }
  const profile = {
    getAnswers: jest.fn(async () => ({ decision_maker_personas: existingPersonas })),
    upsertAnswers: jest.fn(async () => ({})),
  }
  const service = new EsnTargetPersonasService(repo as never, dataSource as never, resolver as never, profile as never)
  return { service, manager, repo, profile }
}

const CSV = 'Catégorie;Intitulé;Niveau décideur\nIT;CTO;1\nIT;DSI;2\nIT;Tech Lead;4\nIT;Dev;\n'

describe('EsnTargetPersonasService.importFile', () => {
  it('remplace l’ensemble de l’espace dans UNE transaction et rend le rapport', async () => {
    const { service, manager } = build()
    const report = await service.importFile('u1', 'csv', CSV)
    expect(manager.delete).toHaveBeenCalledWith(expect.anything(), { workspace_id: 'ws-1' })
    expect(manager.insert).toHaveBeenCalledTimes(1)
    const rows = (manager.insert.mock.calls[0] as unknown as [unknown, Array<Record<string, unknown>>])[1]
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({
      workspace_id: 'ws-1',
      user_id: 'u1',
      title: 'CTO',
      title_normalized: 'cto',
      decision_level: 1,
    })
    expect(report.imported).toBe(3)
    expect(report.rejected).toEqual([{ line: 5, reason: 'level_missing' }])
  })

  it('#3754.2 — les intitulés de niveau 1-2 rejoignent decision_maker_personas, sans écraser ni doubler', async () => {
    const { service, profile } = build(['Directeur Data', 'cto'])
    const report = await service.importFile('u1', 'csv', CSV)
    expect(profile.upsertAnswers).toHaveBeenCalledWith('u1', {
      decision_maker_personas: ['Directeur Data', 'cto', 'DSI'],
    })
    expect(report.fed_to_personas).toBe(1)
  })

  // Théo O onboarding-couverture (22/10/2026) — la V23 retire le plafond de `decision_maker_personas` : plus de coupe à cinq.
  it('plus de plafond : toutes les entrées de niveau 1-2 rejoignent la liste, rien n’est tronqué', async () => {
    const { service, profile } = build(['a', 'b', 'c', 'd'])
    const report = await service.importFile('u1', 'csv', CSV)
    const call = profile.upsertAnswers.mock.calls[0] as unknown as [string, { decision_maker_personas: string[] }]
    expect(call[1].decision_maker_personas).toEqual(['a', 'b', 'c', 'd', 'CTO', 'DSI'])
    expect(report.fed_to_personas).toBe(2)
  })

  it('colonne manquante : rien n’est remplacé, les colonnes sont nommées', async () => {
    const { service, manager } = build()
    const report = await service.importFile('u1', 'csv', 'poste;x\nCTO;1\n')
    expect(manager.delete).not.toHaveBeenCalled()
    expect(report.missing_columns).toEqual(['level'])
    expect(report.imported).toBe(0)
  })

  it('aucune ligne valide : l’existant est gardé', async () => {
    const { service, manager } = build()
    const report = await service.importFile('u1', 'csv', 'intitule;niveau\nA;\n')
    expect(manager.delete).not.toHaveBeenCalled()
    expect(report.rejected).toEqual([{ line: 2, reason: 'level_missing' }])
  })

  it('sans espace actif : refus net', async () => {
    const { service } = build()
    ;(service as unknown as { resolver: { resolveContext: jest.Mock } }).resolver.resolveContext.mockResolvedValue({
      workspaceId: null,
    })
    await expect(service.importFile('u1', 'csv', CSV)).rejects.toBeInstanceOf(BadRequestException)
  })
})

describe('EsnTargetPersonasService.importFile — #4426.4 onglet choisi', () => {
  it('lit l’onglet nommé du classeur, pas le premier', async () => {
    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet('Synthèse').addRow(['Texte libre'])
    const postes = workbook.addWorksheet('Postes')
    postes.addRow(['Intitulé', 'Niveau décideur'])
    postes.addRow(['CTO', 1])
    const content = Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64')
    const { service } = build()
    const report = await service.importFile('u1', 'xlsx', content, 'Postes')
    expect(report.imported).toBe(1)
  })
})
