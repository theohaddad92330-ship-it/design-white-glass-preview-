import { describe, expect, it } from 'vitest'
import { CAPABILITY_TIERS, TIERED_VOCABULARY, tierOf, tieredActions } from './capability-tiers'

/**
 * #1444 — LES TROIS RANGS COUVRENT TOUT LE VOCABULAIRE DU SERVEUR.
 *
 * La garde qui compte : une action sans rang serait **silencieusement absente**
 * de la carte. L'utilisateur verrait « connecté » sans savoir que cet outil sait
 * écrire chez lui — exactement l'inverse de ce que l'issue demande. C'est le
 * même défaut que les icônes en double : une propriété répartie que personne ne
 * peut vérifier à l'œil.
 */
describe('les rangs de capacité', () => {
  it('lit un vocabulaire réel, et pas une liste vide', () => {
    expect(TIERED_VOCABULARY.length).toBeGreaterThan(25)
    expect(CAPABILITY_TIERS).toEqual(['read', 'prepare', 'act'])
  })

  it('range CHAQUE action du vocabulaire serveur — aucune orpheline', () => {
    // Le nom fautif est DANS la valeur comparée : sans lui l'échec dirait
    // « 3 n'est pas 0 » et il faudrait le déboguer.
    expect(TIERED_VOCABULARY.filter(action => tierOf(action) === null)).toEqual([])
  })

  it('ne range aucune action qui n’existe pas au vocabulaire', () => {
    const known = new Set(TIERED_VOCABULARY)
    const orphans = ['read_emails', 'send_email', 'create_draft'].filter(a => !known.has(a))
    expect(orphans).toEqual([])
  })

  it('met la frontière au bon endroit : lire, préparer, sortir', () => {
    // Lire — rien ne bouge chez l'outil. `import_contacts` fait entrer de la
    // donnée DANS Bellum : c'est notre base qui change, pas la sienne.
    expect(tierOf('read_emails')).toBe('read')
    expect(tierOf('list_events')).toBe('read')
    expect(tierOf('import_contacts')).toBe('read')
    // Préparer — le produit fabrique, rien ne part.
    expect(tierOf('create_draft')).toBe('prepare')
    expect(tierOf('enrich_contact')).toBe('prepare')
    // Agir — ça SORT, et jamais sans un geste humain.
    expect(tierOf('send_email')).toBe('act')
    expect(tierOf('export_contact')).toBe('act')
    expect(tierOf('create_event')).toBe('act')
  })

  it('rend une action inconnue null plutôt que de la classer au hasard', () => {
    expect(tierOf('teleporter_le_consultant')).toBeNull()
  })
})

describe('le regroupement affiché', () => {
  it('garde l’ordre des rangs, quel que soit celui des actions', () => {
    const groups = tieredActions(['send_email', 'read_emails', 'create_draft'])
    expect(groups.map(g => g.tier)).toEqual(['read', 'prepare', 'act'])
  })

  it('RETIRE un rang vide — « ne sait que lire » doit se voir', () => {
    const groups = tieredActions(['read_emails', 'list_events'])
    expect(groups.map(g => g.tier)).toEqual(['read'])
    expect(groups[0]?.actions).toEqual(['read_emails', 'list_events'])
  })

  it('ne rend rien du tout quand le serveur n’autorise aucune action', () => {
    expect(tieredActions([])).toEqual([])
  })

  it('ignore une action hors vocabulaire au lieu de la ranger de force', () => {
    expect(tieredActions(['read_emails', 'teleporter'])).toEqual([{ tier: 'read', actions: ['read_emails'] }])
  })
})
