import { describe, expect, it } from 'vitest'
import {
  cleDePeriode,
  compterEtats,
  ETATS_DE_LA_LEGENDE,
  lireCleDePeriode,
  moisCourt,
  moisLong,
  moisPrecedent,
  moisSuivant,
  peutAvancer,
  peutRemonter,
  phraseDeCellule,
  SYMBOLE,
} from './billing-calendar.logic'
import type { BillingCalendarCell, BillingCalendarRow } from '@/lib/billing-calendar'

/**
 * La logique PURE du calendrier de facturation (#1653).
 *
 * L'environnement de test du back-office est `node` : rien n'est mis en page,
 * donc rien ici ne mesure un rendu. Ce qui se garde ici, c'est ce que chaque
 * cellule DIT — le symbole, la phrase lue par un lecteur d'écran, la borne de
 * navigation. Ce qui se voit se recette dans le navigateur.
 */

const cellule = (over: Partial<BillingCalendarCell> = {}): BillingCalendarCell => ({
  month: '2026-09',
  months: 1,
  state: 'paid',
  window: { start: '2026-09-01', end: '2026-09-30' },
  reference: 'F-2026-009',
  invoiceAmountCents: 19_900,
  invoiceCurrency: 'EUR',
  lateDays: null,
  ...over,
})

const ligne = (over: Partial<BillingCalendarRow> = {}): BillingCalendarRow => ({
  workspaceId: 'ws-1',
  workspaceName: 'Skaizen',
  period: 'monthly',
  amountCents: 19_900,
  currency: 'EUR',
  startDate: '2026-01-01',
  commitmentEnd: null,
  periodsTotal: 9,
  derivationCapped: false,
  cells: [],
  ...over,
})

describe('les cinq états de la légende', () => {
  it('LIT quelque chose — chacun porte un symbole ET un libellé, jamais une couleur seule', () => {
    expect(ETATS_DE_LA_LEGENDE).toHaveLength(5)
    for (const etat of ETATS_DE_LA_LEGENDE) {
      expect(SYMBOLE[etat.state]).toBeTruthy()
      expect(etat.libelle.length).toBeGreaterThan(3)
    }
  })

  it('les cinq symboles de #1653, mot pour mot', () => {
    expect(SYMBOLE.paid).toBe('✓')
    expect(SYMBOLE.issued).toBe('○')
    expect(SYMBOLE.to_issue).toBe('⚠')
    expect(SYMBOLE.late).toBe('✗')
    expect(SYMBOLE.no_period).toBe('—')
  })
})

describe('phraseDeCellule — une cellule ne ment jamais', () => {
  it('émise et payée : la période, la référence, l’encaissement', () => {
    const phrase = phraseDeCellule(ligne(), cellule())
    expect(phrase).toContain('Skaizen')
    expect(phrase).toContain('01/09/2026')
    expect(phrase).toContain('30/09/2026')
    expect(phrase).toContain('F-2026-009')
    expect(phrase).toContain('encaissée')
  })

  it('émise en attente : elle n’est PAS annoncée en retard', () => {
    const phrase = phraseDeCellule(ligne(), cellule({ state: 'issued' }))
    expect(phrase).toContain('en attente')
    expect(phrase).not.toContain('retard')
  })

  it('à émettre : une période commencée, rien de plus', () => {
    const phrase = phraseDeCellule(ligne(), cellule({ state: 'to_issue', reference: null, invoiceAmountCents: null }))
    expect(phrase).toContain('à émettre')
    expect(phrase).not.toContain('retard')
  })

  it('en retard : le nombre de jours est DIT, jamais deviné', () => {
    const phrase = phraseDeCellule(ligne(), cellule({ state: 'late', reference: null, lateDays: 35 }))
    expect(phrase).toContain('en retard')
    expect(phrase).toContain('35')
  })

  it('en retard sans jours mesurés : aucune durée inventée, et surtout pas « 0 jour »', () => {
    const phrase = phraseDeCellule(ligne(), cellule({ state: 'late', reference: null, lateDays: null }))
    expect(phrase).toContain('en retard')
    expect(phrase).not.toMatch(/\b0 jour/)
  })

  it('« pas de période » n’est PAS « rien à facturer »', () => {
    const phrase = phraseDeCellule(ligne(), cellule({ state: 'no_period', window: null, reference: null }))
    expect(phrase).toContain('aucune période ne commence')
    expect(phrase).not.toContain('rien à facturer')
    expect(phrase).not.toContain('à jour')
  })

  it('une période trimestrielle dit qu’elle couvre trois mois', () => {
    const phrase = phraseDeCellule(
      ligne({ period: 'quarterly' }),
      cellule({ months: 3, window: { start: '2026-07-01', end: '2026-09-30' } }),
    )
    expect(phrase).toContain('3 mois')
  })
})

