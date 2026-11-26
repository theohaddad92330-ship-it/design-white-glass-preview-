import { describe, expect, it } from 'vitest'
import type { MissionView } from './api'
import { assigneesOf } from './api'
import {
  accountCounts,
  channelCounts,
  consultantCounts,
  contractKindCounts,
  businessUnitCounts,
  currencyCounts,
  facetCounts,
  filterMissions,
  matchesFacet,
  matchesQuery,
  ownerCounts,
  RENEWAL_WINDOWS_IN_URGENCY_ORDER,
  renewalCounts,
  statusCounts,
} from './filters'

/**
 * LES FACETTES DE LA LISTE DES MISSIONS — #1348, #1358, #1359, #1361, #1368.
 *
 * Cinq retours demandaient cinq objets ; ils comptent les mêmes populations.
 * Ces tests figent les SEUILS, qui sont la seule chose que cinq lectures
 * auraient fait diverger.
 */

const mission = (over: Partial<MissionView> = {}): MissionView =>
  ({
    id: 'm-1',
    label: 'TMA ACME',
    status: 'active',
    ends_on: '2026-12-31',
    accountName: 'ACME',
    marginPercent: null,
    ...over,
  }) as MissionView

describe('matchesFacet', () => {
  /**
   * #2192.10 — « Fin sous 45 jours » (résumé démandé par l'issue) EST la
   * facette « à renouveler », et pas une sixième population : la marge non
   * mesurable ci-dessous suit la même règle de consolidation (#1348 vs #1359,
   * loi 4 du tome 7). Avant ce point, la fenêtre s'arrêtait à J-30 — une
   * mission à J-40 ne remontait ni ici ni nulle part ailleurs sur cet écran.
   */
  it('« à renouveler » retient l’échue, l’imminente, J-30 et J-45 — pas J-60', () => {
    expect(matchesFacet(mission({ renewal: 'overdue' }), 'toRenew')).toBe(true)
    expect(matchesFacet(mission({ renewal: 'imminent' }), 'toRenew')).toBe(true)
    expect(matchesFacet(mission({ renewal: 'j30' }), 'toRenew')).toBe(true)
    expect(matchesFacet(mission({ renewal: 'j45' }), 'toRenew')).toBe(true)
    expect(matchesFacet(mission({ renewal: 'j60' }), 'toRenew')).toBe(false)
    expect(matchesFacet(mission({ renewal: 'far' }), 'toRenew')).toBe(false)
  })

  it('« sans date de fin » lit la FENÊTRE, pas `ends_on` — une date illisible en est une aussi', () => {
    expect(matchesFacet(mission({ renewal: 'unknown' }), 'noEndDate')).toBe(true)
    expect(matchesFacet(mission({ renewal: undefined }), 'noEndDate')).toBe(true)
    expect(matchesFacet(mission({ renewal: 'j30' }), 'noEndDate')).toBe(false)
  })

  /**
   * ⚠️ LA DISTINCTION QUI COMPTE : `undefined` n'est pas `[]`.
   *
   * Le champ absent veut dire « le serveur ne l'a pas renvoyé » — pendant les
   * dix minutes qui séparent le déploiement du web de celui de l'API, par
   * exemple. Conclure « aucun risque » d'un silence est une cause racine du
   * dépôt : la mission sort de la facette sans être déclarée saine.
   */
  it('« avec risque » ne conclut RIEN d’un champ absent', () => {
    expect(matchesFacet(mission({ risks: ['no_end_date'] }), 'withRisk')).toBe(true)
    expect(matchesFacet(mission({ risks: [] }), 'withRisk')).toBe(false)
    expect(matchesFacet(mission({ risks: undefined }), 'withRisk')).toBe(false)
  })

  /**
   * #2408.49 — LA MARGE SEULE, isolée de « avec risque » qui mélange les six
   * types. `margin_at_risk` (marge négative ou nulle) déclenche le filtre ;
   * `margin_unknown` (marge non mesurable) NE LE DÉCLENCHE PAS — ce sont deux
   * questions différentes, et la retour demandait la première.
   */
  it('« marge » ne retient QUE `margin_at_risk`, jamais `margin_unknown`', () => {
    expect(matchesFacet(mission({ risks: ['margin_at_risk'] }), 'marginAtRisk')).toBe(true)
    expect(matchesFacet(mission({ risks: ['margin_unknown'] }), 'marginAtRisk')).toBe(false)
    expect(matchesFacet(mission({ risks: [] }), 'marginAtRisk')).toBe(false)
    expect(matchesFacet(mission({ risks: undefined }), 'marginAtRisk')).toBe(false)
  })

  /**
   * #2408.60 — « Consultants bientôt disponibles », la vue enregistrée que
   * #2408 nomme. PAS un synonyme de `toRenew` : `toRenew` répond à « la
   * DATE approche », celle-ci répond à « le CONSULTANT se libère », et les
   * deux divergent précisément sur une mission déjà RECONDUITE — la date
   * approche toujours, mais personne ne se libère (même dérivation
   * qu'`/missions/planning`, `availabilityFrom`/`availabilityBucket` de
   * `planning.ts`, rejouée sur `ends_on`/`renewal_status` de CETTE lentille,
   * jamais une jointure vers une autre route).
   */
  const TODAY = '2026-09-27'
  const ASSIGNEE = [{ id: 'c-1', fullName: 'Yanis Cordier', photoUrl: null }]

  it('retient une fin proche, un consultant affecté, aucune reconduction signée', () => {
    expect(
      matchesFacet(
        mission({ ends_on: '2026-10-07', assignees: ASSIGNEE, renewal_status: null }),
        'consultantsSoonAvailable',
        TODAY,
      ),
    ).toBe(true)
  })

  it('retient une fin déjà passée — plus rien n’engage le consultant au-delà d’aujourd’hui', () => {
    expect(
      matchesFacet(
        mission({ ends_on: '2026-09-01', assignees: ASSIGNEE, renewal_status: null }),
        'consultantsSoonAvailable',
        TODAY,
      ),
    ).toBe(true)
  })

  it('exclut une reconduction SIGNÉE — la date approche, personne ne se libère', () => {
    expect(
      matchesFacet(
        mission({ ends_on: '2026-10-07', assignees: ASSIGNEE, renewal_status: 'renouvele' }),
        'consultantsSoonAvailable',
        TODAY,
      ),
    ).toBe(false)
  })

  it('exclut sans consultant affecté — rien à libérer', () => {
    expect(
      matchesFacet(
        mission({ ends_on: '2026-10-07', assignees: [], renewal_status: null }),
        'consultantsSoonAvailable',
        TODAY,
      ),
    ).toBe(false)
    expect(
      matchesFacet(
        mission({ ends_on: '2026-10-07', assignees: undefined, renewal_status: null }),
        'consultantsSoonAvailable',
        TODAY,
      ),
    ).toBe(false)
  })

  it('exclut une fin trop lointaine (hors fenêtre de 30 jours)', () => {
    expect(
      matchesFacet(
        mission({ ends_on: '2027-01-01', assignees: ASSIGNEE, renewal_status: null }),
        'consultantsSoonAvailable',
        TODAY,
      ),
    ).toBe(false)
  })

  it('exclut une date de fin inconnue — on ne devine jamais « bientôt »', () => {
    expect(
      matchesFacet(
        mission({ ends_on: null, assignees: ASSIGNEE, renewal_status: null }),
        'consultantsSoonAvailable',
        TODAY,
      ),
    ).toBe(false)
  })
})

