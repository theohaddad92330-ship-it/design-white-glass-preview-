import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ContactListItem } from '@bellum/contracts'
import {
  contactCountryScope,
  contactRowsFrom,
  emptyContactFilters,
  filterContactRows,
  peopleSearchCriteria,
  type DiscoverContactRow,
} from './discover-contact-rows'

/**
 * #2165.7 / #2166.15-.25 — des PERSONNES comme type de résultat de Découvrir.
 *
 * Deux interdits se croisent ici et méritent chacun leur test :
 *
 * 1. une ligne de personne ne porte AUCUN critère protégé — la photo existe
 *    sur la source et ne doit pas franchir cette frontière, parce qu'une liste
 *    de personnes EST un classement (c58 au registre de doctrine) ;
 * 2. « coordonnée disponible » n'est PAS la coordonnée — la ligne dit qu'un
 *    canal existe, jamais sa valeur.
 */

function item(overrides: Partial<ContactListItem> = {}): ContactListItem {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    account_id: null,
    full_name: 'Alex Martin',
    title: 'Directeur des systèmes d’information',
    entity: 'Filiale Sud',
    decision_role: 'technical',
    priority: null,
    email: 'alex@example.com',
    phone: null,
    linkedin_url: null,
    why_contact: 'Porte le budget infrastructure',
    user_status: 'new',
    source: null,
    company_name: 'Acme',
    ...overrides,
  } as ContactListItem
}

describe('une personne, une ligne (#2166.15-.25)', () => {
  it('reprend la personne, son entreprise, sa fonction, son entité et son rôle', () => {
    const row = contactRowsFrom([item()])[0] as DiscoverContactRow
    expect(row.fullName).toBe('Alex Martin')
    expect(row.company).toBe('Acme')
    expect(row.title).toContain('Directeur')
    expect(row.entity).toBe('Filiale Sud')
    expect(row.decisionRole).toBe('technical')
  })

  it('#2166.22 — dit qu’un canal EXISTE, jamais sa valeur', () => {
    const row = contactRowsFrom([item({ email: 'alex@example.com', phone: null })])[0] as DiscoverContactRow
    expect(row.channels).toEqual({ email: true, phone: false })
    expect(JSON.stringify(row)).not.toContain('alex@example.com')
  })

  it('#2166.21/.24 — la provenance est une SOURCE et une DATE, jamais un « vérifié »', () => {
    const row = contactRowsFrom([
      item({ source_tag: 'PUBLIC', last_enrichment_at: '2026-08-12T00:00:00.000Z' }),
    ])[0] as DiscoverContactRow
    expect(row.provenance).toEqual({ sourceTag: 'PUBLIC', seenAt: '2026-08-12T00:00:00.000Z' })
    expect(row.unknown).not.toContain('jobFreshness')
  })

  it('#2166.25 — ce qui manque est NOMMÉ, la localisation comprise', () => {
    const row = contactRowsFrom([
      item({ title: 'Assistant administratif', decision_role: null, why_contact: null, last_enrichment_at: null }),
    ])[0] as DiscoverContactRow
    expect(row.unknown).toEqual(['location', 'expertise', 'level', 'jobFreshness', 'reason'])
  })

  /**
   * #2165.35 / #2165.37 (DÉCISION Louis 17/09/2026) — niveau et expertise
   * étaient BLOQUÉS le 16/09 « faute de donnée sur la source ». Ils sont
   * désormais déduits UNE FOIS du poste par le référentiel PARTAGÉ
   * (`@bellum/contracts`), le MÊME que la matrice de couverture des comptes —
   * jamais une seconde taxonomie recodée pour ce filtre.
   */
  it('#2165.35/#2165.37 — niveau et expertise sont déduits du poste, pas inventés', () => {
    const row = contactRowsFrom([item({ title: 'DSI', decision_role: null })])[0] as DiscoverContactRow
    expect(row.level).toBe('c_level')
    expect(row.expertise).toBe('it')
    expect(row.unknown).not.toContain('level')
    expect(row.unknown).not.toContain('expertise')
  })

  it('rend "niveau inconnu" / "expertise inconnue" — jamais devinés — sur un intitulé muet', () => {
    const row = contactRowsFrom([
      item({ title: 'Assistant administratif', decision_role: null }),
    ])[0] as DiscoverContactRow
    expect(row.level).toBeNull()
    expect(row.expertise).toBeNull()
    expect(row.unknown).toContain('level')
    expect(row.unknown).toContain('expertise')
  })

  it('aucun CRITÈRE PROTÉGÉ ne franchit la frontière — la photo reste sur la fiche', () => {
    const row = contactRowsFrom([item({ photo_url: 'https://cdn/photo.jpg' })])[0] as DiscoverContactRow
    expect(JSON.stringify(row)).not.toContain('photo')
    expect(Object.keys(row)).not.toContain('photoUrl')
  })

  it('la garde ci-dessus LIT bien la source qu’elle protège', () => {
    const source = readFileSync(resolve(__dirname, 'discover-contact-rows.ts'), 'utf8')
    expect(source.length).toBeGreaterThan(500)
    expect(source).toContain('CRITÈRES PROTÉGÉS')
    // Le témoin : le fichier NE lit pas `photo_url`. S'il se mettait à le
    // faire, cette ligne rougirait avant même le test de sérialisation.
    expect(source).not.toMatch(/item\.photo_url/)
  })
})

