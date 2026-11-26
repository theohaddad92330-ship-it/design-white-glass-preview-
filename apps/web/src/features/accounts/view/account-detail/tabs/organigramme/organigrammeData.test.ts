import type { Contact, OrgGraph } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import {
  buildContactSlugIndex,
  classifyCrmMatch,
  filterOrgGraphByExcludedContacts,
  getCurrentOrgContacts,
  getRecommendedPath,
  resolveGraphPersonContact,
} from './organigrammeData'
import { isMostlyInferred, MOSTLY_INFERRED_RATIO } from './orgGraphData'

describe('getRecommendedPath — le chemin serveur prime sur le tri local', () => {
  const board = { id: 'c1', full_name: 'Martine Presidente', decision_role: 'sponsor', priority: 1 } as Contact
  const dsi = { id: 'c2', full_name: 'Jean Dupont', decision_role: 'technical', priority: 2 } as Contact

  it("suit l'ordre calculé par le serveur, garde-fou board compris", () => {
    // Le tri local placerait le sponsor (poids de rôle le plus fort) en tête ; le
    // serveur a déjà écarté la gouvernance de la 1re approche sur un compte froid.
    const path = getRecommendedPath([board, dsi], [{ personId: 'p-jean-dupont' }, { personId: 'p-martine-presidente' }])
    expect(path.map(c => c.full_name)).toEqual(['Jean Dupont', 'Martine Presidente'])
  })

  it('retombe sur le tri local quand le dossier ne porte pas de graphe', () => {
    expect(getRecommendedPath([board, dsi]).map(c => c.full_name)).toEqual(['Martine Presidente', 'Jean Dupont'])
  })

  it('Théo comptes-fiche — le chemin montre jusqu’à 10 personnes, pas 3', () => {
    const many = Array.from(
      { length: 12 },
      (_, i) => ({ id: `c${i}`, full_name: `Personne ${i}`, decision_role: 'technical', priority: 2 }) as Contact,
    )
    expect(getRecommendedPath(many)).toHaveLength(10)
    expect(
      getRecommendedPath(
        many,
        many.map(c => ({ personId: `p-personne-${c.full_name.split(' ')[1]}` })),
      ),
    ).toHaveLength(10)
  })

  it("ignore un chemin serveur qu'on ne sait pas rapprocher des contacts", () => {
    // Mieux vaut l'ancien tri qu'un chemin tronqué au hasard.
    const path = getRecommendedPath([board, dsi], [{ personId: 'p-inconnu-ailleurs' }])
    expect(path.map(c => c.full_name)).toEqual(['Martine Presidente', 'Jean Dupont'])
  })
})

describe('resolveGraphPersonContact — le rapprochement carte → fiche résiste à l’ordre et aux accents (#3019 recette CAPGEMINI 25/09)', () => {
  // Mesuré en recette : la fiche contact porte l'ordre du registre légal
  // ("Wachter Bernd" — Pappers assemble NOM Prénom), le graphe porte l'ordre
  // de la page équipe ("Bernd Wachter") figé au moment de l'analyse. La clé
  // EXACTE (`orgPersonSlug`) ne les rapproche pas ; c'est ce que #3019 devait
  // corriger et ne corrigeait pas encore.
  it('un ordre prénom/nom inversé reste rapproché — même personne, deux ordres', () => {
    const bernd = { id: 'c-wachter', full_name: 'Wachter Bernd' } as Contact
    const index = buildContactSlugIndex([bernd])
    const found = resolveGraphPersonContact(index, { id: 'p-bernd-wachter', fullName: 'Bernd Wachter' })
    expect(found?.id).toBe('c-wachter')
  })

  it('un accent présent d’un côté et absent de l’autre reste rapproché', () => {
    const emilie = { id: 'c-chartier', full_name: 'Emilie Chartier' } as Contact
    const index = buildContactSlugIndex([emilie])
    const found = resolveGraphPersonContact(index, { id: 'p-milie-chartier', fullName: 'Émilie Chartier' })
    expect(found?.id).toBe('c-chartier')
  })

  it('la clé EXACTE prime toujours — jamais écrasée par le repli tolérant', () => {
    // `orgPersonSlug` matche déjà : le repli ne doit jamais entrer en jeu ni
    // changer le résultat.
    const werner = { id: 'c-werner', full_name: 'Werner' } as Contact
    const index = buildContactSlugIndex([werner])
    const found = resolveGraphPersonContact(index, { id: 'p-werner', fullName: 'Claudia Werner' })
    expect(found?.id).toBe('c-werner')
  })

  it('deux contacts qui partagent le même repli tolérant ne rapprochent personne — une ambiguïté ne devine pas', () => {
    // Même jeu de jetons ("jean" + "martin"), deux ordres différents : le repli
    // ne peut pas savoir laquelle des deux fiches est la bonne personne. Le
    // graphe porte ici un id qui ne matche NI l'une NI l'autre clé exacte
    // (ex. un id désambiguïsé côté assembleur, `-2`, après collision de slug).
    const jean = { id: 'c-jean', full_name: 'Jean Martin' } as Contact
    const homonyme = { id: 'c-homonyme', full_name: 'Martin Jean' } as Contact
    const index = buildContactSlugIndex([jean, homonyme])
    const ambiguous = resolveGraphPersonContact(index, { id: 'p-jean-martin-2', fullName: 'Jean Martin' })
    expect(ambiguous).toBeUndefined()
  })
})

