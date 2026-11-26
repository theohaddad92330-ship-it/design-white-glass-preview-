import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { Route as Affaires } from './affaires'
import { Route as Comptes } from './comptes'
import { Route as Decouvrir } from './decouvrir'
import { Route as Facturation } from './facturation'
import { Route as Signaux } from './signaux'
import { Route as Vivier } from './vivier'
import { Route as AccountAnalyze } from './accounts/$id_.analyze'

/** #4710 / #4789 — le nom français affiché dans la navigation mène à la vraie route, par redirection explicite. */
function redirectOf(beforeLoad: unknown, params: Record<string, string> = {}): { to?: string; params?: unknown } {
  try {
    ;(beforeLoad as (ctx: { params: Record<string, string> }) => void)({ params })
  } catch (thrown) {
    if (isRedirect(thrown)) return thrown.options as { to?: string; params?: unknown }
    throw thrown
  }
  throw new Error('aucune redirection levée')
}

describe('alias français des écrans', () => {
  it.each([
    ['/vivier', Vivier, '/consultants'],
    ['/affaires', Affaires, '/projects'],
    ['/signaux', Signaux, '/signals'],
    ['/comptes', Comptes, '/accounts'],
    ['/decouvrir', Decouvrir, '/discover'],
    ['/facturation', Facturation, '/billing'],
  ])('%s renvoie vers %s', (_url, route, to) => {
    const out = redirectOf(route.options.beforeLoad)
    expect(out.to).toBe(to)
    expect(out).toMatchObject({ replace: true })
  })

  it('/accounts/<id>/analyze renvoie vers le dossier du compte, identifiant conservé', () => {
    const out = redirectOf(AccountAnalyze.options.beforeLoad, { id: '781e98e8-059d-48ac-acd9-f0cae463ecdb' })
    expect(out.to).toBe('/accounts/$id')
    expect(out.params).toEqual({ id: '781e98e8-059d-48ac-acd9-f0cae463ecdb' })
  })
})
