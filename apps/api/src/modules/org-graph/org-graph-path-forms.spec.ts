import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { orgGraphSchema, type OrgGraph, type RelationshipMemory } from '@bellum/contracts'
import { PATH_ORIGIN_RANKING_INPUTS, computePathOrigin } from './org-graph-path'

/**
 * Le chemin recommandé PART DE TOI et a TROIS formes (`T5.md:815-831`, U26/U29
 * du tome 1) : relation directe · à un saut · entrée froide.
 *
 * ⚠️ Ce que ces tests protègent, au-delà du calcul : le chemin RANGE des
 * personnes, donc il tombe sous « aucun critère protégé ne pèse dans le rang
 * d'une personne ». Le dernier `describe` le prouve en nommant ce qui entre
 * dans le tri — et en cassant si quelque chose d'autre y entrait.
 */

/** ISO du jour de référence de tous ces tests — une date figée, sinon la
 *  fraîcheur dépendrait du jour où la CI tourne. */
const NOW = new Date('2026-09-01T10:00:00.000Z')

function person(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    fullName: id.replace('p-', '').replace('-', ' '),
    identityStatus: 'classified',
    confidence: 70,
    decisionRoles: [],
    sources: [],
    ...overrides,
  }
}

/** Une source first-party : la personne est DÉJÀ dans nos propres registres. */
function ourSource(id: string, kind: 'crm' | 'workspace_user' | 'workspace_import' = 'crm') {
  return { id, kind, grounding: 'A' as const }
}

/** Une source publique — elle ne dit rien de notre relation. */
function publicSource(id: string) {
  return { id, kind: 'official_site' as const, grounding: 'A' as const }
}

function graph(overrides: Partial<Record<string, unknown>> = {}): OrgGraph {
  return orgGraphSchema.parse({
    graphVersion: 3,
    entities: [
      { id: 'e-groupe', name: 'Groupe', type: 'groupe', parentId: null, confidence: 90 },
      { id: 'e-data', name: 'Direction Data', type: 'bu', parentId: 'e-groupe', confidence: 90 },
    ],
    people: [
      person('p-cible', { entityId: 'e-data', decisionRoles: ['champion'], sources: [publicSource('s-pub')] }),
      person('p-claire', { entityId: 'e-data', decisionRoles: ['influencer'], sources: [ourSource('s-crm')] }),
    ],
    hierarchyEdges: [],
    influenceEdges: [],
    buyingCommittee: [],
    uncoveredZones: [],
    recommendedPath: [{ step: 1, personId: 'p-cible', objective: 'ouvrir' }],
    rejectedItems: [],
    ...overrides,
  })
}

const memory = (over: Partial<RelationshipMemory> = {}): RelationshipMemory => ({
  relation: 'ancien client',
  lastContactAt: '2026-04-01',
  owner: 'Camille',
  ...over,
})

