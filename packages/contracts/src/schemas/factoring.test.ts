import { describe, expect, it } from 'vitest'
import {
  FACTORING_CONTRACT_STATES,
  RECEIVABLE_ASSIGNMENT_STATES,
  RECONCILIATION_STATES,
  RECONCILIATION_TOLERANCE_CENTS,
  assignedOutstandingCents,
  commissionAmountCents,
  effectiveCommissionRateBps,
  expectedNetCents,
  isFactorOwing,
  missingAssignments,
  reconcileAssignment,
  summarizeFactoring,
} from './factoring.js'

/**
 * Les tests de la CESSION — écrits avant le code (TDD), et chacun contre une
 * façon connue de se tromper dans ce dépôt.
 *
 * Trois d'entre elles reviennent partout et sont testées nommément ici :
 *  · un « non mesuré » rendu `0` (un encours cédé sans montant, un taux absent) ;
 *  · un total partiel qui se lit comme un total (d'où `withoutAmount`) ;
 *  · une dérivation refaite à deux endroits (d'où `effectiveCommissionRateBps`,
 *    seul chemin qui répond à « quel taux s'applique ? »).
 */

describe('les taxonomies', () => {
  it('nomment leurs valeurs, et l’ordre des états de cession suit le cycle de vie', () => {
    // GA-08 : une valeur s'ajoute EN FIN, jamais au milieu. Ce test fige
    // l'ordre pour qu'une insertion se voie en relecture.
    expect(RECEIVABLE_ASSIGNMENT_STATES).toEqual(['prepared', 'assigned', 'settled', 'rejected', 'recalled'])
    expect(FACTORING_CONTRACT_STATES).toEqual(['active', 'suspended', 'ended'])
    expect(RECONCILIATION_STATES).toEqual(['not_due', 'unmeasurable', 'awaiting', 'matched', 'short', 'over'])
  })

  it('distingue les états où le factor DOIT quelque chose de ceux où il ne doit rien', () => {
    // Une cession préparée n'a pas été transmise ; une cession refusée ou
    // reprise ne sera pas réglée. Dans les trois cas, attendre un règlement
    // ferait apparaître un « manquant » qui n'existe pas.
    expect(isFactorOwing('prepared')).toBe(false)
    expect(isFactorOwing('rejected')).toBe(false)
    expect(isFactorOwing('recalled')).toBe(false)
    expect(isFactorOwing('assigned')).toBe(true)
    expect(isFactorOwing('settled')).toBe(true)
  })
})

describe('effectiveCommissionRateBps — le taux vit à UN seul endroit', () => {
  it('prend le taux de la cession quand elle en porte un', () => {
    expect(effectiveCommissionRateBps({ commissionRateBps: 180 }, { commissionRateBps: 250 })).toBe(180)
  })

  it('retombe sur le taux du contrat quand la cession n’en porte pas', () => {
    expect(effectiveCommissionRateBps({ commissionRateBps: null }, { commissionRateBps: 250 })).toBe(250)
  })

  it('rend `null` quand personne ne l’a saisi — un taux inconnu n’est pas 0 %', () => {
    // « 0 % de commission » annoncerait un affacturage gratuit. C'est le même
    // défaut que « marge : 0 » sur une marge non mesurée.
    expect(effectiveCommissionRateBps({ commissionRateBps: null }, { commissionRateBps: null })).toBeNull()
    expect(effectiveCommissionRateBps({ commissionRateBps: null }, null)).toBeNull()
  })

  it('garde un taux de cession RÉELLEMENT nul, qui n’est pas la même chose qu’absent', () => {
    // Une cession négociée sans commission existe. `0` saisi et `null` non
    // saisi sont deux valeurs distinctes, comme `loaded_daily_cost_cents`.
    expect(effectiveCommissionRateBps({ commissionRateBps: 0 }, { commissionRateBps: 250 })).toBe(0)
  })
})

describe('la commission et le net attendu', () => {
  it('calculent la commission au centime, à l’arrondi près', () => {
    expect(commissionAmountCents(1_000_000, 250)).toBe(25_000)
    expect(expectedNetCents(1_000_000, 250)).toBe(975_000)
  })

  it('rendent `null` dès qu’un terme manque — jamais 0', () => {
    expect(commissionAmountCents(null, 250)).toBeNull()
    expect(commissionAmountCents(1_000_000, null)).toBeNull()
    expect(expectedNetCents(null, 250)).toBeNull()
    expect(expectedNetCents(1_000_000, null)).toBeNull()
  })
})

