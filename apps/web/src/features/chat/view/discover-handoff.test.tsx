import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PendingChatAction } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { filtersFromSearch } from '@/features/discover/lib/discover-prefill'
import { contextModeFromSearch } from '@/features/discover/lib/discover-context-mode'
import { isStartupSegmentActive } from '@/features/discover/lib/discover-query'
import { DiscoverHandoff, discoverCriteriaOfReply, discoverHandoffTarget, discoverSearch } from './discover-handoff'
import { renderMarkdown } from './markdown'

/**
 * #2472 — « quand je clique sur découvrir la requête de découvrir est pas préremplie »
 *
 * Le préremplissage existait, mais par UN seul chemin : la carte de proposition
 * (`PendingActions`, `navigate({ to: '/discover', search: discoverSearch(action) })`).
 * L'AUTRE chemin — le lien que Laura écrit dans le TEXTE de sa réponse, que son
 * prompt lui demande explicitement d'écrire (`[Découvrir](/discover)`,
 * `bellum_advisor.py:767`) — partait NU. Même bulle, même réponse, mêmes
 * critères à l'écran : l'un les emporte, l'autre non.
 */

const CRITERIA: PendingChatAction = {
  action: 'find_accounts',
  sectors: ['it'],
  signals: ['hiring'],
  department: '31',
  headcount: '1000+',
  keywords: 'aéronautique',
}

function renderReply(text: string, criteria: Readonly<Record<string, string>> | null) {
  return renderWithRouter(<DiscoverHandoff criteria={criteria}>{renderMarkdown(text)}</DiscoverHandoff>)
}