describe('computePathOrigin — les trois formes', () => {
  it('ENTRÉE FROIDE quand aucune personne ne vient de nos propres registres', () => {
    const cold = graph({
      people: [person('p-cible', { entityId: 'e-data', sources: [publicSource('s-pub')] })],
      recommendedPath: [{ step: 1, personId: 'p-cible', objective: 'ouvrir' }],
    })
    const origin = computePathOrigin(cold, { memory: null, now: NOW })
    expect(origin?.form).toBe('cold')
    expect(origin?.hop).toBeUndefined()
    // « on le dit sans détour » : rien n'est masqué, la fraîcheur vaut inconnu.
    expect(origin?.relationFreshness).toBe('inconnu')
  })

  it('RELATION DIRECTE quand la personne visée est DÉJÀ dans nos registres', () => {
    const direct = graph({
      people: [person('p-cible', { entityId: 'e-data', sources: [ourSource('s-crm')] })],
      recommendedPath: [{ step: 1, personId: 'p-cible', objective: 'ouvrir' }],
    })
    const origin = computePathOrigin(direct, { memory: memory(), now: NOW })
    expect(origin?.form).toBe('direct')
    expect(origin?.hop).toBeUndefined()
    expect(origin?.owner).toBe('Camille')
    expect(origin?.relation).toBe('ancien client')
  })

  it('À UN SAUT quand quelqu’un de nos registres partage l’entité de la cible', () => {
    const origin = computePathOrigin(graph(), { memory: memory(), now: NOW })
    expect(origin?.form).toBe('one_hop')
    expect(origin?.hop?.personId).toBe('p-claire')
    expect(origin?.hop?.basis).toBe('same_entity')
  })

  it('préfère une arête hiérarchique SOURCÉE au simple partage d’entité', () => {
    const withEdge = graph({
      people: [
        person('p-cible', { entityId: 'e-data', sources: [publicSource('s-pub')] }),
        person('p-claire', { entityId: 'e-data', sources: [ourSource('s-crm')] }),
        person('p-marc', { entityId: 'e-groupe', sources: [ourSource('s-crm2', 'workspace_user')] }),
      ],
      hierarchyEdges: [
        { fromId: 'p-marc', toId: 'p-cible', type: 'reports_to', sourceIds: ['s-pub'], confidence: 95, verified: true },
      ],
      recommendedPath: [{ step: 1, personId: 'p-cible', objective: 'ouvrir' }],
    })
    const origin = computePathOrigin(withEdge, { memory: memory(), now: NOW })
    expect(origin?.hop?.personId).toBe('p-marc')
    expect(origin?.hop?.basis).toBe('hierarchy')
    // La pièce voyage : sans elle, « passe par Marc » ne s'appuie sur rien.
    expect(origin?.hop?.sourceIds).toEqual(['s-pub'])
  })

  it('ne saute JAMAIS par une personne écartée', () => {
    // `orgGraphSchema` interdit déjà qu'un rejeté reste dans `people[]` — on ne
    // peut donc pas construire ce cas par `parse`. On l'assemble à la main :
    // c'est l'état intermédiaire qu'un appelant peut tenir en mémoire entre une
    // correction et la revalidation, et le calcul doit s'y tenir tout seul.
    const base = graph({
      people: [
        person('p-cible', { entityId: 'e-data', sources: [publicSource('s-pub')] }),
        person('p-claire', { entityId: 'e-data', sources: [ourSource('s-crm')] }),
      ],
      recommendedPath: [{ step: 1, personId: 'p-cible', objective: 'ouvrir' }],
    })
    expect(computePathOrigin(base, { memory: memory(), now: NOW })?.form).toBe('one_hop')

    const withRejection: OrgGraph = { ...base, rejectedItems: [{ sourceId: 'p-claire', reason: 'homonyme' }] }
    const origin = computePathOrigin(withRejection, { memory: memory(), now: NOW })
    expect(origin?.form).toBe('cold')
    expect(origin?.hop).toBeUndefined()
  })

  it('ne saute pas par un ex-employé ni par du stock brut', () => {
    const stale = graph({
      people: [
        person('p-cible', { entityId: 'e-data', sources: [publicSource('s-pub')] }),
        person('p-parti', { entityId: 'e-data', identityStatus: 'historical', sources: [ourSource('s-crm')] }),
      ],
      recommendedPath: [{ step: 1, personId: 'p-cible', objective: 'ouvrir' }],
    })
    expect(computePathOrigin(stale, { memory: memory(), now: NOW })?.form).toBe('cold')
  })

  it('ne dit RIEN quand personne ne vise personne (chemin vide)', () => {
    // Pas de cible = pas de chemin = pas de forme. Répondre « entrée froide »
    // ici affirmerait « aucune relation ne mène à la cible » alors qu'il n'y a
    // pas de cible : une mesure présentée là où aucune n'était possible.
    const noTarget = graph({ recommendedPath: [] })
    expect(computePathOrigin(noTarget, { memory: memory(), now: NOW })).toBeNull()
  })
})

describe('la péremption du chemin', () => {
  it('DIT que la relation est périmée au-delà du second seuil', () => {
    // La source écrit « ⚠ relation de 5 mois, à revalider ». 2026-04-01 → 2026-09-01
    // fait cinq mois, donc au-delà de 90 jours.
    const origin = computePathOrigin(graph(), { memory: memory({ lastContactAt: '2026-04-01' }), now: NOW })
    expect(origin?.relationDate).toBe('2026-04-01')
    expect(origin?.relationFreshness).toBe('perime')
  })

  it('la dit vieillissante entre les deux seuils, fraîche en deçà', () => {
    expect(
      computePathOrigin(graph(), { memory: memory({ lastContactAt: '2026-08-20' }), now: NOW })?.relationFreshness,
    ).toBe('frais')
    expect(
      computePathOrigin(graph(), { memory: memory({ lastContactAt: '2026-07-01' }), now: NOW })?.relationFreshness,
    ).toBe('vieillissant')
  })

  it('une relation SANS date se lit « inconnu », jamais « fraîche »', () => {
    // Le cœur de la règle : ne pas savoir quand on a parlé n'est pas avoir parlé
    // hier. Un « frais » ici ferait jouer un chemin mort.
    const origin = computePathOrigin(graph(), { memory: memory({ lastContactAt: null }), now: NOW })
    expect(origin?.relationFreshness).toBe('inconnu')
    expect(origin?.relationDate).toBeUndefined()
  })

  it('ne recopie pas une mémoire vide en champs vides', () => {
    const origin = computePathOrigin(graph(), { memory: { relation: '   ', owner: null }, now: NOW })
    expect(origin?.relation).toBeUndefined()
    expect(origin?.owner).toBeUndefined()
  })
})

