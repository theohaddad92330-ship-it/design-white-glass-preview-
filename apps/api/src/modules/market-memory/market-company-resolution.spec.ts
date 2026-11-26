import { marketMatchKey } from './market-company-key'
import { type MarketCandidate, resolveMarketCompany } from './market-company-resolution'

/**
 * #1617 — « zéro mauvais Thales ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CES TESTS FIXENT
 * ─────────────────────────────────────────────────────────────────────────────
 * `match_key` et `website_domain` portent des index NON UNIQUES
 * (`1791743186247-MarketMemory.ts:91,94`) sur 60 067 entreprises. Les deux
 * chemins de lecture faisaient pourtant chacun un choix SILENCIEUX quand
 * plusieurs lignes répondaient :
 *
 *   · `resolve()` appelait `findOne({ where: { matchKey } })` — la PREMIÈRE
 *     ligne que la base rend, sans `ORDER BY` ;
 *   · `pathsFor()` écrasait `best.set(ref, …)` à chaque ligne — la DERNIÈRE.
 *
 * Deux lectures du même compte pouvaient donc désigner deux entreprises
 * différentes, et aucune des deux n'était choisie : c'est le hasard de l'ordre
 * de lecture. Attacher la mémoire d'un compte au mauvais compte est pire que ne
 * pas en avoir — l'erreur est invisible et ressort en réunion.
 *
 * La règle que ces tests posent : **une ambiguïté qu'on ne sait pas trancher ne
 * se tranche pas au hasard, elle se DIT.**
 */

function candidate(partial: Partial<MarketCandidate> & { companyName: string }): MarketCandidate {
  return {
    companyKey: partial.companyKey ?? partial.companyName.toLowerCase().replace(/\s+/g, '-'),
    companyName: partial.companyName,
    matchKey: partial.matchKey ?? marketMatchKey(partial.companyName),
    websiteDomain: partial.websiteDomain ?? null,
    country: partial.country ?? null,
    pathsTotal: partial.pathsTotal ?? 40,
  }
}

