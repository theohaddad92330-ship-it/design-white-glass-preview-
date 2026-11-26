import { describe, expect, it } from 'vitest'
import { buildFinanceExportCsv, financeExportFilename } from './finance-export'

/**
 * L'EXPORT — manque n°5. Voir la doctrine en tête de `finance-export.ts` pour
 * pourquoi il ne recalcule rien et pourquoi une section absente ne devient
 * jamais une ligne « non mesuré ».
 */
describe('buildFinanceExportCsv', () => {
  it('exporte les quatre chiffres d’affaires, avec la même valeur que l’écran', () => {
    const csv = buildFinanceExportCsv({
      generatedAt: new Date('2026-08-30T10:00:00Z'),
      month: '2026-07',
      revenue: {
        periodMonth: '2026-07-01',
        lines: [
          { kind: 'signed', amountCents: 120_000_00, withoutAmount: 0, unavailableReason: null, sourceRows: null },
          { kind: 'produced', amountCents: null, withoutAmount: 0, unavailableReason: 'no_source', sourceRows: null },
          { kind: 'invoiced', amountCents: 41_000_00, withoutAmount: 0, unavailableReason: null, sourceRows: null },
          { kind: 'collected', amountCents: 0, withoutAmount: 0, unavailableReason: null, sourceRows: null },
        ],
      },
    })

    expect(csv).toContain('Signé')
    expect(csv).toContain('120')
    // `null` est « non mesuré », jamais un 0 ou une case vide.
    expect(csv).toContain('non mesuré')
    // Une ligne existe, elle NOMME sa raison — mais ce n'est pas cette
    // fonction qui l'expose (elle recopie `amountCents`, pas `unavailableReason`
    // en toutes lettres) : ce test garde seulement que rien n'y devient un
    // zéro fabriqué. `collected` à 0 centimes EST une mesure vraie et s'écrit.
    expect(csv).toMatch(/Encaissé.*0/)
  })

  it('porte sa date, dans le fichier — pas seulement dans son nom', () => {
    const csv = buildFinanceExportCsv({ generatedAt: new Date('2026-08-30T10:00:00Z') })
    expect(csv).toContain('30/08/2026')
  })

  it('dit la période quand elle existe, et dit qu’il n’y en a pas sinon', () => {
    const withMonth = buildFinanceExportCsv({ generatedAt: new Date('2026-08-30T10:00:00Z'), month: '2026-07' })
    expect(withMonth).toContain('2026-07')

    const withoutMonth = buildFinanceExportCsv({ generatedAt: new Date('2026-08-30T10:00:00Z') })
    expect(withoutMonth).toContain('Vue courante')
  })

  it('n’exporte AUCUNE section dont la lecture a échoué — un droit manquant ne laisse pas deviner ce qu’il y avait à voir', () => {
    const csv = buildFinanceExportCsv({
      generatedAt: new Date('2026-08-30T10:00:00Z'),
      revenue: {
        periodMonth: '2026-07-01',
        lines: [{ kind: 'signed', amountCents: 100, withoutAmount: 0, unavailableReason: null, sourceRows: null }],
      },
      // Les cinq autres blocs sont `null`/absents, comme `FinancePanel` les
      // passe quand la lecture est en erreur (droit manquant ou panne).
      margin: null,
      capacity: null,
      dso: null,
      channels: null,
      forecast: null,
    })

    expect(csv).toContain('Signé')
    expect(csv).not.toContain('Marge de l’espace')
    expect(csv).not.toContain('Délai de paiement')
    expect(csv).not.toContain('Capacité')
  })

  it('la marge non mesurée se calcule avec la MÊME fonction que l’écran, jamais une seconde formule', () => {
    const csv = buildFinanceExportCsv({
      generatedAt: new Date('2026-08-30T10:00:00Z'),
      margin: { marginPercent: 31, measured: 6, unmeasured: 4, threshold: null },
    })
    // 4 / (6 + 4) = 40 % — exactement ce que `unmeasuredShare` rend à l'écran.
    expect(csv).toMatch(/Marge non mesurée.*40 %/)
  })

  it('le taux d’intercontrat exporté est le même nombre que la pilule de l’écran', () => {
    const csv = buildFinanceExportCsv({
      generatedAt: new Date('2026-08-30T10:00:00Z'),
      capacity: {
        periodMonth: '2026-08-01',
        capacityDays: 120,
        committedDays: 100,
        availableDays: 20,
        unmeasured: 0,
        bench: { rate: 0.17, onBench: 1, measurability: { measurable: true, observed: 6, required: 5, missing: 0 } },
      },
    })
    expect(csv).toMatch(/Taux d'intercontrat.*17 %/)
  })
})

describe('financeExportFilename', () => {
  it('porte la date ET, quand elle existe, la période', () => {
    expect(financeExportFilename({ generatedAt: new Date('2026-08-30T10:00:00Z'), month: '2026-07' })).toBe(
      'finance-2026-07-2026-08-30.csv',
    )
  })

  it('reste datée même sans période sélectionnée (le cockpit)', () => {
    expect(financeExportFilename({ generatedAt: new Date('2026-08-30T10:00:00Z') })).toBe('finance-2026-08-30.csv')
  })
})