/** Une cession minimale, que chaque test déforme sur le seul point qu'il teste. */
function assignment(patch: Partial<Parameters<typeof reconcileAssignment>[0]> = {}) {
  return {
    status: 'assigned' as const,
    assignedAmountCents: 1_000_000 as number | null,
    commissionRateBps: 250 as number | null,
    settlementsCents: [] as readonly number[],
    ...patch,
  }
}

describe('reconcileAssignment — la réconciliation des règlements du factor', () => {
  it('dit « rien n’est dû » sur une cession préparée, refusée ou reprise', () => {
    for (const status of ['prepared', 'rejected', 'recalled'] as const) {
      expect(reconcileAssignment(assignment({ status })).state).toBe('not_due')
    }
  })

  it('signale un règlement reçu sur une cession qui ne devait rien — c’est une ANOMALIE, pas un silence', () => {
    const result = reconcileAssignment(assignment({ status: 'rejected', settlementsCents: [120_000] }))
    expect(result.state).toBe('over')
    expect(result.settledCents).toBe(120_000)
  })

  it('dit « non mesurable » quand le montant cédé manque — surtout pas « rien reçu »', () => {
    const result = reconcileAssignment(assignment({ assignedAmountCents: null }))
    expect(result.state).toBe('unmeasurable')
    expect(result.expectedNetCents).toBeNull()
    expect(result.varianceCents).toBeNull()
  })

  it('dit « non mesurable » quand le TAUX manque — sans taux, aucun net n’est calculable', () => {
    expect(reconcileAssignment(assignment({ commissionRateBps: null })).state).toBe('unmeasurable')
  })

  it('dit « en attente » tant qu’aucun règlement n’est arrivé, et n’annonce AUCUN écart', () => {
    // L'écart vaudrait « −975 000 », c'est-à-dire « le factor nous doit tout ».
    // Vrai arithmétiquement, faux comme diagnostic : la cession vient de partir.
    const result = reconcileAssignment(assignment())
    expect(result.state).toBe('awaiting')
    expect(result.expectedNetCents).toBe(975_000)
    expect(result.varianceCents).toBeNull()
  })

  it('rapproche une somme de règlements, pas seulement un règlement unique', () => {
    const result = reconcileAssignment(assignment({ settlementsCents: [500_000, 475_000] }))
    expect(result.state).toBe('matched')
    expect(result.settledCents).toBe(975_000)
    expect(result.varianceCents).toBe(0)
  })

  it('tolère l’écart d’ARRONDI de la commission, et rien de plus', () => {
    // La tolérance est arithmétique, pas commerciale : `Math.round` sur une
    // commission peut décaler d'un centime. Un euro d'écart reste un écart.
    expect(RECONCILIATION_TOLERANCE_CENTS).toBe(1)
    expect(reconcileAssignment(assignment({ settlementsCents: [975_001] })).state).toBe('matched')
    expect(reconcileAssignment(assignment({ settlementsCents: [975_100] })).state).toBe('over')
  })

  it('nomme un règlement INSUFFISANT et le chiffre', () => {
    const result = reconcileAssignment(assignment({ settlementsCents: [900_000] }))
    expect(result.state).toBe('short')
    expect(result.varianceCents).toBe(-75_000)
  })

  it('nomme un règlement EXCÉDENTAIRE — le factor a réglé plus que le net attendu', () => {
    const result = reconcileAssignment(assignment({ settlementsCents: [1_000_000] }))
    expect(result.state).toBe('over')
    expect(result.varianceCents).toBe(25_000)
  })
})