describe('matchesQuery', () => {
  it('cherche le nom de la mission, celui du compte ET celui du consultant (#1358)', () => {
    const row = mission({
      label: 'TMA ACME',
      accountName: 'Nova Logistique',
      assignees: [{ id: 'c-1', fullName: 'Salomé Dufour', photoUrl: null }],
    })
    expect(matchesQuery(row, 'tma')).toBe(true)
    expect(matchesQuery(row, 'nova')).toBe(true)
    expect(matchesQuery(row, 'dufour')).toBe(true)
    expect(matchesQuery(row, 'blablacar')).toBe(false)
  })

  it('ignore les accents et la casse — « Salomé » se trouve en tapant « salome »', () => {
    const row = mission({ assignees: [{ id: 'c-1', fullName: 'Salomé Dufour', photoUrl: null }] })
    expect(matchesQuery(row, 'salome')).toBe(true)
  })

  /**
   * ⚠️ Le piège que `assigneeNames` existe pour éviter : étaler des OBJETS dans
   * une botte de foin y écrit « [object Object] », et la recherche par
   * consultant cesse de trouver personne — sans rougir un seul test de type.
   */
  it('ne cherche jamais dans « [object Object] »', () => {
    const row = mission({ assignees: [{ id: 'c-1', fullName: 'Salomé Dufour', photoUrl: null }] })
    expect(matchesQuery(row, 'object')).toBe(false)
  })

  it('une recherche vide ne retire rien', () => {
    expect(matchesQuery(mission(), '   ')).toBe(true)
  })

  /**
   * #2192.37 — LE FILTRE « OWNER » DE L'ISSUE, PAR LA RECHERCHE EXISTANTE.
   *
   * `ownerName` est déjà résolu côté serveur et déjà une colonne (`columns.ts`,
   * #2195.13) — il manquait seulement au foin de la recherche, qui ne portait
   * que la mission, le compte et le consultant (#1358). Une nouvelle liste
   * déroulante aurait dupliqué le mécanisme qui filtre déjà « Compte » et
   * « Consultant » sur ce même écran (loi 4 du tome 7) ; l'ajouter au foin
   * réutilise la SEULE porte de resserrement client de cet écran (GA-26).
   */
  it('cherche aussi le PORTEUR (owner) — #2192.37', () => {
    const row = mission({ ownerName: 'Théo Martin' })
    expect(matchesQuery(row, 'theo')).toBe(true)
    expect(matchesQuery(row, 'martin')).toBe(true)
  })

  it('un porteur ABSENT ne fait pas planter la recherche — jamais « null »', () => {
    const row = mission({ ownerName: null })
    expect(matchesQuery(row, 'null')).toBe(false)
  })
})

