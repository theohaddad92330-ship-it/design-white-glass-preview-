import type { InvoiceReadiness } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { financeAlerts } from './finance-alerts'

/**
 * La bande du bas de l'écran Finance — ce que le dossier du 26/08 retient des
 * neuf variantes, et ce qu'il en rejette.
 *
 * Retenu (variante 6) : « des alertes avec leur montant et un lien. 67 factures
 * manquantes · 98 420 € · voir. C'est la seule variante qui transforme un
 * chiffre en file de travail. »
 *
 * Rejeté : le journal d'activité récente (« un journal ne fait prendre aucune
 * décision »), les actions IA suggérées (« elle mélange des sujets commerciaux
 * sur un écran finance »), la bannière marketing et l'invitation permanente à
 * Laura (« Laura se tait quand elle n'a rien à dire »).
 *
 * Et la correction que la source apporte à sa propre variante : « ces alertes
 * reprennent exactement les compteurs du bloc au-dessus. → Le bloc dit l'état,
 * la bande dit ce que je fais aujourd'hui — triée par gravité, cinq maximum, et
 * elle annonce ce qu'elle replie. »
 */
function row(over: Partial<InvoiceReadiness> = {}): InvoiceReadiness {
  return {
    missionId: '11111111-1111-4111-8111-111111111111',
    missionLabel: null,
    accountId: null,
    accountName: null,
    periodMonth: '2026-07-01',
    state: 'blocked',
    blockers: [],
    days: null,
    preparedAmountCents: null,
    invoicedAt: null,
    invoiceReference: null,
    invoicedAmountCents: null,
    dueOn: null,
    remindersSent: 0,
    // ⚠️ Les trois champs du LITIGE, ajoutés au contrat par un lot parallèle le
    // 27/08. Une fixture qui les oublie ne compile plus — et c'est voulu : un
    // litige omis ferait passer un test sur un cas qui n'existe pas.
    disputedAt: null,
    disputeReason: null,
    disputeResolvedAt: null,
    lastReminderAt: null,
    paidAt: null,
    paidAmountCents: null,
    ...over,
  }
}

describe('financeAlerts', () => {
  it('groupe par bloqueur, compte les missions et somme les montants', () => {
    const { shown } = financeAlerts([
      row({ blockers: ['missing_timesheet'], preparedAmountCents: 50_000_00 }),
      row({ blockers: ['missing_timesheet'], preparedAmountCents: 48_420_00 }),
    ])

    expect(shown).toEqual([
      {
        blocker: 'missing_timesheet',
        missions: 2,
        amountCents: 98_420_00,
        withoutAmount: 0,
        route: '/missions/cra',
        action: 'open_timesheet',
      },
    ])
  })

  it('classe par GRAVITÉ, pas par volume — la liste fermée porte déjà cet ordre', () => {
    const { shown } = financeAlerts([
      row({ blockers: ['unexplained_gap'] }),
      row({ blockers: ['unexplained_gap'] }),
      row({ blockers: ['unexplained_gap'] }),
      row({ blockers: ['missing_timesheet'] }),
    ])

    // Trois écarts inexpliqués contre un relevé manquant : c'est quand même le
    // relevé manquant qui passe devant. Il ne se signale nulle part, et c'est
    // lui qui fait passer un mois entier.
    expect(shown.map(entry => entry.blocker)).toEqual(['missing_timesheet', 'unexplained_gap'])
  })

  it('ne rend JAMAIS « 0 € » quand aucune ligne du groupe ne porte de montant', () => {
    const { shown } = financeAlerts([row({ blockers: ['missing_rate'] }), row({ blockers: ['missing_rate'] })])

    // Un TJM absent, c'est justement le bloqueur : le montant ne peut pas
    // exister. « 0 € » se lirait « il n'y a rien à facturer ».
    expect(shown[0]?.amountCents).toBeNull()
    expect(shown[0]?.withoutAmount).toBe(2)
  })

  it('compte les lignes sans montant — un total partiel est un plancher, et il le dit', () => {
    const { shown } = financeAlerts([
      row({ blockers: ['missing_po'], preparedAmountCents: 12_000_00 }),
      row({ blockers: ['missing_po'], preparedAmountCents: null }),
    ])

    expect(shown[0]).toMatchObject({ amountCents: 12_000_00, withoutAmount: 1, missions: 2 })
  })

  it('une mission bloquée par trois choses entre dans les trois files', () => {
    const { shown } = financeAlerts([
      row({ blockers: ['missing_timesheet', 'missing_po', 'missing_billing_contact'], preparedAmountCents: 9_000_00 }),
    ])

    // Ce sont trois gestes différents, sur trois écrans différents. Les fondre
    // en une seule ligne « 1 mission bloquée » ne dirait pas quoi faire — et
    // les montants ne s'additionnent jamais ENTRE files, c'est le même argent
    // vu sous trois empêchements.
    expect(shown).toHaveLength(3)
    expect(shown.every(entry => entry.amountCents === 9_000_00)).toBe(true)
  })

  it('montre cinq lignes au maximum et ANNONCE ce qu’elle replie', () => {
    const { shown, hidden } = financeAlerts([
      row({ blockers: ['missing_timesheet'] }),
      row({ blockers: ['timesheet_not_submitted'] }),
      row({ blockers: ['timesheet_not_validated'] }),
      row({ blockers: ['timesheet_disputed'] }),
      row({ blockers: ['timesheet_anomalies'] }),
      row({ blockers: ['missing_rate'] }),
      row({ blockers: ['missing_po'] }),
    ])

    expect(shown).toHaveLength(5)
    // Replier en silence, c'est perdre deux files de travail sans que personne
    // ne puisse le savoir.
    expect(hidden).toBe(2)
  })

  it('ignore ce qui ne bloque pas — un mois prêt, facturé ou non dû n’est pas du travail', () => {
    const { shown, hidden } = financeAlerts([
      row({ state: 'ready', blockers: [] }),
      row({ state: 'invoiced', blockers: [] }),
      row({ state: 'not_due', blockers: [] }),
    ])

    expect(shown).toEqual([])
    expect(hidden).toBe(0)
  })

  it('un bloqueur inconnu d’un client plus ancien n’est pas jeté en silence', () => {
    // Le serveur peut nommer un bloqueur que ce navigateur ne connaît pas
    // encore. Le jeter ferait disparaître du travail réel ; il passe donc en
    // dernier — on ne peut pas prétendre connaître sa gravité.
    const { shown } = financeAlerts([
      row({ blockers: ['un_bloqueur_futur' as never] }),
      row({ blockers: ['missing_timesheet'] }),
    ])

    expect(shown.map(entry => entry.blocker)).toEqual(['missing_timesheet', 'un_bloqueur_futur'])
    expect(shown[1]?.route).toBeNull()
  })
})