describe('assignedOutstandingCents — l’ENCOURS cédé', () => {
  it('ne compte que ce qui est chez le factor et non réglé', () => {
    const encours = assignedOutstandingCents([
      { status: 'assigned', assignedAmountCents: 400_000 },
      { status: 'assigned', assignedAmountCents: 600_000 },
      // Réglée : elle est sortie de l'encours.
      { status: 'settled', assignedAmountCents: 900_000 },
      // Préparée : elle n'est pas encore partie.
      { status: 'prepared', assignedAmountCents: 300_000 },
      { status: 'rejected', assignedAmountCents: 200_000 },
      { status: 'recalled', assignedAmountCents: 100_000 },
    ])
    expect(encours.amountCents).toBe(1_000_000)
    expect(encours.count).toBe(2)
    expect(encours.withoutAmount).toBe(0)
  })

  it('compte à part les cessions SANS montant — un total partiel se lit sinon comme un total', () => {
    const encours = assignedOutstandingCents([
      { status: 'assigned', assignedAmountCents: 400_000 },
      { status: 'assigned', assignedAmountCents: null },
    ])
    expect(encours.count).toBe(2)
    expect(encours.amountCents).toBe(400_000)
    expect(encours.withoutAmount).toBe(1)
  })

  it('rend `null` quand AUCUNE ligne n’est chiffrée — jamais « encours : 0 € »', () => {
    const encours = assignedOutstandingCents([{ status: 'assigned', assignedAmountCents: null }])
    expect(encours.amountCents).toBeNull()
  })

  it('rend `0` sur un encours VIDE — là, zéro est VRAI', () => {
    expect(assignedOutstandingCents([]).amountCents).toBe(0)
  })
})

describe('missingAssignments — « Cession manquante »', () => {
  const receivables = [
    // Facturée, impayée, sans cession : c'est exactement ce que la maquette
    // remonte en tuile « Cession manquante ».
    {
      missionId: 'm1',
      periodMonth: '2026-06-01',
      state: 'invoiced' as const,
      paidAt: null,
      paidAmountCents: null,
      invoicedAmountCents: 460_000,
    },
    // Déjà encaissée par le client : plus rien à céder.
    {
      missionId: 'm2',
      periodMonth: '2026-06-01',
      state: 'invoiced' as const,
      paidAt: '2026-07-02T09:00:00Z',
      paidAmountCents: 300_000,
      invoicedAmountCents: 300_000,
    },
    // Pas encore facturée : une cession porte sur une CRÉANCE, donc sur une
    // facture émise. La réclamer ici ferait un « manquant » qu'on ne peut pas
    // lever.
    {
      missionId: 'm3',
      periodMonth: '2026-06-01',
      state: 'blocked' as const,
      paidAt: null,
      paidAmountCents: null,
      invoicedAmountCents: null,
    },
  ]

  it('ne retient que les mois FACTURÉS et NON encaissés qui n’ont aucune cession', () => {
    const missing = missingAssignments(receivables, [])
    expect(missing.rows.map(row => row.missionId)).toEqual(['m1'])
    expect(missing.bucket.count).toBe(1)
    expect(missing.bucket.amountCents).toBe(460_000)
  })

  it('retire une créance dès qu’une cession la couvre — la clé est (mission, mois)', () => {
    const missing = missingAssignments(receivables, [{ missionId: 'm1', periodMonth: '2026-06-01' }])
    expect(missing.rows).toEqual([])
    // Un seau VIDE vaut bien 0 € : la population est complète.
    expect(missing.bucket.amountCents).toBe(0)
  })

  it('ne rapproche PAS deux mois différents de la même mission', () => {
    // La jointure par position est un défaut déjà payé ici : la clé porte le
    // mois, pas seulement la mission.
    const missing = missingAssignments(receivables, [{ missionId: 'm1', periodMonth: '2026-05-01' }])
    expect(missing.rows.map(row => row.missionId)).toEqual(['m1'])
  })

  it('compte une créance sans montant plutôt que de la chiffrer à zéro', () => {
    const missing = missingAssignments(
      [
        {
          missionId: 'm4',
          periodMonth: '2026-06-01',
          state: 'invoiced' as const,
          paidAt: null,
          paidAmountCents: null,
          invoicedAmountCents: null,
        },
      ],
      [],
    )
    expect(missing.bucket.count).toBe(1)
    expect(missing.bucket.withoutAmount).toBe(1)
    expect(missing.bucket.amountCents).toBeNull()
  })

  /**
   * ───────────────────────────────────────────────────────────────────────
   * #2419.4 — UN PAIEMENT PARTIEL NE SORT PAS DE LA FILE
   * ───────────────────────────────────────────────────────────────────────
   * « Déjà encaissé ⇒ plus rien à céder » était vrai d'un SOLDE, faux d'un
   * acompte : le SOLDE d'une facture réglée à moitié reste cessible. Et le
   * montant retenu était le FACTURÉ, donc on aurait proposé de céder
   * 10 000 € alors que 5 000 € sont déjà rentrés — un double défaut.
   */
  it('garde une créance PARTIELLEMENT réglée, et ne propose que le RESTE dû', () => {
    const missing = missingAssignments(
      [
        {
          missionId: 'm5',
          periodMonth: '2026-06-01',
          state: 'invoiced' as const,
          paidAt: '2026-07-02T09:00:00Z',
          paidAmountCents: 500_000,
          invoicedAmountCents: 1_000_000,
        },
      ],
      [],
    )
    expect(missing.rows.map(row => row.missionId)).toEqual(['m5'])
    expect(missing.bucket.amountCents).toBe(500_000)
  })

  /** Payée d'un montant NON MESURÉ : on ne propose pas de céder ce qu'on ne
   *  sait pas rester dû, et on n'accuse pas le client d'un impayé. */
  it('écarte une créance réglée d’un montant inconnu', () => {
    const missing = missingAssignments(
      [
        {
          missionId: 'm6',
          periodMonth: '2026-06-01',
          state: 'invoiced' as const,
          paidAt: '2026-07-02T09:00:00Z',
          paidAmountCents: null,
          invoicedAmountCents: 1_000_000,
        },
      ],
      [],
    )
    expect(missing.rows).toEqual([])
  })
})