describe('filterMissions', () => {
  it('cumule les facettes en ET — deux cases cochées raccourcissent la file', () => {
    const rows = [
      mission({ id: 'a', renewal: 'j30', risks: ['renewal_not_started'] }),
      mission({ id: 'b', renewal: 'j30', risks: [] }),
      mission({ id: 'c', renewal: 'unknown', risks: ['no_end_date'] }),
    ]
    expect(filterMissions(rows, { query: '', facets: ['toRenew', 'withRisk'] }).map(m => m.id)).toEqual(['a'])
  })
})

describe('facetCounts', () => {
  /**
   * ⚠️ Le compte suit la RECHERCHE mais IGNORE les autres facettes.
   *
   * Sinon cocher « Sans date de fin » ferait tomber « Avec risque » à zéro
   * alors que trois missions y répondent, et une pastille à « 0 » qu'un clic
   * remplit se lit comme une panne.
   */
  it('compte chaque facette indépendamment des autres', () => {
    const rows = [
      mission({ id: 'a', renewal: 'j30', risks: ['renewal_not_started'] }),
      mission({ id: 'b', renewal: 'unknown', risks: [] }),
      mission({ id: 'c', renewal: 'overdue', risks: ['margin_unknown'] }),
    ]
    expect(facetCounts(rows, '')).toEqual({
      toRenew: 2,
      noEndDate: 1,
      withRisk: 2,
      marginAtRisk: 0,
      consultantsSoonAvailable: 0,
    })
  })

  /**
   * #2408.60 — même garde que les autres facettes juste au-dessus : comptée
   * indépendamment, sur la RECHERCHE seule.
   */
  it('#2408.60 — compte « consultants bientôt disponibles » séparément', () => {
    const today = '2026-09-27'
    const rows = [
      mission({
        id: 'a',
        ends_on: '2026-10-07',
        assignees: [{ id: 'c-1', fullName: 'Yanis Cordier', photoUrl: null }],
        renewal_status: null,
      }),
      mission({ id: 'b', ends_on: '2026-10-07', assignees: [], renewal_status: null }),
      mission({
        id: 'c',
        ends_on: '2026-10-07',
        assignees: [{ id: 'c-2', fullName: 'Camille Aubert', photoUrl: null }],
        renewal_status: 'renouvele',
      }),
    ]
    expect(facetCounts(rows, '', today).consultantsSoonAvailable).toBe(1)
  })

  it('#2408.49 — compte « marge » séparément, `margin_unknown` n’y entre pas', () => {
    const rows = [
      mission({ id: 'a', risks: ['margin_at_risk'] }),
      mission({ id: 'b', risks: ['margin_unknown'] }),
      mission({ id: 'c', risks: [] }),
    ]
    expect(facetCounts(rows, '').marginAtRisk).toBe(1)
  })

  it('suit la recherche', () => {
    const rows = [
      mission({ id: 'a', label: 'TMA ACME', renewal: 'j30' }),
      mission({ id: 'b', label: 'Refonte Nova', renewal: 'j30' }),
    ]
    expect(facetCounts(rows, 'nova').toRenew).toBe(1)
  })
})

