import {
  amountInCents,
  daysOverdue,
  daysSince,
  harvestList,
  normalizeInvoice,
  normalizeSignature,
} from './admin-docs-normalize'

const NOW = new Date('2026-08-10T12:00:00.000Z')

describe('amountInCents', () => {
  it('prend le champ en centimes quand il existe', () => {
    expect(amountInCents({ amount_cents: 199_900 })).toBe(199_900)
  })

  it('convertit des euros UNE fois, en arrondissant au centime', () => {
    // Un montant en flottant qui traverse deux conversions affiche un jour
    // 1 999,99 € là où la facture dit 2 000 €.
    expect(amountInCents({ amount: 1999.995 })).toBe(200_000)
    expect(amountInCents({ total_amount: { value: 2000, currency: 'EUR' } })).toBe(200_000)
  })

  it('rend null sur un montant absent ou illisible — jamais zéro', () => {
    expect(amountInCents({})).toBeNull()
    expect(amountInCents({ amount: 'gratuit' })).toBeNull()
  })
})

describe('daysSince / daysOverdue', () => {
  it('compte les jours écoulés', () => {
    expect(daysSince('2026-08-01T12:00:00.000Z', NOW)).toBe(9)
  })

  it('un retard inconnu vaut null, pas zéro', () => {
    // « 0 jour de retard » se lit « elle vient d'échoir ».
    expect(daysOverdue(null, NOW)).toBeNull()
    expect(daysOverdue('pas une date', NOW)).toBeNull()
  })

  it('une échéance à venir donne un retard négatif', () => {
    expect(daysOverdue('2026-08-20T12:00:00.000Z', NOW)).toBe(-10)
  })
})

describe('normalizeSignature', () => {
  it('lit une demande Yousign', () => {
    const signature = normalizeSignature(
      'yousign',
      {
        id: 'sr_1',
        name: 'Contrat de prestation ACME',
        created_at: '2026-08-04T09:00:00.000Z',
        signers: [{ info: { first_name: 'Marc', last_name: 'Dupuis' } }],
      },
      NOW,
    )
    expect(signature).toMatchObject({
      id: 'sr_1',
      title: 'Contrat de prestation ACME',
      signer: 'Marc Dupuis',
      daysWaiting: 6,
    })
  })

  it('lit une enveloppe nommée autrement', () => {
    const signature = normalizeSignature(
      'docusign',
      { envelopeId: 'env-9', emailSubject: 'Avenant', sentDateTime: '2026-08-08T09:00:00.000Z' },
      NOW,
    )
    expect(signature).toMatchObject({ id: 'env-9', title: 'Avenant', daysWaiting: 2 })
  })

  it('rend null sans identifiant — rien à suivre', () => {
    expect(normalizeSignature('yousign', { name: 'Sans id' }, NOW)).toBeNull()
  })

  it('n’invente pas de signataire', () => {
    const signature = normalizeSignature('yousign', { id: 'sr_2' }, NOW)
    expect(signature?.signer).toBeNull()
    expect(signature?.daysWaiting).toBeNull()
  })
})

describe('normalizeInvoice', () => {
  it('lit une facture Qonto', () => {
    const invoice = normalizeInvoice(
      'qonto',
      {
        id: 'inv_1',
        number: 'F-2026-014',
        client: { name: 'ACME' },
        total_amount: { value: 2400, currency: 'EUR' },
        due_date: '2026-07-31',
      },
      NOW,
    )
    expect(invoice).toMatchObject({
      reference: 'F-2026-014',
      client: 'ACME',
      amountCents: 240_000,
      currency: 'EUR',
      daysOverdue: 10,
    })
  })

  it('une facture sans échéance n’est pas en retard de zéro jour', () => {
    const invoice = normalizeInvoice('tiime', { id: 'inv_2', number: 'F-2' }, NOW)
    expect(invoice?.daysOverdue).toBeNull()
    expect(invoice?.amountCents).toBeNull()
  })
})

describe('harvestList', () => {
  it('trouve la liste quel que soit son nom', () => {
    expect(harvestList({ data: [{ id: 1 }] })).toHaveLength(1)
    expect(harvestList({ invoices: [{ id: 1 }, { id: 2 }] })).toHaveLength(2)
    expect(harvestList([{ id: 1 }])).toHaveLength(1)
  })

  it('ignore une liste de chaînes — ce ne sont pas des enregistrements', () => {
    expect(harvestList({ warnings: ['quota bientôt atteint'] })).toEqual([])
  })

  it('rend une liste vide sur une réponse vide ou hostile', () => {
    expect(harvestList(null)).toEqual([])
    expect(harvestList({ error: 'unauthorized' })).toEqual([])
  })
})
