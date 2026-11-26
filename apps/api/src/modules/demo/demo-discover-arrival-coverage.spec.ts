import { DEMO_DISCOVER_ARRIVAL_COVERAGE } from './demo-coverage'
import { demoDiscoverResponse } from './demo-scripts'
import { DEMO_DISCOVER_SAVED_VIEWS } from './demo-seed.service'

/**
 * #4556 (craft rule n°9) — la démonstration ouvre Découvrir sur une LISTE, sans « Explorer » (collecte payante).
 * L'écran (`Discover.tsx`) propose la première recherche enregistrée de la salle (#4628 : au clic, jamais seule) ; ici on prouve que CHAQUE recherche
 * semée, rejouée contre la liste scriptée, ramène des cartes — et qu'une levée de fonds y porte le lien de son annonce.
 * Sait dire NON : une recherche semée qui ne ramènerait rien (« Résultat non vérifiable », « Albi · 250 à 999 »)
 * fait rougir ; la classification ne peut pas être « vide à dessein ».
 */
type Row = { name: string; signals: { type: string; url?: string }[] }
const rows = (filters: Record<string, unknown>) =>
  (demoDiscoverResponse({ ...filters }) as { candidates: Row[] }).candidates

describe('#4556 — Découvrir en démonstration : une liste dès l’arrivée', () => {
  it.each(DEMO_DISCOVER_SAVED_VIEWS.map(view => [view.name, view.filters] as const))(
    'la recherche enregistrée « %s » ramène au moins une carte',
    (_name, filters) => {
      expect(rows(filters).length).toBeGreaterThan(0)
    },
  )

  // #4556.2 — « vue · Lille » et « Albi · 250 à 999 » : « Reprendre » rend une LISTE (≥ 8 cartes), pas une page vide.
  it.each(['vue · Lille', 'Albi · 250 à 999'])('la recherche « %s » est semée et ramène au moins 8 cartes', name => {
    const view = DEMO_DISCOVER_SAVED_VIEWS.find(candidate => candidate.name === name)
    expect(view).toBeDefined()
    expect(rows(view?.filters ?? {}).length).toBeGreaterThanOrEqual(8)
  })

  // #4515.5 — en démo, une ville AVEC son rayon de 25 km rend une liste (la ville d'abord), et le rayon voyage dans la
  // requête : jamais un rayon affiché sur une liste vide.
  it('#4515.5 — une ville et son rayon de 25 km rendent des cartes, le rayon est gardé dans la requête', () => {
    const response = demoDiscoverResponse({ city: 'Lille', radiusKm: 25 }) as {
      candidates: (Row & { city: string | null })[]
      query: { radiusKm?: number }
    }
    expect(response.candidates.length).toBeGreaterThan(0)
    expect(response.candidates[0]?.city).toBe('Lille')
    expect(response.query.radiusKm).toBe(25)
  })

  it('la liste porte une levée de fonds avec le lien de son annonce, sur un domaine fictif', () => {
    const funded = rows({}).flatMap(row => row.signals.filter(signal => signal.type === 'funding'))
    expect(funded.length).toBeGreaterThan(0)
    for (const signal of funded) expect(signal.url).toMatch(/^https:\/\/[a-z0-9.-]+\.example\//)
  })

  // #4285.1 — la recherche que l'arrivée PROPOSE (première, ou dernière si l'écran trie du plus récent) rend la levée
  // datée ET son lien. Contrôle négatif : « Banque & assurance · Île-de-France » n'en porte pas, elle ne doit pas être aux bouts.
  const fundedWithLink = (filters: Record<string, unknown>) =>
    rows(filters).some(row => row.signals.some(signal => signal.type === 'funding' && Boolean(signal.url)))
  it('#4285.1 — les deux bouts de la liste des recherches semées montrent une levée avec son lien', () => {
    const views = DEMO_DISCOVER_SAVED_VIEWS
    expect(fundedWithLink(views[0]!.filters)).toBe(true)
    expect(fundedWithLink(views[views.length - 1]!.filters)).toBe(true)
  })
  it('#4285.1 (négatif) — la recherche Banque & assurance ne porte pas de levée', () => {
    const bank = DEMO_DISCOVER_SAVED_VIEWS.find(view => view.name.startsWith('Banque'))
    expect(fundedWithLink(bank?.filters ?? {})).toBe(false)
  })

  it('est classée « seedée », avec sa raison', () => {
    expect(DEMO_DISCOVER_ARRIVAL_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_ARRIVAL_COVERAGE.reason).toContain('demo-discover-arrival-coverage.spec.ts')
  })
})
