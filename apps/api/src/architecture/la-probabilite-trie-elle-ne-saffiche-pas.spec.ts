import {
  calibrateDealProbability,
  calibratedProbabilitySchema,
  rankedContactSchema,
  type RankedContact,
} from '@bellum/contracts'
import { rankAccountContacts, type RankableContactRow } from '../modules/contacts/contact-ranking'

/**
 * GA-376 — un chiffre NON CALIBRÉ trie ; il ne s'affiche pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ RÉÉCRITE LE 11/10/2026 — RENVERSEMENT DATÉ (décision Louis, #4016 L1)
 * ─────────────────────────────────────────────────────────────────────────────
 * `c26_probabilite` ne refuse plus d'AFFICHER une probabilité : il refuse d'en
 * afficher une NUE. Une probabilité voyage désormais vers un écran, mais
 * SEULEMENT dans l'enveloppe `calibratedProbabilitySchema` — méthode nommée,
 * intervalle, axes, axes non évaluables nommés et sortis du dénominateur,
 * `null` quand rien ne la fonde. Ce que cette garde tenait reste vrai, et pour
 * une raison plus nette qu'avant : `reachPoints` n'est PAS calibré (des points
 * fixes, aucune issue réelle derrière), donc il trie et ne voyage pas. Un champ
 * qui porte un nom de probabilité dans ce que l'API rend est refusé, SAUF si
 * sa valeur est une enveloppe calibrée valide — ce que la garde vérifie en la
 * PARSANT, pas en lisant son nom.
 *
 * Ce qui suit est la règle du 21/09/2026, gardée pour être lue.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUE CETTE GARDE PROTÈGE — ET QU'ELLE N'INVENTE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * #2375.5, DÉCISION LOUIS 21/09/2026, qui PRÉCISE `c26_probabilite` au lieu de
 * l'entamer : le refus prononcé six fois porte sur ce qui est AFFICHÉ et sur ce
 * qui est PERSISTÉ. Un calcul qui estime la chance d'obtenir une information a
 * le droit d'ORDONNER une liste de contacts ; aucun pourcentage, aucune jauge,
 * aucune formule « x % de chances » ne paraît à l'écran. Ce qui s'affiche est la
 * RAISON du rang — « a répondu deux fois », « poste exposé » —, jamais le chiffre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA FRONTIÈRE EXISTAIT DÉJÀ DANS LE CODE, SANS NOM ET SANS GARDE
 * ─────────────────────────────────────────────────────────────────────────────
 * `rankAccountContacts` calcule quatre signaux qui ORDONNENT et qui ne voyagent
 * pas : `rolePoints`, `reachPoints`, `measured`, `legacyPriority`. Ils sont
 * déstructurés hors de la réponse juste avant qu'elle ne soit rendue — une
 * ligne qu'un refactor discret supprimerait sans qu'aucun test ne bouge, et
 * l'estimation de joignabilité arriverait alors à l'écran sous forme de nombre.
 *
 * `reachPoints` EST la « probabilité d'obtenir une information » du point :
 * adresse vérifiée 15, e-mail ou téléphone 11, profil 5, cherché sans rien
 * trouver 0, jamais cherché `null`. Il départage (#2297.57) et il ne note pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE D'AUTRES GARDES TIENNENT DÉJÀ, ET QUE CELLE-CI NE REFAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 *  - GA-06 (`protected-criteria.spec.ts`) tient l'AUTRE moitié de la décision :
 *    aucun critère protégé ne pèse dans le rang. `contact-ranking.ts` y est le
 *    noyau tenu le plus strictement du dépôt — identité, photo, adresse,
 *    localisation et fuseau y sont refusés. Vérifié le 21/09/2026 : le tri ne
 *    consomme rien d'autre que titre, entité, rôle de décision, coordonnées,
 *    source, statut, dates d'échange et d'enrichissement.
 *  - GA-64 (`no-persisted-probability.spec.ts`) refuse qu'un champ NOMMÉ d'une
 *    probabilité entre en migration, en entité ou en contrat.
 *
 * Ce que ni l'une ni l'autre ne regarde : ce que la fonction de classement REND
 * vraiment. C'est ce que celle-ci lit — la valeur, pas le nom.
 */

