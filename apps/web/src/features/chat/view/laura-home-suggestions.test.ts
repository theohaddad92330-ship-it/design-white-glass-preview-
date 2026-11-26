import { describe, expect, it } from 'vitest'
import {
  HOME_SUGGESTION_FAMILY,
  HOME_SUGGESTION_REQUIRES,
  HOME_SUGGESTION_REQUIRES_VIVIER,
  LAURA_SUGGESTION_FAMILIES,
  MAX_HOME_SUGGESTIONS,
  resolveLauraHomeSuggestions,
  type LauraHomeContext,
} from './laura-home-suggestions'

/**
 * #1600 — une collection UNIQUE, six suggestions au plus, dont le classement
 * dépend du contexte réel de l'espace. Le `t` de test rend la clé elle-même :
 * suffisant pour vérifier l'identité et l'ordre des suggestions, sans dépendre
 * du contenu des fichiers de traduction (couvert séparément par les gardes
 * i18n et par `Chat.test.tsx`).
 */
const t = ((key: string) => key) as unknown as Parameters<typeof resolveLauraHomeSuggestions>[0]

const NOTHING: LauraHomeContext = { hasPortfolio: false, hasVivier: false, hasPartners: false }

describe('resolveLauraHomeSuggestions (#3773 — quatre au plus, jamais complétées)', () => {
  it('un espace sans signal reçoit les quatre suggestions « nouvel utilisateur », et RIEN d’autre', () => {
    const suggestions = resolveLauraHomeSuggestions(t, NOTHING)
    expect(suggestions.map(s => s.id)).toEqual([
      'findCompatibleAccounts',
      'analyzeCompany',
      'zoneOpportunities',
      'whereInvestTime',
    ])
  })

  it('la borne est QUATRE (#3773.3) — plus six', () => {
    expect(MAX_HOME_SUGGESTIONS).toBe(4)
    const everything = resolveLauraHomeSuggestions(t, { hasPortfolio: true, hasVivier: true, hasPartners: true })
    expect(everything.length).toBe(4)
  })

  it('ne complète JAMAIS pour atteindre quatre : un seul signal vrai, une seule carte (#3773.3)', () => {
    const suggestions = resolveLauraHomeSuggestions(t, { ...NOTHING, hasPartners: true })
    expect(suggestions.map(s => s.id)).toEqual(['rank2PartnerUsage'])
  })

  it('un portefeuille rempli seul rend ses quatre suggestions, dont « préparer mon prochain rendez-vous » (#3773.2)', () => {
    const suggestions = resolveLauraHomeSuggestions(t, { ...NOTHING, hasPortfolio: true })
    expect(suggestions.map(s => s.id)).toEqual(['whereInvestTime', 'prepareMeeting', 'findAccessPath', 'whatsChanged'])
  })

  it('un vivier rempli seul rend ses trois suggestions — pas le repli nouvel utilisateur — et rien pour combler', () => {
    const suggestions = resolveLauraHomeSuggestions(t, { ...NOTHING, hasVivier: true })
    expect(suggestions.map(s => s.id)).toEqual(['consultantAvailable', 'matchVivier', 'matchingEnvironments'])
  })

  it('TÉMOIN #3773 — un espace mature voit UNE carte par signal (partenaires, portefeuille, vivier) avant la deuxième du portefeuille', () => {
    const suggestions = resolveLauraHomeSuggestions(t, { hasPortfolio: true, hasVivier: true, hasPartners: true })
    expect(suggestions.map(s => s.id)).toEqual([
      'rank2PartnerUsage',
      'whereInvestTime',
      // Le rôle (ici par défaut) range ensuite par famille : le portefeuille avant le vivier.
      'prepareMeeting',
      'consultantAvailable',
    ])
  })

  it('deux capacités distinctes restent distinctes : positionner UN consultant ≠ rapprocher TOUT le vivier', () => {
    const ids = Object.keys(HOME_SUGGESTION_REQUIRES)
    expect(ids).toContain('consultantAvailable')
    expect(ids).toContain('matchVivier')
    expect(HOME_SUGGESTION_FAMILY.consultantAvailable).toBe('position')
    expect(HOME_SUGGESTION_FAMILY.matchVivier).toBe('position')
  })

  it('« où investir mon temps » ne se propose jamais deux fois, même si deux familles le portent', () => {
    const suggestions = resolveLauraHomeSuggestions(t, { ...NOTHING, hasPortfolio: true, hasVivier: true })
    expect(suggestions.filter(s => s.id === 'whereInvestTime')).toHaveLength(1)
  })

  it('chaque suggestion porte son type (run ou prompt) et son texte réel', () => {
    const [first] = resolveLauraHomeSuggestions(t, NOTHING)
    expect(first.kind).toBe('prompt')
    expect(first.label).toBe('home.suggestions.findCompatibleAccounts.label')
    expect(first.prompt).toBe('home.suggestions.findCompatibleAccounts.prompt')
    expect(first.benefit).toBe('home.suggestions.findCompatibleAccounts.benefit')

    const run = resolveLauraHomeSuggestions(t, NOTHING).find(s => s.id === 'analyzeCompany')
    expect(run?.kind).toBe('run')
  })
})

