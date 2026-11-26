import { describe, expect, it } from 'vitest'
import {
  ambiguousCitySuggestion,
  extractFreetextZone,
  freetextSkillAndCity,
  parseNeedsFreetext,
  unrecognizedFreetextZone,
  unreadSizePhrase,
} from './discover-needs-freetext'

/**
 * #2165.60 — RÉFUTÉ en prod le 19/09 : « qui recrute des développeurs Java à
 * Toulouse », tapé en mode Besoins, rendait 40 résultats hors sujet (plongeur,
 * valet de chambre ; départements 26/16/05/38), avec « Non pris en compte :
 * recrute, développeurs, Java » et un rail resté VIDE. Cause : le texte libre
 * part TOUJOURS comme une recherche REGISTRE (`buildDiscoverRequest`, mode
 * 'registry' — voir `Discover.freetextSearch.test.tsx`), qui ne sait ni lire
 * une nature de signal ni resserrer sur les mots-clés d'intention.
 *
 * Cette fonction est PURE et ne fait qu'un tri : elle ne cherche rien, elle ne
 * vérifie rien — elle range ce qu'elle reconnaît dans les CONTRÔLES RÉELS du
 * rail des besoins (nature, ville) et laisse le reste, mots vides retirés,
 * repartir en mots-clés. Rien n'est deviné : une phrase sans déclencheur
 * reconnu rend `'any'`/`null`, jamais une valeur inventée.
 */
describe('parseNeedsFreetext (#2165.60)', () => {
  it('« qui recrute des développeurs Java à Toulouse » pose nature=hiring, ville=Toulouse, le reste en mots-clés', () => {
    expect(parseNeedsFreetext('qui recrute des développeurs Java à Toulouse')).toEqual({
      nature: 'hiring',
      city: 'Toulouse',
      region: null,
      department: null,
      keywords: 'développeurs Java',
      keywordGroups: ['développeurs Java'],
    })
  })

  it('reconnaît un appel d’offres et un marché attribué, pas seulement le recrutement', () => {
    expect(parseNeedsFreetext('cabinets qui répondent à un appel d’offres à Lyon').nature).toBe('tender')
    expect(parseNeedsFreetext('marché attribué à une ESN à Nantes').nature).toBe('award')
  })

  it('une phrase sans déclencheur reconnu rend `any`, jamais une nature devinée', () => {
    expect(parseNeedsFreetext('sociétés de conseil en cybersécurité').nature).toBe('any')
  })

  it('sans « à <Ville> », la ville reste `null` — jamais devinée d’un autre mot', () => {
    const parsed = parseNeedsFreetext('qui recrute des développeurs Java')
    expect(parsed.city).toBeNull()
    expect(parsed.keywords).toBe('développeurs Java')
  })

  it('une phrase vide ne pose rien', () => {
    expect(parseNeedsFreetext('')).toEqual({
      nature: 'any',
      city: null,
      region: null,
      department: null,
      keywords: null,
      keywordGroups: [],
    })
    expect(parseNeedsFreetext('   ')).toEqual({
      nature: 'any',
      city: null,
      region: null,
      department: null,
      keywords: null,
      keywordGroups: [],
    })
  })

  it('mots vides seuls (« qui », « des », « à ») : aucun mot-clé inventé', () => {
    expect(parseNeedsFreetext('qui des les').keywords).toBeNull()
  })

  it('une ville à double mot est reconnue entière (« à Saint-Priest »)', () => {
    expect(parseNeedsFreetext('recrutement à Saint-Priest').city).toBe('Saint-Priest')
  })
})

describe('#4419.29 — une phrase libre en minuscules = compétence + ville', () => {
  it.each([
    ['dev vue à lille', 'dev vue', 'Lille'],
    ['développeurs Vue.js près de Lille', 'développeurs Vue.js', 'Lille'],
    ['data engineer autour de villeneuve-d’ascq', 'data engineer', 'Villeneuve-d’Ascq'],
    ['java a toulouse', 'java', 'Toulouse'],
  ])('« %s » → mots « %s », ville « %s »', (text, keywords, city) => {
    const parsed = parseNeedsFreetext(text)
    expect(parsed.keywords).toBe(keywords)
    expect(parsed.city).toBe(city)
  })

  it('sait dire NON : aucune compétence non tapée, aucun lieu hors référentiel sans marqueur (#5002 : la ville connue, elle, est lue)', () => {
    const parsed = parseNeedsFreetext('dev vue atlantide')
    expect(parsed.city).toBeNull()
    expect(parsed.keywords).toBe('dev vue atlantide')
    expect(parseNeedsFreetext('dev vue à lille').keywords).not.toMatch(/java/i)
  })
})