/**
 * Les MOTS qui disent une probabilité — comparés à des mots ENTIERS, jamais à
 * une sous-chaîne.
 *
 * ⚠️ Mesuré en écrivant cette garde : `/rate/i` accusait `strategic_axes`
 * (st-RATE-gic), c'est-à-dire les huit axes stratégiques du contrat, du code
 * parfaitement juste. Une garde trop gourmande est un défaut au même titre
 * qu'une garde borgne, et c'est celle-là qu'on finit par désarmer.
 */
const PROBABILITY_WORDS = new Set([
  'rate',
  'ratio',
  'percent',
  'percentage',
  'pourcent',
  'pourcentage',
  'chance',
  'chances',
  'proba',
  'probability',
  'probabilite',
  'likelihood',
  'odds',
])

/** `reply_probability`, `closingChance`, `answer-rate` → leurs mots. */
function words(key: string): string[] {
  return key
    .split(/[^A-Za-z0-9]+|(?<=[a-z0-9])(?=[A-Z])/)
    .filter(Boolean)
    .map(part => part.toLowerCase())
}

/** Les signaux qui ORDONNENT et qui ne doivent JAMAIS voyager vers un écran. */
const ORDER_ONLY_SIGNALS = ['rolePoints', 'reachPoints', 'measured', 'legacyPriority'] as const

/**
 * Les noms de champ qui sonnent comme une probabilité, où qu'ils soient — SAUF
 * ceux dont la valeur est une enveloppe CALIBRÉE valide (#4016 L1, 11/10/2026).
 * La valeur est parsée : un objet qui ressemble à l'enveloppe sans en avoir
 * les axes, l'intervalle ou la méthode reste une probabilité nue.
 */
function probabilityShapedKeys(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((item, i) => probabilityShapedKeys(item, `${path}[${i}]`))
  if (value === null || typeof value !== 'object') return []
  const found: string[] = []
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const here = path ? `${path}.${key}` : key
    if (words(key).some(word => PROBABILITY_WORDS.has(word))) {
      if (calibratedProbabilitySchema.safeParse(child).success) continue
      found.push(here)
    }
    found.push(...probabilityShapedKeys(child, here))
  }
  return found
}

function row(over: Partial<RankableContactRow> & { id: string }): RankableContactRow {
  return {
    title: 'Directeur des achats',
    entity: null,
    decision_role: 'economic',
    email: null,
    email_verified: null,
    phone: null,
    linkedin_url: null,
    source: 'analysis',
    user_status: null,
    email_sent_at: null,
    last_enrichment_at: null,
    priority: null,
    demo_seed_first_door: null,
    ...over,
  }
}

/** Deux personnes strictement identiques, SAUF leur joignabilité. */
const JOIGNABLE = row({ id: 'b-joignable', email: 'a@b.fr', email_verified: true })
const INJOIGNABLE = row({ id: 'a-injoignable', linkedin_url: 'https://profil' })

function rank(rows: readonly RankableContactRow[]): RankedContact[] {
  return rankAccountContacts(rows, null, { subject: 'achats', perimeter: null, offer: null }).ranked
}

