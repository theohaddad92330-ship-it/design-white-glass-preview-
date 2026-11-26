import { describe, expect, it } from 'vitest'
import { TIMESHEET_STATUSES } from '@bellum/contracts'
import { TIMESHEET_SPLIT_GROUPS, timesheetSplit, type TimesheetSummary } from './finance-timesheet-split'

const summary = (over: Partial<TimesheetSummary> = {}): TimesheetSummary => ({
  total: 0,
  awaiting: 0,
  submitted: 0,
  validated: 0,
  disputed: 0,
  rejected: 0,
  notRequired: 0,
  ...over,
})

describe('la répartition des relevés — trois teintes, pas quatre', () => {
  it('fond « à saisir » et « à valider » : deux étapes du même « pas fini »', () => {
    // C'est la correction que l'annexe apporte à sa propre variante 6.
    const split = timesheetSplit(summary({ total: 10, awaiting: 4, submitted: 3, validated: 3 }))
    expect(split.bands.map(band => band.group)).toEqual(['validated', 'pending', 'conflict'])
    expect(split.bands.find(band => band.group === 'pending')?.count).toBe(7)
  })

  it('un relevé RENVOYÉ pèse comme un litige — c’est un refus, pas un brouillon', () => {
    const split = timesheetSplit(summary({ total: 6, validated: 3, disputed: 2, rejected: 1 }))
    expect(split.bands.find(band => band.group === 'conflict')?.count).toBe(3)
  })

  it('sort les relevés NON ATTENDUS du dénominateur, et les NOMME', () => {
    // Le forfait n'attend aucun relevé : le compter en attente inventerait un
    // retard, et le garder au dénominateur ferait baisser la part de « validé »
    // sans que rien n'aille mal.
    const split = timesheetSplit(summary({ total: 12, validated: 6, awaiting: 2, notRequired: 4 }))
    expect(split.measured).toBe(8)
    expect(split.notRequired).toBe(4)
    expect(split.bands.find(band => band.group === 'validated')?.share).toBe(75)
  })

  it('un relevé EN RETARD (mois clos, rien reçu — #2196.6) reste dans « pas fini »', () => {
    // Le serveur le compte à part d'`awaiting` depuis #2196.6 : sans cette
    // ligne, il tombait dans `unclassified` et la barre ne faisait plus 100 %.
    const split = timesheetSplit(summary({ total: 5, awaiting: 1, late: 2, validated: 2 }))
    expect(split.bands.find(band => band.group === 'pending')?.count).toBe(3)
    expect(split.unclassified).toBe(0)
  })

  it('un relevé ESCALADÉ (#2196.24) reste dans « pas fini » — il attend toujours son dépôt', () => {
    const split = timesheetSplit(summary({ total: 4, escalated: 1, submitted: 1, validated: 2 }))
    expect(split.bands.find(band => band.group === 'pending')?.count).toBe(2)
    expect(split.unclassified).toBe(0)
  })
})

describe('ce que la répartition refuse de dire', () => {
  it('AUCUNE part quand rien n’est mesuré — jamais « 0 % validé »', () => {
    const split = timesheetSplit(summary({ total: 3, notRequired: 3 }))
    expect(split.measured).toBe(0)
    for (const band of split.bands) expect(band.share).toBeNull()
  })

  it('une lecture ABSENTE ne fabrique aucune répartition', () => {
    const split = timesheetSplit(null)
    expect(split.measured).toBe(0)
    expect(split.bands.every(band => band.count === 0 && band.share === null)).toBe(true)
  })

  it('un compteur illisible vaut zéro compté, jamais un `NaN` à l’écran', () => {
    const split = timesheetSplit({ ...summary({ total: 4, validated: 4 }), awaiting: Number.NaN })
    expect(split.bands.find(band => band.group === 'validated')?.share).toBe(100)
  })

  it('un total INFÉRIEUR à la somme des groupes ne rend pas un « non classé » négatif', () => {
    const split = timesheetSplit(summary({ total: 1, validated: 5 }))
    expect(split.unclassified).toBe(0)
  })
})

describe('la garde LIT le modèle — un neuvième statut se verrait', () => {
  it('les neuf statuts du modèle sont couverts par les trois groupes, `not_required` mis à part', () => {
    // Ce test est le seul lien entre l'énumération du contrat et ce regroupement.
    // Sans lui, ajouter un statut au modèle laisserait cette répartition muette
    // dessus — il tomberait dans `unclassified` sans que personne ne le sache.
    expect([...TIMESHEET_STATUSES]).toEqual([
      'draft',
      'submitted',
      'validated',
      'disputed',
      'expected',
      'missing',
      'not_required',
      'rejected',
      'escalated',
    ])
    expect(TIMESHEET_SPLIT_GROUPS.length).toBe(3)
  })

  it('un statut NON CLASSÉ se voit dans le total, il ne disparaît pas', () => {
    // Le serveur compte 10, les trois groupes n'en reconnaissent que 7 : les 3
    // restants s'affichent. Une répartition dont les parts ne font pas 100 %
    // doit dire pourquoi.
    const split = timesheetSplit(summary({ total: 10, validated: 4, awaiting: 3 }))
    expect(split.unclassified).toBe(3)
  })
})