describe('#2472 — les critères de la réponse voyagent avec le lien', () => {
  it('le lien écrit dans le texte emporte les critères que la réponse a préparés', async () => {
    const criteria = discoverCriteriaOfReply([CRITERIA])
    renderReply('Regarde [Découvrir](/discover) pour la suite.', criteria)
    const link = await screen.findByRole('link', { name: 'Découvrir' })
    const href = link.getAttribute('href') ?? ''
    expect(href).toMatch(/^\/discover\?/)
    expect(href).toContain('sectors=it')
    expect(href).toContain('signals=hiring')
    expect(href).toContain('headcount=1000%2B')
    expect(href).toContain('keywords=a%C3%A9ronautique')
  })

  it('les DEUX chemins emportent exactement les mêmes critères (GA-26)', () => {
    // La carte de proposition dérive ses paramètres de `discoverSearch` ; le lien
    // du texte dérive les siens de `discoverCriteriaOfReply`, qui l'appelle. Deux
    // dérivations de la même chose divergeraient.
    expect(discoverCriteriaOfReply([CRITERIA])).toEqual(discoverSearch(CRITERIA))
  })

  it('témoin — un autre écran ne reçoit RIEN, même quand des critères existent', async () => {
    renderReply('Le détail est dans [Comptes](/accounts).', discoverCriteriaOfReply([CRITERIA]))
    expect(await screen.findByRole('link', { name: 'Comptes' })).toHaveAttribute('href', '/accounts')
  })

  it('témoin — sans critère préparé, le lien reste celui d’avant ce lot', async () => {
    renderReply('- **[Découvrir](/discover)** : pour en trouver de nouveaux', null)
    expect(await screen.findByRole('link', { name: 'Découvrir' })).toHaveAttribute('href', '/discover')
  })

  it('un lien qui porte DÉJÀ sa requête n’est pas réécrit', async () => {
    renderReply('Va voir [Découvrir](/discover?sectors=finance).', discoverCriteriaOfReply([CRITERIA]))
    expect(await screen.findByRole('link', { name: 'Découvrir' })).toHaveAttribute('href', '/discover?sectors=finance')
  })

  it('une proposition sans aucun critère exploitable ne fabrique pas de requête vide', () => {
    expect(discoverCriteriaOfReply([{ action: 'find_accounts' }])).toBeNull()
    expect(discoverCriteriaOfReply([])).toBeNull()
    expect(discoverCriteriaOfReply([{ action: 'open_screen', route: '/discover', label: 'Découvrir' }])).toBeNull()
  })

  /**
   * La preuve qui compte : l'URL produite est-elle RELUE par l'écran d'arrivée ?
   * « Le lien porte une requête » ne dit rien tant que `discover-prefill` n'en
   * tire pas des filtres — c'est le défaut « déclaré au contrat, posé dans
   * l'URL, jamais lu » que ce dépôt a déjà payé deux fois.
   */
  it('l’URL produite est réellement relue par le rail de Découvrir', () => {
    const target = discoverHandoffTarget('/discover', discoverCriteriaOfReply([CRITERIA]))
    const filters = filtersFromSearch(Object.fromEntries(new URLSearchParams(target.split('?')[1] ?? '')))
    expect(filters).not.toBeNull()
    expect(filters?.department).toBe('31')
    expect(filters?.headcount).toEqual(['1000+'])
    expect(filters?.signalSources).toEqual(['hiring'])
    expect(filters?.keywords).toBe('aéronautique')
    expect(filters?.sectors.length).toBeGreaterThan(0)
  })

  // #3941.1 — recette prod R4b : « startup levée de fonds » répondait « Précise
  // ta demande ». `company_profile: 'startup'` écrit le MÊME préréglage que le
  // chip « Startup » du rail (`applyStartupSegment`) — vérifié ici par le rail
  // lui-même (`isStartupSegmentActive`), pas par une réécriture de ses valeurs.
  it('#3941.1 — `company_profile: startup` ouvre Découvrir avec le préréglage Startup actif', () => {
    const action: PendingChatAction = { action: 'find_accounts', company_profile: 'startup' }
    const target = discoverHandoffTarget('/discover', discoverSearch(action))
    const filters = filtersFromSearch(Object.fromEntries(new URLSearchParams(target.split('?')[1] ?? '')))
    expect(filters).not.toBeNull()
    expect(isStartupSegmentActive(filters!)).toBe(true)
  })

  it('la proposition la plus RÉCENTE gagne — c’est celle que la personne vient de lire', () => {
    const older: PendingChatAction = { action: 'find_accounts', sectors: ['finance'] }
    expect(discoverCriteriaOfReply([older, CRITERIA])).toEqual(discoverSearch(CRITERIA))
  })

  /**
   * #2165.64 — le marqueur d'ORIGINE.
   *
   * Sans lui, l'écran ne peut pas distinguer « Laura a composé cette URL » de
   * « le commercial recharge SA PROPRE recherche, déjà écrite dans l'URL par
   * #2165.64 » — les deux portent les MÊMES clés (`sectors`, `department`…).
   * Seul ce marqueur déclenche la mention « préparé par Laura ».
   */
  it('#2165.64 — une vraie proposition porte le marqueur d’origine', () => {
    expect(discoverSearch(CRITERIA).laura).toBe('1')
  })

  it('#2165.64 — une proposition sans critère ne fabrique pas le marqueur', () => {
    expect(discoverSearch({ action: 'find_accounts' })).toEqual({})
  })

  /**
   * #2454.4/.5/.9 — le mode de contexte RÉSOLU par Laura (`chat.py`,
   * `req.context_mode`) survit au clic vers Découvrir, comme `sectors` ou
   * `department` : `discoverSearch` le pose en `context`, la même clé que lit
   * `contextModeFromSearch` (`discover-context-mode.ts`) sur `?context=`.
   */
  it('#2454.4/.5/.9 — le mode de contexte connu du tour voyage vers Découvrir', () => {
    expect(discoverSearch({ ...CRITERIA, context_mode: 'neutral' }).context).toBe('neutral')
  })

  it('#2454.4/.5/.9 — aucun mode connu du tour, aucune clé `context` devinée', () => {
    expect(discoverSearch(CRITERIA)).not.toHaveProperty('context')
  })

  /**
   * #2454.4 — le mode DÉCLARÉ sous le composeur (#2453) voyage dans l'URL,
   * comme les critères, sous la MÊME clé (`context`) que
   * `routes/discover/index.tsx` lit déjà au chargement — donc CONSERVÉ sans
   * code neuf côté Découvrir. Dit NON tant que le mode n'atteint pas la clé
   * que l'écran d'arrivée relit réellement (même doctrine que la preuve
   * ci-dessus : « déclaré au contrat, posé dans l'URL, jamais lu »).
   */
  it('#2454.4 — le mode de contexte voyage avec les critères, sous la clé que Découvrir relit', () => {
    const withMode: PendingChatAction = { ...CRITERIA, context_mode: 'neutral' }
    const search = discoverSearch(withMode)
    expect(search.context).toBe('neutral')
    expect(contextModeFromSearch(search.context)).toBe('neutral')
  })

  it('#2454.4 — absent, aucune clé `context` ne part (comportement d’avant ce point)', () => {
    expect(discoverSearch(CRITERIA).context).toBeUndefined()
  })

  /**
   * #3392 (reste, recette prod 30/09) — « la carte Découvrir n'a pas le
   * filtre région AURA ». `discoverSearch` composait déjà `sectors`,
   * `department`… mais jamais `region` : le seul critère géographique LARGE
   * qu'une proposition puisse porter disparaissait avant même d'atteindre
   * l'URL.
   */
  it('#3392 — le code région voyage jusqu’à l’URL, et le rail de Découvrir le relit', () => {
    const withRegion: PendingChatAction = { action: 'find_accounts', region: ['84'] }
    expect(discoverSearch(withRegion).region).toBe('84')
    const target = discoverHandoffTarget('/discover', discoverCriteriaOfReply([withRegion]))
    const filters = filtersFromSearch(Object.fromEntries(new URLSearchParams(target.split('?')[1] ?? '')))
    expect(filters?.region).toEqual(['84'])
  })

  it('#3392 — sans région déclarée, aucune clé `region` ne part', () => {
    expect(discoverSearch(CRITERIA)).not.toHaveProperty('region')
  })
})
