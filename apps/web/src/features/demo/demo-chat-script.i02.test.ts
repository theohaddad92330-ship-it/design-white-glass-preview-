import { describe, expect, it } from 'vitest'
import { DEMO_CHAT_PROMPTS } from './demo-chat-script'

const prompt = (id: string) => {
  const found = DEMO_CHAT_PROMPTS.find(p => p.id === id)
  expect(found, `${id} doit exister dans la salle`).toBeDefined()
  return found!
}

/** Lot I02 — les trois réponses scriptées que la recette suivante rejoue à l'écran. */
describe('#3889.2 — p-needs-history : les besoins fermés sont un historique, jamais une piste', () => {
  const a = prompt('p-needs-history').answer
  it('nomme les trois besoins fermés semés et les range en historique', () => {
    expect(a).toContain('3 besoins fermés')
    expect(a).toContain('Historique (fermés)')
    for (const title of [
      'socle de conteneurs',
      'industrialisation des déploiements',
      'reprise d’un cluster existant',
    ]) {
      expect(a).toContain(title)
    }
  })
  it('sait dire NON : aucune piste ouverte, aucune généralisation aux autres comptes (#3889.5)', () => {
    expect(a).toMatch(/pas des pistes ouvertes/)
    expect(a).toMatch(/ne dit pas qu’ils n’en ont jamais eu/)
    expect(a).not.toMatch(/%/)
  })
})

describe('#3866 — p-account-fit-data-bi : pas de « Prioritaire » sur la seule taille ou ancienneté', () => {
  const a = prompt('p-account-fit-data-bi').answer
  it('exige un élément réel et nomme « À qualifier »', () => {
    expect(a).toContain('À qualifier')
    expect(a).toMatch(/projet, une demande, une relation/)
  })
  it('ne remplit pas une liste pour atteindre un nombre', () => {
    expect(a).toMatch(/ne remplis pas une liste/)
  })
})

describe('#3867 — p-strategy-full : une recommandation, des arbitrages, aucune garantie', () => {
  const a = prompt('p-strategy-full').answer
  it('ouvre sur une recommandation et nomme les arbitrages', () => {
    expect(a.startsWith('**Ma recommandation')).toBe(true)
    expect(a).toContain('Les arbitrages')
  })
  it('applique les cinq dimensions sans nommer la méthode', () => {
    for (const dim of ['Le périmètre', 'Le problème', 'Les personnes', 'Les preuves', 'Le passage à l’action']) {
      expect(a).toContain(dim)
    }
    expect(a).not.toMatch(/5P|SalesConnect/)
  })
  it('ne garantit ni délai ni résultat', () => {
    expect(a).toMatch(/Je ne promets ni délai de démarrage ni résultat commercial/)
    expect(a).not.toMatch(/garanti(?!s)\s+(?:sous|en)\s+\d/i)
  })
})

describe('#3889.1 — p-experience-search : une absence se nomme, elle ne se généralise pas', () => {
  const a = prompt('p-experience-search').answer
  it('dit aucun résultat ET la portée (CV autorisés, clients masqués)', () => {
    expect(a).toContain('aucun')
    expect(a).toMatch(/consentement est valide/)
    expect(a).toMatch(/masqué/)
  })
  it('sait dire NON : ne nomme aucun consultant rattaché à un compte réel', () => {
    expect(a).not.toMatch(/Camille|Hakim|Yanis|Salomé|Antoine|Inès|Marc|Léa|Anthony/)
  })
})

describe('#3871 — la salle nomme « déjà en historique » et « déjà écarté »', () => {
  it('historique : rien n’est reproposé, on archive sans supprimer', () => {
    const a = prompt('p-contact-departure-historique').answer
    expect(a).toContain('déjà en historique')
    expect(a).toMatch(/ne supprime jamais/)
  })
  it('écarté : un départ ne remplace pas un écartement explicite', () => {
    const a = prompt('p-contact-departure-ecarte').answer
    expect(a).toContain('déjà écartée')
    expect(a).toMatch(/ne remplace pas ce choix/)
  })
})

describe('#3876.5 — p-find-accounts-city : une ville reste une ville', () => {
  const found = prompt('p-find-accounts-city')
  it('la proposition porte la commune, jamais son département', () => {
    const [action] = found.pendingActions?.() ?? []
    expect(action).toMatchObject({ action: 'find_accounts', city: 'Lyon' })
    expect(action).not.toHaveProperty('department')
  })
  it('la réponse nomme la maille et n’élargit pas seule', () => {
    expect(found.answer).toContain('la commune de Lyon')
    expect(found.answer).toMatch(/pas tout le Rhône/)
  })
})