describe('les six filtres exprimables (#2165.34/.35/.36/.37/.39/.41)', () => {
  const rows = contactRowsFrom([
    item({
      id: 'a',
      full_name: 'A',
      title: 'DSI',
      entity: 'Nord',
      email: 'a@x',
      user_status: 'new',
      decision_role: null,
    }),
    item({
      id: 'b',
      full_name: 'B',
      title: 'Acheteur',
      entity: 'Sud',
      email: null,
      phone: null,
      user_status: 'replied',
      decision_role: null,
    }),
    item({
      id: 'c',
      full_name: 'C',
      title: 'Directeur technique',
      entity: 'Sud',
      phone: '+33',
      email: null,
      user_status: 'new',
      decision_role: null,
    }),
  ])

  it('#2165.34 — la fonction filtre sur du texte libre, insensible à la casse', () => {
    expect(filterContactRows(rows, { ...emptyContactFilters(), title: 'dsi' }).map(r => r.fullName)).toEqual(['A'])
  })

  it('#2165.36 — l’entité resserre sans toucher au reste', () => {
    expect(filterContactRows(rows, { ...emptyContactFilters(), entity: 'Sud' }).map(r => r.fullName)).toEqual([
      'B',
      'C',
    ])
  })

  it('#2165.39 — « joignable » garde e-mail OU téléphone, et rien d’autre', () => {
    expect(filterContactRows(rows, { ...emptyContactFilters(), reachableOnly: true }).map(r => r.fullName)).toEqual([
      'A',
      'C',
    ])
  })

  it('#2165.41 — la relation de l’espace est un filtre, pas un rangement', () => {
    expect(filterContactRows(rows, { ...emptyContactFilters(), relation: 'replied' }).map(r => r.fullName)).toEqual([
      'B',
    ])
  })

  it('#2165.35 — le niveau (déduit du poste) filtre sans deviner ce qui reste inconnu', () => {
    // A = DSI → c_level ; B = Acheteur → niveau non déduit ; C = Directeur technique → n1.
    expect(filterContactRows(rows, { ...emptyContactFilters(), level: 'c_level' }).map(r => r.fullName)).toEqual(['A'])
    expect(filterContactRows(rows, { ...emptyContactFilters(), level: 'n1' }).map(r => r.fullName)).toEqual(['C'])
  })

  it('#2165.37 — l’expertise (déduite du poste) filtre sans deviner ce qui reste inconnu', () => {
    // A = DSI → it ; B et C ne matchent aucun indice d'expertise.
    expect(filterContactRows(rows, { ...emptyContactFilters(), expertise: 'it' }).map(r => r.fullName)).toEqual(['A'])
  })

  it('n’attrape pas ce qu’il ne vise pas : sans critère, rien n’est retiré', () => {
    expect(filterContactRows(rows, emptyContactFilters())).toHaveLength(3)
  })

  /**
   * #2165.38 — LE FILTRE « LOCALISATION » SUR LES PERSONNES.
   *
   * Il était refusé au motif qu'« aucune localisation n'existe sur la liste
   * des contacts ». C'était exact : `location` vivait sur la FICHE
   * (`contactSchema.location`, alimentée par l'enrichissement) et jamais sur
   * la projection de liste — or c'est la liste qu'on filtre.
   *
   * Ce que ces tests exigent, et qui les rend capables de dire NON :
   *
   * 1. le champ ABSENT reste `unknown: ['location']` — la ligne dit qu'elle ne
   *    sait pas, elle n'affiche ni « 0 » ni une chaîne vide (GA-18 / GA-19) ;
   * 2. le champ PRÉSENT sort `location` de `unknown` — le filtre cesse d'être
   *    inconditionnel, mais seulement là où c'est vrai ;
   * 3. une personne dont la localisation est INCONNUE n'est JAMAIS rattrapée
   *    par le siège ni par le nom de son entreprise : elle sort du filtre, elle
   *    n'y entre pas par déduction. Un lieu deviné se lit comme un lieu vrai.
   */
  it('#2165.38 — reprend la localisation de la liste quand la source la donne', () => {
    const row = contactRowsFrom([item({ location: 'Lyon, France' })])[0] as DiscoverContactRow
    expect(row.location).toBe('Lyon, France')
    expect(row.unknown).not.toContain('location')
  })

  it('#2165.38 — dit « inconnue » quand la source ne la donne pas, jamais une chaîne vide', () => {
    const row = contactRowsFrom([item()])[0] as DiscoverContactRow
    expect(row.location).toBeNull()
    expect(row.unknown).toContain('location')
  })

  it('#2165.38 — ne rabat pas une chaîne blanche sur une valeur : inconnue reste inconnue', () => {
    const row = contactRowsFrom([item({ location: '   ' })])[0] as DiscoverContactRow
    expect(row.location).toBeNull()
    expect(row.unknown).toContain('location')
  })

  it('#2165.38 — filtre sur le lieu, insensible à la casse, sans deviner celui qu’on ignore', () => {
    const located = contactRowsFrom([
      item({ id: 'f', full_name: 'F', location: 'Lyon, France', company_name: 'Acme Lyon' }),
      item({ id: 'g', full_name: 'G', location: 'Nantes, France', company_name: 'Acme Lyon' }),
      // Localisation INCONNUE, mais l'entreprise s'appelle « Acme Lyon » : la
      // ligne ne doit PAS être rattrapée par ce nom.
      item({ id: 'h', full_name: 'H', company_name: 'Acme Lyon' }),
    ])
    expect(filterContactRows(located, { ...emptyContactFilters(), location: 'lyon' }).map(r => r.fullName)).toEqual([
      'F',
    ])
  })

  it('#2165.38 — sans critère de lieu, aucune ligne n’est retirée, pas même celles sans lieu', () => {
    const mixed = contactRowsFrom([
      item({ id: 'i', full_name: 'I', location: 'Lille' }),
      item({ id: 'j', full_name: 'J' }),
    ])
    expect(emptyContactFilters().location).toBe('')
    expect(filterContactRows(mixed, emptyContactFilters())).toHaveLength(2)
  })

  /**
   * #2294.2 — « nombre max » : un des cinq filtres encore absents au registre
   * (#2294, mesuré 17/09/2026). Un plafond sur la LISTE rendue, appliqué
   * APRÈS les autres critères — jamais un critère qui exclut une personne en
   * particulier, jamais un score.
   */
  it('#2294.2 — le nombre max plafonne la liste rendue, après les autres critères', () => {
    expect(filterContactRows(rows, { ...emptyContactFilters(), maxResults: 2 }).map(r => r.fullName)).toEqual([
      'A',
      'B',
    ])
  })

  it('#2294.2 — "any" (défaut) ne plafonne rien', () => {
    expect(filterContactRows(rows, { ...emptyContactFilters(), maxResults: 'any' })).toHaveLength(3)
  })

  /**
   * #2165.40 — DÉCISION Louis 15/09 : on NOMME ce qu'on sait — « poste vu le
   * <date>, source <la source> », jamais « vérifié ». Le filtre ne garde donc
   * PAS « les postes vérifiés » (rien ne l'est) mais « les postes DATÉS » —
   * ceux dont `provenance.seenAt` existe, à l'opposé de `unknown.jobFreshness`.
   */
  it('#2165.40 — « poste daté » garde ceux dont la provenance a une date, jamais un « vérifié »', () => {
    const dated = contactRowsFrom([
      item({ id: 'f', full_name: 'F', last_enrichment_at: '2026-08-12T00:00:00.000Z', source_tag: 'PUBLIC' }),
      item({ id: 'g', full_name: 'G', last_enrichment_at: null }),
    ])
    expect(filterContactRows(dated, { ...emptyContactFilters(), datedOnly: true }).map(r => r.fullName)).toEqual(['F'])
  })

  /**
   * #2294.2 (24/09/2026) — « fraîcheur minimale » : le 12e des 12 filtres
   * nommés (LAU-FINAL-035), le dernier encore absent. Distinct de `datedOnly`
   * (#2165.40, « a une date, n'importe laquelle ») : ici un SEUIL, en jours
   * depuis `provenance.seenAt` (= `last_enrichment_at`). Une ligne sans date
   * connue ne matche JAMAIS un seuil — même prudence que `location`/`level` :
   * l'inconnu n'est pas rattrapé, il reste inconnu.
   */
  it('#2294.2 — « fraîcheur minimale » garde ceux enrichis dans les N derniers jours', () => {
    const rowsByFreshness = contactRowsFrom([
      item({ id: 'h', full_name: 'H', last_enrichment_at: '2026-09-20T00:00:00.000Z' }), // 4 jours
      item({ id: 'i', full_name: 'I', last_enrichment_at: '2026-08-01T00:00:00.000Z' }), // > 30 jours
      item({ id: 'j', full_name: 'J', last_enrichment_at: null }), // inconnu
    ])
    const result = filterContactRows(rowsByFreshness, {
      ...emptyContactFilters(),
      minFreshnessDays: 7,
      now: '2026-09-24T00:00:00.000Z',
    })
    expect(result.map(r => r.fullName)).toEqual(['H'])
  })

  it('#2294.2 — "any" (défaut) ne pose aucune contrainte de fraîcheur', () => {
    const rowsByFreshness = contactRowsFrom([
      item({ id: 'h', full_name: 'H', last_enrichment_at: '2026-01-01T00:00:00.000Z' }),
      item({ id: 'i', full_name: 'I', last_enrichment_at: null }),
    ])
    expect(filterContactRows(rowsByFreshness, emptyContactFilters())).toHaveLength(2)
  })

  /*
   * #2151.55 / #2166.49 — « Trouver les commerciaux » / « Chercher les
   * contacts » depuis un résultat compte de Découvrir : la liste de personnes
   * se resserre sur CETTE entreprise, par le NOM (texte libre, insensible à
   * la casse) — même mécanique que `title`/`entity` ci-dessus, jamais un
   * identifiant qu'un candidat non encore en portefeuille n'a pas.
   */
  it('#2151.55 / #2166.49 — l’entreprise resserre sur son nom, insensible à la casse', () => {
    const scoped = contactRowsFrom([
      item({ id: 'd', full_name: 'D', company_name: 'Acme Corp' }),
      item({ id: 'e', full_name: 'E', company_name: 'Autre Société' }),
    ])
    expect(filterContactRows(scoped, { ...emptyContactFilters(), company: 'acme' }).map(r => r.fullName)).toEqual(['D'])
  })

  /**
   * #2166.57 — DÉCISION 23/09/2026 (tranché sans Louis) : chaîner « Chercher
   * les contacts » sur une SÉLECTION de N candidats sans élargir le contrat
   * partagé `company: string` (qui resterait un texte libre à une seule
   * valeur pour les deux appelants existants ci-dessus et le champ de saisie
   * de `CallListResults`/`ProjectionResults`). `companies: string[]` est un
   * critère SÉPARÉ, en OR entre les noms — vide = aucune contrainte, comme
   * les autres filtres de cet écran.
   */
  it('#2166.57 — une SÉLECTION de candidats cherche les contacts de CHACUNE des entreprises (OR)', () => {
    const scoped = contactRowsFrom([
      item({ id: 'd', full_name: 'D', company_name: 'Acme Corp' }),
      item({ id: 'e', full_name: 'E', company_name: 'Globex SA' }),
      item({ id: 'f', full_name: 'F', company_name: 'Autre Société' }),
    ])
    expect(
      filterContactRows(scoped, { ...emptyContactFilters(), companies: ['acme', 'globex'] }).map(r => r.fullName),
    ).toEqual(['D', 'E'])
  })

  it('#2166.57 — `companies` vide (défaut) ne pose aucune contrainte', () => {
    const scoped = contactRowsFrom([item({ id: 'd', full_name: 'D', company_name: 'Acme Corp' })])
    expect(filterContactRows(scoped, emptyContactFilters()).map(r => r.fullName)).toEqual(['D'])
  })

  /**
   * #2621.1 — LE PAYS DU WORKSPACE PAR DÉFAUT, avec une bascule « monde ».
   *
   * Mesuré au registre (20/09/2026) : `contacts.service.ts` porte un `country`
   * brut (Apollo) jamais rapproché du marché de l'espace — chercher « DHL »
   * dans Découvrir pouvait montrer des contacts DHL hors France sans qu'aucun
   * réglage ne le dise. Le rapprochement se fait ici, sur `location` (« Ville,
   * Pays »), avec le nom EXACT qu'Apollo écrit (`MARKET_COUNTRY_NAMES`,
   * `@bellum/contracts`, GA-26 — même table que le marché de l'espace).
   *
   * Ce que ces tests exigent :
   * 1. par défaut (`worldwide: false`), seules les personnes dont le lieu
   *    NOMME le pays du workspace restent ;
   * 2. une personne dont le lieu est INCONNU n'est jamais rattrapée comme
   *    « dans le pays » : par prudence elle sort aussi (même logique que le
   *    filtre de lieu texte libre ci-dessus — on ne devine pas) ;
   * 3. la bascule `worldwide: true` retire la contrainte, connues et
   *    inconnues comprises — c'est la garantie « zéro contact hors France »
   *    ET son inverse explicite.
   */
  it('#2621.1 — par défaut, ne garde que les personnes situées dans le pays du workspace', () => {
    const mixed = contactRowsFrom([
      item({ id: 'k', full_name: 'K', location: 'Paris, France' }),
      item({ id: 'l', full_name: 'L', location: 'Berlin, Germany' }),
      // Lieu inconnu : ne doit PAS être rattrapé comme « en France ».
      item({ id: 'm', full_name: 'M' }),
    ])
    expect(
      filterContactRows(mixed, { ...emptyContactFilters(), worldwide: false }, 'France').map(r => r.fullName),
    ).toEqual(['K'])
  })

  it('#2621.1 — la bascule « monde » retire la contrainte de pays, inconnues comprises', () => {
    const mixed = contactRowsFrom([
      item({ id: 'k', full_name: 'K', location: 'Paris, France' }),
      item({ id: 'l', full_name: 'L', location: 'Berlin, Germany' }),
      item({ id: 'm', full_name: 'M' }),
    ])
    expect(
      filterContactRows(mixed, { ...emptyContactFilters(), worldwide: true }, 'France').map(r => r.fullName),
    ).toEqual(['K', 'L', 'M'])
  })

  it('#2621.1 — sans pays de workspace connu (chargement), aucune contrainte n’est posée', () => {
    const mixed = contactRowsFrom([
      item({ id: 'k', full_name: 'K', location: 'Paris, France' }),
      item({ id: 'l', full_name: 'L', location: 'Berlin, Germany' }),
    ])
    expect(filterContactRows(mixed, emptyContactFilters(), null).map(r => r.fullName)).toEqual(['K', 'L'])
  })

  it('#2621.1 — le défaut de `emptyContactFilters` reste au pays (bascule éteinte)', () => {
    expect(emptyContactFilters().worldwide).toBe(false)
  })

  it('#3819 — les personnes des entreprises de la recherche ne sont pas écartées par le pays (lieu inconnu gardé)', () => {
    const rows = contactRowsFrom([
      item({ id: 'p', full_name: 'P', location: null }),
      item({ id: 'q', full_name: 'Q', location: null }),
    ])
    expect(filterContactRows(rows, emptyContactFilters(), contactCountryScope(true, 'France'))).toHaveLength(2)
    expect(filterContactRows(rows, emptyContactFilters(), contactCountryScope(false, 'France'))).toHaveLength(0)
  })
})

