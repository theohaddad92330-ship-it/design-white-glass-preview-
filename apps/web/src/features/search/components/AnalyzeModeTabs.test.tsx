import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AnalyzeModeTabs } from './AnalyzeChrome'

/**
 * #4542 — la rangée d'onglets de « Analyser un compte » était écrasée en hauteur par la carte de
 * progression (`flex-1`), sa sœur dans la colonne flex de `Search.tsx` : `overflow-x-auto` ramène la
 * hauteur minimale automatique d'un enfant flex à 0, et sans `shrink-0` la rangée cède sa hauteur.
 * jsdom ne calcule pas de mise en page : la garde lit donc la CLASSE qui l'empêche, et la preuve de
 * rendu réel (Chromium, 1512 px et 768 px) est dans le rapport du lot.
 */
describe('#4542 — AnalyzeModeTabs garde sa hauteur', () => {
  it('le tablist est `shrink-0` : un parent flex à hauteur contrainte ne l’écrase pas', () => {
    render(<AnalyzeModeTabs mode="company" onModeChange={() => {}} onMany={() => {}} />)
    const tablist = screen.getByRole('tablist')
    expect(tablist.className).toMatch(/(^|\s)shrink-0(\s|$)/)
  })

  it('chaque onglet garde sa cible ≥ 44 px au tactile (min-h-11)', () => {
    render(<AnalyzeModeTabs mode="company" onModeChange={() => {}} onMany={() => {}} />)
    for (const tab of screen.getAllByRole('tab')) expect(tab.className).toContain('min-h-11')
  })
})