describe('statusCounts', () => {
  /**
   * #2407.5 — le filtre « Statut » propose TOUS les statuts de la machine
   * (14 valeurs), y compris ceux qu'AUCUNE mission ne porte. Une absence
   * n'affiche jamais « 0 » (GA-18/19) : `statusCounts` ne pose donc une clé
   * que pour un statut réellement rencontré, jamais à zéro par construction —
   * c'est à l'appelant (`FilterChips`, `count: undefined`) de ne rien
   * afficher pour les statuts absents de la Map.
   */
  it('ne compte que les statuts RENCONTRÉS — un statut absent des missions est absent de la Map', () => {
    const rows = [mission({ id: 'a', status: 'active' }), mission({ id: 'b', status: 'active' })]
    const counts = statusCounts(rows, '')
    expect(counts.get('active')).toBe(2)
    expect(counts.has('draft')).toBe(false)
    expect(counts.has('archived')).toBe(false)
  })

  it('compte chaque statut indépendamment', () => {
    const rows = [
      mission({ id: 'a', status: 'active' }),
      mission({ id: 'b', status: 'onboarding' }),
      mission({ id: 'c', status: 'onboarding' }),
    ]
    const counts = statusCounts(rows, '')
    expect(counts.get('active')).toBe(1)
    expect(counts.get('onboarding')).toBe(2)
  })

  it('suit la recherche', () => {
    const rows = [
      mission({ id: 'a', label: 'TMA ACME', status: 'active' }),
      mission({ id: 'b', label: 'Refonte Nova', status: 'active' }),
    ]
    expect(statusCounts(rows, 'nova').get('active')).toBe(1)
  })
})

