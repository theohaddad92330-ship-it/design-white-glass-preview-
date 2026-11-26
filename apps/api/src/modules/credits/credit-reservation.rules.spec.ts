import type { CreditReservationEntity } from '../../database/entities/credit-reservation.entity'
import { liveReservedTotal, RESERVATION_TTL_MS, spendableCredits } from './credit-reservation.rules'

/**
 * La dérivation « ce qui est EN VOL » — une seule fois, ici.
 *
 * Deux endroits en ont besoin et ne peuvent pas s'appeler l'un l'autre : le
 * registre qui ÉCRIT les réservations (Action OS) et le service qui ANNONCE le
 * solde (facturation). Deux implémentations divergeraient, et la divergence
 * s'appellerait « le bandeau dit 3, le run dit 0 ».
 */

const NOW = new Date('2026-08-29T12:00:00Z')

function row(over: Partial<CreditReservationEntity> = {}): CreditReservationEntity {
  return {
    id: 'r1',
    workspace_id: 'ws-1',
    user_id: 'u-1',
    kind: 'enrichment',
    amount: 1,
    state: 'reserved',
    reference: 'corr-1',
    expires_at: new Date(NOW.getTime() + 60_000),
    settled_at: null,
    created_at: NOW,
    ...over,
  } as CreditReservationEntity
}

describe('liveReservedTotal — ce qui est promis et pas encore soldé', () => {
  it('additionne les réservations vivantes', () => {
    expect(liveReservedTotal([row({ amount: 8 }), row({ id: 'r2', amount: 4, reference: 'corr-2' })], NOW)).toBe(12)
  })

  it('ignore une réservation PÉRIMÉE — un run mort depuis une heure ne gèle rien', () => {
    const dead = row({ expires_at: new Date(NOW.getTime() - 1) })
    expect(liveReservedTotal([dead], NOW)).toBe(0)
  })

  it('ignore tout ce qui est déjà soldé (consumed / released / expired)', () => {
    const settled = (['consumed', 'released', 'expired'] as const).map((state, i) =>
      row({ id: `s${i}`, state, settled_at: NOW }),
    )
    expect(liveReservedTotal(settled, NOW)).toBe(0)
  })

  it("ne compte QU'UNE FOIS une même référence réservée deux fois — un retour de file ne gèle pas le double", () => {
    // Le cas réel : la file rejoue le run, ou l'utilisateur reclique. Deux lignes
    // `reserved` portent alors la même référence. Elles couvrent LA MÊME dépense :
    // les additionner annoncerait un manque de crédits qui n'existe pas.
    const twice = [row({ id: 'a', amount: 8 }), row({ id: 'b', amount: 8 })]
    expect(liveReservedTotal(twice, NOW)).toBe(8)
  })

  it('un doublon de référence garde le montant le PLUS ÉLEVÉ — jamais le plus indulgent', () => {
    const twice = [row({ id: 'a', amount: 4 }), row({ id: 'b', amount: 8 })]
    expect(liveReservedTotal(twice, NOW)).toBe(8)
  })

  it('une liste vide vaut zéro réservé — rien en vol, pas « inconnu »', () => {
    expect(liveReservedTotal([], NOW)).toBe(0)
  })
})

describe('spendableCredits — le solde qu’on a le droit de promettre', () => {
  it('retranche ce qui est en vol', () => {
    expect(spendableCredits(20, 8)).toBe(12)
  })

  it('ne descend jamais sous zéro — un dépassement se lit « 0 », pas « -3 »', () => {
    expect(spendableCredits(2, 8)).toBe(0)
  })

  it('sans réservation, le solde est celui du pool — chemin byte-identique', () => {
    expect(spendableCredits(20, 0)).toBe(20)
  })
})

describe('RESERVATION_TTL_MS', () => {
  it('vaut trente minutes — assez pour un run, trop court pour geler une journée', () => {
    expect(RESERVATION_TTL_MS).toBe(30 * 60_000)
  })
})