/**
 * #3773.5 — « si un consultant, un compte ou un besoin doit être choisi, demander
 * ce seul élément puis préparer la bonne demande ».
 */
describe('resolveLauraHomeSuggestions × élément à choisir (#3773.5)', () => {
  const EVERYTHING: LauraHomeContext = { hasPortfolio: true, hasVivier: true, hasPartners: true }
  const all = resolveLauraHomeSuggestions(t, { ...EVERYTHING }).concat(
    resolveLauraHomeSuggestions(t, { ...NOTHING, hasPortfolio: true }),
    resolveLauraHomeSuggestions(t, { ...NOTHING, hasVivier: true }),
  )

  it('« positionner un consultant » demande un consultant, « par qui entrer » demande un compte', () => {
    expect(all.find(s => s.id === 'consultantAvailable')?.needs).toBe('consultant')
    expect(all.find(s => s.id === 'findAccessPath')?.needs).toBe('account')
  })

  it('une question complète n’a rien à choisir et ne porte aucune demande à compléter', () => {
    for (const id of ['whereInvestTime', 'prepareMeeting', 'rank2PartnerUsage', 'matchVivier']) {
      const suggestion = all.find(s => s.id === id)
      expect(suggestion?.needs).toBeNull()
      expect(suggestion?.promptFor).toBeNull()
    }
  })

  it('l’élément choisi entre dans la demande par son NOM — pas de texte caché', () => {
    const withName = ((key: string, params?: { name?: string }) =>
      params?.name ? `${key}:${params.name}` : key) as unknown as typeof t
    const suggestion = resolveLauraHomeSuggestions(withName, { ...NOTHING, hasPortfolio: true }).find(
      s => s.id === 'findAccessPath',
    )
    expect(suggestion?.promptFor?.('SNCF')).toContain('SNCF')
  })

  it('« préparer mon prochain rendez-vous » n’exige AUCUN agenda branché (#3773.3)', () => {
    expect(HOME_SUGGESTION_REQUIRES.prepareMeeting).toBeNull()
    const ids = resolveLauraHomeSuggestions(t, { ...NOTHING, hasPortfolio: true, connectedFamilies: [] }).map(s => s.id)
    expect(ids).toContain('prepareMeeting')
  })
})

/**
 * #1902.11 — LES SUGGESTIONS D'ACCUEIL LISENT LE MÊME REGISTRE QUE LE COMPOSEUR.
 *
 * Le composeur cache une amorce dont l'outil n'est pas branché (`PROMPT_REQUIRES`,
 * lu dans le registre des outils). L'accueil ne le lisait pas. Aujourd'hui
 * aucune des dix ne dépend d'un connecteur — c'est écrit, suggestion par
 * suggestion, et une onzième ne peut pas naître sans dire ce qu'elle exige.
 */
describe('resolveLauraHomeSuggestions × registre des outils (#1902.11)', () => {
  const EVERYTHING: LauraHomeContext = { hasPortfolio: true, hasVivier: true, hasPartners: true }

  it('déclare ce qu’exige CHAQUE suggestion qu’elle sait rendre', () => {
    const everyId = new Set(
      [
        NOTHING,
        { ...NOTHING, hasVivier: true },
        { ...NOTHING, hasPortfolio: true },
        { ...NOTHING, hasPartners: true },
        EVERYTHING,
      ].flatMap(context => resolveLauraHomeSuggestions(t, context).map(s => s.id)),
    )
    everyId.add('matchingEnvironments')
    expect(everyId.size).toBeGreaterThanOrEqual(10)
    for (const id of everyId) expect(Object.keys(HOME_SUGGESTION_REQUIRES)).toContain(id)
  })

  it('cache une suggestion dont la capacité n’est pas branchée, la montre quand elle l’est', () => {
    const requires = { ...HOME_SUGGESTION_REQUIRES, whereInvestTime: 'calendar' as const }
    const hidden = resolveLauraHomeSuggestions(t, { ...NOTHING, connectedFamilies: ['crm'] }, requires)
    expect(hidden.map(s => s.id)).not.toContain('whereInvestTime')
    const shown = resolveLauraHomeSuggestions(t, { ...NOTHING, connectedFamilies: ['calendar'] }, requires)
    expect(shown.map(s => s.id)).toContain('whereInvestTime')
  })

  it('pendant la lecture du registre, une suggestion qui exige un outil ATTEND — les autres restent', () => {
    const requires = { ...HOME_SUGGESTION_REQUIRES, whereInvestTime: 'calendar' as const }
    const ids = resolveLauraHomeSuggestions(t, NOTHING, requires).map(s => s.id)
    expect(ids).not.toContain('whereInvestTime')
    expect(ids).toContain('findCompatibleAccounts')
  })

  it('la table réelle ne cache rien aujourd’hui — aucune suggestion ne dépend d’un connecteur', () => {
    expect(Object.values(HOME_SUGGESTION_REQUIRES).every(requirement => requirement === null)).toBe(true)
    expect(resolveLauraHomeSuggestions(t, { ...NOTHING, connectedFamilies: [] })).toEqual(
      resolveLauraHomeSuggestions(t, NOTHING),
    )
  })
})

