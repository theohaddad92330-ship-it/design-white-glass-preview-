import type { OutgoingPayment } from '@bellum/contracts'
import { outgoingPaymentsToCsv } from './outgoing-payments-export'

const NOW = new Date('2026-07-20T12:00:00.000Z')

function payment(over: Partial<OutgoingPayment> = {}): OutgoingPayment {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    missionId: '22222222-2222-4222-8222-222222222222',
    missionLabel: 'Renfort exploitation',
    accountId: '33333333-3333-4333-8333-333333333333',
    accountName: 'NOVA LOGISTIQUE',
    consultantId: '44444444-4444-4444-8444-444444444444',
    consultantName: 'Salomé Dufour',
    consultantTitle: 'Data Engineer',
    periodMonth: '2026-07-01',
    status: 'valide',
    payableAmountCents: 1_497_300,
    settledAmountCents: null,
    supplierInvoiceId: '55555555-5555-4555-8555-555555555555',
    supplierInvoiceReference: 'F-2026-0714',
    timesheetValidatedAt: '2026-07-14T09:00:00.000Z',
    timesheetDays: 18,
    scheduledOn: '2026-07-15',
    paidOn: null,
    remindersSent: 0,
    lastReminderAt: null,
    validatedAt: '2026-07-10T09:00:00.000Z',
    rejectedAt: null,
    rejectionReason: null,
    ...over,
  }
}

/** Le BOM, en ÉCHAPPEMENT — un U+FEFF littéral est un espace invisible que le
 *  linter refuse, et qu'une fusion perdrait sans que personne ne le voie. */
const BOM = '\uFEFF'

/** Les cellules d'une ligne, BOM et retours chariot retirés. */
function cells(csv: string, line: number): string[] {
  const body = csv.startsWith(BOM) ? csv.slice(BOM.length) : csv
  return body.split('\r\n')[line]?.split(';') ?? []
}

describe('l’export CSV des paiements sortants', () => {
  it('commence par un BOM — sans lui, un tableur ouvre « Salomé » en « SalomÃ© »', () => {
    expect(outgoingPaymentsToCsv([payment()], NOW).startsWith(BOM)).toBe(true)
  })

  it('sépare au point-virgule et termine chaque ligne par CRLF', () => {
    const csv = outgoingPaymentsToCsv([payment()], NOW)
    expect(csv).toContain('\r\n')
    expect(cells(csv, 0)[0]).toBe('Consultant')
  })

  it('écrit les montants en euros, virgule décimale', () => {
    expect(cells(outgoingPaymentsToCsv([payment()], NOW), 1)[8]).toBe('14973,00')
  })

  it('laisse la case VIDE — jamais « 0,00 » — quand le montant est inconnu', () => {
    // Un tableur additionne une colonne de montants. Un `0` à la place d'une
    // absence produit une somme fausse que personne ne relit.
    const csv = outgoingPaymentsToCsv([payment({ payableAmountCents: null })], NOW)
    expect(cells(csv, 1)[8]).toBe('')
  })

  it('laisse la case VIDE — jamais « 0 » — quand aucun relevé n’existe', () => {
    const csv = outgoingPaymentsToCsv([payment({ timesheetDays: null })], NOW)
    expect(cells(csv, 1)[6]).toBe('')
  })

  it('écrit le retard avec la MÊME fonction que l’écran', () => {
    // Un export qui produirait un autre chiffre que l'écran ferait douter des
    // deux. Le 20/07 pour une date prévue au 15/07 : cinq jours.
    expect(cells(outgoingPaymentsToCsv([payment()], NOW), 1)[13]).toBe('5')
  })

  it('n’écrit AUCUN retard sur un paiement sorti, ni sur une date non échue', () => {
    const settled = payment({ status: 'paye', paidOn: '2026-07-16', settledAmountCents: 1_497_300 })
    expect(cells(outgoingPaymentsToCsv([settled], NOW), 1)[13]).toBe('')
    expect(cells(outgoingPaymentsToCsv([payment({ scheduledOn: '2026-07-30' })], NOW), 1)[13]).toBe('')
  })

  it('écrit « 0 » relance — ici, zéro est une VRAIE valeur', () => {
    expect(cells(outgoingPaymentsToCsv([payment()], NOW), 1)[14]).toBe('0')
  })

  it('échappe un point-virgule dans un nom plutôt que de décaler toute la ligne', () => {
    const csv = outgoingPaymentsToCsv([payment({ accountName: 'NOVA; LOGISTIQUE' })], NOW)
    expect(cells(csv, 1)[2]).toBe('"NOVA')
    expect(csv).toContain('"NOVA; LOGISTIQUE"')
  })

  it('ne porte AUCUNE colonne bancaire — ce n’est pas un fichier de virement', () => {
    // Bellum SUIT le paiement, il ne le déclenche pas : ce fichier ne peut pas
    // être ouvert dans un outil bancaire, et c'est voulu.
    const header = outgoingPaymentsToCsv([payment()], NOW).split('\r\n')[0] ?? ''
    expect(/iban|bic|rib|swift|domiciliation/i.test(header)).toBe(false)
  })

  it('rend son entête même sur une liste vide — un fichier nu ne dit pas ce qu’il a lu', () => {
    expect(cells(outgoingPaymentsToCsv([], NOW), 0)).toHaveLength(15)
  })
})