describe("getCurrentOrgContacts — l'organigramme ne montre que l'org actuelle", () => {
  const actif = { id: 'c1', full_name: 'Jean Dupont', lifecycle_state: 'actionnable' } as Contact
  const exEmploye = { id: 'c2', full_name: 'Paul Parti', lifecycle_state: 'historique' } as Contact
  const ecarte = { id: 'c3', full_name: 'Luc Ecarte', lifecycle_state: 'rejete' } as Contact
  const sansEtat = { id: 'c4', full_name: 'Anne Ancienne' } as Contact

  it('écarte un ex-employé et un contact rejeté (annexe p15/p25)', () => {
    expect(getCurrentOrgContacts([actif, exEmploye, ecarte]).map(c => c.full_name)).toEqual(['Jean Dupont'])
  })

  it("garde un contact dont l'état n'est pas renseigné — on ne masque que sur une donnée réelle", () => {
    expect(getCurrentOrgContacts([sansEtat])).toHaveLength(1)
  })
})

describe('getCurrentOrgContacts — #4465.2 un départ déduit du parcours sort du décompte, pas du dossier', () => {
  const present = {
    id: 'c1',
    full_name: 'Jean Dupont',
    apollo_enrichment: { employment_history: [{ organization_name: 'Safran', title: 'DSI', current: true }] },
  } as unknown as Contact
  const parti = {
    id: 'c2',
    full_name: 'Paul Parti',
    apollo_enrichment: {
      employment_history: [
        { organization_name: 'Orange', title: 'Directeur', current: true },
        { organization_name: 'Safran', title: 'DSI', end_date: '2025-03-31' },
      ],
    },
  } as unknown as Contact
  const sansHistorique = { id: 'c3', full_name: 'Anne Sansparcours' } as Contact

  it('ne compte plus la personne partie, mais la garde dans la liste fournie', () => {
    const all = [present, parti, sansHistorique]
    expect(getCurrentOrgContacts(all, 'Safran').map(c => c.full_name)).toEqual(['Jean Dupont', 'Anne Sansparcours'])
    expect(all).toHaveLength(3)
  })

  it("NON : sans nom de compte, ou sans historique, personne n'est écarté", () => {
    expect(getCurrentOrgContacts([present, parti, sansHistorique])).toHaveLength(3)
    expect(getCurrentOrgContacts([sansHistorique], 'Safran')).toHaveLength(1)
  })
})

describe('isMostlyInferred — une carte devinée se déclare', () => {
  // Restauré le 26/08 depuis le garde-fou d'honnêteté du 21/08 (« ≥ 60 % de
  // nœuds gris »). Le dépôt comptait déjà les liens vérifiés et les liens
  // inférés côte à côte, et n'en tirait aucune phrase : un graphe fait à 100 %
  // d'hypothèses affichait « Confiance 65/100 », qui est un chiffre exact et
  // une lecture fausse.

  it('déclare la carte quand la majorité des liens est déduite', () => {
    expect(isMostlyInferred(4, 6)).toBe(true)
    expect(isMostlyInferred(0, 3)).toBe(true)
  })

  it('ne la déclare pas quand la majorité est vérifiée', () => {
    expect(isMostlyInferred(7, 3)).toBe(false)
    expect(isMostlyInferred(3, 0)).toBe(false)
  })

  it('déclenche AU seuil, pas au-dessus', () => {
    // 60 % exactement : le seuil est inclusif, sinon un graphe à 60 % passerait
    // pour vérifié à une décimale près.
    expect(isMostlyInferred(4, 6)).toBe(true)
    expect(isMostlyInferred(41, 59)).toBe(false)
    expect(isMostlyInferred(40, 60)).toBe(true)
  })

  it('rend `null` sur un graphe SANS lien — ne rien savoir n’est pas deviner', () => {
    expect(isMostlyInferred(0, 0)).toBeNull()
  })

  it('le seuil est celui qu’on annonce', () => {
    expect(MOSTLY_INFERRED_RATIO).toBe(0.6)
  })
})

