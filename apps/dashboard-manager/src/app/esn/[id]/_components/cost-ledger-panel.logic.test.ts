import { describe, expect, it } from 'vitest'
import { libelleCoutUsd, libelleStatutLedger } from './cost-ledger-panel.logic'

describe('libelleCoutUsd — un fournisseur non tarifé n’est jamais « 0,00 $ »', () => {
  it('formate un coût mesuré en dollars', () => {
    expect(libelleCoutUsd({ costUsd: 0.42 })).toBe('0.42 $')
  })

  it('nomme « non tarifé » plutôt que d’afficher 0,00 $ (doctrine)', () => {
    expect(libelleCoutUsd({ costUsd: null })).toBe('non tarifé')
  })

  it('distingue un coût RÉELLEMENT nul d’un coût non tarifé', () => {
    expect(libelleCoutUsd({ costUsd: 0 })).toBe('0.00 $')
  })
})

// #2440.46 — une limite fournisseur (429 / surcharge) se lit sur la fiche ESN, datée, sans débit.
describe('libelleStatutLedger — la limite fournisseur est nommée, le reste ne dit rien', () => {
  it('nomme la limite fournisseur', () => {
    expect(libelleStatutLedger({ status: 'provider_limit' })).toBe('Limite fournisseur — aucun débit')
  })

  it('ne dit rien d’une ligne sans statut ou à statut ordinaire (aucune étiquette inventée)', () => {
    expect(libelleStatutLedger({ status: null })).toBeNull()
    expect(libelleStatutLedger({ status: 'ok' })).toBeNull()
  })

  it('une ligne en limite ne montre pas « 0.00 $ » comme un prix : elle dit qu’il n’y a pas eu de facturation', () => {
    expect(libelleCoutUsd({ costUsd: 0, status: 'provider_limit' })).toBe('non facturé')
    expect(libelleCoutUsd({ costUsd: 0, status: null })).toBe('0.00 $')
  })
})