describe('les mois', () => {
  it('un mois court, en français, sans lire l’horloge ni un fuseau', () => {
    expect(moisCourt('2026-09')).toBe('sept. 26')
    expect(moisCourt('2026-01')).toBe('janv. 26')
    expect(moisCourt('2025-12')).toBe('déc. 25')
  })

  it('un mois long, pour l’entête complète', () => {
    expect(moisLong('2026-09')).toBe('septembre 2026')
  })

  it('sait dire NON à un mois illisible — le libellé brut, jamais une date inventée', () => {
    expect(moisCourt('2026-13')).toBe('2026-13')
    expect(moisCourt('n’importe quoi')).toBe('n’importe quoi')
    expect(moisLong('')).toBe('—')
  })

  it('avance et recule d’un mois, y compris par-dessus une année', () => {
    expect(moisPrecedent('2026-01')).toBe('2025-12')
    expect(moisSuivant('2025-12')).toBe('2026-01')
    expect(moisPrecedent('2026-09')).toBe('2026-08')
  })

  it('la navigation recule de DOUZE mois d’un coup, pas d’un', () => {
    expect(moisPrecedent('2026-09', 12)).toBe('2025-09')
    expect(moisSuivant('2025-09', 12)).toBe('2026-09')
  })
})

describe('les bornes de navigation — un bouton ne remonte jamais dans le vide', () => {
  const calendrier = {
    anchorMonth: '2026-09',
    currentMonth: '2026-09',
    earliestPeriodMonth: '2019-01' as string | null,
  }

  it('on peut remonter tant qu’une période existe avant la fenêtre', () => {
    expect(peutRemonter({ ...calendrier, anchorMonth: '2026-09' })).toBe(true)
  })

  it('on ne remonte pas quand la plus ancienne période est déjà dans la fenêtre', () => {
    expect(peutRemonter({ ...calendrier, anchorMonth: '2019-05', earliestPeriodMonth: '2019-01' })).toBe(false)
  })

  it('aucune période du tout : rien à remonter', () => {
    expect(peutRemonter({ ...calendrier, earliestPeriodMonth: null })).toBe(false)
  })

  it('on n’avance jamais au-delà du mois courant — le futur ne se facture pas', () => {
    expect(peutAvancer({ ...calendrier, anchorMonth: '2026-09' })).toBe(false)
    expect(peutAvancer({ ...calendrier, anchorMonth: '2026-03' })).toBe(true)
  })
})

describe('la clé d’une période — un clic ouvre LA PÉRIODE, pas la fiche client', () => {
  it('fait l’aller-retour', () => {
    const cle = cleDePeriode('ws-1', '2026-09-01')
    expect(lireCleDePeriode(cle)).toEqual({ workspaceId: 'ws-1', periodStart: '2026-09-01' })
  })

  it('sait dire NON — une clé absente, tronquée ou mal datée ne désigne rien', () => {
    expect(lireCleDePeriode(undefined)).toBeNull()
    expect(lireCleDePeriode('')).toBeNull()
    expect(lireCleDePeriode('ws-1')).toBeNull()
    expect(lireCleDePeriode('ws-1~pas-une-date')).toBeNull()
    expect(lireCleDePeriode('~2026-09-01')).toBeNull()
  })

  it('n’attrape pas ce qu’elle ne vise pas — un identifiant qui contient un tiret', () => {
    const cle = cleDePeriode('22222222-2222-4222-8222-222222222222', '2026-09-01')
    expect(lireCleDePeriode(cle)?.workspaceId).toBe('22222222-2222-4222-8222-222222222222')
  })
})

describe('compterEtats — ce que la grille résume', () => {
  it('compte par état, sur toutes les lignes', () => {
    const rows = [
      ligne({ cells: [cellule(), cellule({ state: 'late' }), cellule({ state: 'no_period' })] }),
      ligne({ workspaceId: 'ws-2', cells: [cellule({ state: 'late' }), cellule({ state: 'to_issue' })] }),
    ]
    expect(compterEtats(rows)).toEqual({ paid: 1, issued: 0, to_issue: 1, late: 2, no_period: 1 })
  })

  it('aucune ligne : des zéros MESURÉS, pas des inconnues — il n’y a rien à compter', () => {
    expect(compterEtats([])).toEqual({ paid: 0, issued: 0, to_issue: 0, late: 0, no_period: 0 })
  })
})
