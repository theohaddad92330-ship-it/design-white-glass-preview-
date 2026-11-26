import { describe, expect, it } from 'vitest'
import { checkBudgetGate, type PeriodSpendUsd, type WorkspaceBudgetLevers } from './workspace-budget.js'

const NO_LEVERS: WorkspaceBudgetLevers = {
  monthlyBudgetUsd: null,
  perMemberCapUsd: null,
  perActionCapUsd: null,
  alertOnOverage: true,
  blockAtCap: false,
}

const NO_SPEND: PeriodSpendUsd = { workspaceUsd: 0, memberUsd: 0, actionUsd: 0 }

describe('sans réglage, la porte ne fait RIEN (doctrine « sans clé = no-op »)', () => {
  it('laisse toujours passer quand aucun des trois plafonds n’est configuré', () => {
    const verdict = checkBudgetGate(NO_LEVERS, { workspaceUsd: 999_999, memberUsd: 999_999, actionUsd: 999_999 }, 1)
    expect(verdict).toEqual({ allowed: true, overCap: null })
  })
})

describe('le budget mensuel de l’espace (GA-43 : jamais agrégé entre espaces)', () => {
  const levers: WorkspaceBudgetLevers = { ...NO_LEVERS, monthlyBudgetUsd: 100 }

  it('bloque et NOMME la limite quand `blockAtCap` est actif', () => {
    const verdict = checkBudgetGate({ ...levers, blockAtCap: true }, { ...NO_SPEND, workspaceUsd: 95 }, 10)
    expect(verdict).toEqual({
      allowed: false,
      overCap: 'workspace_budget',
      message: expect.stringContaining('budget mensuel'),
    })
  })

  it('laisse passer mais signale le dépassement quand `blockAtCap` est éteint', () => {
    const verdict = checkBudgetGate(levers, { ...NO_SPEND, workspaceUsd: 95 }, 10)
    expect(verdict).toEqual({ allowed: true, overCap: 'workspace_budget', alert: true })
  })

  it('ne se déclenche PAS pile au plafond — seul le DÉPASSEMENT compte', () => {
    const verdict = checkBudgetGate({ ...levers, blockAtCap: true }, { ...NO_SPEND, workspaceUsd: 90 }, 10)
    expect(verdict).toEqual({ allowed: true, overCap: null })
  })

  it('compte le coût ESTIMÉ de l’action à venir, pas seulement le déjà-dépensé', () => {
    // L'aperçu avant action : une action à 10 $ sur un espace déjà à 92 $ pousse
    // le projeté à 102 $, au-dessus du plafond de 100 $ — même si les 92 $ seuls
    // ne le dépassaient pas.
    const verdict = checkBudgetGate({ ...levers, blockAtCap: true }, { ...NO_SPEND, workspaceUsd: 92 }, 10)
    expect(verdict.allowed).toBe(false)
  })
})

describe('le plafond par membre', () => {
  it('nomme `member_cap`, jamais confondu avec le budget de l’espace', () => {
    const levers: WorkspaceBudgetLevers = { ...NO_LEVERS, perMemberCapUsd: 20, blockAtCap: true }
    const verdict = checkBudgetGate(levers, { ...NO_SPEND, memberUsd: 18 }, 5)
    expect(verdict).toEqual({ allowed: false, overCap: 'member_cap', message: expect.stringContaining('membre') })
  })
})

describe('le plafond par action', () => {
  it('nomme `action_cap`', () => {
    const levers: WorkspaceBudgetLevers = { ...NO_LEVERS, perActionCapUsd: 3, blockAtCap: true }
    const verdict = checkBudgetGate(levers, { ...NO_SPEND, actionUsd: 1 }, 5)
    expect(verdict).toEqual({ allowed: false, overCap: 'action_cap', message: expect.stringContaining('action') })
  })
})

describe('précédence quand plusieurs plafonds sont dépassés à la fois', () => {
  it('nomme le budget de l’espace en premier — c’est le plus englobant', () => {
    const levers: WorkspaceBudgetLevers = {
      monthlyBudgetUsd: 100,
      perMemberCapUsd: 20,
      perActionCapUsd: 3,
      alertOnOverage: true,
      blockAtCap: true,
    }
    const verdict = checkBudgetGate(levers, { workspaceUsd: 95, memberUsd: 18, actionUsd: 1 }, 10)
    expect(verdict).toEqual({ allowed: false, overCap: 'workspace_budget', message: expect.any(String) })
  })
})

describe('un plafond aberrant (0 ou négatif) est traité comme non réglé', () => {
  it('ne bloque jamais sur un plafond à zéro — un réglage mal saisi ne doit rien casser', () => {
    const levers: WorkspaceBudgetLevers = { ...NO_LEVERS, monthlyBudgetUsd: 0, blockAtCap: true }
    const verdict = checkBudgetGate(levers, { ...NO_SPEND, workspaceUsd: 500 }, 10)
    expect(verdict).toEqual({ allowed: true, overCap: null })
  })
})