describe('resolveMarketCompany — une ambiguïté se dit, elle ne se tranche pas au hasard', () => {
  it('rend `unresolved` quand rien ne répond — et c’est une bonne réponse', () => {
    expect(resolveMarketCompany([], [], {})).toEqual({ status: 'unresolved' })
  })

  it('rend `resolved` quand le domaine désigne UNE entreprise', () => {
    const thales = candidate({ companyName: 'Thales', websiteDomain: 'thalesgroup.com', pathsTotal: 272 })
    expect(resolveMarketCompany([thales], [], {})).toEqual({
      status: 'resolved',
      companyKey: thales.companyKey,
      strength: 'domain',
      matchedOn: 'domain',
      pathsTotal: 272,
      ambiguityDropped: null,
    })
  })

  it('rend `resolved` par le NOM quand le domaine ne répond pas — force `inferred`', () => {
    const sncf = candidate({ companyName: 'SNCF', pathsTotal: 90 })
    const resolution = resolveMarketCompany([], [sncf], {})
    expect(resolution.status).toBe('resolved')
    expect(resolution).toMatchObject({ companyKey: sncf.companyKey, strength: 'inferred' })
  })

  /**
   * LE CŒUR DE #1617.
   *
   * Deux entreprises réelles partagent la clé normalisée `orange` : l'opérateur
   * et une banque. Avant ce lot, la lecture en prenait une, et laquelle
   * dépendait de l'ordre de la base.
   */
  it('rend `ambiguous` quand DEUX entreprises portent la même clé de nom', () => {
    const homonymes = [
      candidate({ companyName: 'Orange', companyKey: 'orange-telecom', pathsTotal: 150 }),
      candidate({ companyName: 'Orange', companyKey: 'orange-bank', pathsTotal: 12 }),
    ]
    expect(resolveMarketCompany([], homonymes, {})).toEqual({
      status: 'ambiguous',
      ambiguity: { on: 'name', candidates: 2 },
    })
  })

  it('rend `ambiguous` quand DEUX entreprises partagent le domaine — une filiale sous le domaine de son groupe', () => {
    const sousLeMemeDomaine = [
      candidate({ companyName: 'BNP Paribas', companyKey: 'bnp', websiteDomain: 'group.bnpparibas', pathsTotal: 282 }),
      candidate({
        companyName: 'BNP Paribas Personal Investors',
        companyKey: 'bnp-pi',
        websiteDomain: 'group.bnpparibas',
        pathsTotal: 1,
      }),
    ]
    expect(resolveMarketCompany(sousLeMemeDomaine, [], {})).toEqual({
      status: 'ambiguous',
      ambiguity: { on: 'domain', candidates: 2 },
    })
  })

  /**
   * LE SEUL DÉPARTAGE QUE LA DONNÉE PERMET.
   *
   * #1617 demande une hiérarchie SIREN → registre + pays → domaine → identifiant
   * LinkedIn → nom. Le corpus ne porte NI SIREN, NI identifiant de registre, NI
   * identifiant LinkedIn (les trois fichiers qui portent une URL de profil ne
   * sont pas importés, et ce refus est gardé). Le seul échelon supplémentaire
   * réellement disponible est le PAYS — et il est utile : deux « CGI » dans deux
   * pays ne sont pas la même entreprise.
   */
  it('départage deux homonymes par le PAYS quand l’appelant le connaît', () => {
    const homonymes = [
      candidate({ companyName: 'CGI', companyKey: 'cgi-fr', country: 'FR', pathsTotal: 80 }),
      candidate({ companyName: 'CGI', companyKey: 'cgi-ca', country: 'CA', pathsTotal: 400 }),
    ]
    expect(resolveMarketCompany([], homonymes, { country: 'fr' })).toMatchObject({
      status: 'resolved',
      companyKey: 'cgi-fr',
    })
  })

  it('reste `ambiguous` quand le pays ne départage pas non plus', () => {
    const homonymes = [
      candidate({ companyName: 'CGI', companyKey: 'cgi-a', country: 'FR' }),
      candidate({ companyName: 'CGI', companyKey: 'cgi-b', country: 'FR' }),
    ]
    expect(resolveMarketCompany([], homonymes, { country: 'FR' })).toEqual({
      status: 'ambiguous',
      ambiguity: { on: 'name', candidates: 2 },
    })
  })

  it('reste `ambiguous` quand l’appelant ne connaît AUCUN pays — on ne devine pas', () => {
    const homonymes = [
      candidate({ companyName: 'CGI', companyKey: 'cgi-fr', country: 'FR' }),
      candidate({ companyName: 'CGI', companyKey: 'cgi-ca', country: 'CA' }),
    ]
    expect(resolveMarketCompany([], homonymes, {}).status).toBe('ambiguous')
  })

  /**
   * UN CÔTÉ AMBIGU N'INVALIDE PAS L'AUTRE.
   *
   * Un domaine porté par une filiale ET son groupe ne dit rien ; si le nom, lui,
   * désigne UNE entreprise, il n'y a aucune raison de rendre le compte muet. On
   * retient le nom, ET on garde trace de l'ambiguïté écartée — c'est elle que le
   * rapport « résolutions à revoir » compte.
   */
  it('retient le côté qui tranche, et RETIENT que l’autre était ambigu', () => {
    const domaineAmbigu = [
      candidate({ companyName: 'BNP Paribas', companyKey: 'bnp', websiteDomain: 'group.bnpparibas' }),
      candidate({ companyName: 'BNP Paribas PI', companyKey: 'bnp-pi', websiteDomain: 'group.bnpparibas' }),
    ]
    const nomUnique = [candidate({ companyName: 'BNP Paribas', companyKey: 'bnp', pathsTotal: 282 })]

    expect(resolveMarketCompany(domaineAmbigu, nomUnique, {})).toEqual({
      status: 'resolved',
      companyKey: 'bnp',
      strength: 'inferred',
      matchedOn: 'name',
      pathsTotal: 282,
      ambiguityDropped: { on: 'domain', candidates: 2 },
    })
  })

  /**
   * L'ARBITRAGE MESURÉ EN PRODUCTION RESTE EN VIGUEUR — et #1617 demande
   * l'inverse.
   *
   * Le retour pose « domaine > nom » comme une hiérarchie fixe. La production a
   * montré que c'est faux sur CE corpus : `group.bnpparibas` y est porté par une
   * filiale à 1 parcours pendant que la maison mère, à 282, porte un autre
   * domaine. Un candidat SOUS LE SEUIL ne porte aucune information : le préférer
   * jette un signal réel pour du silence.
   *
   * La règle mesurée (commits 2873db015 / e067ab929) tient donc, et c'est
   * délibéré : les deux couverts → le domaine ; un seul couvert → lui.
   */
  it('préfère le candidat COUVERT, même s’il vient du nom — la règle mesurée en production', () => {
    const domaineSousLeSeuil = [candidate({ companyName: 'Filiale', companyKey: 'filiale', pathsTotal: 1 })]
    const nomCouvert = [candidate({ companyName: 'Maison mère', companyKey: 'mere', pathsTotal: 282 })]

    expect(resolveMarketCompany(domaineSousLeSeuil, nomCouvert, {})).toMatchObject({
      status: 'resolved',
      companyKey: 'mere',
      strength: 'inferred',
    })
  })

  it('préfère le DOMAINE quand les deux sont couverts', () => {
    const domaine = [candidate({ companyName: 'A', companyKey: 'a', pathsTotal: 50 })]
    const nom = [candidate({ companyName: 'B', companyKey: 'b', pathsTotal: 90 })]

    expect(resolveMarketCompany(domaine, nom, {})).toMatchObject({ companyKey: 'a', strength: 'domain' })
  })
})