/**
 * ⚠️ LA GARDE QUI CHERCHE L'APPELANT, pas seulement la fonction.
 *
 * Le défaut n°1 du dépôt est « du code juste, calculé, testé, que personne
 * n'appelle ». `computePathOrigin` a DEUX appelants, et il faut les deux :
 *  - `OrgGraphService.recomputePath` — le bouton « Recalculer le chemin » ;
 *  - `AccountsService.applyOrgChart` — CHAQUE analyse fraîche.
 *
 * Sans le second, la forme du chemin n'existerait qu'après un clic manuel : la
 * capacité serait livrée et invisible sur tout dossier neuf.
 */
describe('les deux appelants de computePathOrigin', () => {
  const read = (path: string) => readFileSync(join(__dirname, path), 'utf8')

  it('est appelé par le recalcul du chemin', () => {
    expect(read('./org-graph.service.ts')).toContain('computePathOrigin(')
  })

  it('est appelé par la persistance d’une analyse FRAÎCHE', () => {
    const service = read('../accounts/accounts.service.ts')
    expect(service).toContain('computePathOrigin(')
    // Et il est appelé DANS le chemin de persistance de l'organigramme, pas
    // n'importe où : c'est `applyOrgChart` qui écrit le graphe.
    const applyOrgChart = service.slice(service.indexOf('async applyOrgChart('))
    // Borné au CORPS de la méthode : jusqu'à l'`UPDATE` qui écrit le graphe.
    // Chercher dans tout le reste du fichier attraperait n'importe quel appel
    // situé plus bas et rendrait la garde borgne.
    const body = applyOrgChart.slice(0, applyOrgChart.indexOf('UPDATE accounts'))
    expect(body).toContain('withPathOrigin(')
  })

  it('la garde LIT vraiment les deux fichiers', () => {
    // Un chemin faux rendrait ces tests verts pour toujours si l'on se
    // contentait d'un `includes` sur une chaîne vide.
    expect(read('./org-graph.service.ts').length).toBeGreaterThan(1000)
    expect(read('../accounts/accounts.service.ts').length).toBeGreaterThan(1000)
  })
})

describe('ce qui entre dans le RANG des personnes (GA-06)', () => {
  it('est une liste NOMMÉE, et elle ne contient aucun critère protégé', () => {
    // Un chemin range des gens. L'interdit de l'annexe III porte sur l'usage
    // CLASSANT : il suffit qu'un champ protégé entre ici pour qu'il pèse.
    expect(PATH_ORIGIN_RANKING_INPUTS).toEqual(['hopBasis', 'confidence', 'personId'])
    for (const forbidden of [
      'photoUrl',
      'photo_url',
      'age',
      'birthDate',
      'gender',
      'nationality',
      'origin',
      'maritalStatus',
      'address',
      'postalCode',
    ]) {
      expect(PATH_ORIGIN_RANKING_INPUTS).not.toContain(forbidden)
    }
  })

  it('le calcul IGNORE une photo, même posée sur la personne', () => {
    // La garde qui LIT : on pose réellement le champ et on vérifie que le
    // résultat ne bouge pas. Une garde qui n'exercerait que la liste ci-dessus
    // ne verrait pas un tri qui lit `photoUrl` sans l'avoir déclaré.
    const withPhoto = graph({
      people: [
        person('p-cible', { entityId: 'e-data', sources: [publicSource('s-pub')] }),
        person('p-a', { entityId: 'e-data', confidence: 60, sources: [ourSource('s1')], photoUrl: 'https://x/a.jpg' }),
        person('p-b', { entityId: 'e-data', confidence: 90, sources: [ourSource('s2')] }),
      ],
      recommendedPath: [{ step: 1, personId: 'p-cible', objective: 'ouvrir' }],
    })
    // `p-b` gagne par sa confiance (90 > 60), pas par l'absence de photo.
    expect(computePathOrigin(withPhoto, { memory: memory(), now: NOW })?.hop?.personId).toBe('p-b')
  })
})