describe('#4419.29 — mode Comptes : « dev vue à lille » = compétence Vue + ville Lille', () => {
  it.each([
    ['dev vue à lille', 'vue', 'Lille'],
    ['développeurs Vue.js près de Lille', 'Vue.js', 'Lille'],
    ['Data engineer à Lille', 'Data engineer', 'Lille'],
  ])('« %s » → compétence « %s », ville « %s »', (text, skill, city) => {
    expect(freetextSkillAndCity(text)).toEqual({ skill, city, region: null, department: null })
  })

  // #4579.9 — « vue et java » : deux compétences, pas le mot-clé collé « vue java ».
  it.each([
    ['dev vue et java à lille', 'vue, java'],
    ['dev vue ou java à lille', 'vue, java'],
    ['dev vue, java et python à lille', 'vue, java, python'],
    ['Data engineer et DevOps à Lille', 'Data engineer, DevOps'],
  ])('#4579.9 — « %s » → compétences « %s » (une liste, pas une chaîne)', (text, skill) => {
    expect(freetextSkillAndCity(text)?.skill).toBe(skill)
  })

  it('sait dire NON : sans ville, ou sans autre mot qu’un métier, la phrase reste une phrase', () => {
    // #4579.9 — pas de découpe sans connecteur : « data engineer » reste UNE compétence.
    expect(freetextSkillAndCity('data engineer à Lille')?.skill).toBe('data engineer')
    expect(freetextSkillAndCity('dev vue')).toBeNull()
    // Lot D (Louis 31/10, revient sur #4419.29) : un métier seul AVEC une zone est le besoin, plus une phrase à jeter.
    expect(freetextSkillAndCity('développeurs à Lille')).toMatchObject({ skill: 'développeurs', city: 'Lille' })
    expect(freetextSkillAndCity('à Lille')).toBeNull()
    expect(freetextSkillAndCity('cabinets qui recrutent des devs Python à Lyon')).toBeNull()
  })
})

/**
 * #4841 — « talend en occitanie » : la région partait en mot-clé, le rail restait « Toute la France ». La zone
 * dite (région, département) se pose dans le rail ; rien n'est deviné d'un mot qui n'est pas dans le référentiel.
 */
describe('parseNeedsFreetext — zone région / département (#4841)', () => {
  it('« talend en occitanie » → région 76, « occitanie » n’est plus un mot-clé', () => {
    const parsed = parseNeedsFreetext('talend en occitanie')
    expect(parsed.region).toBe('76')
    expect(parsed.department).toBeNull()
    expect(parsed.city).toBeNull()
    expect(parsed.keywords).toBe('talend')
  })

  it('« java dans le gard » → département 30', () => {
    const parsed = parseNeedsFreetext('java dans le gard')
    expect(parsed.department).toBe('30')
    expect(parsed.region).toBeNull()
    expect(parsed.keywords).toBe('java')
  })

  it('« java dans le 30 » et « java département 30 » → département 30', () => {
    expect(parseNeedsFreetext('java dans le 30').department).toBe('30')
    expect(parseNeedsFreetext('java département 30').keywords).toBe('java')
  })

  it('« dev vue à lille » (minuscule) reste une ville, pas une zone', () => {
    const parsed = parseNeedsFreetext('dev vue à lille')
    expect(parsed.city).toBe('Lille')
    expect(parsed.region).toBeNull()
    expect(parsed.department).toBeNull()
  })

  it('négatif : un nombre nu ne pose rien (« java 11 » est une version) ; une région NOMMÉE SEULE seule en fin de phrase se lit désormais comme une commune (lot 786, #5002)', () => {
    expect(parseNeedsFreetext('java 11').department).toBeNull()
    expect(parseNeedsFreetext('talend occitanie').region).toBe('76')
    expect(parseNeedsFreetext('talend en occitanie').keywords).not.toMatch(/occitanie/i)
  })

  it('un lieu inconnu après « en » reste en mots-clés, jamais jeté', () => {
    const parsed = parseNeedsFreetext('talend en atlantide')
    expect(parsed.region).toBeNull()
    expect(parsed.keywords).toBe('talend atlantide')
  })
})

describe('freetextSkillAndCity — zone région / département (#4841)', () => {
  it('« talend en occitanie » en mode Comptes pose la compétence ET la région', () => {
    expect(freetextSkillAndCity('talend en occitanie')).toEqual({
      skill: 'talend',
      city: null,
      region: '76',
      department: null,
    })
  })

  it('« java dans le gard » pose le département', () => {
    expect(freetextSkillAndCity('java dans le gard')).toEqual({
      skill: 'java',
      city: null,
      region: null,
      department: '30',
    })
  })
})

