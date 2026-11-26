import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  attachObservedClients,
  isPlausibleEsnName,
  mergeEsnByMatchKey,
  stripCertaintyDecoration,
  type RawAccountPartnerRow,
} from './esn-on-accounts-merge'
import { marketMatchKey } from '../market-memory/market-company-key'

const row = (overrides: Partial<RawAccountPartnerRow>): RawAccountPartnerRow => ({
  name: 'Capgemini',
  account_id: 'acc-1',
  account_name: 'Compte',
  rank: 'unknown',
  certainty: null,
  ...overrides,
})

describe('#1799.1 — une même ESN, deux orthographes, une seule ligne', () => {
  it('fusionne « Capgemini » et « CAPGEMINI » vus sur deux comptes différents', () => {
    const rows: RawAccountPartnerRow[] = [
      row({ name: 'Capgemini', account_id: 'acc-1', rank: 'unknown' }),
      row({ name: 'CAPGEMINI', account_id: 'acc-2', rank: 'rank1' }),
    ]

    const result = mergeEsnByMatchKey(rows)

    // LE défaut #1799 : sans la clé normalisée, ce test rend deux lignes.
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      name: 'Capgemini',
      accounts: 2,
      rank1: 1,
      rank2: 0,
      knownRelationship: 0,
      certainty: null,
      // #2151.32 — nouveaux à 0 : `mergeEsnByMatchKey` ne connaît pas encore
      // la mémoire marché, seul `attachObservedClients` les porte à leur vraie
      // valeur (voir plus bas).
      observedAtAccounts: 0,
      unresolvedAtAccounts: 0,
      // #2298.8 — aucune ligne rang 2 datée dans ce fixture : `measured: false`,
      // jamais un `count: 0` qui se lirait comme un fait plutôt qu'une absence
      // de mesure (GA-18/GA-19).
      rank2Observations: { measured: false },
      accountsList: [
        { id: 'acc-1', name: 'Compte' },
        { id: 'acc-2', name: 'Compte' },
      ],
    })
  })

  // #2151.62 — l'annuaire ne montre plus seulement UN NOMBRE de comptes :
  // il nomme les comptes eux-mêmes, un seul chemin de lecture (GA-26) avec
  // la fiche compte, qui lit la même table `account_partners`.
  it('#2151.62 — porte la liste des comptes (id + nom), pas seulement leur nombre', () => {
    const rows: RawAccountPartnerRow[] = [
      row({ name: 'Capgemini', account_id: 'acc-1', account_name: 'Orange', rank: 'unknown' }),
      row({ name: 'CAPGEMINI', account_id: 'acc-2', account_name: 'SNCF', rank: 'rank1' }),
    ]

    const result = mergeEsnByMatchKey(rows)

    expect(result[0]?.accountsList).toEqual([
      { id: 'acc-1', name: 'Orange' },
      { id: 'acc-2', name: 'SNCF' },
    ])
  })

  it('fusionne aussi une forme juridique ajoutée — « Capgemini France » et « Capgemini »', () => {
    const rows: RawAccountPartnerRow[] = [
      row({ name: 'Capgemini France', account_id: 'acc-1', rank: 'unknown' }),
      row({ name: 'Capgemini France', account_id: 'acc-2', rank: 'unknown' }),
      row({ name: 'Capgemini', account_id: 'acc-3', rank: 'rank1' }),
    ]

    const result = mergeEsnByMatchKey(rows)

    expect(result).toHaveLength(1)
    // La variante la plus fréquente (deux occurrences) gagne l'affichage —
    // pas la première rencontrée, qui dépendrait de l'ordre SQL.
    expect(result[0]?.name).toBe('Capgemini France')
    expect(result[0]?.accounts).toBe(3)
    expect(result[0]?.rank1).toBe(1)
  })

  it('ne compte qu’UNE fois un compte où la même ESN apparaît deux fois sous deux noms', () => {
    // Le même compte, la même ESN, deux lignes `account_partners` (une
    // déclarée, une détectée) : le nombre de COMPTES ne double pas pour ça.
    const rows: RawAccountPartnerRow[] = [
      row({ name: 'Capgemini', account_id: 'acc-1', rank: 'unknown' }),
      row({ name: 'CAPGEMINI', account_id: 'acc-1', rank: 'unknown' }),
    ]

    const result = mergeEsnByMatchKey(rows)

    expect(result).toHaveLength(1)
    expect(result[0]?.accounts).toBe(1)
  })

  /* ---------------------------------------------------------------------- */
  /*  TÉMOIN — la garde ne fusionne pas ce qu'elle ne doit pas fusionner     */
  /* ---------------------------------------------------------------------- */

  it('TÉMOIN — ne fusionne PAS deux ESN réellement distinctes (« CGI » et « CGI Business Consulting »)', () => {
    const rows: RawAccountPartnerRow[] = [
      row({ name: 'CGI', account_id: 'acc-1', rank: 'unknown' }),
      row({ name: 'CGI Business Consulting', account_id: 'acc-2', rank: 'unknown' }),
    ]

    const result = mergeEsnByMatchKey(rows)

    expect(result).toHaveLength(2)
    expect(result.map(r => r.name).sort()).toEqual(['CGI', 'CGI Business Consulting'])
  })

  it('TÉMOIN — « Capgemini » et « Capgemini Invent » restent deux lignes', () => {
    // `marketMatchKey` ne retire que les formes juridiques et les mots de
    // structure (SA, SAS, Groupe, France…) — jamais un mot qui distingue
    // deux entités. « Invent » n'en est pas un.
    const rows: RawAccountPartnerRow[] = [
      row({ name: 'Capgemini', account_id: 'acc-1', rank: 'unknown' }),
      row({ name: 'Capgemini Invent', account_id: 'acc-2', rank: 'unknown' }),
    ]

    const result = mergeEsnByMatchKey(rows)

    expect(result).toHaveLength(2)
  })

  it('deux homonymes complets mais réellement non rapprochables restent deux comptes séparés dans deux groupes s’ils diffèrent d’un mot', () => {
    // Rappel doctrine : on ne fusionne JAMAIS deux entités sans preuve. Ici,
    // deux noms qui ne partagent qu'un mot générique ne collent pas.
    const rows: RawAccountPartnerRow[] = [
      row({ name: 'Novéris Digital', account_id: 'acc-1', rank: 'unknown' }),
      row({ name: 'Kaerneo Systems', account_id: 'acc-2', rank: 'unknown' }),
    ]

    const result = mergeEsnByMatchKey(rows)

    expect(result).toHaveLength(2)
  })

  /* ---------------------------------------------------------------------- */
  /*  Bords                                                                  */
  /* ---------------------------------------------------------------------- */

  it('ignore une ligne sans nom exploitable, sans la rapprocher des autres', () => {
    const rows: RawAccountPartnerRow[] = [
      row({ name: '   ', account_id: 'acc-1', rank: 'unknown' }),
      row({ name: 'Capgemini', account_id: 'acc-2', rank: 'unknown' }),
    ]

    const result = mergeEsnByMatchKey(rows)

    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('Capgemini')
  })

  it('trie par nombre de comptes décroissant, puis par nom — même ordre que l’ancienne requête', () => {
    const rows: RawAccountPartnerRow[] = [
      row({ name: 'Devoteam', account_id: 'acc-1', rank: 'unknown' }),
      row({ name: 'Capgemini', account_id: 'acc-1', rank: 'unknown' }),
      row({ name: 'Capgemini', account_id: 'acc-2', rank: 'unknown' }),
    ]

    const result = mergeEsnByMatchKey(rows)

    expect(result.map(r => r.name)).toEqual(['Capgemini', 'Devoteam'])
  })
})

