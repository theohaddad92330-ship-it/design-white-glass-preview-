import { cadrageApplied } from '@bellum/contracts'
import { DEMO_ANALYSIS_RUNS, DEMO_VERIFICATION_RUNS } from './demo-dataset'

/**
 * Cadrage analyse (15/10, décision D) — le dossier livré affiche en tête
 * « Cadrage appliqué : … », lu sur le DERNIER run du compte. Craft n°9 : la
 * démo le montre rempli, avec un cadrage FICTIF, sur le compte que la salle
 * ouvre (Société Générale, qui porte déjà deux runs pour l'historique).
 */
describe('démo — « Cadrage appliqué » rempli sur le dossier Société Générale', () => {
  const latest = [...DEMO_ANALYSIS_RUNS]
    .filter(run => run.company === 'Société Générale')
    .sort((a, b) => a.daysAgo - b.daysAgo)[0]

  it('le dernier run porte un cadrage, et chaque question y a une réponse', () => {
    const parts = cadrageApplied(latest?.scope_selection ?? null).map(part => part.key)
    expect(parts).toEqual(expect.arrayContaining(['geo', 'priorities', 'roles', 'levels']))
  })

  it('le run plus ancien reste sans cadrage — un run d’avant la feature ne fabrique aucune ligne', () => {
    const older = DEMO_ANALYSIS_RUNS.find(run => run.company === 'Société Générale' && run !== latest)
    expect(cadrageApplied(older?.scope_selection ?? null)).toEqual([])
  })
})

// Théo B r1-recherche.N6 — « Cadrage conservé » sur BPCE : objectifs choisis, angle, zone, entités ciblées/exclues.
describe('démo — cadrage conservé sur le dossier Groupe BPCE', () => {
  const bpce = DEMO_VERIFICATION_RUNS.find(run => run.company === 'Groupe BPCE')

  it('porte les objectifs, l’angle, la zone, les entités ciblées et exclues, les postes et le niveau', () => {
    const parts = cadrageApplied(bpce?.scope_selection ?? null).map(part => part.key)
    expect(parts).toEqual(
      expect.arrayContaining(['objectives', 'angle', 'geo', 'included', 'excluded', 'roles', 'levels']),
    )
  })

  it('les entités nommées sont les VRAIES entités du groupe, pas un monde fictif', () => {
    expect(bpce?.scope_selection?.included_entities).toEqual([
      'Banque Populaire Auvergne-Rhône-Alpes',
      'Caisse d’Epargne Rhône Alpes',
    ])
    expect(bpce?.scope_selection?.excluded_entities).toEqual(['Natixis'])
  })

  it('SNCF reste sans cadrage conservé — pas de rappel fabriqué', () => {
    const sncf = DEMO_VERIFICATION_RUNS.find(run => run.company === 'SNCF')
    expect(cadrageApplied(sncf?.scope_selection ?? null)).toEqual([])
  })
})