describe('#4841 — la région dite dans la phrase arrive au rail', () => {
  it('« talend en occitanie » pose la région 76 et ne laisse pas « occitanie » en mot-clé', () => {
    const parsed = parseNeedsFreetext('talend en occitanie')
    expect(parsed.region).toBe('76')
    expect(parsed.city).toBeNull()
    expect(parsed.keywords).toBe('talend')
    expect(freetextSkillAndCity('talend en occitanie')).toEqual({
      skill: 'talend',
      city: null,
      region: '76',
      department: null,
    })
  })

  it('lit les écritures courantes : accents, « dans la région », alias', () => {
    expect(parseNeedsFreetext('java en Île-de-France').region).toBe('11')
    expect(parseNeedsFreetext('java dans la région Grand Est').region).toBe('44')
    expect(parseNeedsFreetext('sap en PACA').region).toBe('93')
  })

  it('une ville reste une ville, et un nom de région en fin de phrase est la zone (lot 786 : comme une commune nue, #5002)', () => {
    expect(parseNeedsFreetext('dev vue à lille')).toMatchObject({ city: 'Lille', keywords: 'dev vue' })
    expect(parseNeedsFreetext('dev vue à lille').region).toBeNull()
    const bare = parseNeedsFreetext('java occitanie')
    expect(bare.region).toBe('76')
    expect(bare.keywords).toBe('java')
  })
})

describe('#4945.1 — une zone non reconnue dans la phrase est DITE, jamais ignorée', () => {
  it('« talend en atlantide » : « atlantide » est nommée comme zone non reconnue', () => {
    expect(unrecognizedFreetextZone('talend en atlantide')).toBe('atlantide')
    expect(unrecognizedFreetextZone('java dans le Mordor')).toBe('Mordor')
  })

  it('#4998.2 — une ville inconnue (« à Zorglub-sur-Mer ») ou un nom de commune seul est DIT non reconnu', () => {
    expect(unrecognizedFreetextZone('talend à Zorglub-sur-Mer')).toBe('Zorglub-sur-Mer')
    expect(unrecognizedFreetextZone('Zorglub-sur-Mer')).toBe('Zorglub-sur-Mer')
    expect(unrecognizedFreetextZone('Boulogne-sur-Mer')).toBeNull()
  })

  it("#4998.3 — la zone inconnue suivie d'une virgule (la phrase de la recette 02/11) est DITE", () => {
    expect(unrecognizedFreetextZone('ESN de plus de 500 personnes en Zorglub-sur-Mer, freelance Java')).toBe(
      'Zorglub-sur-Mer',
    )
    expect(unrecognizedFreetextZone('java en France, freelance')).toBeNull()
    expect(unrecognizedFreetextZone('esn, entreprises, java')).toBeNull()
  })

  it('#4998.3 — une taille en toutes lettres est RELUE pour être dite non lue, jamais devinée', () => {
    expect(unreadSizePhrase('ESN de plus de 500 personnes en Zorglub-sur-Mer, freelance Java')).toBe(
      'plus de 500 personnes',
    )
    expect(unreadSizePhrase('moins de 50 salariés')).toBe('moins de 50 salariés')
    expect(unreadSizePhrase('java 11 à Lille')).toBeNull()
  })

  it('une zone reconnue, une ville, un nombre nu, une compétence ou une modalité ne sont PAS signalés', () => {
    expect(unrecognizedFreetextZone('talend en occitanie')).toBeNull()
    expect(unrecognizedFreetextZone('java dans le gard')).toBeNull()
    expect(unrecognizedFreetextZone('dev vue à lille')).toBeNull()
    // décision écrite : un nombre nu ne pose rien et ne se signale pas
    expect(unrecognizedFreetextZone('talend 30')).toBeNull()
    expect(unrecognizedFreetextZone('java 11')).toBeNull()
    // « en java » : une compétence derrière « en » n'est pas une zone
    expect(unrecognizedFreetextZone('dev en java')).toBeNull()
    expect(unrecognizedFreetextZone('poste en télétravail')).toBeNull()
    expect(unrecognizedFreetextZone('talend')).toBeNull()
  })
})