describe('contractKindCounts', () => {
  /**
   * #2408.43 — le filtre « Nature » propose les quatre valeurs du contrat
   * (`régie`, `forfait`, `recrutement`, `inconnu`), même patron que
   * `statusCounts` : une valeur RENCONTRÉE seulement, jamais à zéro par
   * construction (GA-18/19).
   */
  it('ne compte que les natures RENCONTRÉES', () => {
    const rows = [mission({ id: 'a', contract_kind: 'regie' }), mission({ id: 'b', contract_kind: 'regie' })]
    const counts = contractKindCounts(rows, '')
    expect(counts.get('regie')).toBe(2)
    expect(counts.has('forfait')).toBe(false)
  })

  it('compte chaque nature indépendamment', () => {
    const rows = [
      mission({ id: 'a', contract_kind: 'regie' }),
      mission({ id: 'b', contract_kind: 'forfait' }),
      mission({ id: 'c', contract_kind: 'forfait' }),
    ]
    const counts = contractKindCounts(rows, '')
    expect(counts.get('regie')).toBe(1)
    expect(counts.get('forfait')).toBe(2)
  })

  it('suit la recherche', () => {
    const rows = [
      mission({ id: 'a', label: 'TMA ACME', contract_kind: 'regie' }),
      mission({ id: 'b', label: 'Refonte Nova', contract_kind: 'regie' }),
    ]
    expect(contractKindCounts(rows, 'nova').get('regie')).toBe(1)
  })
})

describe('ownerCounts — #2408.38', () => {
  /**
   * Contrairement à `statusCounts`/`contractKindCounts`, il n'y a pas
   * d'énumération fermée à proposer : le porteur (`ownerName`) est un nom
   * résolu côté serveur, ABSENT tant que rien n'est renseigné. `null` ne
   * pose donc AUCUNE clé — une absence n'affiche jamais 0 (GA-18/19), et une
   * clé « non renseigné » inventerait une catégorie que personne n'a demandée.
   */
  it('ne compte que les porteurs RENSEIGNÉS, jamais `null`', () => {
    const rows = [
      mission({ id: 'a', ownerName: 'Camille Roy' }),
      mission({ id: 'b', ownerName: 'Camille Roy' }),
      mission({ id: 'c', ownerName: null }),
    ]
    const counts = ownerCounts(rows, '')
    expect(counts.get('Camille Roy')).toBe(2)
    expect(counts.size).toBe(1)
  })

  it('suit la recherche', () => {
    const rows = [
      mission({ id: 'a', label: 'TMA ACME', ownerName: 'Camille Roy' }),
      mission({ id: 'b', label: 'Refonte Nova', ownerName: 'Camille Roy' }),
    ]
    expect(ownerCounts(rows, 'nova').get('Camille Roy')).toBe(1)
  })
})

describe('accountCounts — #2408.41', () => {
  /**
   * Même geste que `ownerCounts`, pour le compte : un SÉLECTEUR dédié, en
   * plus de la recherche texte libre déjà là — celle-ci demande de connaître
   * l'orthographe exacte, celui-là se parcourt.
   */
  it('ne compte que les comptes RENSEIGNÉS', () => {
    const rows = [
      mission({ id: 'a', accountName: 'ACME' }),
      mission({ id: 'b', accountName: 'ACME' }),
      mission({ id: 'c', accountName: undefined }),
    ]
    const counts = accountCounts(rows, '')
    expect(counts.get('ACME')).toBe(2)
    expect(counts.size).toBe(1)
  })
})

describe('channelCounts — #2408.52, #2408.62', () => {
  /**
   * Même geste qu'`ownerCounts`/`accountCounts` : `channel` est ABSENT sans
   * `finance:read`, ou quand la mission n'a aucune ligne de conditions
   * commerciales (voir `DeliveryService.commercialTermsByMission`) — une
   * absence n'affiche jamais 0 (GA-18/19), et ne pose donc AUCUNE clé.
   */
  it('ne compte que les canaux CONNUS, jamais `undefined`', () => {
    const rows = [
      mission({ id: 'a', channel: 'partner' }),
      mission({ id: 'b', channel: 'partner' }),
      mission({ id: 'c', channel: undefined }),
    ]
    const counts = channelCounts(rows, '')
    expect(counts.get('partner')).toBe(2)
    expect(counts.size).toBe(1)
  })

  it('suit la recherche', () => {
    const rows = [
      mission({ id: 'a', label: 'TMA ACME', channel: 'partner' }),
      mission({ id: 'b', label: 'Refonte Nova', channel: 'partner' }),
    ]
    expect(channelCounts(rows, 'nova').get('partner')).toBe(1)
  })
})

