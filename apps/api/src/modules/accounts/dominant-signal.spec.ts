import { pickDominantSignal, readSignalPreview, signalFreshnessOf } from './accounts.service'

/**
 * #3682.1 — le « signal dominant » est le fait le plus utile à la décision
 * d'aujourd'hui, pas le premier de la liste. Un fait de 2024 ne passe pas
 * devant un fait actuel parce que l'analyse a été relancée en 2026.
 */
describe('pickDominantSignal (#3682.1)', () => {
  const archive = { title: 'Plan 2024', date: '2024-03', freshness: 'archive' }
  const current = { title: 'Appel d’offres juin 2026', date: '2026-06', freshness: 'current' }
  const undated = { title: 'Sans date' }

  it('préfère un fait actuel à un fait ancien placé avant lui', () => {
    expect(pickDominantSignal([archive, current])).toBe(current)
  })

  it('sans fait actuel, garde le premier — contexte historique, jamais caché', () => {
    expect(pickDominantSignal([archive, { ...archive, title: 'Autre 2023' }])).toBe(archive)
  })

  it('un fait sans fraîcheur passe avant un fait ancien, jamais avant un actuel', () => {
    expect(pickDominantSignal([archive, undated])).toBe(undated)
    expect(pickDominantSignal([undated, current])).toBe(current)
  })

  it('liste vide ou absente : rien, aucun signal inventé', () => {
    expect(pickDominantSignal([])).toBeNull()
    expect(pickDominantSignal(null)).toBeNull()
  })

  it('l’aperçu porte la fraîcheur du fait, sans la deviner', () => {
    expect(readSignalPreview(archive)?.freshness).toBe('archive')
    expect(readSignalPreview(undated)?.freshness).toBeNull()
    expect(readSignalPreview({ ...archive, freshness: 'bizarre' })?.freshness).toBeNull()
  })
})

/**
 * LUDB.7 bis — pour un espace NON-IT, un signal purement IT (« assistant IA » chez Clauger,
 * type `tech`) n'est jamais le signal dominant. Le pack de l'espace est PASSÉ, pas deviné.
 */
describe('pickDominantSignal — pack de l’espace (LUDB.7 bis)', () => {
  const tech = { title: 'Déploie un assistant IA', date: '2026-10', freshness: 'current', type: 'tech' }
  const hiring = { title: 'Recrute un conducteur de travaux', date: '2026-09', freshness: 'current', type: 'hiring' }

  it('espace industriel : le signal tech cède devant un signal de son métier', () => {
    expect(pickDominantSignal([tech, hiring], 'industrial_engineering')).toBe(hiring)
  })

  it('espace industriel : un seul signal tech ⇒ aucun dominant (on n’affiche pas un signal hors métier)', () => {
    expect(pickDominantSignal([tech], 'industrial_engineering')).toBeNull()
  })

  it('NON-RÉGRESSION IT : espace esn_it ou pack inconnu, le choix est identique à avant', () => {
    expect(pickDominantSignal([tech, hiring], 'esn_it')).toBe(tech)
    expect(pickDominantSignal([tech, hiring])).toBe(tech)
    expect(pickDominantSignal([tech, hiring], null)).toBe(tech)
  })

  it('la fraîcheur du ligne suit le même choix', () => {
    const freshness = signalFreshnessOf([tech, hiring], null, 'industrial_engineering')
    expect(freshness).toEqual(signalFreshnessOf([hiring], null))
  })
})
