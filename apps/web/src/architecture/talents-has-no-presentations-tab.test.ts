import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TALENTS_TABS } from '@/features/consultants/view/talentsTabs'

/**
 * #4528 (Louis 24/10/2026, revient sur #4502 côté Talents, garde #4349) — TALENTS GARDE LA PERSONNE.
 *
 * Une présentation (consultant × besoin) ne vit qu'à UN endroit : Affaires › Présentations
 * (`/projects/presentations`). Talents = Vivier · Recrutement, et rien d'autre : ni onglet « Présentations » /
 * « Positionnements », ni liste de présentations montée dans la page, ni ancre qui l'ouvre.
 *
 * ⚠️ La garde protège une règle, elle ne l'invente pas : elle LIT les onglets réels, la page réelle et les
 * traductions réelles, et le témoin prouve qu'elle dit NON sur un `TALENTS_TABS` à trois entrées.
 */
const SRC = resolve(__dirname, '..')
const read = (file: string) => readFileSync(resolve(SRC, file), 'utf8')
const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const ALLOWED_TABS = ['vivier', 'recrutement']
const PRESENTATION_TAB = /presentation|positionnement|submission/i

/** Ce qui ne va pas dans une liste d'onglets de Talents, nommé — vide quand tout va bien. */
function talentsTabsViolations(tabs: readonly string[]): string[] {
  const found: string[] = []
  for (const tab of tabs) {
    if (PRESENTATION_TAB.test(tab)) found.push(`onglet présentations : ${tab}`)
    else if (!ALLOWED_TABS.includes(tab)) found.push(`onglet hors contrat : ${tab}`)
  }
  if (tabs.length !== ALLOWED_TABS.length) found.push(`${tabs.length} onglets au lieu de ${ALLOWED_TABS.length}`)
  return found
}

describe('#4528 — Talents n’a PAS d’onglet présentations', () => {
  it('lit un corpus réel — les onglets, la page et les traductions', () => {
    expect(TALENTS_TABS.length).toBeGreaterThan(0)
    expect(read('features/consultants/view/ConsultantsPage.tsx').length).toBeGreaterThan(5000)
    expect(read('i18n/locales/fr/consultants.json').length).toBeGreaterThan(5000)
  })

  it('TALENTS_TABS = Vivier · Recrutement', () => {
    expect(talentsTabsViolations(TALENTS_TABS)).toEqual([])
    expect([...TALENTS_TABS]).toEqual(ALLOWED_TABS)
  })

  it('SAIT DIRE NON : un TALENTS_TABS à trois entrées est refusé', () => {
    expect(talentsTabsViolations(['vivier', 'recrutement', 'positionnements'])).toEqual([
      'onglet présentations : positionnements',
      '3 onglets au lieu de 2',
    ])
    expect(talentsTabsViolations(['vivier', 'recrutement', 'presentations'])).not.toEqual([])
    expect(talentsTabsViolations(['vivier', 'recrutement', 'autre'])).not.toEqual([])
  })

  it('la page Talents ne monte ni liste de présentations ni fenêtre d’ajout', () => {
    const page = withoutComments(read('features/consultants/view/ConsultantsPage.tsx'))
    expect(page).not.toMatch(/SubmissionsView|PresentationsPage|PresentationsTable|AddPresentationDialog/)
    expect(page).not.toContain('id="positionnements"')
  })

  it('la barre de l’écran Recrutement ne renvoie pas non plus vers un onglet présentations', () => {
    const page = withoutComments(read('features/consultants/recruitment/RecruitmentPage.tsx'))
    expect(page.length).toBeGreaterThan(1000)
    expect(page).not.toMatch(/positionnements|bar\.presentations/)
  })

  it('aucune traduction `tabs.positionnements` ne survit dans Talents (toutes les langues)', () => {
    for (const lang of ['fr', 'en']) {
      const tabs = (JSON.parse(read(`i18n/locales/${lang}/consultants.json`)) as { tabs?: Record<string, string> }).tabs
      expect(tabs, lang).toBeDefined()
      expect(Object.keys(tabs ?? {}), lang).toEqual(ALLOWED_TABS)
    }
  })
})