describe('filterOrgGraphByExcludedContacts — #3742/#3744 (reste) : même filtre que les contacts', () => {
  function minimalGraph(): OrgGraph {
    return {
      graphVersion: 1,
      entities: [],
      people: [
        {
          id: 'p-jean-dupont',
          fullName: 'Jean Dupont',
          identityStatus: 'classified',
          decisionRoles: [],
          confidence: 80,
          sources: [],
        },
        {
          id: 'p-ana-garcia',
          fullName: 'Ana Garcia',
          identityStatus: 'classified',
          decisionRoles: [],
          confidence: 70,
          sources: [],
        },
      ],
      hierarchyEdges: [
        {
          fromId: 'p-ana-garcia',
          toId: 'p-jean-dupont',
          type: 'reports_to',
          sourceIds: ['s1'],
          confidence: 95,
          verified: true,
        },
      ],
      influenceEdges: [
        {
          fromId: 'p-ana-garcia',
          toId: 'p-jean-dupont',
          topic: 'budget',
          stance: 'supporter',
          confidence: 55,
          reasoning: 'x',
          sourceIds: [],
        },
      ],
      relationalEdges: [],
      buyingCommittee: [{ personId: 'p-ana-garcia', role: 'technical_buyer', entityId: null }],
      uncoveredZones: [],
      recommendedPath: [
        { step: 1, personId: 'p-jean-dupont', objective: 'sponsor' },
        { step: 2, personId: 'p-ana-garcia', objective: 'relais' },
      ],
      rejectedItems: [],
    }
  }

  it('retire une personne écartée du graphe, et toute arête/comité/étape qui la cite', () => {
    const anaEcartee = {
      id: 'c-ana',
      full_name: 'Ana Garcia',
      excluded_at: '2026-10-07T00:00:00.000Z',
    } as Contact
    const result = filterOrgGraphByExcludedContacts(minimalGraph(), [anaEcartee])
    expect(result.people.map(p => p.id)).toEqual(['p-jean-dupont'])
    expect(result.hierarchyEdges).toEqual([])
    expect(result.influenceEdges).toEqual([])
    expect(result.buyingCommittee).toEqual([])
    expect(result.recommendedPath.map(s => s.personId)).toEqual(['p-jean-dupont'])
  })

  it('garde le graphe TEL QUEL (même référence) quand aucun contact écarté ne correspond', () => {
    const anaActive = { id: 'c-ana', full_name: 'Ana Garcia', excluded_at: null } as Contact
    const graph = minimalGraph()
    expect(filterOrgGraphByExcludedContacts(graph, [anaActive])).toBe(graph)
  })

  it('garde le graphe TEL QUEL sans aucun contact', () => {
    const graph = minimalGraph()
    expect(filterOrgGraphByExcludedContacts(graph, [])).toBe(graph)
  })
})

describe('classifyCrmMatch — #4056.1 superposition CRM : connue / incertaine / non retrouvée', () => {
  const contact = (id: string, full_name: string) => ({ id, full_name }) as Contact
  const person = (fullName: string) => ({ id: `p-${fullName.toLowerCase().replace(/\s+/g, '-')}`, fullName })

  it('un nom retrouvé (exact, ou ordre/accents) est « connu »', () => {
    const index = buildContactSlugIndex([contact('c1', 'Jean Dupont'), contact('c2', 'Wachter Bernd')])
    expect(classifyCrmMatch(index, person('Jean Dupont'))).toBe('known')
    expect(classifyCrmMatch(index, person('Bernd Wachter'))).toBe('known')
  })

  it('une personne du graphe absente du CRM est « détectée, non retrouvée » — jamais fusionnée', () => {
    const index = buildContactSlugIndex([contact('c1', 'Jean Dupont')])
    expect(classifyCrmMatch(index, person('Alice Martin'))).toBe('notFound')
  })

  it('deux fiches CRM candidates pour un même nom souple ⇒ « rapprochement incertain », aucune fiche choisie', () => {
    const index = buildContactSlugIndex([contact('c1', 'Dupont Jean'), contact('c2', 'Dupont  Jean')])
    const p = { id: 'p-autre-graphie', fullName: 'Jean-Dupont' }
    expect(classifyCrmMatch(index, p)).toBe('uncertain')
    expect(resolveGraphPersonContact(index, { id: 'p-x', fullName: 'Jean Dupont' })).toBeUndefined()
  })

  it('SAIT DIRE NON — un nom vide ne produit aucun statut', () => {
    const index = buildContactSlugIndex([contact('c1', 'Jean Dupont')])
    expect(classifyCrmMatch(index, { id: 'p-', fullName: '' })).toBeNull()
  })
})