describe('GA-376 — le signal qui TRIE existe vraiment, et il trie', () => {
  it('la joignabilité change l’ORDRE de deux personnes autrement identiques', () => {
    // Sans ceci, tout le reste du fichier garderait une frontière imaginaire :
    // on prouverait qu'un nombre ne s'affiche pas, sans avoir prouvé qu'il sert.
    const ordre = rank([INJOIGNABLE, JOIGNABLE]).map(c => c.contact_id)
    expect(ordre).toEqual(['b-joignable', 'a-injoignable'])
    // Et l'ordre ne vient pas de l'ordre d'entrée ni de l'identifiant : `a-…`
    // précède `b-…` alphabétiquement, et c'est `b-…` qui sort en tête.
    expect(rank([JOIGNABLE, INJOIGNABLE]).map(c => c.contact_id)).toEqual(ordre)
  })

  it('le classement rend bien quelque chose — un corpus vide serait vert pour toujours', () => {
    const ranked = rank([JOIGNABLE, INJOIGNABLE])
    expect(ranked.length).toBe(2)
    expect(ranked.every(c => rankedContactSchema.safeParse(c).success)).toBe(true)
  })
})

describe('GA-376 — ce qui trie ne VOYAGE pas', () => {
  it('aucun signal d’ordre ne survit dans ce que l’API rend', () => {
    for (const contact of rank([JOIGNABLE, INJOIGNABLE])) {
      const fuites = ORDER_ONLY_SIGNALS.filter(signal => signal in contact)
      expect(fuites).toEqual([])
    }
  })

  it('la réponse porte EXACTEMENT les clés du contrat, ni plus ni moins', () => {
    // La forme est la seule chose qu'un écran peut lire : si rien d'autre ne
    // voyage, rien d'autre ne peut s'afficher. C'est cette implication qui rend
    // la frontière tenable sans relire les écrans un par un.
    // #3282.19 (02/10) — une clé OPTIONNELLE du contrat est remplie après le
    // classement (ex. `next_action_due_date`, lue par le service) : le
    // classeur pur peut ne pas la porter, « absent » y voulant dire « non lu ».
    // Rien HORS contrat ne voyage, et tout ce qui est requis est là.
    const shape = rankedContactSchema.shape
    const toutes = Object.keys(shape).sort()
    const requises = toutes.filter(k => !shape[k as keyof typeof shape].isOptional())
    for (const contact of rank([JOIGNABLE, INJOIGNABLE])) {
      const cles = Object.keys(contact).sort()
      expect(cles.filter(k => !toutes.includes(k))).toEqual([])
      expect(requises.filter(k => !cles.includes(k))).toEqual([])
    }
  })

  it('aucune valeur rendue ne porte un nom de probabilité, à aucune profondeur', () => {
    expect(probabilityShapedKeys(rank([JOIGNABLE, INJOIGNABLE]))).toEqual([])
  })
})

describe('GA-376 — ce qui s’affiche est la RAISON, pas le chiffre', () => {
  it('chaque axe rendu porte un code de raison, jamais une phrase', () => {
    const axes = rank([JOIGNABLE, INJOIGNABLE]).flatMap(c => c.axes)
    expect(axes.length).toBeGreaterThan(8)
    for (const axe of axes) {
      expect(typeof axe.reason).toBe('string')
      // Un CODE : pas d'espace, donc pas une phrase française figée dans un
      // contrat. L'écran traduit — et peut donc dire « a répondu deux fois ».
      expect(axe.reason).toMatch(/^[a-z0-9_]+$/)
    }
  })

  it('la joignabilité, elle, reste NOMMÉE sur la ligne — un score n’est jamais nu', () => {
    // La décision retire le CHIFFRE de l'écran, pas l'axe : sous un score, ce
    // qui n'a pas pu être évalué reste nommé (GA-18 / GA-19, `c26_probabilite`).
    const injoignable = rank([JOIGNABLE, INJOIGNABLE]).find(c => c.contact_id === 'a-injoignable')
    expect(injoignable?.axes.map(a => a.key)).toContain('accessibility')
  })

  it('un axe non évaluable rend `null`, jamais 0', () => {
    const jamaisCherche = rank([row({ id: 'c-vide' })])[0]
    const accessibilite = jamaisCherche.axes.find(a => a.key === 'accessibility')
    expect(accessibilite?.points).toBeNull()
    expect(accessibilite?.reason).toBe('never_searched')
  })
})

