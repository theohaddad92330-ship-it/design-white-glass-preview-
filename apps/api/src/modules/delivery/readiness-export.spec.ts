import type { InvoiceReadiness } from '@bellum/contracts'
import { readinessToCsv, collectionsToCsv } from './readiness-export'

const row = (over: Partial<InvoiceReadiness> = {}): InvoiceReadiness => ({
  missionId: '11111111-1111-1111-1111-111111111111',
  missionLabel: 'Renfort plateforme',
  accountId: null,
  accountName: 'ACME',
  periodMonth: '2026-07-01',
  state: 'ready',
  blockers: [],
  days: 18.5,
  preparedAmountCents: 1_202_500,
  invoicedAt: null,
  invoiceReference: null,
  invoicedAmountCents: null,
  dueOn: null,
  remindersSent: 0,
  lastReminderAt: null,
  paidAt: null,
  paidAmountCents: null,
  disputedAt: null,
  disputeReason: null,
  disputeResolvedAt: null,
  ...over,
})

describe('l’export « prêt à facturer »', () => {
  it('sort en point-virgule, avec un BOM — sinon Excel FR met tout dans la colonne A', () => {
    const csv = readinessToCsv([row()])
    // Le BOM est nommé par son POINT DE CODE et non écrit en caractère : un
    // `startsWith('\uFEFF')` littéral se lit `startsWith('')` dans une revue,
    // et personne ne peut voir qu'il a disparu le jour où il disparaîtra.
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    // Une seule fois, et en TÊTE : un second BOM au milieu du fichier
    // s'afficherait comme un caractère parasite dans la cellule.
    expect(csv.indexOf('\uFEFF', 1)).toBe(-1)
    expect(csv.split('\r\n')[0]).toContain('"Compte";"Mission"')
  })

  it('écrit les montants en EUROS avec une virgule, pas en centimes', () => {
    // « 1202500 » dans une colonne « montant » se lit comme un million.
    expect(readinessToCsv([row()])).toContain('"12025,00"')
  })

  /**
   * Le 500 de production du 01/09/2026 : `GET .../export.csv?month=2026-07`
   * répondait « Internal server error » dès qu'un mois portait une ÉCHÉANCE.
   * `due_on` est une colonne `date` ; en requête brute, `pg` en rendait un
   * objet `Date`, et la cellule appelait `.replace()` dessus.
   *
   * Le parseur de `pg-date.ts` ferme la cause à la source. Ce test-ci ferme la
   * conséquence : l'export ne doit pas tomber sur une valeur qui n'est pas une
   * chaîne, quelle que soit la porte par laquelle elle est entrée.
   */
  it('n’explose pas sur une échéance rendue en objet par le pilote SQL', () => {
    const csv = readinessToCsv([row({ dueOn: new Date(2026, 7, 25) as unknown as string })])
    expect(csv).toContain('2026-08-25')
  })

  it('laisse une cellule VIDE plutôt que d’écrire « N/A »', () => {
    // Écrire « N/A » y met une donnée, et quelqu'un finira par la lire comme
    // telle.
    const csv = readinessToCsv([row({ preparedAmountCents: null, days: null })])
    expect(csv).not.toContain('N/A')
    expect(csv).toContain(';;')
  })

  it('cite tout, pour qu’un point-virgule dans un nom ne casse pas la ligne', () => {
    const csv = readinessToCsv([row({ accountName: 'ACME; filiale' })])
    expect(csv).toContain('"ACME; filiale"')
    // Une ligne d'en-tête et une ligne de données, pas trois.
    expect(csv.trimEnd().split('\r\n')).toHaveLength(2)
  })

  it('double les guillemets d’un libellé qui en contient', () => {
    expect(readinessToCsv([row({ missionLabel: 'Mission « Phoenix »' })])).toContain('Mission « Phoenix »')
    expect(readinessToCsv([row({ missionLabel: 'Le "run"' })])).toContain('"Le ""run"""')
  })

  it('liste les bloqueurs dans UNE cellule', () => {
    const csv = readinessToCsv([row({ state: 'blocked', blockers: ['missing_timesheet', 'missing_rate'] })])
    expect(csv).toContain('"missing_timesheet, missing_rate"')
  })

  // #2197.41 — l'export est un des endroits où la valeur voyage : un
  // « déclaré facturé » doit s'y distinguer d'un « facturé » PROUVÉ, et QUI
  // l'a déclaré doit s'y lire — sinon un comptable qui ouvre ce fichier croit
  // tenir une preuve là où il n'a qu'une déclaration.
  describe('#2197.41 — le déclaré facturé porte sa source', () => {
    it('sort l’état brut `invoiced_declared`, distinct de `invoiced`', () => {
      const csv = readinessToCsv([row({ state: 'invoiced_declared' })])
      expect(csv).toContain(';"invoiced_declared";')
      expect(csv).not.toContain(';"invoiced";')
    })

    it('ajoute une colonne « Déclaré par », vide sur une ligne PROUVÉE ou non facturée', () => {
      const csv = readinessToCsv([row({ state: 'ready' })])
      expect(csv.split('\r\n')[0]).toContain('"Déclaré par"')
      // La colonne existe mais reste VIDE : ni "N/A", ni un nom deviné.
      expect(csv).toContain(';;\r\n')
    })

    it('remplit « Déclaré par » sur une ligne déclarée', () => {
      const csv = readinessToCsv([row({ state: 'invoiced_declared', invoicedByName: 'Louis Schlegel' })])
      expect(csv).toContain('"Louis Schlegel"')
    })
  })
})

// #2198.45 — l'export de l'écran « encaissements ».
describe('l’export « encaissements »', () => {
  it('sort en point-virgule, avec un BOM, et porte l’INTERLOCUTEUR', () => {
    const csv = collectionsToCsv([row({ state: 'invoiced', billingContactName: 'Camille Vasseur' })])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.split('\r\n')[0]).toContain('"Compte";"Interlocuteur";"Mission"')
    expect(csv).toContain('"Camille Vasseur"')
  })

  it('écrit facturé ET réglé, en euros — l’écart EST l’information', () => {
    const csv = collectionsToCsv([row({ state: 'invoiced', invoicedAmountCents: 1_000_000, paidAmountCents: 500_000 })])
    expect(csv).toContain('"10000,00"')
    expect(csv).toContain('"5000,00"')
  })

  it('laisse une cellule VIDE plutôt que d’écrire « N/A » sur un règlement non mesuré', () => {
    const csv = collectionsToCsv([row({ state: 'invoiced', paidAmountCents: null })])
    expect(csv).not.toContain('N/A')
  })

  it('ne recalcule AUCUN statut/retard — colonnes brutes, jamais une dérivation à part', () => {
    const csv = collectionsToCsv([row({ state: 'invoiced_declared', dueOn: '2026-08-04' })])
    expect(csv).toContain(';"invoiced_declared";')
    expect(csv).toContain('2026-08-04')
  })
})