describe('currencyCounts — #2408.53', () => {
  /**
   * Même geste qu'`ownerCounts`/`accountCounts`/`channelCounts` : `currency`
   * est ABSENT (`undefined`) sans `finance:read`, ou quand la mission n'a
   * aucune ligne de conditions commerciales, ET peut être `null` (ligne lue,
   * devise non renseignée) — les deux cas ne posent AUCUNE clé, une absence
   * n'affiche jamais 0 (GA-18/19).
   */
  it('ne compte que les devises CONNUES, jamais `undefined` ni `null`', () => {
    const rows = [
      mission({ id: 'a', currency: 'EUR' }),
      mission({ id: 'b', currency: 'EUR' }),
      mission({ id: 'c', currency: 'CHF' }),
      mission({ id: 'd', currency: null }),
      mission({ id: 'e', currency: undefined }),
    ]
    const counts = currencyCounts(rows, '')
    expect(counts.get('EUR')).toBe(2)
    expect(counts.get('CHF')).toBe(1)
    expect(counts.size).toBe(2)
  })

  it('suit la recherche', () => {
    const rows = [
      mission({ id: 'a', label: 'TMA ACME', currency: 'EUR' }),
      mission({ id: 'b', label: 'Refonte Nova', currency: 'CHF' }),
    ]
    expect(currencyCounts(rows, 'nova').get('CHF')).toBe(1)
    expect(currencyCounts(rows, 'nova').has('EUR')).toBe(false)
  })
})

describe('businessUnitCounts — #2408.39', () => {
  /**
   * La BU du COMPTE porteur, résolue serveur (`MissionView.businessUnitName`).
   * `undefined` (forme d'avant) et `null` (compte sans BU déclarée) ne posent
   * AUCUNE clé : on n'affiche pas ce qu'on n'a pas (GA-18/19).
   */
  it('ne compte que les BU CONNUES, jamais `undefined` ni `null`', () => {
    const rows = [
      mission({ id: 'a', businessUnitName: 'Agence Lyon' }),
      mission({ id: 'b', businessUnitName: 'Agence Lyon' }),
      mission({ id: 'c', businessUnitName: 'Agence Paris' }),
      mission({ id: 'd', businessUnitName: null }),
      mission({ id: 'e', businessUnitName: undefined }),
    ]
    const counts = businessUnitCounts(rows, '')
    expect(counts.get('Agence Lyon')).toBe(2)
    expect(counts.get('Agence Paris')).toBe(1)
    expect(counts.size).toBe(2)
  })

  it('suit la recherche', () => {
    const rows = [
      mission({ id: 'a', label: 'TMA ACME', businessUnitName: 'Agence Lyon' }),
      mission({ id: 'b', label: 'Refonte Nova', businessUnitName: 'Agence Paris' }),
    ]
    expect(businessUnitCounts(rows, 'nova').get('Agence Paris')).toBe(1)
    expect(businessUnitCounts(rows, 'nova').has('Agence Lyon')).toBe(false)
  })
})

describe('consultantCounts — #2408.42', () => {
  /**
   * ⚠️ Une mission peut porter PLUSIEURS affectés : chacun compte pour
   * lui-même, comme `assigneeNames` le fait déjà pour la recherche.
   */
  it('compte chaque consultant AFFECTÉ, une mission à plusieurs en compte plusieurs', () => {
    const rows = [
      mission({ id: 'a', assignees: [{ id: 'c-1', fullName: 'Salomé Dufour', photoUrl: null }] }),
      mission({
        id: 'b',
        assignees: [
          { id: 'c-1', fullName: 'Salomé Dufour', photoUrl: null },
          { id: 'c-2', fullName: 'Inès Kaczmarek', photoUrl: null },
        ],
      }),
      mission({ id: 'c', assignees: [] }),
    ]
    const counts = consultantCounts(rows, '')
    expect(counts.get('Salomé Dufour')).toBe(2)
    expect(counts.get('Inès Kaczmarek')).toBe(1)
    expect(counts.size).toBe(2)
  })
})