/**
 * #4634 (décision Louis 26/10/2026) — « les critères partent dans la RECHERCHE, côté serveur ». Seuls ceux qui ont
 * un jumeau EXACT au contrat `GET /contacts` partent ; les autres affinent la liste trouvée, et l'écran le dit.
 */
describe('#4634 — les critères de personnes partent dans la requête', () => {
  it('fonction, entreprise, entité, lieu et relation deviennent les paramètres du contrat', () => {
    expect(
      peopleSearchCriteria({
        ...emptyContactFilters(),
        title: ' DSI ',
        company: 'Bedrock',
        entity: 'Nord',
        location: 'Lyon',
        relation: 'replied',
      }),
    ).toEqual({ title: 'DSI', company: 'Bedrock', entity: 'Nord', location: 'Lyon', userStatus: 'replied' })
  })

  it('SAIT DIRE NON — aucun critère posé : aucun paramètre (la requête reste celle d’avant)', () => {
    expect(peopleSearchCriteria(emptyContactFilters())).toEqual({})
  })

  it('SAIT DIRE NON — niveau, expertise, joignable, poste daté ne partent pas : leur taxonomie n’est pas celle du contrat', () => {
    expect(
      peopleSearchCriteria({
        ...emptyContactFilters(),
        level: 'c_level',
        expertise: 'it',
        reachableOnly: true,
        datedOnly: true,
        worldwide: true,
      }),
    ).toEqual({})
  })

  it('cherchés au serveur, ils ne sont plus réappliqués sur la liste déjà tirée', () => {
    const rows = contactRowsFrom([item({ id: 'a', title: 'Acheteur', entity: 'Sud', user_status: 'new' })])
    const filters = { ...emptyContactFilters(), title: 'DSI', entity: 'Nord', relation: 'replied' as const }
    expect(filterContactRows(rows, filters)).toHaveLength(0)
    expect(filterContactRows(rows, filters, null, { searched: true })).toHaveLength(1)
  })

  it('SAIT DIRE NON — cherchés ou non, les affinages restent appliqués', () => {
    const rows = contactRowsFrom([item({ id: 'a', email: null, phone: null })])
    expect(
      filterContactRows(rows, { ...emptyContactFilters(), reachableOnly: true }, null, { searched: true }),
    ).toHaveLength(0)
  })
})