/**
 * #1756 — LE TROISIÈME CANDIDAT : L'ALIAS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES TESTS FIXENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Mesuré en production le 08/09/2026 : « SG SOCIETE GENERALE » choisi dans
 * l'autocomplétion affiche « Bellum n'a pas suffisamment d'observations » alors
 * que le corpus connaît « SOCIETE GENERALE » avec 267 parcours observés. Zéro
 * candidat par le nom (la clé diffère), zéro par le domaine (`CompanySuggestion`
 * ne porte pas de site web) — et la jointure rend zéro SANS JAMAIS ÉCHOUER.
 *
 * L'alias est le seul rapprochement supplémentaire que la donnée permet : il
 * n'invente aucun identifiant, il enregistre une décision. Ces tests posent ses
 * trois limites — il arrive en DERNIER, il ne départage RIEN, et il ressort
 * NOMMÉ comme une approximation.
 */
describe('#1756 — l’alias rattrape le silence, il ne tranche jamais', () => {
  const sg = candidate({ companyName: 'SOCIETE GENERALE', companyKey: 'societe generale', pathsTotal: 267 })

  it('rapproche par ALIAS quand le domaine ET le nom ne rendent RIEN — le cas de #1756', () => {
    expect(resolveMarketCompany([], [], {}, [sg])).toEqual({
      status: 'resolved',
      companyKey: 'societe generale',
      // ⚠️ FAIBLE : une équivalence déclarée n'est pas un domaine racine partagé.
      strength: 'inferred',
      matchedOn: 'alias',
      pathsTotal: 267,
      ambiguityDropped: null,
    })
  })

  it('reste `unresolved` sans alias — sans table remplie, le chemin est celui d’avant', () => {
    expect(resolveMarketCompany([], [], {})).toEqual({ status: 'unresolved' })
    expect(resolveMarketCompany([], [], {}, [])).toEqual({ status: 'unresolved' })
  })

  it('une résolution par alias est DISTINGUABLE d’une résolution exacte', () => {
    const parAlias = resolveMarketCompany([], [], {}, [sg])
    const parNom = resolveMarketCompany([], [sg], {})
    // Les deux rendent la même clé avec la même force : sans `matchedOn`, rien
    // ne permettrait de compter les approximations à part.
    expect(parAlias).toMatchObject({ companyKey: 'societe generale', strength: 'inferred' })
    expect(parNom).toMatchObject({ companyKey: 'societe generale', strength: 'inferred' })
    expect(parAlias).toMatchObject({ matchedOn: 'alias' })
    expect(parNom).toMatchObject({ matchedOn: 'name' })
  })

  it('ne DÉPARTAGE pas deux entreprises visées par le même alias — il se tait', () => {
    const deux = [
      candidate({ companyName: 'Orange', companyKey: 'orange-telecom', pathsTotal: 259 }),
      candidate({ companyName: 'Orange Bank', companyKey: 'orange-bank', pathsTotal: 40 }),
    ]
    // Ni l'un ni l'autre, et surtout pas le plus gros : « une mauvaise jointure
    // est pire qu'une absence de donnée ».
    expect(resolveMarketCompany([], [], {}, deux)).toEqual({ status: 'unresolved' })
  })

  it('n’écrase PAS un rapprochement par domaine — l’alias arrive en dernier', () => {
    const parDomaine = candidate({ companyName: 'Thales', companyKey: 'thales', websiteDomain: 'thalesgroup.com' })
    const aliasConcurrent = candidate({ companyName: 'Autre', companyKey: 'autre', pathsTotal: 900 })

    expect(resolveMarketCompany([parDomaine], [], {}, [aliasConcurrent])).toMatchObject({
      companyKey: 'thales',
      matchedOn: 'domain',
    })
  })

  it('n’écrase PAS un rapprochement par nom', () => {
    const parNom = candidate({ companyName: 'SNCF', companyKey: 'sncf', pathsTotal: 64 })
    const aliasConcurrent = candidate({ companyName: 'Autre', companyKey: 'autre', pathsTotal: 900 })

    expect(resolveMarketCompany([], [parNom], {}, [aliasConcurrent])).toMatchObject({
      companyKey: 'sncf',
      matchedOn: 'name',
    })
  })

  /**
   * ⚠️ LA LIMITE LA PLUS IMPORTANTE DE CE LOT.
   *
   * Une AMBIGUÏTÉ n'est pas un silence : « plusieurs répondent » reste vrai
   * quoi qu'en dise la table d'alias. Laisser un alias trancher là serait
   * rejouer très exactement le défaut de #1617 — un choix silencieux entre deux
   * candidats — au nom d'une équivalence déclarée par quelqu'un d'autre.
   */
  it('ne tranche PAS une ambiguïté de nom, même avec un alias net', () => {
    const homonymes = [
      candidate({ companyName: 'Orange', companyKey: 'orange-telecom', pathsTotal: 259 }),
      candidate({ companyName: 'Orange', companyKey: 'orange-bank', pathsTotal: 40 }),
    ]
    expect(resolveMarketCompany([], homonymes, {}, [sg])).toEqual({
      status: 'ambiguous',
      ambiguity: { on: 'name', candidates: 2 },
    })
  })

  it('ne tranche PAS une ambiguïté de domaine non plus', () => {
    const memeDomaine = [
      candidate({ companyName: 'BNP Paribas', companyKey: 'bnp', websiteDomain: 'group.bnpparibas' }),
      candidate({ companyName: 'BNP Paribas PI', companyKey: 'bnp-pi', websiteDomain: 'group.bnpparibas' }),
    ]
    expect(resolveMarketCompany(memeDomaine, [], {}, [sg])).toEqual({
      status: 'ambiguous',
      ambiguity: { on: 'domain', candidates: 2 },
    })
  })

  /**
   * Le SEUIL reste celui du service, pas celui de l'arbitre : `resolveMarketCompany`
   * rend `resolved` avec son `pathsTotal`, et c'est `MarketMemoryService` qui
   * décide si ce total suffit. Un alias ne contourne donc aucun seuil.
   */
  it('un alias sous le seuil rend quand même sa MESURE — le seuil vit dans le service', () => {
    const petit = candidate({ companyName: 'Petite', companyKey: 'petite', pathsTotal: 2 })
    expect(resolveMarketCompany([], [], {}, [petit])).toMatchObject({
      status: 'resolved',
      matchedOn: 'alias',
      pathsTotal: 2,
    })
  })
})