describe('renewalCounts', () => {
  it('compte les HUIT fenêtres, dans l’ordre de l’urgence', () => {
    // #2195.2 à #2195.7 — l'issue nomme SIX fenêtres (J-60, J-45, J-30, J-15,
    // échue, sans date) ; la septième est « imminente » (≤ 10 jours), qui
    // existait avant J-15 et lui survit : elles comptent des populations
    // disjointes, et fondre la seconde dans la première aurait perdu l'urgence
    // la plus courte au moment précis où l'on affine l'échelle.
    // #2195.50 — la huitième est `far` : la lentille des renouvellements sert
    // maintenant les échéances lointaines (décision de Louis, 20/09/2026).
    const rows = [
      mission({ id: 'a', renewal: 'overdue' }),
      mission({ id: 'b', renewal: 'j30' }),
      mission({ id: 'c', renewal: 'j30' }),
      mission({ id: 'd', renewal: 'unknown' }),
      mission({ id: 'e', renewal: 'j15' }),
      mission({ id: 'f', renewal: 'j45' }),
      mission({ id: 'g', renewal: 'far' }),
    ]
    const counts = renewalCounts(rows, '')
    expect([...counts.keys()]).toEqual(['overdue', 'imminent', 'j15', 'j30', 'j45', 'j60', 'unknown', 'far'])
    expect(counts.get('overdue')).toBe(1)
    expect(counts.get('j15')).toBe(1)
    expect(counts.get('j30')).toBe(2)
    expect(counts.get('j45')).toBe(1)
    expect(counts.get('unknown')).toBe(1)
    expect(counts.get('far')).toBe(1)
    // ⚠️ Un zéro COMPTÉ : ces deux fenêtres ont été mesurées et sont vides.
    expect(counts.get('imminent')).toBe(0)
    expect(counts.get('j60')).toBe(0)
    // Les huit seaux s'ADDITIONNENT jusqu'au total : aucune ligne ne tombe
    // entre deux fenêtres, aucune n'est comptée deux fois.
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(rows.length)
  })

  it('#2195.50 — compte `far`, un ZÉRO compté n’est pas une absence', () => {
    // Avant ce lot, `far` était absent du compte : la lentille ne le servait
    // pas. Depuis, une fenêtre lointaine vide reste affichée à zéro, comme
    // toutes les autres — c'est un fait mesuré, pas un silence.
    const withFar = renewalCounts([mission({ renewal: 'far' })], '')
    expect(withFar.get('far')).toBe(1)

    const withoutAnyFar = renewalCounts([mission({ renewal: 'unknown' })], '')
    expect(withoutAnyFar.has('far')).toBe(true)
    expect(withoutAnyFar.get('far')).toBe(0)
  })
})

/**
 * #2195.50 — L'ORDRE A UN OBJET : « Sans date de fin » AVANT les lointaines.
 *
 * ⚠️ Ce test lit la POSITION des identifiants de fenêtre (`indexOf`), jamais
 * un texte affiché : un titre de section renommé par un lot voisin (copie
 * i18n) ne doit JAMAIS le faire rougir — seul un réordonnancement des
 * fenêtres le doit. C'est la garantie que #2195.50 demande explicitement.
 */
describe('#2195.50 — « Sans date de fin » devant les échéances lointaines', () => {
  it('`unknown` se range STRICTEMENT avant `far`', () => {
    // ⚠️ Rougit UNIQUEMENT si l'ordre des IDENTIFIANTS de fenêtre change —
    // jamais si un libellé affiché est renommé (i18n), puisqu'aucun texte
    // n'est lu ici. Cassé une fois pour le prouver : `far` déplacé avant
    // `unknown` dans `RENEWAL_WINDOWS_IN_URGENCY_ORDER` fait tomber CETTE
    // assertion, et seulement elle (voir le rapport de livraison).
    const unknownRank = RENEWAL_WINDOWS_IN_URGENCY_ORDER.indexOf('unknown')
    const farRank = RENEWAL_WINDOWS_IN_URGENCY_ORDER.indexOf('far')
    expect(unknownRank).toBeGreaterThanOrEqual(0)
    expect(farRank).toBeGreaterThanOrEqual(0)
    expect(unknownRank).toBeLessThan(farRank)
  })
})