describe('summarizeFactoring — l’entête de l’écran', () => {
  const rows = [
    { status: 'assigned' as const, assignedAmountCents: 400_000, commissionRateBps: 250, settlementsCents: [] },
    { status: 'settled' as const, assignedAmountCents: 600_000, commissionRateBps: 250, settlementsCents: [585_000] },
    { status: 'settled' as const, assignedAmountCents: 200_000, commissionRateBps: 250, settlementsCents: [180_000] },
    { status: 'assigned' as const, assignedAmountCents: null, commissionRateBps: 250, settlementsCents: [] },
  ]

  it('sépare l’encours, l’attente de règlement et l’écart constaté', () => {
    const summary = summarizeFactoring(rows, { unreconciledSettlementsCents: [] })
    expect(summary.outstanding.count).toBe(2)
    expect(summary.outstanding.amountCents).toBe(400_000)
    expect(summary.outstanding.withoutAmount).toBe(1)
    // ⚠️ UNE seule cession « en attente », pas deux : la quatrième est bien
    // partie chez le factor, mais son montant manque — on ne sait donc pas
    // quel règlement attendre. Elle est comptée par `unmeasurable`, jamais
    // perdue, et surtout jamais rangée en « attente » avec un net attendu de 0.
    expect(summary.awaiting.count).toBe(1)
    // Le NET attendu, pas le montant cédé : 400 000 − 2,50 % = 390 000. C'est
    // ce que le factor doit verser, et c'est le seul chiffre qu'on puisse
    // comparer à ce qui arrivera.
    expect(summary.awaiting.amountCents).toBe(390_000)
  })

  it('n’additionne que les écarts MESURÉS, et compte ceux qui ne le sont pas', () => {
    const summary = summarizeFactoring(rows, { unreconciledSettlementsCents: [] })
    // 585 000 − 585 000 = 0 ; 180 000 − 195 000 = −15 000.
    expect(summary.varianceCents).toBe(-15_000)
    // La cession sans montant : elle attend un règlement dont personne ne
    // connaît le montant. Le total d'écart reste MESURÉ sur les deux lignes
    // qui le sont, et ce compteur dit sur combien il ne l'est pas.
    expect(summary.unmeasurable).toBe(1)
  })

  it('n’annonce AUCUN écart quand rien n’est mesurable — un écart de 0 se lirait « tout est juste »', () => {
    const summary = summarizeFactoring(
      [{ status: 'assigned' as const, assignedAmountCents: null, commissionRateBps: null, settlementsCents: [] }],
      { unreconciledSettlementsCents: [] },
    )
    expect(summary.varianceCents).toBeNull()
    expect(summary.unmeasurable).toBe(1)
  })

  it('remonte les règlements que rien ne rapproche — c’est le travail qui reste à faire', () => {
    const summary = summarizeFactoring(rows, { unreconciledSettlementsCents: [12_000, 8_000] })
    expect(summary.unreconciled.count).toBe(2)
    expect(summary.unreconciled.amountCents).toBe(20_000)
  })
})