describe('#4419.1 / #4945.2 — la phrase libre est LUE après la zone (lot D, recette 31/10)', () => {
  it('« développeur Java dans les Hauts-de-France » : zone 32 posée, le reste (métier + techno) est une compétence', () => {
    const zone = extractFreetextZone('développeur Java dans les Hauts-de-France')
    expect(zone).toMatchObject({ region: '32', department: null, rest: 'développeur Java' })
    expect(freetextSkillAndCity(zone.rest, true)).toEqual({
      skill: 'Java',
      city: null,
      region: null,
      department: null,
    })
  })

  it('un métier seul avec une zone lue (« développeur ») devient le besoin, pas un nom', () => {
    expect(freetextSkillAndCity('développeur', true)?.skill).toBe('développeur')
    expect(freetextSkillAndCity('développeur à Lyon')).toMatchObject({ skill: 'développeur', city: 'Lyon' })
  })

  it('témoins : sans zone, un nom ou « Python Software » reste un NOM (#4842)', () => {
    expect(freetextSkillAndCity('Capgemini')).toBeNull()
    expect(freetextSkillAndCity('Python Software')).toBeNull()
    expect(freetextSkillAndCity('développeur')).toBeNull()
  })

  it('« les Hauts-de-France » : jamais « s Hauts-de-France » comme zone non reconnue', () => {
    expect(unrecognizedFreetextZone('développeur Java dans les Hauts-de-France')).toBeNull()
    expect(unrecognizedFreetextZone('java dans les Mordor')).toBe('Mordor')
    expect(unrecognizedFreetextZone('java dans les Atlantides')).toBe('Atlantides')
  })
})

describe('#4793.2 — mode Besoins : « dans les <région> » pose aussi la région', () => {
  it('lit « les » comme « le » et « la »', () => {
    expect(parseNeedsFreetext('développeur Java dans les Hauts-de-France')).toMatchObject({
      region: '32',
      keywords: 'développeur Java',
    })
  })
  // #5002 — une ville du référentiel nommée SEULE en fin de phrase (sans « à ») est la zone ; le reste = mots-clés.
  it('« Data Strasbourg » → ville Strasbourg, mots-clés data (#5002)', () => {
    expect(parseNeedsFreetext('Data Strasbourg')).toMatchObject({ city: 'Strasbourg', keywords: 'Data' })
    expect(parseNeedsFreetext('java saint-etienne')).toMatchObject({ city: 'Saint-Étienne', keywords: 'java' })
    expect(freetextSkillAndCity('Data Strasbourg')).toMatchObject({ skill: 'Data', city: 'Strasbourg' })
  })

  it('une ville seule n’est pas une zone (c’est peut-être un nom), un lieu inconnu reste mot-clé (#5002, garde #4841)', () => {
    expect(parseNeedsFreetext('Strasbourg').city).toBeNull()
    expect(parseNeedsFreetext('Strasbourg').keywords).toBe('Strasbourg')
    const unknown = parseNeedsFreetext('java atlantide')
    expect(unknown.city).toBeNull()
    expect(unknown.keywords).toBe('java atlantide')
    expect(parseNeedsFreetext('Python Software').city).toBeNull()
  })
})

describe('garde #5002 — commune ambiguë (mot courant ou marque)', () => {
  it('« Data Nice » reste mot-clé et PROPOSE Nice ; « Data Strasbourg » reste zone', () => {
    expect(parseNeedsFreetext('Data Nice')).toMatchObject({ city: null, keywords: 'Data Nice' })
    expect(ambiguousCitySuggestion('Data Nice')).toBe('Nice')
    expect(ambiguousCitySuggestion('Data Strasbourg')).toBeNull()
    expect(parseNeedsFreetext('Data Strasbourg')).toMatchObject({ city: 'Strasbourg', keywords: 'Data' })
  })
  it('« développeur à Nice » (marqueur) reste une zone', () => {
    expect(parseNeedsFreetext('développeur à Nice').city).toBe('Nice')
    expect(ambiguousCitySuggestion('développeur à Nice')).toBeNull()
  })
})

describe('lot 786 (#5203 B) — une RÉGION nommée seule en fin de phrase est la zone, comme une ville', () => {
  it('« SAP Île-de-France » → région 11, mots-clés SAP', () => {
    expect(parseNeedsFreetext('SAP Île-de-France')).toMatchObject({ region: '11', city: null, keywords: 'SAP' })
    expect(freetextSkillAndCity('SAP Île-de-France')).toMatchObject({ skill: 'SAP', region: '11', city: null })
  })
  it('sans accents ni tirets, et en plusieurs mots : « java ile de france », « talend Grand Est »', () => {
    expect(parseNeedsFreetext('java ile de france')).toMatchObject({ region: '11', keywords: 'java' })
    expect(parseNeedsFreetext('talend Grand Est')).toMatchObject({ region: '44', keywords: 'talend' })
  })
  it('sait dire NON : une région seule (« Occitanie ») reste un mot-clé ; « Java Lille » garde sa ville', () => {
    expect(parseNeedsFreetext('Occitanie')).toMatchObject({ region: null, keywords: 'Occitanie' })
    expect(parseNeedsFreetext('Java Lille')).toMatchObject({ city: 'Lille', region: null, keywords: 'Java' })
  })
})