/**
 * LES GOLDEN TESTS QUE #1617 NOMME — « zéro mauvais Thales ».
 *
 * ⚠️ Ils portent sur la NON-FUSION : ces noms ne doivent PAS se rapprocher. Le
 * seul test qui existait avant ce lot allait dans le sens inverse — il vérifiait
 * que « Groupe Thales » et « Thales SA » se rejoignent, ce qui est voulu (même
 * entreprise, deux graphies) mais ne dit RIEN du risque que le retour décrit.
 */
describe('#1617 — les paires qui ne doivent jamais se confondre', () => {
  const NE_SE_CONFONDENT_PAS: readonly (readonly [string, string])[] = [
    ['Thales', 'Thales Alenia Space'],
    ['SNCF', 'SNCF Réseau'],
    ['Orange', 'Orange Business'],
    ['La Poste', 'La Poste Telecom'],
    ['EDF', 'EDF Renouvelables'],
    ['CGI', 'CGI Finance'],
  ]

  it.each(NE_SE_CONFONDENT_PAS)('« %s » et « %s » restent deux entreprises', (gauche, droite) => {
    expect(marketMatchKey(gauche)).not.toBe(marketMatchKey(droite))
  })

  /**
   * Le pendant : les graphies d'une MÊME entreprise doivent se rejoindre, sinon
   * la garde ci-dessus serait satisfaite par une normalisation qui ne rapproche
   * plus rien du tout. Une garde qui n'accepte rien ne protège rien.
   */
  const SONT_LA_MEME: readonly (readonly [string, string])[] = [
    ['Thales', 'THALES GROUP'],
    ['Thales', 'Groupe Thales'],
    ['Thales', 'Thales SA'],
    ['Société Générale', 'SOCIETE GENERALE'],
  ]

  it.each(SONT_LA_MEME)('« %s » et « %s » sont la même', (gauche, droite) => {
    expect(marketMatchKey(gauche)).toBe(marketMatchKey(droite))
  })

  /**
   * ⚠️ ET LE CAS QUE LA NORMALISATION NE PEUT PAS TRANCHER.
   *
   * « Thales » et « THALES GROUP » se rejoignent parce que `groupe`/`group` est
   * un mot de structure. C'est juste — mais ça veut dire que si le corpus
   * contient DEUX lignes distinctes sous ces deux graphies, la clé de nom les
   * ramène toutes les deux. Ce n'est alors plus un problème de normalisation,
   * c'est une AMBIGUÏTÉ, et c'est `resolveMarketCompany` qui doit la dire.
   */
  it('deux lignes du corpus sous deux graphies de Thales rendent `ambiguous`, jamais l’une des deux', () => {
    const deuxGraphies = [
      candidate({ companyName: 'Thales', companyKey: 'thales', pathsTotal: 272 }),
      candidate({ companyName: 'THALES GROUP', companyKey: 'thales-group', pathsTotal: 31 }),
    ]
    expect(deuxGraphies[0]!.matchKey).toBe(deuxGraphies[1]!.matchKey)
    expect(resolveMarketCompany([], deuxGraphies, {})).toEqual({
      status: 'ambiguous',
      ambiguity: { on: 'name', candidates: 2 },
    })
  })
})
