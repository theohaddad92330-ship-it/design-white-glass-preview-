import { DEMO_DISCOVER_HOLDING_SUBSIDIARY_COVERAGE } from './demo-coverage'
import { demoDiscoverResponse } from './demo-scripts'

/**
 * #3983 (reste) — « et en démonstration, la holding écartée au profit de sa filiale montre quoi ? »
 * Craft rule n°9 : aucun champ de table à lui ; ce fichier lit la VRAIE réponse scriptée, sans
 * `discoverResponseSchema.parse` (qui retirerait `qualification`, non déclaré au schéma).
 */
describe('#3983 — holding → filiale, en démonstration', () => {
  it('est classé seedé, avec sa raison', () => {
    expect(DEMO_DISCOVER_HOLDING_SUBSIDIARY_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_HOLDING_SUBSIDIARY_COVERAGE.reason).toContain('#3983')
  })

  it('la vue PAR DÉFAUT porte la holding écartée ET sa filiale, qui dit son groupe', () => {
    const response = demoDiscoverResponse({}) as { candidates: Array<Record<string, unknown>> }
    const holding = response.candidates.find(
      c => (c['qualification'] as { code?: string } | undefined)?.code === 'holding_subsidiary_in_zone',
    )
    expect(holding?.['qualification']).toMatchObject({ verdict: 'excluded' })
    const reason = (holding?.['qualification'] as { reason: string }).reason
    const subsidiary = response.candidates.find(c => {
      const link = c['groupLink'] as { kind: string; entities: string[] } | undefined
      return link?.kind === 'capital_link' && link.entities.includes(String(holding?.['name']))
    })
    expect(subsidiary).toBeDefined()
    expect(reason).toContain(String(subsidiary?.['name']))
    expect((subsidiary?.['qualification'] as { verdict?: string } | undefined)?.verdict).not.toBe('excluded')
  })

  // #3983 (recette prod 13/10) — « Groupe Aurélys n'apparaît PAS parmi les écartées » : en cherchant
  // la santé (NAF 86.10Z) ou la zone de la filiale (Lyon), le NAF/département de la holding (64.20Z,
  // Paris) la retirait AVANT qu'elle ne soit écartée — la tête de groupe disparaissait au lieu d'être
  // listée avec son motif. Comme le vrai chemin (`holding_subsidiary.py`), elle suit sa filiale retenue.
  const headOf = (response: { candidates: Array<Record<string, unknown>> }) =>
    response.candidates.find(
      c => (c['qualification'] as { code?: string } | undefined)?.code === 'holding_subsidiary_in_zone',
    )

  it.each([
    ['le NAF de la filiale', { nafCode: '86.10Z' }],
    ['la zone de la filiale', { departments: ['69'] }],
  ])('la holding écartée reste listée, motif nommé, quand la recherche cible %s', (_label, query) => {
    const response = demoDiscoverResponse({ ...query, includeOutOfTarget: true }) as {
      candidates: Array<Record<string, unknown>>
    }
    expect(response.candidates.some(c => c['name'] === 'Pharmatek Santé (démo)')).toBe(true)
    const head = headOf(response)
    expect(head?.['name']).toBe('Groupe Aurélys (démo)')
    expect((head?.['qualification'] as { reason: string }).reason).toContain('Pharmatek Santé (démo)')
  })

  it('une holding dont la filiale n’est PAS retenue ne s’invite pas dans la liste', () => {
    const response = demoDiscoverResponse({ nafCode: '30.11Z' }) as { candidates: Array<Record<string, unknown>> }
    expect(headOf(response)).toBeUndefined()
  })

  it('la tête de groupe listée n’est pas comptée en plus parmi les « hors cible écartés »', () => {
    // La filiale est NOMMÉE par la recherche (choix explicite) : elle passe la cible, sa tête la suit.
    const response = demoDiscoverResponse({ nafCode: '86.10Z', freetext: 'Pharmatek' }) as {
      candidates: Array<Record<string, unknown>>
      targetSectorFilter?: { excludedCount: number; excludedSectors: string[] }
    }
    expect(headOf(response)?.['name']).toBe('Groupe Aurélys (démo)')
    expect(response.targetSectorFilter?.excludedSectors ?? []).not.toContain('Santé privée — société holding du groupe')
  })
})
