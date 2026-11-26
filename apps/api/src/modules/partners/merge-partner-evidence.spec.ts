import type { MarketEsnObserved } from '@bellum/contracts'
import { mergePartnerEvidence } from './observed-esn'

/**
 * #1605 — UNE LIGNE PAR ESN, TOUTES SES PREUVES CONSERVÉES.
 *
 * Ce que cette suite tient, et qui est le cœur du retour : « même ESN déclarée +
 * observée + inférée → UNE ligne → toutes les preuves conservées ». L'ancienne
 * forme (#1579) gardait deux listes et un drapeau ; elle obligeait à DÉDUIRE que
 * trois chemins concordaient, au lieu de le montrer.
 */

const partner = (name: string, source: 'declared' | 'analysis') => ({ name, source })
const observed = (esnName: string, persons: number): MarketEsnObserved => ({
  esnName,
  persons,
  certainty: 'forte',
})

describe('mergePartnerEvidence', () => {
  it('porte les TROIS origines sur une seule ligne quand elles concordent', () => {
    // Déclarée par l'équipe ET observée : deux chemins indépendants, une ligne.
    const { partners, unmatched } = mergePartnerEvidence([partner('ALTEN', 'declared')], [observed('ALTEN', 9)])

    expect(partners).toHaveLength(1)
    expect(partners[0]!.evidence_origins).toEqual(['workspace_declared', 'market_observation'])
    expect(partners[0]!.market_observation_count).toBe(9)
    // Et elle ne réapparaît PAS dans le bloc des observées : c'est le doublon visé.
    expect(unmatched).toEqual([])
  })

  it('une ligne DÉTECTÉE et observée porte « source actuelle » et « observation »', () => {
    const { partners } = mergePartnerEvidence([partner('CGI', 'analysis')], [observed('CGI', 4)])

    expect(partners[0]!.evidence_origins).toEqual(['market_observation', 'current_inference'])
  })

  it('rapproche par la MÊME normalisation que la mémoire marché', () => {
    // « Groupe SII » et « SII » sont la même société — les séparer produirait
    // exactement le doublon que le retour veut supprimer.
    const { partners, unmatched } = mergePartnerEvidence([partner('SII', 'declared')], [observed('Groupe SII', 6)])

    expect(partners[0]!.evidence_origins).toContain('market_observation')
    expect(partners[0]!.market_observation_count).toBe(6)
    expect(unmatched).toEqual([])
  })

  it('garde le nom de la DÉCLARATION HUMAINE, jamais celui du corpus', () => {
    // Le commercial a tapé « SG », le corpus écrit « Groupe SG ». Une observation
    // ne remplace jamais une déclaration humaine.
    const { partners } = mergePartnerEvidence([partner('SG', 'declared')], [observed('Groupe SG', 12)])

    expect(partners[0]!.name).toBe('SG')
  })

  it('rend `null` — et jamais `0` — quand le corpus n’observe pas la société', () => {
    const { partners } = mergePartnerEvidence([partner('ALTEN', 'declared')], [])

    expect(partners[0]!.market_observation_count).toBeNull()
    expect(partners[0]!.evidence_origins).toEqual(['workspace_declared'])
  })

  it('laisse dans le bloc « observées » ce que l’espace ne connaît PAS encore', () => {
    const { partners, unmatched } = mergePartnerEvidence(
      [partner('ALTEN', 'declared')],
      [observed('ALTEN', 9), observed('CAPGEMINI', 3)],
    )

    expect(partners).toHaveLength(1)
    expect(unmatched.map(entry => entry.esnName)).toEqual(['CAPGEMINI'])
    // `alsoKnown` est faux par construction : ce qui reste ici n'est justement
    // pas connu de l'espace.
    expect(unmatched[0]!.alsoKnown).toBe(false)
  })

  it('conserve l’ORDRE du corpus dans les non-rapprochées', () => {
    // Le corpus est déjà trié par nombre de parcours ; re-trier ici ferait une
    // seconde source de vérité sur l'ordre.
    const { unmatched } = mergePartnerEvidence([], [observed('A', 9), observed('B', 3), observed('C', 1)])

    expect(unmatched.map(entry => entry.esnName)).toEqual(['A', 'B', 'C'])
  })

  it('ne rapproche RIEN sur un nom qui ne produit aucune clé', () => {
    // Une clé vide rapprocherait tout de tout.
    const { partners, unmatched } = mergePartnerEvidence([partner('   ', 'declared')], [observed('   ', 4)])

    expect(partners[0]!.market_observation_count).toBeNull()
    expect(unmatched).toHaveLength(1)
  })

  it('rend une liste vide des deux côtés quand il n’y a rien', () => {
    expect(mergePartnerEvidence([], [])).toEqual({ partners: [], unmatched: [] })
  })
})

/**
 * #1590.7 — LA PRÉMISSE DE LA DÉCISION « LA FUSION RESTE CÔTÉ TYPESCRIPT ».
 *
 * #1590 (T7) demande cette fusion un cran plus haut, dans le producteur
 * (`apps/ia/app/services/esn_presence.py`). On la garde ici, et la première
 * des quatre raisons est que le résultat demandé est déjà livré — EN AVAL du
 * producteur, sur une entrée plus large. Cette suite le PROUVE au lieu de
 * l'affirmer : si elle tombait, la décision n'aurait plus son premier appui,
 * et il faudrait la reprendre avant que quelqu'un re-propose le portage.
 *
 * Le détail de la décision, ses quatre raisons et son jumeau Python : le
 * docblock de `mergePartnerEvidence` (`observed-esn.ts`).
 */
