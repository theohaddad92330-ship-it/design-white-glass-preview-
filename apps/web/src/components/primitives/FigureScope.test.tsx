import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FigureScope } from './FigureScope'
import { figureScopeIsComplete, type FigureScopeValue } from './figure-scope'

/** Une portée telle qu'un appelant non typé (une réponse d'API, un `any`) la passerait. */
const untyped = (json: string): FigureScopeValue => JSON.parse(json) as FigureScopeValue

/**
 * #4298.2 — CHAQUE CHIFFRE DU TABLEAU DE BORD DIT SA PÉRIODE ET SA SOURCE.
 *
 * « 30 derniers jours · ton CRM » : la période d'abord, puis ce que l'ESPACE a
 * branché — jamais un fournisseur de BellumAI (doctrine : on nomme ce que
 * l'espace a branché, jamais ce qui nous sert).
 */
afterEach(cleanup)

describe('FigureScope — la période et la source d’un chiffre', () => {
  it('dit une fenêtre glissante et la source branchée', () => {
    render(<FigureScope scope={{ period: { kind: 'lastDays', days: 30 }, sources: ['crm'] }} />)
    expect(screen.getByText('30 derniers jours · ton CRM')).toBeInTheDocument()
  })

  it('dit un état courant comme tel, jamais comme une période', () => {
    render(<FigureScope scope={{ period: { kind: 'now' }, sources: ['portfolio'] }} />)
    expect(screen.getByText("Aujourd'hui · ton portefeuille")).toBeInTheDocument()
  })

  it('dit un horizon à venir', () => {
    render(<FigureScope scope={{ period: { kind: 'nextDays', days: 30 }, sources: ['bellum'] }} />)
    expect(screen.getByText(/30 prochains jours/)).toBeInTheDocument()
  })

  it('une liste de sources VIDE se dit, elle ne se tait pas', () => {
    render(<FigureScope scope={{ period: { kind: 'now' }, sources: [] }} />)
    expect(screen.getByText("Aujourd'hui · aucune source lisible")).toBeInTheDocument()
  })

  it('dit NON à un chiffre sans période', () => {
    // Un appelant qui contourne le typage ne produit pas un chiffre
    // muet sur sa fenêtre : la portée est déclarée incomplète.
    expect(figureScopeIsComplete(untyped('{"sources":["crm"]}'))).toBe(false)
    expect(figureScopeIsComplete({ period: { kind: 'lastDays', days: 0 }, sources: ['crm'] })).toBe(false)
    expect(figureScopeIsComplete({ period: { kind: 'lastDays', days: 7 }, sources: ['crm'] })).toBe(true)
  })

  it('ne nomme jamais un fournisseur : la source est une capacité branchée', () => {
    expect(() => render(<FigureScope scope={untyped('{"period":{"kind":"now"},"sources":["apollo"]}')} />)).toThrow(
      /source/,
    )
  })
})