describe('GA-376 — elle sait dire NON', () => {
  it('voit un signal d’ordre qui aurait fui dans la réponse', () => {
    const fuite = { ...rank([JOIGNABLE])[0], reachPoints: 15 } as unknown as RankedContact
    expect(ORDER_ONLY_SIGNALS.filter(signal => signal in fuite)).toEqual(['reachPoints'])
    expect(Object.keys(fuite).sort()).not.toEqual(Object.keys(rankedContactSchema.shape).sort())
  })

  it('voit un champ de probabilité, même enfoui sous deux niveaux', () => {
    expect(probabilityShapedKeys({ ranked: [{ axes: [{ reply_probability: 0.72 }] }] })).toEqual([
      'ranked[0].axes[0].reply_probability',
    ])
    expect(probabilityShapedKeys([{ answer_rate: 0.4 }])).toEqual(['[0].answer_rate'])
    expect(probabilityShapedKeys({ closingChance: 72 })).toEqual(['closingChance'])
  })

  it('n’attrape PAS ce qu’elle ne vise pas', () => {
    // `score`, `max`, `points`, `position` sont la forme LÉGITIME d'un score
    // décomposé — les refuser casserait la règle voisine (« un score n'est
    // jamais nu ») au lieu de la servir.
    expect(probabilityShapedKeys({ score: 45, max: 70, points: 15, position: 1, total: 12, scored: 9 })).toEqual([])
    // ⚠️ Le faux positif MESURÉ en écrivant cette garde : `/rate/i` accusait
    // `strategic_axes` (st-RATE-gic), les huit axes stratégiques du contrat.
    // Le témoin reste ici pour que la gourmandise ne revienne pas.
    expect(probabilityShapedKeys({ strategic_axes: [], corporate: 1, generated_at: 'x', accurate: true })).toEqual([])
    // Un TAUX historique mesuré n'est pas une prédiction — mais il ne voyage pas
    // dans CE contrat, et la garde n'a pas à trancher ailleurs : elle ne lit que
    // ce que `rankAccountContacts` rend.
    expect(probabilityShapedKeys({ acceptanceRate: 0.4 })).toEqual(['acceptanceRate'])
  })
})

describe('GA-376 — #4016 L1 (11/10/2026) : seule une probabilité CALIBRÉE voyage', () => {
  const calibrated = calibrateDealProbability({
    stage: 'negotiation',
    history: [
      { outcome: 'won', highestStage: 'negotiation' },
      { outcome: 'won', highestStage: null },
      { outcome: 'won', highestStage: null },
      { outcome: 'lost', highestStage: 'negotiation' },
      { outcome: 'won', highestStage: null },
    ],
    shared: null,
  })

  it('laisse passer une probabilité dans son enveloppe calibrée', () => {
    expect(calibrated.value).not.toBeNull()
    expect(probabilityShapedKeys({ deals: [{ closing_probability: calibrated }] })).toEqual([])
  })

  it('SAIT DIRE NON — la même probabilité, nue ou privée de ses axes, est refusée', () => {
    expect(probabilityShapedKeys({ deals: [{ closing_probability: calibrated.value }] })).toEqual([
      'deals[0].closing_probability',
    ])
    expect(probabilityShapedKeys({ closing_probability: { ...calibrated, axes: [] } })).toContain('closing_probability')
    expect(probabilityShapedKeys({ closing_probability: { ...calibrated, interval: null } })).toContain(
      'closing_probability',
    )
  })

  it('le signal de joignabilité n’est pas calibré — il ne voyage toujours pas', () => {
    // Aucune issue réelle derrière `reachPoints` : des points fixes. Le
    // renversement du 11/10 ne le rend pas affichable.
    expect(calibratedProbabilitySchema.safeParse({ reachPoints: 15 }).success).toBe(false)
    for (const contact of rank([JOIGNABLE, INJOIGNABLE])) {
      expect(ORDER_ONLY_SIGNALS.filter(signal => signal in contact)).toEqual([])
    }
  })
})
