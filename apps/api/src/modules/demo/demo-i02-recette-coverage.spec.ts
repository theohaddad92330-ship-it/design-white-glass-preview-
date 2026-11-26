import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #3871 (lot I02) — « <contact> a quitté l'entreprise » : la recette du 09/10
 * n'a pas pu conclure faute de CAS (aucun contact `historique` ni `rejete`
 * identifié). La salle les porte maintenant TOUS LES DEUX, sur de vraies
 * fiches de Société Générale, pour que l'écran montre — en lecture seule —
 * « déjà en historique » et « déjà écarté » (`propose_contact_departure`).
 */
describe('#3871 — la salle porte un contact historique ET un contact écarté', () => {
  const sg = DEMO_DOSSIERS.find(d => d.account.company_name === 'Société Générale')
  const states = (sg?.contacts ?? []).map(c => c.lifecycle_state)

  it('LIT : le dossier Société Générale existe et porte des contacts', () => {
    expect(sg).toBeDefined()
    expect(states.length).toBeGreaterThan(5)
  })

  it('un contact `historique` (a quitté l’entreprise)', () => {
    expect(states).toContain('historique')
  })

  it('un contact `rejete` (écarté explicitement, terminal plus fort)', () => {
    expect(states).toContain('rejete')
  })

  it('sait dire NON : un contact actif n’est ni historique ni écarté', () => {
    expect(states.filter(s => s !== 'historique' && s !== 'rejete').length).toBeGreaterThan(0)
  })

  it('les deux fiches nommées par la réponse scriptée de la salle existent avec le bon état', () => {
    const byName = new Map((sg?.contacts ?? []).map(c => [c.full_name, c.lifecycle_state]))
    expect(byName.get('Karim Fassi')).toBe('historique')
    expect(byName.get('Hélène Marchetti')).toBe('rejete')
  })
})