/* -------------------------------------------------------------------------- */
/*  #1799 — un nom d'ESN est une société, pas une phrase                       */
/* -------------------------------------------------------------------------- */
//
// Mesuré en production le 09/09/2026 sur `GET /api/partners/on-my-accounts`,
// espace de Louis, APRÈS le correctif #1799.1 ci-dessus : 50 entrées, dont 34
// n'étaient pas des entreprises. Les chaînes ci-dessous sont les VALEURS
// RÉELLES mesurées ce soir-là — ni reformulées, ni simplifiées.
//
// Défense en profondeur : le vrai producteur (`apps/ia/app/services/esn_presence.py`)
// est corrigé séparément (voir son test `test_esn_presence.py`). Ce filtre-ci
// protège en plus l'endpoint mesuré contre les 34 lignes DÉJÀ écrites en base
// par l'ancien pipeline — elles ne disparaissent pas de `account_partners`
// (aucun nettoyage destructif ici), mais elles n'atteignent plus l'écran.

describe('#1799 — un nom d’ESN est une société, pas une phrase', () => {
  describe('les 34 non-entités mesurées en production sont refusées', () => {
    const nonEntities = [
      'Aucun concurrent ESN identifié dans les sources',
      'Aucun concurrent ESN identifié',
      'Aucun concurrent ESN identifié dans les sources fournies',
      'ESN non identifiée',
      'ESN probable non identifiée',
      'Non identifié',
      // Plusieurs sociétés écrasées dans un seul champ : on ne les sépare
      // pas (deviner trois fiches depuis un seul texte serait une invention),
      // on écarte la ligne entière.
      'Capgemini / Accenture / Sopra Steria (ESN généralistes)',
    ]

    it.each(nonEntities)('rejette %j — la ligne n’apparaît nulle part, pas même vide', name => {
      const result = mergeEsnByMatchKey([row({ name, account_id: 'acc-1', rank: 'unknown' })])
      expect(result).toEqual([])
    })

    it('une non-entité mêlée à une vraie ESN ne laisse que la vraie ESN', () => {
      const result = mergeEsnByMatchKey([
        row({ name: 'Aucun concurrent ESN identifié', account_id: 'acc-1', rank: 'unknown' }),
        row({ name: 'Capgemini', account_id: 'acc-2', rank: 'unknown' }),
      ])
      expect(result).toHaveLength(1)
      expect(result[0]?.name).toBe('Capgemini')
    })
  })

  it('TÉMOIN — une vraie ESN au nom inhabituel (esperluette, plusieurs mots) n’est pas attrapée', () => {
    // « Business & Decision » est une ESN française réelle. Son nom porte une
    // esperluette et un espace : exactement la forme qu'une garde trop
    // gourmande confondrait avec une liste de plusieurs sociétés.
    const result = mergeEsnByMatchKey([row({ name: 'Business & Decision', account_id: 'acc-1', rank: 'unknown' })])
    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('Business & Decision')
  })

  describe('la certitude sort du nom — « Capgemini — probable » devient « Capgemini »', () => {
    const decorated: Record<string, string> = {
      'Capgemini — probable': 'Capgemini',
      'Probable : Capgemini': 'Capgemini',
      'Accenture — probable': 'Accenture',
      'Probable — Accenture': 'Accenture',
      'Accenture (probable — cloud, IA, healthcare worldwide)': 'Accenture',
      'Sopra Steria — probable': 'Sopra Steria',
    }

    it.each(Object.entries(decorated))('normalise %j en %j', (raw, expected) => {
      const result = mergeEsnByMatchKey([row({ name: raw, account_id: 'acc-1', rank: 'unknown' })])
      expect(result).toHaveLength(1)
      expect(result[0]?.name).toBe(expected)
    })

    it('« Capgemini » et « Capgemini — probable », vus sur deux comptes, fusionnent en UNE ligne', () => {
      const result = mergeEsnByMatchKey([
        row({ name: 'Capgemini', account_id: 'acc-1', rank: 'unknown' }),
        row({ name: 'Capgemini — probable', account_id: 'acc-2', rank: 'rank1' }),
      ])
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        name: 'Capgemini',
        accounts: 2,
        rank1: 1,
        rank2: 0,
        knownRelationship: 0,
        certainty: null,
        observedAtAccounts: 0,
        unresolvedAtAccounts: 0,
        rank2Observations: { measured: false },
        accountsList: [
          { id: 'acc-1', name: 'Compte' },
          { id: 'acc-2', name: 'Compte' },
        ],
      })
    })

    it('TÉMOIN — « Capgemini » et « Capgemini Invent » restent deux lignes malgré la normalisation', () => {
      const result = mergeEsnByMatchKey([
        row({ name: 'Capgemini', account_id: 'acc-1', rank: 'unknown' }),
        row({ name: 'Capgemini Invent', account_id: 'acc-2', rank: 'unknown' }),
      ])
      expect(result).toHaveLength(2)
      expect(result.map(r => r.name).sort()).toEqual(['Capgemini', 'Capgemini Invent'])
    })
  })

  describe('la certitude voyage à part — jamais dans le nom', () => {
    it('rend la certitude la plus forte observée sur le groupe', () => {
      const result = mergeEsnByMatchKey([
        row({ name: 'Capgemini', account_id: 'acc-1', rank: 'unknown', certainty: 'faible' }),
        row({ name: 'CAPGEMINI', account_id: 'acc-2', rank: 'unknown', certainty: 'forte' }),
      ])
      expect(result).toHaveLength(1)
      expect(result[0]?.certainty).toBe('forte')
    })

    it('rend `null` quand aucune ligne du groupe ne porte de certitude — jamais devinée', () => {
      const result = mergeEsnByMatchKey([row({ name: 'Capgemini', account_id: 'acc-1', rank: 'unknown' })])
      expect(result[0]?.certainty).toBeNull()
    })

    it('une ligne DÉCLARÉE (certitude absente de la base) ne fait pas régresser une ligne DÉTECTÉE du même groupe', () => {
      const result = mergeEsnByMatchKey([
        row({ name: 'Capgemini', account_id: 'acc-1', rank: 'unknown', certainty: null }),
        row({ name: 'Capgemini', account_id: 'acc-2', rank: 'unknown', certainty: 'moyenne' }),
      ])
      expect(result[0]?.certainty).toBe('moyenne')
    })
  })

  describe('fenêtre de déploiement — le champ `certainty` est optionnel côté ligne brute', () => {
    it('une ligne brute sans `certainty` (API pas encore redéployée) ne casse pas le regroupement', () => {
      // `certainty` est absent de l'objet, pas seulement `null` — le cas exact
      // d'une ligne lue via `SELECT *` avant que la migration/colonne ne soit
      // sélectionnée par une requête plus ancienne.
      const legacyRow = { name: 'Capgemini', account_id: 'acc-1', rank: 'unknown' } as RawAccountPartnerRow
      const result = mergeEsnByMatchKey([legacyRow])
      expect(result).toHaveLength(1)
      expect(result[0]?.certainty).toBeNull()
    })
  })
})