/**
 * LE WEB SE DÉPLOIE AVANT L'API — et le champ change de forme dans l'intervalle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROUVÉ EN RECETTE LIVE LE 04/09/2026, DIX MINUTES APRÈS LE DÉPLOIEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * `assignees` est passé de `string[]` à `{ id, fullName, photoUrl }[]` dans le
 * même lot. Le web est parti en premier, comme toujours, et l'API rendait
 * encore `['Julien Roussel']` : la cellule lisait `person.fullName` sur une
 * chaîne, donc `undefined`, et la colonne « Consultant » affichait « ? » sur
 * TOUTES les lignes — moins que ce qu'elle montrait la veille.
 *
 * Ce n'était pas une surprise : le même fichier écrit déjà, sur `nextAction`,
 * « le web se déploie une dizaine de minutes avant l'API ». La règle existait,
 * elle n'avait pas été appliquée à ce champ-ci.
 *
 * ⚠️ Ces tests gardent la TOLÉRANCE, pas la forme. Une garde qui ne testerait
 * que la forme neuve resterait verte pendant toute la fenêtre de bascule.
 */
describe('assigneesOf — la forme d’avant reste lisible', () => {
  it('lit la forme NEUVE telle quelle', () => {
    const person = { id: 'c-1', fullName: 'Salomé Dufour', photoUrl: 'https://x/s.jpg' }
    expect(assigneesOf({ assignees: [person] })).toEqual([person])
  })

  /**
   * ⚠️ `id: null` et non un identifiant inventé : sans identité, la cellule
   * n'attache PAS de lien. Ouvrir la fiche du premier homonyme du vivier serait
   * pire que ne rien offrir.
   */
  it('lit la forme ANCIENNE — le nom survit, l’identité est NULLE, pas devinée', () => {
    expect(assigneesOf({ assignees: ['Julien Roussel'] })).toEqual([
      { id: null, fullName: 'Julien Roussel', photoUrl: null, loadPercent: null },
    ])
  })

  it('lit un mélange des deux — la bascule n’est pas atomique', () => {
    expect(
      assigneesOf({ assignees: ['Julien Roussel', { id: 'c-2', fullName: 'Léa Marchand', photoUrl: null }] }).map(
        p => p.fullName,
      ),
    ).toEqual(['Julien Roussel', 'Léa Marchand'])
  })

  it('distingue toujours « on n’a pas pu lire » de « personne n’est affecté »', () => {
    expect(assigneesOf({ assignees: null })).toEqual([])
    expect(assigneesOf({ assignees: [] })).toEqual([])
  })

  /**
   * LA PREUVE QUE LA GARDE SAIT DIRE NON — la recherche par consultant.
   *
   * C'est l'autre moitié du même défaut : sur l'ancienne forme, un étalement
   * naïf aurait écrit « [object Object] » dans la botte de foin. Sur la
   * nouvelle, lire la chaîne directement l'aurait vidée. Les deux se cherchent.
   */
  it('la recherche par consultant marche sur les DEUX formes', () => {
    const ancienne = mission({ id: 'a', assignees: ['Julien Roussel'] })
    const neuve = mission({ id: 'b', assignees: [{ id: 'c-1', fullName: 'Julien Roussel', photoUrl: null }] })
    expect(matchesQuery(ancienne, 'roussel')).toBe(true)
    expect(matchesQuery(neuve, 'roussel')).toBe(true)
    expect(matchesQuery(ancienne, 'object')).toBe(false)
  })
})
