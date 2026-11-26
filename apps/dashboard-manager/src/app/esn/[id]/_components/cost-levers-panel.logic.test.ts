import { describe, expect, it } from 'vitest'
import type { WorkspaceBudgetLevers } from '@bellum/contracts'
import { formFromLevers, leversFromForm, libelleEtatPlafonds } from './cost-levers-panel.logic'

const AUCUN: WorkspaceBudgetLevers = {
  monthlyBudgetUsd: null,
  perMemberCapUsd: null,
  perActionCapUsd: null,
  alertOnOverage: true,
  blockAtCap: false,
}

describe('leversFromForm — les cinq leviers de #2440.83-89', () => {
  it('un champ vide est « pas de plafond » (null), jamais 0', () => {
    const out = leversFromForm({ monthly: '', perMember: ' ', perAction: '', alertOnOverage: true, blockAtCap: false })
    expect(out).toEqual({ ok: true, levers: AUCUN })
  })

  it('lit les trois plafonds, virgule décimale comprise, et les deux interrupteurs', () => {
    const out = leversFromForm({
      monthly: '120',
      perMember: '12,5',
      perAction: '3.75',
      alertOnOverage: false,
      blockAtCap: true,
    })
    expect(out).toEqual({
      ok: true,
      levers: {
        monthlyBudgetUsd: 120,
        perMemberCapUsd: 12.5,
        perActionCapUsd: 3.75,
        alertOnOverage: false,
        blockAtCap: true,
      },
    })
  })

  it.each(['0', '-4', 'abc', '1e999', '12 dollars'])('NON — « %s » n’est pas un plafond valide', saisie => {
    const out = leversFromForm({
      monthly: saisie,
      perMember: '',
      perAction: '',
      alertOnOverage: true,
      blockAtCap: false,
    })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toMatch(/budget mensuel/i)
  })

  it('l’erreur nomme le champ fautif, pas le premier de la liste', () => {
    const out = leversFromForm({
      monthly: '10',
      perMember: '',
      perAction: '-1',
      alertOnOverage: true,
      blockAtCap: false,
    })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toMatch(/par action/i)
  })
})

describe('formFromLevers — l’aller-retour', () => {
  it('rend les champs tels que saisis, vide pour un plafond non réglé', () => {
    expect(formFromLevers(AUCUN)).toEqual({
      monthly: '',
      perMember: '',
      perAction: '',
      alertOnOverage: true,
      blockAtCap: false,
    })
    const reglé = { ...AUCUN, monthlyBudgetUsd: 120, blockAtCap: true }
    expect(leversFromForm(formFromLevers(reglé))).toEqual({ ok: true, levers: reglé })
  })
})

describe('libelleEtatPlafonds — dit ce que la porte fait RÉELLEMENT', () => {
  it('sans plafond : la porte ne bloque ni n’alerte rien, et le dit', () => {
    expect(libelleEtatPlafonds(AUCUN)).toBe('Aucun plafond réglé : rien n’est bloqué ni signalé.')
  })

  it('un interrupteur « bloquer » sans plafond n’est pas présenté comme actif', () => {
    expect(libelleEtatPlafonds({ ...AUCUN, blockAtCap: true })).toBe(
      'Aucun plafond réglé : rien n’est bloqué ni signalé.',
    )
  })

  it('avec un plafond et le blocage : les actions au-delà sont refusées', () => {
    expect(libelleEtatPlafonds({ ...AUCUN, monthlyBudgetUsd: 50, blockAtCap: true })).toBe(
      '1 plafond réglé : au-delà, l’action est refusée.',
    )
  })

  it('avec plusieurs plafonds, sans blocage et alerte : on signale seulement', () => {
    expect(libelleEtatPlafonds({ ...AUCUN, monthlyBudgetUsd: 50, perActionCapUsd: 2 })).toBe(
      '2 plafonds réglés : au-delà, l’action passe et un dépassement est signalé.',
    )
  })

  it('sans blocage ni alerte : le dépassement passe sans trace, et c’est dit', () => {
    expect(libelleEtatPlafonds({ ...AUCUN, perMemberCapUsd: 9, alertOnOverage: false })).toBe(
      '1 plafond réglé : au-delà, l’action passe et rien n’est signalé.',
    )
  })
})