describe('#1799 — second tour : les trois formes relevées À L’ÉCRAN après le rattrapage', () => {
  /*
   * Le filtre à l'écriture et le rattrapage en base ont retiré 719 lignes sur
   * 1 640. Trois formes sont RESTÉES, vues sur /accounts/partners le
   * 09/09/2026 — chacune ratée pour une raison de POSITION, pas de fond :
   *   « Capgemini probable »                           le suffixe exigeait un tiret
   *   « Airbus (client principal, probable partenaire IT) »  la parenthèse devait
   *                                                    commencer par « probable »
   *   « Inetum | CGI | Devoteam »                      « | » n'était pas un séparateur
   */

  it('retire un mot de certitude posé NU en fin de nom', () => {
    expect(stripCertaintyDecoration('Capgemini probable')).toBe('Capgemini')
    expect(stripCertaintyDecoration('Atos possible')).toBe('Atos')
    expect(stripCertaintyDecoration('Inetum à confirmer')).toBe('Inetum')
    // Et le nom nettoyé reste une société : il rejoint le groupe existant.
    expect(isPlausibleEsnName(stripCertaintyDecoration('Capgemini probable'))).toBe(true)
  })

  it('ÉCARTE la ligne quand la parenthèse est une phrase, plutôt que de la raboter', () => {
    /*
     * « Airbus (client principal, probable partenaire IT) » raboté donnerait
     * « Airbus » — un CLIENT affiché comme une ESN en place chez des comptes.
     * Silencieusement faux, donc pire que rien : on écarte la ligne entière.
     */
    const phrase = 'Airbus (client principal, probable partenaire IT)'
    expect(isPlausibleEsnName(stripCertaintyDecoration(phrase))).toBe(false)
    expect(isPlausibleEsnName(stripCertaintyDecoration('Acasi (racheté par Qonto, puis intégré/fermé)'))).toBe(false)
  })

  it('refuse plusieurs noms séparés par « | » — trois sociétés ne sont pas une société', () => {
    expect(isPlausibleEsnName('Inetum | CGI | Devoteam')).toBe(false)
    expect(isPlausibleEsnName('Sopra|Steria')).toBe(false)
  })

  /*
   * LE TÉMOIN — une garde doit prouver qu'elle n'attrape pas ce qu'elle ne
   * vise pas. Ces noms sont de vraies ESN et doivent TOUS survivre.
   */
  it("n'attrape pas les vrais noms de société", () => {
    for (const nom of [
      'Capgemini',
      'Sopra Steria',
      'Business & Decision',
      'Groupe Onepoint',
      'Open',
      'Devoteam',
      'Accenture Technology Solutions',
    ]) {
      // jest n'accepte pas de message en 2e argument d'expect (c'est vitest) :
      // le nom voyage dans l'assertion elle-meme pour rester lisible en cas de rouge.
      expect([nom, stripCertaintyDecoration(nom)]).toEqual([nom, nom])
      expect([nom, isPlausibleEsnName(nom)]).toEqual([nom, true])
    }
  })

  it('garde une parenthèse COURTE comme un commentaire, et rend la société', () => {
    // Trois mots de contexte ne font pas une phrase : « Acasi » est une vraie
    // ESN, et la ligne doit rejoindre son groupe plutôt que disparaître.
    expect(stripCertaintyDecoration('Acasi (acquis juillet 2026)')).toBe('Acasi')
    expect(isPlausibleEsnName(stripCertaintyDecoration('Acasi (acquis juillet 2026)'))).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/*  #1818 — une CINQUIÈME forme : une clause de certitude, pas un mot          */
/* -------------------------------------------------------------------------- */
//
// Relevée à l'écran le 10/09/2026 sur /accounts/partners : « EBTrans —
// ressources internes probables ». EBTrans est un COMPTE de l'espace, pas une
// ESN — la phrase entière dit le CONTRAIRE d'une présence d'ESN (« les
// ressources sont probablement internes », donc : pas de partenaire externe
// détecté). `stripCertaintyDecoration` ne retire rien ici : son suffixe ne
// connaît qu'un tiret suivi d'un SEUL mot de certitude (« — probable »), pas
// d'une clause de plusieurs mots qui se termine par un mot de certitude
// accordé au pluriel (« ressources … probableS »).
//
// Raboter la clause pour ne garder que « EBTrans » serait la même faute que
// « Airbus (client principal, probable partenaire IT) » plus haut : un COMPTE
// affiché comme une ESN détectée chez lui-même, silencieusement faux. Comme
// pour la parenthèse longue, la ligne entière est écartée par
// `isPlausibleEsnName` — jamais raccourcie en un nom qui aurait l'air juste.
describe('#1818 — un tiret suivi d’une CLAUSE de plusieurs mots n’est pas une décoration', () => {
  it('écarte « EBTrans — ressources internes probables » — un compte, pas une ESN', () => {
    const result = mergeEsnByMatchKey([
      { name: 'EBTrans — ressources internes probables', account_id: 'acc-1', rank: 'unknown', certainty: null },
    ])
    expect(result).toEqual([])
  })

  it('écarte la même forme avec un tiret simple et un mot de certitude différent', () => {
    expect(isPlausibleEsnName('Devoteam - moyens humains internes possibles')).toBe(false)
    expect(isPlausibleEsnName('Atos — équipe interne supposée')).toBe(false)
  })

  it('une non-entité de cette forme mêlée à une vraie ESN ne laisse que la vraie ESN', () => {
    const result = mergeEsnByMatchKey([
      { name: 'EBTrans — ressources internes probables', account_id: 'acc-1', rank: 'unknown', certainty: null },
      { name: 'Capgemini', account_id: 'acc-2', rank: 'unknown', certainty: null },
    ])
    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('Capgemini')
  })

  it('TÉMOIN — le suffixe d’UN SEUL mot continue de se faire simplement RETIRER, pas écarter', () => {
    // « Capgemini — probable » désigne bien Capgemini : un seul mot de
    // certitude après le tiret reste une décoration, la ligne rejoint son
    // groupe. La nouvelle règle ne vise que les clauses de PLUSIEURS mots.
    expect(stripCertaintyDecoration('Capgemini — probable')).toBe('Capgemini')
    expect(isPlausibleEsnName(stripCertaintyDecoration('Capgemini — probable'))).toBe(true)
  })

  it('TÉMOIN — n’attrape pas les vrais noms de société, avec ou sans tiret dans leur forme habituelle', () => {
    for (const nom of ['Business & Decision', 'Accenture Technology Solutions', 'Groupe Onepoint', 'Sopra Steria']) {
      expect([nom, isPlausibleEsnName(nom)]).toEqual([nom, true])
    }
  })
})

/* -------------------------------------------------------------------------- */
/*  #1799 (troisième tour) — le vrai défaut principal : une LISTE, pas         */
/*  décorée par un mot de certitude, jamais visée par le filtre               */
/* -------------------------------------------------------------------------- */
//
// Recette en production le 10/09/2026 sur `GET /api/partners/on-my-accounts` :
// 50 lignes, 200. Le correctif #1818 (la clause de certitude après un tiret)
// est juste, mais il n'est PAS le défaut principal — six lignes de la même
// recette portent une LISTE d'ESN dans le champ nom, jamais un mot de
// certitude :
//
//   « Inetum, CGI, Devoteam »
//   « Sopra Steria, Capgemini, Accenture »
//   « Capgemini, Accenture ou autre ESN généraliste »
//   « Capgemini, Accenture, Sopra Steria »
//   « Capgemini, Accenture, Sopra Steria, Atos »
//   « Capgemini, Sopra Steria, Atos, Accenture »
//
// Capgemini a sa PROPRE ligne (détectée seule sur d'autres comptes) ET
// apparaît dans cinq de ces listes : « pourquoi y a deux fois Capgemini »,
// six fois — le symptôme originel de #1799, jamais fermé.
//
// DEUX causes, toutes deux dans `esn-on-accounts-merge.ts` :
//
//  1. `MULTI_ENTITY_RE` exigeait des espaces autour du « / »
//     (`/\s\/\s|\s*\|\s*/`) alors que son propre docblock promettait
//     « entourés d'espaces ou non » — la branche `|` tenait la promesse, la
//     branche `/` non. Quatre lignes de la même recette le prouvent :
//     « Agences web/e-commerce généralistes », « Éditeur/intégrateur ERP »…
//  2. Aucune règle sur la VIRGULE. « Capgemini, Accenture, Sopra Steria,
//     Atos » fait 5 mots (sous `MAX_NAME_WORDS`), pas de parenthèse, pas de
//     négation — plausible pour l'ancien filtre. C'était le trou principal.
describe('#1799 (troisième tour) — une LISTE séparée par des virgules ou un « / » sans espaces', () => {
  it('écarte les six listes RÉELLEMENT mesurées en production — jamais réduites à leur premier nom', () => {
    const listes = [
      'Inetum, CGI, Devoteam',
      'Sopra Steria, Capgemini, Accenture',
      'Capgemini, Accenture ou autre ESN généraliste',
      'Capgemini, Accenture, Sopra Steria',
      'Capgemini, Accenture, Sopra Steria, Atos',
      'Capgemini, Sopra Steria, Atos, Accenture',
    ]
    for (const nom of listes) {
      // ⚠️ Jamais rabotée sur la première entité : garder « Capgemini » depuis
      // « Capgemini, Accenture, Sopra Steria » fabriquerait un compte de TROIS
      // comptes attribué à une seule ESN — la faute déjà refusée sur EBTrans.
      expect([nom, isPlausibleEsnName(nom)]).toEqual([nom, false])
    }
  })

  it('une liste mêlée à une VRAIE ESN détectée seule ne laisse que la vraie ESN — Capgemini n’apparaît qu’une fois', () => {
    const result = mergeEsnByMatchKey([
      { name: 'Capgemini', account_id: 'acc-1', account_name: 'Orange', rank: 'unknown', certainty: null },
      {
        name: 'Capgemini, Accenture, Sopra Steria',
        account_id: 'acc-2',
        account_name: 'SNCF',
        rank: 'unknown',
        certainty: null,
      },
      {
        name: 'Sopra Steria, Capgemini, Accenture',
        account_id: 'acc-3',
        account_name: 'RATP',
        rank: 'unknown',
        certainty: null,
      },
    ])
    expect(result).toEqual([
      {
        name: 'Capgemini',
        accounts: 1,
        rank1: 0,
        rank2: 0,
        knownRelationship: 0,
        observedAtAccounts: 0,
        unresolvedAtAccounts: 0,
        rank2Observations: { measured: false },
        certainty: null,
        accountsList: [{ id: 'acc-1', name: 'Orange' }],
      },
    ])
  })

  it('écarte un « / » SANS espaces autour — les quatre formes mesurées en production', () => {
    for (const nom of [
      'Agences web/e-commerce généralistes',
      'Agences web/e-commerce locales',
      'Éditeur/intégrateur ERP',
      'ESN généraliste ou spécialisée retail/distribution',
    ]) {
      expect([nom, isPlausibleEsnName(nom)]).toEqual([nom, false])
    }
  })

  /*
   * LE TÉMOIN — la partie difficile. Une virgule est LÉGITIME dans une
   * raison sociale ; ces noms doivent TOUS survivre.
   */
  it('TÉMOIN — n’attrape aucun vrai nom de société, virgule ou pas', () => {
    for (const nom of [
      'Ernst & Young',
      'Devoteam G Cloud',
      'Sopra Steria Group',
      'Capgemini Invent',
      'Accenture Technology Solutions',
      'Business & Decision',
      'Groupe Onepoint',
    ]) {
      expect([nom, isPlausibleEsnName(nom)]).toEqual([nom, true])
    }
  })

  /*
   * LE TÉMOIN, À L'ÉCHELLE DU RÉFÉRENTIEL — pas seulement sept noms choisis à
   * la main. `esn-seed-names.ts` porte 477 vraies raisons sociales (deux
   * fichiers fournis le 20/08, dédupliqués) : la garde ne doit en écarter
   * AUCUNE. Lu depuis le fichier source, pas recopié ici — un nom ajouté au
   * référentiel entre dans le corpus du témoin sans qu'on y pense.
   *
   * Ce test répond aussi à la question posée : « au moins un nom portant une
   * virgule réelle, cherché dans le référentiel plutôt qu'inventé ». Il n'en
   * existe AUCUN dans les 477 — vérifié ci-dessous en même temps que le
   * témoin, pas affirmé à part. C'est une information en soi : la virgule
   * n'a, à ce jour, aucun témoin réel dans ce dépôt, seulement dans les
   * exemples ci-dessus (`Ernst & Young`… n'en portent d'ailleurs aucune non
   * plus — aucun des sept témoins choisis à la main n'en a une réelle).
   */
  it('TÉMOIN À L’ÉCHELLE — n’écarte aucune des 477 raisons sociales du référentiel ESN, et aucune n’y porte de virgule', () => {
    const source = readFileSync(join(__dirname, '..', 'esn-directory', 'esn-seed-names.ts'), 'utf8')
    const noms = [...source.matchAll(/name:\s*'([^']*)'/g)].map(m => m[1]!)

    // La garde n'est pas borgne : son corpus n'est pas vide.
    expect(noms.length).toBeGreaterThanOrEqual(400)

    // Comme dans le VRAI pipeline (`mergeEsnByMatchKey`, `backfill-esn-partner-names.ts`) :
    // `stripCertaintyDecoration` retire d'abord une décoration éventuelle
    // (dont une parenthèse COURTE — un second nom du référentiel, « Alten
    // (Groupe Alten) », est une précision légitime, pas une phrase) avant que
    // `isPlausibleEsnName` ne juge ce qui reste. Une garde qui sauterait
    // cette étape jugerait une forme que le filtre ne voit jamais en
    // production, et se tromperait sur des noms bien réels.
    //
    // jest n'accepte pas de message en 2e argument d'expect (c'est vitest) :
    // la liste des noms écartés à tort voyage dans l'assertion elle-même.
    const rejetes = noms.filter(nom => !isPlausibleEsnName(stripCertaintyDecoration(nom)))
    expect(rejetes).toEqual([])

    const avecVirgule = noms.filter(nom => nom.includes(','))
    // S'il en existait une, elle devrait survivre malgré la nouvelle règle —
    // ce n'est pas le cas ici : aucune des 477 n'en porte.
    expect(avecVirgule).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */
/*  #1799 (quatrième tour) — deux espèces résiduelles, mesurées EN PRODUCTION  */
/*  dix minutes après le correctif du troisième tour                          */
/* -------------------------------------------------------------------------- */
//
// `GET /api/partners/on-my-accounts`, 50 lignes : virgule et slash ont
// disparu. Deux espèces restent.

describe('#1799 (quatrième tour) — une DESCRIPTION plutôt qu’un nom, deux formes', () => {
  describe('une raison sociale ne commence pas par une minuscule QUAND elle a plusieurs mots', () => {
    it('écarte les quatre descriptions RÉELLEMENT mesurées', () => {
      for (const nom of [
        'cabinet de conseil IT généraliste',
        'équipe ou partenaire interne Fnac Darty',
        'équipes internes et partenaires industriels référencés',
        'freelance ou petite agence web locale',
      ]) {
        expect([nom, isPlausibleEsnName(nom)]).toEqual([nom, false])
      }
    })

    it('TÉMOIN — « coconsult » est une vraie ESN du référentiel, stylisée en minuscules, UN SEUL mot : elle survit', () => {
      // La règle porte sur la PHRASE (plusieurs mots minuscules qui se lisent
      // comme une description), jamais sur la casse d'un mot seul — sinon
      // cette vraie raison sociale serait écartée à tort. C'est exactement
      // pourquoi elle ne s'écrit pas « ^[a-z] » tout court.
      expect(isPlausibleEsnName('coconsult')).toBe(true)
    })
  })

  describe('une raison sociale ne commence pas par un nom de tête GÉNÉRIQUE (ESN, Agences, Éditeur, Fournisseur, Cabinet, Prestataire, Intégrateur)', () => {
    it('écarte les cinq descriptions RÉELLEMENT mesurées', () => {
      for (const nom of [
        'Agences digitales locales',
        'Éditeur ou intégrateur immobilier',
        'ESN généraliste locale ou régionale',
        'ESN locale Occitanie',
        'Fournisseur IT interne ou groupe E.Leclerc',
      ]) {
        expect([nom, isPlausibleEsnName(nom)]).toEqual([nom, false])
      }
    })
  })

  /*
   * LE TÉMOIN À L'ÉCHELLE, RE-EXÉCUTÉ — la garde la plus précieuse de ce lot.
   * Chaque règle ajoutée ce tour-ci passe devant les 477 raisons sociales
   * AVANT d'être livrée : si l'une d'elles était écartée à tort, ce test
   * rouge le dirait, avec le nom en clair dans le tableau `rejetes`.
   */
  it('TÉMOIN À L’ÉCHELLE — les deux nouvelles règles n’écartent AUCUNE des 477 raisons sociales du référentiel', () => {
    const source = readFileSync(join(__dirname, '..', 'esn-directory', 'esn-seed-names.ts'), 'utf8')
    const noms = [...source.matchAll(/name:\s*'([^']*)'/g)].map(m => m[1]!)
    expect(noms.length).toBeGreaterThanOrEqual(400)

    const rejetes = noms.filter(nom => !isPlausibleEsnName(stripCertaintyDecoration(nom)))
    expect(rejetes).toEqual([])
  })
})

describe('#1799 (quatrième tour) — « & » et « et » sont la même conjonction : « pourquoi y a deux fois Crédit Agricole »', () => {
  it('fusionne « Crédit Agricole Technologies & Services » et « … et Services », mesurées séparément en production', () => {
    const result = mergeEsnByMatchKey([
      row({ name: 'Crédit Agricole Technologies & Services', account_id: 'acc-1', rank: 'unknown' }),
      row({ name: 'Crédit Agricole Technologies et Services', account_id: 'acc-2', rank: 'rank1' }),
    ])
    expect(result).toHaveLength(1)
    expect(result[0]?.accounts).toBe(2)
  })

  it('TÉMOIN — « ELSAN » et « ELSAN Services » restent DEUX lignes : le rapprochement ne fusionne jamais deux entités qui diffèrent d’un mot', () => {
    // Rappel explicite du docblock de `mergeEsnByMatchKey` : ce ne sont
    // peut-être pas la même société. La conjonction n'a rien à voir ici —
    // ce témoin vérifie que le correctif de CE tour ne l'a pas fait dériver.
    const result = mergeEsnByMatchKey([
      row({ name: 'ELSAN', account_id: 'acc-1', rank: 'unknown' }),
      row({ name: 'ELSAN Services', account_id: 'acc-2', rank: 'unknown' }),
    ])
    expect(result).toHaveLength(2)
  })

  /*
   * LE TÉMOIN À L'ÉCHELLE, POUR CETTE RÈGLE-CI PRÉCISÉMENT — la question
   * n'est pas seulement « une vraie ESN survit-elle », c'est « le repli sur
   * « et » fait-il apparaître une collision NOUVELLE entre deux raisons
   * sociales réellement distinctes du référentiel ? ». Mesuré une fois hors
   * du test (voir le rapport) : 455 groupes avant, 455 après. Ce test relit
   * le même fait, pour qu'il reste vrai si le référentiel change.
   */
  it('TÉMOIN À L’ÉCHELLE — le repli « & » → « et » ne fait fusionner AUCUNE paire de raisons sociales distinctes du référentiel', () => {
    const source = readFileSync(join(__dirname, '..', 'esn-directory', 'esn-seed-names.ts'), 'utf8')
    const noms = [...source.matchAll(/name:\s*'([^']*)'/g)].map(m => m[1]!)
    expect(noms.length).toBeGreaterThanOrEqual(400)

    const result = mergeEsnByMatchKey(
      noms.map((name, index) => row({ name, account_id: `acc-${index}`, rank: 'unknown' })),
    )
    // Deux lignes sont fusionnées uniquement si `marketMatchKey` les
    // rapproche DÉJÀ (« Capgemini »/« Capgemini France »…) — le repli « & »
    // ne doit ajouter AUCUNE fusion aux 8 raisons sociales qui portent un
    // « & » (`B&D Conseil`, `Bain & Company`, `Business & Decision`,
    // `Conseil & Stratégie`, `CS Communication & Systèmes`, `Ernst & Young
    // Advisory`, `France Telecom R&D`, `McKinsey & Company`) : chacune doit
    // apparaître dans son PROPRE groupe, avec `accounts: 1`.
    // jest n'accepte pas de message en 2e argument d'expect (c'est vitest) :
    // le nom voyage dans l'assertion elle-même pour rester lisible en cas de rouge.
    const ampersandNames = noms.filter(n => n.includes('&'))
    for (const nom of ampersandNames) {
      const group = result.find(r => r.name === nom)
      expect([nom, group?.accounts]).toEqual([nom, 1])
    }
  })
})

/**
 * #1799 (cinquième tour, résidu du 10/09/2026) — « Freelances et micro-agences »
 * n'est pas une société, c'est un SEAU DE RÉSIDU — une catégorie de marché,
 * au même titre que « Agences digitales locales » que le tour précédent a
 * déjà écarté. Elle survivait parce que `GENERIC_HEAD_NOUN_RE` ne connaissait
 * que sept noms de tête (« ESN », « Agences », « Éditeur », « Intégrateur »,
 * « Fournisseur », « Cabinet », « Prestataire ») — pas « Freelances » : ni
 * virgule, ni « / », ni parenthèse, ni négation, ni clause de certitude, ni
 * minuscule de tête, et 3 mots (sous `MAX_NAME_WORDS`) — invisible à toutes
 * les règles précédentes.
 *
 * MESURÉ EN PRODUCTION LE 10/09/2026 sur `GET /api/partners/on-my-accounts`,
 * après les quatre tours précédents : 50 entrées réduites à 2 suspects, dont
 * ce nom-là.
 *
 * ⚠️ Un mot seul (« Freelance.com », une plateforme réelle) reste couvert par
 * `(?=\s|$)` : la règle n'écarte que « Freelances » suivi d'un second mot ou
 * seul en fin de chaîne, jamais un nom qui commence par « Freelance » sans
 * frontière de mot juste après (aucun cas de ce type au référentiel, voir le
 * témoin à l'échelle plus bas).
 */
describe('#1799 (cinquième tour) — « Freelances » rejoint les noms de tête génériques', () => {
  it('écarte « Freelances et micro-agences » — une catégorie, pas une société', () => {
    const result = mergeEsnByMatchKey([
      row({ name: 'Freelances et micro-agences', account_id: 'acc-1', rank: 'unknown' }),
    ])
    expect(result).toEqual([])
  })

  it('une non-entité de cette forme mêlée à une vraie ESN ne laisse que la vraie ESN', () => {
    const result = mergeEsnByMatchKey([
      row({ name: 'Freelances et micro-agences', account_id: 'acc-1', rank: 'unknown' }),
      row({ name: 'Capgemini', account_id: 'acc-2', rank: 'unknown' }),
    ])
    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('Capgemini')
  })

  it('TÉMOIN À L’ÉCHELLE — n’écarte aucune des 477 raisons sociales du référentiel', () => {
    const source = readFileSync(join(__dirname, '..', 'esn-directory', 'esn-seed-names.ts'), 'utf8')
    const noms = [...source.matchAll(/name:\s*'([^']*)'/g)].map(m => m[1]!)
    expect(noms.length).toBeGreaterThanOrEqual(400)

    const rejetes = noms.filter(nom => !isPlausibleEsnName(stripCertaintyDecoration(nom)))
    expect(rejetes).toEqual([])
  })
})

/**
 * #2151.33 / #2151.34 — DÉCISION Louis 18/09 : les trois filtres demandés par
 * #2151 sont livrés, revenant sur le remplacement unique du 17/09. La
 * « relation existante » et le « rang 2 » ne peuvent se filtrer QUE relatifs à
 * cet agrégat de l'espace (même limite que `rank1` ci-dessus, jamais un fait
 * du candidat Découvrir lui-même) — deux compteurs de plus, agrégés de la même
 * façon que `rank1`.
 *
 * `knownRelationship` compte les présences dont la relation N'EST PAS
 * `'unknown'` : une ligne dont personne n'a encore dit si c'est un partenaire
 * ou un concurrent ne doit jamais faire croire que la relation est connue
 * (GA-18/GA-19 — « non mesuré » n'est jamais confondu avec une valeur).
 */
describe('#2151.33 / #2151.34 — rank2 et relation connue voyagent aussi dans le groupe', () => {
  it('compte les présences en rang 2, comme `rank1`', () => {
    const result = mergeEsnByMatchKey([
      row({ name: 'Capgemini', account_id: 'acc-1', rank: 'rank2' }),
      row({ name: 'Capgemini', account_id: 'acc-2', rank: 'rank1' }),
    ])
    expect(result[0]).toMatchObject({ name: 'Capgemini', rank1: 1, rank2: 1 })
  })

  it('compte les présences dont la relation est CONNUE (partenaire ou concurrent), jamais `unknown`', () => {
    const result = mergeEsnByMatchKey([
      row({ name: 'Capgemini', account_id: 'acc-1', relationship: 'partner' }),
      row({ name: 'Capgemini', account_id: 'acc-2', relationship: 'unknown' }),
      row({ name: 'Capgemini', account_id: 'acc-3', relationship: 'competitor' }),
    ])
    expect(result[0]).toMatchObject({ name: 'Capgemini', knownRelationship: 2 })
  })

  it('une ligne sans colonne `relationship` (fenêtre de déploiement) ne compte pas comme connue', () => {
    const result = mergeEsnByMatchKey([row({ name: 'Capgemini', account_id: 'acc-1' })])
    expect(result[0]).toMatchObject({ knownRelationship: 0, rank2: 0 })
  })
})

describe('#2151.32 — attachObservedClients : « clients observés », depuis la mémoire marché', () => {
  const groupFor = (name: string, accountIds: string[]) =>
    mergeEsnByMatchKey(accountIds.map((id, i) => row({ name, account_id: id, account_name: `Compte ${i}` })))

  it('compte un compte OBSERVÉ (persons > 0, mémoire marché) dans `observedAtAccounts`', () => {
    const rows = groupFor('Capgemini', ['acc-1'])
    const result = attachObservedClients(
      rows,
      new Map([['acc-1', { status: 'ok', observedEsnKeys: new Set([marketMatchKey('Capgemini')]) }]]),
    )
    expect(result[0]).toMatchObject({ observedAtAccounts: 1, unresolvedAtAccounts: 0 })
  })

  it('un compte RÉSOLU dont le corpus ne cite pas cette ESN compte « non observé », pas « inconnu »', () => {
    const rows = groupFor('Capgemini', ['acc-1'])
    const result = attachObservedClients(rows, new Map([['acc-1', { status: 'ok', observedEsnKeys: new Set() }]]))
    expect(result[0]).toMatchObject({ observedAtAccounts: 0, unresolvedAtAccounts: 0 })
  })

  it('un compte NON RÉSOLU (mémoire marché indisponible/non couverte) compte « inconnu », jamais « non observé »', () => {
    const rows = groupFor('Capgemini', ['acc-1'])
    const result = attachObservedClients(rows, new Map([['acc-1', { status: 'unknown' }]]))
    expect(result[0]).toMatchObject({ observedAtAccounts: 0, unresolvedAtAccounts: 1 })
  })

  it('agrège sur PLUSIEURS comptes de la même ESN : un observé + un inconnu + un résolu vide', () => {
    const rows = groupFor('Capgemini', ['acc-1', 'acc-2', 'acc-3'])
    const result = attachObservedClients(
      rows,
      new Map([
        ['acc-1', { status: 'ok', observedEsnKeys: new Set([marketMatchKey('Capgemini')]) }],
        ['acc-2', { status: 'unknown' }],
        ['acc-3', { status: 'ok', observedEsnKeys: new Set() }],
      ]),
    )
    expect(result[0]).toMatchObject({ observedAtAccounts: 1, unresolvedAtAccounts: 1 })
  })

  it('rapproche par la MÊME clé que le reste du fichier (marketMatchKey) — « Capgemini France » matche « Capgemini »', () => {
    const rows = groupFor('Capgemini France', ['acc-1'])
    const result = attachObservedClients(
      rows,
      new Map([['acc-1', { status: 'ok', observedEsnKeys: new Set([marketMatchKey('Capgemini')]) }]]),
    )
    expect(result[0]).toMatchObject({ observedAtAccounts: 1 })
  })

  it('un compte absent de la map (jamais interrogé) ne compte ni observé ni inconnu', () => {
    const rows = groupFor('Capgemini', ['acc-1'])
    const result = attachObservedClients(rows, new Map())
    expect(result[0]).toMatchObject({ observedAtAccounts: 0, unresolvedAtAccounts: 0 })
  })
})

/**
 * #2298.8 — TROIS NOTIONS VOISINES, TROIS SOURCES, JAMAIS LA MÊME MESURE.
 *
 * Le registre (`.claude/notes/registre-2026-09-17-lau-039-2298.md`) mesurait
 * `rank2Potential` sans aucun appelant : le type existait
 * (`esnRank2ObservationSchema`/`summarizeRank2Observations`,
 * `packages/contracts/src/schemas/esn-directory.ts`) mais rien ne le
 * remplissait. Ce bloc branche un écrivain RÉEL : une présence en rang 2,
 * DÉTECTÉE par l'analyse d'un compte de l'espace (`account_partners.rank =
 * 'rank2'`, `detected_at` réel), est un CONSTAT datable et sourçable —
 * exactement ce que la décision de Louis du 18/09 exige, jamais un score.
 *
 * ⚠️ Distinct d'`externalWorkforceObserved` (`observedAtAccounts`,
 * `attachObservedClients` ci-dessus, mémoire marché) : celui-ci dit « cette
 * ESN a été VUE chez un client », `rank2Observations` dit « cette ESN a déjà
 * été vue AGISSANT EN RANG 2 ». Une ESN peut être vue sans jamais avoir fait
 * de rang 2, et inversement — deux sources, deux tables, jamais le même
 * calcul (voir le test de distinction en bas de ce bloc).
 */
describe('#2298.8 — rank2Observations : un CONSTAT daté et sourcé, jamais un score', () => {
  it('une présence rang 2 DATÉE devient une observation « déjà sous-traitée »', () => {
    const result = mergeEsnByMatchKey([
      row({
        name: 'Halden Numérique',
        account_id: 'acc-1',
        account_name: 'Nova Logistique',
        rank: 'rank2',
        detected_at: '2026-08-08T00:00:00.000Z',
      }),
    ])
    expect(result[0]?.rank2Observations).toEqual({
      measured: true,
      count: 1,
      mostRecentAt: '2026-08-08T00:00:00.000Z',
      kinds: ['already_subcontracted'],
    })
  })

  it('une présence rang 2 SANS date ne produit AUCUNE observation — jamais une date inventée', () => {
    const result = mergeEsnByMatchKey([
      row({ name: 'Halden Numérique', account_id: 'acc-1', rank: 'rank2', detected_at: null }),
    ])
    expect(result[0]?.rank2Observations).toEqual({ measured: false })
  })

  it('une présence en rang 1 (ou inconnue) ne compte jamais comme une observation de rang 2', () => {
    const result = mergeEsnByMatchKey([
      row({ name: 'Capgemini', account_id: 'acc-1', rank: 'rank1', detected_at: '2026-08-08T00:00:00.000Z' }),
    ])
    expect(result[0]?.rank2Observations).toEqual({ measured: false })
  })

  it('plusieurs comptes en rang 2 : le compte cumule, la date la plus RÉCENTE ressort', () => {
    const result = mergeEsnByMatchKey([
      row({ name: 'Halden Numérique', account_id: 'acc-1', rank: 'rank2', detected_at: '2026-06-01T00:00:00.000Z' }),
      row({ name: 'Halden Numérique', account_id: 'acc-2', rank: 'rank2', detected_at: '2026-08-08T00:00:00.000Z' }),
    ])
    expect(result[0]?.rank2Observations).toMatchObject({
      measured: true,
      count: 2,
      mostRecentAt: '2026-08-08T00:00:00.000Z',
    })
  })

  it('LE PIÈGE — main-d’œuvre externe observée (mémoire marché) et rang 2 déjà observé (CRM) divergent : deux sources, pas une seule', () => {
    // Deux comptes : la mémoire marché observe l'ESN sur LES DEUX, mais un
    // seul compte porte une présence en rang 2 datée. Si les deux notions
    // sortaient du même calcul, elles rendraient le même nombre — ce n'est
    // pas le cas ici, et c'est la preuve qu'elles restent indépendantes.
    const merged = mergeEsnByMatchKey([
      row({ name: 'Halden Numérique', account_id: 'acc-1', account_name: 'Compte 1', rank: 'unknown' }),
      row({
        name: 'Halden Numérique',
        account_id: 'acc-2',
        account_name: 'Compte 2',
        rank: 'rank2',
        detected_at: '2026-08-08T00:00:00.000Z',
      }),
    ])
    const withMarketMemory = attachObservedClients(
      merged,
      new Map([
        ['acc-1', { status: 'ok' as const, observedEsnKeys: new Set([marketMatchKey('Halden Numérique')]) }],
        ['acc-2', { status: 'ok' as const, observedEsnKeys: new Set([marketMatchKey('Halden Numérique')]) }],
      ]),
    )
    const rank2Observations = withMarketMemory[0]?.rank2Observations
    expect(withMarketMemory[0]?.observedAtAccounts).toBe(2)
    expect(rank2Observations).toMatchObject({ measured: true, count: 1 })
    if (rank2Observations?.measured) {
      expect(withMarketMemory[0]?.observedAtAccounts).not.toBe(rank2Observations.count)
    }
  })
})