describe('#1590.7 — « observée + détectée » est déjà fusionné ici, en aval du producteur', () => {
  it('deux variantes du même nom ne font qu’UNE ligne portant les DEUX origines', () => {
    // Le cas exact que le portage aurait dû traiter en Python : le corpus écrit
    // « Groupe SII », le modèle a détecté « SII ». `build_esn_presence` ne
    // déduplique que par nom simple et les laisserait côte à côte ; ici, la
    // normalisation partagée de la mémoire marché les rapproche.
    const { partners, unmatched } = mergePartnerEvidence([partner('SII', 'analysis')], [observed('Groupe SII', 6)])

    expect(partners).toHaveLength(1)
    // « Pas de doublon » : rien ne réapparaît dans le bloc des observées.
    expect(unmatched).toEqual([])
    // Et « certitude montée » se dit ici sans rien écraser : les deux chemins
    // sont NOMMÉS, au lieu d'être résumés en un mot.
    expect(partners[0]!.evidence_origins).toEqual(['market_observation', 'current_inference'])
    expect(partners[0]!.market_observation_count).toBe(6)
  })

  it('l’entrée est plus large que celle du producteur — une DÉCLARATION humaine y entre aussi', () => {
    // Le service IA ne voit jamais ce qu'un humain a saisi dans l'espace :
    // remonter la fusion chez lui perdrait cette troisième corroboration.
    const { partners } = mergePartnerEvidence(
      [partner('ALTEN', 'declared'), partner('CGI', 'analysis')],
      [observed('ALTEN', 9)],
    )

    expect(partners[0]!.evidence_origins).toEqual(['workspace_declared', 'market_observation'])
    expect(partners[1]!.evidence_origins).toEqual(['current_inference'])
  })
})

/**
 * #1624 (décision du 16/09/2026) — LE CORPUS DES FORMES QUE CETTE FUSION
 * PRODUIT VRAIMENT.
 *
 * Pourquoi cette suite existe. L'écran écrivait un prédicat — « seulement
 * observée » — contre une forme (`['market_observation']` seule) que cette
 * fonction ne produit JAMAIS : `mergePartnerEvidence` pousse toujours
 * `workspace_declared` ou `current_inference` à côté. Le prédicat était donc
 * structurellement faux, les deux CTA et un libellé n'étaient jamais rendus, et
 * les tests d'écran restaient verts parce qu'ils INVENTAIENT leur fixture.
 *
 * Ce bloc est l'ancre : il énumère, en faisant tourner la VRAIE fonction, la
 * liste exhaustive des combinaisons d'origines qu'une ligne canonique peut
 * porter. C'est cette liste que `TabPartners.observedOnly.test.tsx` recopie, et
 * l'assertion de TAILLE en tête est ce qui empêche un corpus vidé par accident
 * de rendre tout vert.
 */
describe('#1624 — les combinaisons d’origines réellement émises', () => {
  const corpus = [
    partner('ALTEN', 'declared'), // déclarée ET observée
    partner('CGI', 'analysis'), // détectée ET observée
    partner('Sopra', 'declared'), // déclarée, jamais observée
    partner('Atos', 'analysis'), // détectée, jamais observée
    partner('Devoteam', 'analysis'), // détectée ET observée (2e exemplaire)
  ]
  const observations = [observed('ALTEN', 9), observed('CGI', 4), observed('Devoteam', 4)]

  it('le corpus lu n’est pas vide — sinon cette suite garderait le vide', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(4)
    expect(observations.length).toBeGreaterThanOrEqual(3)
    const { partners } = mergePartnerEvidence(corpus, observations)
    expect(partners).toHaveLength(corpus.length)
  })

  it('énumère EXACTEMENT quatre formes, et `market_observation` n’est jamais seule', () => {
    const { partners } = mergePartnerEvidence(corpus, observations)
    const formes = [...new Set(partners.map(line => line.evidence_origins.join('+')))].sort()

    expect(formes).toEqual([
      'current_inference',
      'market_observation+current_inference',
      'workspace_declared',
      'workspace_declared+market_observation',
    ])
    // Le cœur du défaut : la forme que l'ancien prédicat exigeait n'existe pas.
    expect(formes).not.toContain('market_observation')
  })

  it('une seule de ces formes est « observée sans déclaration de l’espace »', () => {
    const { partners } = mergePartnerEvidence(corpus, observations)
    const observeesSansDeclaration = partners.filter(
      line =>
        line.evidence_origins.includes('market_observation') && !line.evidence_origins.includes('workspace_declared'),
    )

    // Deux LIGNES (CGI, Devoteam), une seule FORME — c'est elle que l'écran
    // doit reconnaître, et elle porte `current_inference` à côté.
    expect(observeesSansDeclaration.map(line => line.name)).toEqual(['CGI', 'Devoteam'])
    expect(new Set(observeesSansDeclaration.map(line => line.evidence_origins.join('+')))).toEqual(
      new Set(['market_observation+current_inference']),
    )
  })
})
