/**
 * #4605.7 — « Thème sombre sélectionné → passage par /login qui rebondit sur /chat → retour en clair ».
 *
 * Le thème choisi vit dans `localStorage` (`bellum-theme`). Il doit se retrouver à TOUT rechargement — y compris celui
 * d'un rebond d'adresse — et DÈS LE PREMIER PEINT : le choix est posé sur `<html>` par un script servi par nous
 * (`public/theme-init.js`, `script-src 'self'` interdit l'inline) avant que React ne monte, pas après un effet.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from './theme-provider'

const initScript = () => readFileSync(resolve(__dirname, '../../../public/theme-init.js'), 'utf8')
const indexHtml = () => readFileSync(resolve(__dirname, '../../../index.html'), 'utf8')

function runInit(stored: string | null, systemDark: boolean) {
  const classes = new Set<string>(['dark'])
  const fakeWindow = {
    localStorage: { getItem: () => stored },
    matchMedia: () => ({ matches: systemDark }),
    document: {
      documentElement: {
        classList: {
          toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)),
        },
      },
    },
  }
  new Function('window', 'document', 'localStorage', initScript())(
    fakeWindow,
    fakeWindow.document,
    fakeWindow.localStorage,
  )
  return classes.has('dark')
}

describe('le thème choisi se pose avant le premier peint', () => {
  it('index.html charge le script du thème AVANT le module de l’application', () => {
    const html = indexHtml()
    const init = html.indexOf('src="/theme-init.js"')
    expect(init).toBeGreaterThan(-1)
    expect(init).toBeLessThan(html.indexOf('src="/src/main.tsx"'))
  })

  it('« sombre » choisi reste sombre, « clair » choisi reste clair, quel que soit le système', () => {
    expect(runInit('dark', false)).toBe(true)
    expect(runInit('light', true)).toBe(false)
  })

  it('sans choix ou « système » : le système décide', () => {
    expect(runInit(null, false)).toBe(false)
    expect(runInit('system', true)).toBe(true)
  })

  it('un stockage qui lève ne casse rien et laisse le défaut sombre de la page', () => {
    const classes = new Set<string>(['dark'])
    const boom = {
      get localStorage(): never {
        throw new Error('SecurityError')
      },
      matchMedia: () => ({ matches: false }),
    }
    expect(() =>
      new Function('window', 'document', initScript())(boom, {
        documentElement: {
          classList: { toggle: (n: string, on: boolean) => (on ? classes.add(n) : classes.delete(n)) },
        },
      }),
    ).not.toThrow()
    expect(classes.has('dark')).toBe(true)
  })
})

describe('ThemeProvider — un stockage qui lève n’est pas un écran blanc', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark')
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('le thème sombre mémorisé est posé dès le montage', () => {
    localStorage.setItem('bellum-theme', 'dark')
    render(<ThemeProvider>{null}</ThemeProvider>)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    localStorage.clear()
  })

  it('lecture du stockage impossible : le provider monte (défaut système), il ne lève pas', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => render(<ThemeProvider>{null}</ThemeProvider>)).not.toThrow()
  })
})
