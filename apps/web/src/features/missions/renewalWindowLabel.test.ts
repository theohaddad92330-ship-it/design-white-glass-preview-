import { describe, expect, it } from 'vitest'
import type { TFunction } from 'i18next'
import { renewalWindowBadge, renewalWindowHint, renewalWindowLabel } from './renewalWindowLabel'

/**
 * #2195.8 — LE LIBELLÉ D'UNE FENÊTRE SE CALCULE, IL N'EST PLUS UN NOM.
 *
 * Ce que cette garde attrape, et qu'aucune autre n'attrape : un écran qui
 * ré-écrirait `t('renewals.windows.j15')` pour un espace réglé sur vingt jours.
 * Elle le prouve en observant la CLÉ demandée, pas le texte rendu — un texte
 * traduit changerait au premier ajustement de copie, la clé non.
 */

/** Un `t` qui rend la clé et ses variables, pour lire ce qui a été DEMANDÉ. */
const t = ((key: string, options?: Record<string, unknown>) =>
  options && 'count' in options ? `${key}:${String(options['count'])}` : key) as unknown as TFunction<'missions'>

describe('renewalWindowLabel', () => {
  it('rend le NOMBRE DE JOURS de l’espace, jamais le nom du palier', () => {
    const scale = [20, 40, 70, 100]
    expect(renewalWindowLabel(t, 'j15', scale)).toBe('renewals.windows.withinDays:20')
    expect(renewalWindowLabel(t, 'j30', scale)).toBe('renewals.windows.withinDays:40')
    expect(renewalWindowLabel(t, 'j60', scale)).toBe('renewals.windows.withinDays:100')
    expect(renewalWindowHint(t, 'j15', scale)).toBe('renewals.windowHints.withinDays:20')
    expect(renewalWindowBadge(t, 'j15', scale)).toBe('renewal.withinDays:20')
  })

  it('sur l’échelle du produit, les nombres sont ceux d’avant le 16/09/2026', () => {
    // La preuve que le lot est « ajout seulement » : sans réglage d'espace, les
    // quatre fenêtres se lisent 15 · 30 · 45 · 60, comme la veille.
    expect(renewalWindowLabel(t, 'j15', undefined)).toBe('renewals.windows.withinDays:15')
    expect(renewalWindowLabel(t, 'j30', undefined)).toBe('renewals.windows.withinDays:30')
    expect(renewalWindowLabel(t, 'j45', undefined)).toBe('renewals.windows.withinDays:45')
    expect(renewalWindowLabel(t, 'j60', undefined)).toBe('renewals.windows.withinDays:60')
  })

  it('les fenêtres SANS borne gardent leur nom — elles ne se règlent pas', () => {
    // `overdue`, `imminent`, `far` et `unknown` n'ont pas de nombre de jours, et
    // leur en inventer un (« à 0 jour ») serait faux. « Sans date de fin »
    // surtout : c'est le garde-fou n°3 de la décision.
    for (const window of ['overdue', 'imminent', 'far', 'unknown'] as const) {
      expect(renewalWindowLabel(t, window, [20, 40, 70, 100])).toBe(`renewals.windows.${window}`)
      expect(renewalWindowHint(t, window, [20, 40, 70, 100])).toBe(`renewals.windowHints.${window}`)
    }
  })

  it('une échelle ABÎMÉE retombe sur celle du produit, jamais sur « 0 jour »', () => {
    // Un réglage illisible ne doit pas produire un libellé faux : il produit
    // celui du produit. Le contrat le tient (`resolveRenewalWindowDays`), la
    // dérivation ne le refait pas.
    expect(renewalWindowLabel(t, 'j15', [60, 30])).toBe('renewals.windows.withinDays:15')
    expect(renewalWindowLabel(t, 'j15', [])).toBe('renewals.windows.withinDays:15')
  })
})