/**
 * #1909.6 — LES HUIT FAMILLES SONT NOMMÉES, ET CHAQUE SUGGESTION DIT LA SIENNE.
 *
 * La taxonomie n'est pas déduite du code : elle vient du retour lui-même
 * (« Familles possibles : Décider, Analyser, Découvrir, Trouver, Positionner,
 * Préparer, Agir, Piloter »). C'est pour ça que le premier test l'épelle — en
 * retirer une, ou en inventer une neuvième, doit être un geste conscient.
 */
describe('les huit familles de suggestions (#1909.6)', () => {
  it('nomme EXACTEMENT les huit familles du retour, dans leur ordre', () => {
    expect(LAURA_SUGGESTION_FAMILIES).toEqual([
      'decide',
      'analyse',
      'discover',
      'find',
      'position',
      'prepare',
      'act',
      'steer',
    ])
  })

  it('classe chaque suggestion DE DONNÉES dans une famille de la taxonomie, et porte sa clé de libellé', () => {
    const personalised = resolveLauraHomeSuggestions(t, {
      hasPortfolio: true,
      hasVivier: true,
      hasPartners: true,
    })
    expect(personalised.length).toBeGreaterThan(0)
    for (const suggestion of personalised) {
      expect(LAURA_SUGGESTION_FAMILIES).toContain(suggestion.family)
      expect(suggestion.familyLabel).toBe(`home.suggestionFamilies.${suggestion.family}`)
    }
  })

  it('la table des familles est EXHAUSTIVE — aucune suggestion de données n’est sans famille', () => {
    const ids = Object.keys(HOME_SUGGESTION_REQUIRES)
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) {
      expect(LAURA_SUGGESTION_FAMILIES).toContain(HOME_SUGGESTION_FAMILY[id as keyof typeof HOME_SUGGESTION_FAMILY])
    }
  })
})

/**
 * #1909.7 — « NE JAMAIS PROPOSER REVERSE MARKET SI LE VIVIER EST VIDE ».
 *
 * Reverse Market, sur l'accueil de Laura, c'est `consultantAvailable` —
 * « Positionner un consultant disponible », mot pour mot l'exemple du retour.
 * Le groupe `VIVIER` disait déjà dans quel ORDRE ces suggestions apparaissent ;
 * il ne disait pas à quelle CONDITION elles ont le droit d'apparaître, et une
 * suggestion listée par erreur sous un second signal serait passée. La
 * précondition est maintenant DÉCLARÉE par suggestion, et c'est elle qui
 * tranche.
 */
describe('le vivier est une précondition, pas un ordre de tri (#1909.7)', () => {
  it('déclare « Positionner un consultant disponible » (Reverse Market) comme dépendant du vivier', () => {
    expect(HOME_SUGGESTION_REQUIRES_VIVIER.consultantAvailable).toBe(true)
    expect(HOME_SUGGESTION_REQUIRES_VIVIER.matchVivier).toBe(true)
    expect(HOME_SUGGESTION_REQUIRES_VIVIER.matchingEnvironments).toBe(true)
  })

  it('retire une suggestion déclarée « vivier » même quand un AUTRE signal la ferait remonter — le cas que le groupe seul laissait passer', () => {
    // `whereInvestTime` remonte par le portefeuille. Déclarée « vivier », elle
    // doit disparaître d'un espace au portefeuille rempli mais au vivier vide.
    const needsVivier = { ...HOME_SUGGESTION_REQUIRES_VIVIER, whereInvestTime: true }
    const hidden = resolveLauraHomeSuggestions(
      t,
      { ...NOTHING, hasPortfolio: true },
      HOME_SUGGESTION_REQUIRES,
      needsVivier,
    )
    expect(hidden.map(s => s.id)).not.toContain('whereInvestTime')
    const shown = resolveLauraHomeSuggestions(
      t,
      { ...NOTHING, hasPortfolio: true, hasVivier: true },
      HOME_SUGGESTION_REQUIRES,
      needsVivier,
    )
    expect(shown.map(s => s.id)).toContain('whereInvestTime')
  })

  it('aucune suggestion rendue à un espace au vivier VIDE n’est déclarée dépendante du vivier', () => {
    const contexts: LauraHomeContext[] = [
      NOTHING,
      { ...NOTHING, hasPortfolio: true },
      { ...NOTHING, hasPartners: true },
      { hasPortfolio: true, hasPartners: true, hasVivier: false },
    ]
    for (const context of contexts) {
      const ids = resolveLauraHomeSuggestions(t, context).map(s => s.id)
      expect(ids.length).toBeGreaterThan(0)
      for (const id of ids) {
        expect(HOME_SUGGESTION_REQUIRES_VIVIER[id as keyof typeof HOME_SUGGESTION_REQUIRES_VIVIER]).toBe(false)
      }
    }
  })
})
