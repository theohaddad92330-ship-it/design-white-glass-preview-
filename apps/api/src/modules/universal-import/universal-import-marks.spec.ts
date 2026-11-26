import { importMarkGroups } from './universal-import-marks'

const A1 = 'a0000000-0000-4000-8000-000000000001'
const A2 = 'a0000000-0000-4000-8000-000000000002'
const C1 = 'c0000000-0000-4000-8000-000000000001'
const C2 = 'c0000000-0000-4000-8000-000000000002'

/** #4051 — quelles fiches reçoivent « Importé le … depuis <fichier> », par famille de fiche. */
describe('importMarkGroups (#4051)', () => {
  it('un fichier contacts : les contacts créés ou complétés ET les comptes créés reçoivent la trace', () => {
    expect(
      importMarkGroups({
        jobType: 'contact',
        scope: 'workspace',
        written: [C1],
        accountsWritten: [A1],
        filled: [{ id: C2, target: 'contact' }],
      }),
    ).toEqual([
      { entityType: 'account', ids: [A1] },
      { entityType: 'contact', ids: [C1, C2] },
    ])
  })

  it('un fichier de consultants : la fiche consultant porte la trace', () => {
    expect(
      importMarkGroups({ jobType: 'talent', scope: 'workspace', written: [C1], accountsWritten: [], filled: [] }),
    ).toEqual([{ entityType: 'consultant', ids: [C1] }])
  })

  it('⚠️ SAIT DIRE NON — un contact PERSONNEL n’a pas de fiche d’équipe : aucune trace', () => {
    expect(
      importMarkGroups({ jobType: 'contact', scope: 'personal', written: [C1], accountsWritten: [], filled: [] }),
    ).toEqual([])
  })

  it('⚠️ SAIT DIRE NON — un besoin n’a pas d’historique de fiche : aucune trace, jamais une famille vide', () => {
    expect(
      importMarkGroups({ jobType: 'need', scope: 'workspace', written: [C1], accountsWritten: [], filled: [] }),
    ).toEqual([])
  })

  it('une même fiche créée et complétée dans le lot ne reçoit qu’UNE trace', () => {
    expect(
      importMarkGroups({
        jobType: 'account',
        scope: 'workspace',
        written: [A1],
        accountsWritten: [],
        filled: [
          { id: A1, target: 'account' },
          { id: A2, target: 'account' },
        ],
      }),
    ).toEqual([{ entityType: 'account', ids: [A1, A2] }])
  })
})
