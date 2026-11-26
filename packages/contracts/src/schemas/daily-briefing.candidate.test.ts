import { describe, expect, it } from 'vitest'
import {
  focusPlanBlockOutcomeReadSchema,
  BRIEFING_CANDIDATE_PROCESSING_STATES,
  BRIEFING_CARD_FIELDS,
  BRIEFING_CONFIDENCE_LEVELS,
  BRIEFING_RANKING_AXES,
  briefingActionSchema,
  briefingRankingAxesVerdict,
} from './daily-briefing.js'

/**
 * LE CONTRAT CANONIQUE D'UN CANDIDAT DU JOUR (#2095, #2099).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI L'EXTENSION PLUTÔT QU'UN SECOND SCHÉMA
 * ─────────────────────────────────────────────────────────────────────────────
 * #2095.13 demande « un contrat canonique de candidat quotidien » et liste ses
 * champs. Un second schéma de vingt-trois champs à côté de `briefingActionSchema`
 * aurait donné DEUX objets pour la même carte, dont un seul est servi et rendu :
 * le motif que ce dépôt connaît par cœur — du code juste que personne n'appelle.
 * Les champs manquants sont donc AJOUTÉS à l'objet que l'écran rend déjà, et
 * c'est lui qui devient canonique (GA-26).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES TESTS REFUSENT
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. une PROBABILITÉ sous quelque nom que ce soit — refusée six fois ;
 *  2. un score ou un poids interne exposé (#2095.83, #2099.48) : les axes sont
 *     NOMMÉS, jamais chiffrés ;
 *  3. un axe non évaluable compté dans le dénominateur (GA-18 / GA-19) ;
 *  4. un « 0 » là où la vérité est « non mesuré » — `estimatedMinutes` refuse
 *     zéro plutôt que de l'afficher ;
 *  5. une extension qui casse les charges utiles déjà écrites.
 */

/** Une carte telle que l'API l'écrit AUJOURD'HUI — sans aucun champ neuf. */
const SERVED_CARD = {
  id: 'reply:thread-1',
  labelKey: 'briefing.actions.reply',
  labelVars: { company: 'Damaris Industries' },
  href: '/mailbox',
  kind: 'reply',
  priority: 1,
}

describe('l’extension est ADDITIVE (#2095.13)', () => {
  it('une carte écrite avant les champs neufs parse encore, et rend l’absence', () => {
    const parsed = briefingActionSchema.parse(SERVED_CARD)
    expect(parsed.businessObject).toBeNull()
    expect(parsed.verdict).toBeNull()
    expect(parsed.consequence).toBeNull()
    expect(parsed.confidence).toBeNull()
    expect(parsed.estimatedMinutes).toBeNull()
    expect(parsed.rankingAxes).toEqual([])
    // Une carte qui arrive sans état de traitement est SUGGÉRÉE : c'est ce
    // qu'elle est, et l'inventer « exécutée » serait la seule valeur fausse.
    expect(parsed.processingState).toBe('suggested')
    // #2095.19 / #2095.34 / #2993 — deux champs de plus, même règle additive :
    // absents de la charge utile, ils rendent l'absence, jamais une valeur devinée.
    expect(parsed.owner).toBeNull()
    expect(parsed.permission).toBeNull()
  })

  it('les champs neufs sont déclarés à la parité démo — sinon personne ne les remplit', () => {
    // La garde de couverture démo raisonne par TABLE : ces champs n'en ajoutent
    // aucune, donc elle ne les verrait jamais passer. `BRIEFING_CARD_FIELDS`
    // est ce qui la rend capable de les voir (craft rule n°9).
    for (const field of [
      'businessObject',
      'verdict',
      'consequence',
      'confidence',
      'estimatedMinutes',
      'rankingAxes',
      'processingState',
      'owner',
      'permission',
    ]) {
      expect(BRIEFING_CARD_FIELDS, field).toContain(field)
    }
  })
})

describe('l’objet métier d’une carte (#2099.4, #2801)', () => {
  it('ne porte que les cinq formes qui ont VRAIMENT un dossier', () => {
    // #2801 — le PROJET rejoint la liste : sa fiche existe désormais,
    // `/projects/$id` (fondation de l'épopée #2801). Avant ce lot, seuls
    // account/contact/mission/talent avaient un dossier ; `project` était
    // refusé plus bas, exactement par ce test.
    for (const kind of ['account', 'contact', 'mission', 'talent', 'project']) {
      const parsed = briefingActionSchema.parse({
        ...SERVED_CARD,
        businessObject: { kind, id: 'x-1', name: 'Damaris Industries' },
      })
      expect(parsed.businessObject?.kind, kind).toBe(kind)
    }
  })

  it('sait dire NON : une forme sans dossier ne se mentionne pas — ce serait un lien mort', () => {
    // `signal` n'a toujours aucun dossier (`object-forms.ts`, `noDossierReason`
    // muet) : c'est l'exemple qui remplace `project`, promu ci-dessus.
    const rejected = briefingActionSchema.safeParse({
      ...SERVED_CARD,
      businessObject: { kind: 'signal', id: 'p-1', name: 'Portail' },
    })
    expect(rejected.success).toBe(false)
  })
})

describe('un score n’est jamais nu, et jamais chiffré (#2095.61 à #2095.67)', () => {
  // #2397.2 — DÉPENDANCE et OPPORTUNITÉ s'ajoutent EN FIN (GA-08) : deux des
  // dix axes du corps de l'issue #2397 qu'aucune des sept explications
  // existantes ne nommait encore. Version minimale : nommés, jamais évalués
  // pour l'instant (aucune catégorie de `briefing-actions.ts` ne sait
  // aujourd'hui dater une dépendance ou VÉRIFIER un mouvement favorable —
  // `account` ne le fait qu'en confiance `inferred`, jamais `verified` — donc
  // rien ne les marque `evaluated` : c'est le calcul du rang à dix axes,
  // hors de ce lot, qui les fera passer d'axe nommé à axe pesé.
  it('les NEUF axes du classement sont NOMMÉS', () => {
    expect(BRIEFING_RANKING_AXES).toHaveLength(9)
    expect([...BRIEFING_RANKING_AXES]).toEqual([
      'consequence',
      'urgency',
      'actionableNow',
      'roleFit',
      'dataConfidence',
      'effort',
      'commitment',
      'dependency',
      'opportunity',
    ])
  })

  it('un axe NON ÉVALUABLE reste nommé et SORT du dénominateur (GA-18 / GA-19)', () => {
    const verdict = briefingRankingAxesVerdict([
      { axis: 'consequence', evaluated: true },
      { axis: 'urgency', evaluated: true },
      { axis: 'dataConfidence', evaluated: false },
    ])
    expect(verdict.evaluated).toEqual(['consequence', 'urgency'])
    // Nommé, pas effacé : « on n'affiche pas ce qu'on n'a pas » vaut pour les
    // LISTES ; sous un score, l'axe non évaluable reste dit.
    expect(verdict.unevaluable).toEqual(['dataConfidence'])
    expect(verdict.denominator).toBe(2)
  })

  it('aucun axe évaluable ne rend PAS « 0 » — il rend « non mesuré »', () => {
    const verdict = briefingRankingAxesVerdict([
      { axis: 'effort', evaluated: false },
      { axis: 'commitment', evaluated: false },
    ])
    expect(verdict.denominator).toBeNull()
    expect(verdict.unevaluable).toEqual(['effort', 'commitment'])
  })

  it('aucun axe n’est compté deux fois — un doublon servi ne gonfle pas le dénominateur', () => {
    const verdict = briefingRankingAxesVerdict([
      { axis: 'urgency', evaluated: true },
      { axis: 'urgency', evaluated: true },
    ])
    expect(verdict.denominator).toBe(1)
  })

  it('sait dire NON : rien dans le contrat ne porte un poids ni une probabilité', () => {
    const written = JSON.stringify(Object.keys(briefingActionSchema.shape))
    expect(written).not.toMatch(/score|weight|poids|probab|chance|forecast|likelihood/i)
  })
})

describe('les facettes que la carte peut dire (#2099.6 à #2099.12)', () => {
  it('la confiance est un NIVEAU nommé, jamais un pourcentage', () => {
    expect([...BRIEFING_CONFIDENCE_LEVELS]).toEqual(['verified', 'reported', 'inferred'])
    expect(briefingActionSchema.safeParse({ ...SERVED_CARD, confidence: 'verified' }).success).toBe(true)
    expect(briefingActionSchema.safeParse({ ...SERVED_CARD, confidence: 0.82 }).success).toBe(false)
  })

  it('un temps estimé de ZÉRO minute est refusé — c’est « non mesuré », donc `null`', () => {
    expect(briefingActionSchema.safeParse({ ...SERVED_CARD, estimatedMinutes: 0 }).success).toBe(false)
    expect(briefingActionSchema.safeParse({ ...SERVED_CARD, estimatedMinutes: 15 }).success).toBe(true)
    expect(briefingActionSchema.parse({ ...SERVED_CARD, estimatedMinutes: null }).estimatedMinutes).toBeNull()
  })

  it('le verdict et la conséquence sont des CLÉS de locale, jamais des phrases', () => {
    const parsed = briefingActionSchema.parse({
      ...SERVED_CARD,
      verdict: { labelKey: 'briefing.verdict.replyWaiting' },
      consequence: { labelKey: 'briefing.consequence.dealSlips', labelVars: { days: 9 } },
    })
    expect(parsed.verdict?.labelKey).toBe('briefing.verdict.replyWaiting')
    expect(parsed.consequence?.labelVars).toEqual({ days: 9 })
    expect(briefingActionSchema.safeParse({ ...SERVED_CARD, verdict: { labelKey: '' } }).success).toBe(false)
  })
})

describe('les neuf états de traitement (#2099.33 à #2099.41)', () => {
  it('sont exactement ceux du retour, et « ouverte » n’est pas « terminée »', () => {
    expect([...BRIEFING_CANDIDATE_PROCESSING_STATES]).toEqual([
      'suggested',
      'seen',
      'prepared',
      'awaiting_validation',
      'scheduled',
      'done',
      'postponed',
      'dismissed',
      'obsolete',
    ])
    // #2099.42 : consulter n'est pas traiter. Les deux états existent, et ce
    // test dit qu'ils ne se confondent pas.
    expect(BRIEFING_CANDIDATE_PROCESSING_STATES.indexOf('seen')).not.toBe(
      BRIEFING_CANDIDATE_PROCESSING_STATES.indexOf('done'),
    )
  })

  it('sait dire NON : un état inventé est refusé', () => {
    expect(briefingActionSchema.safeParse({ ...SERVED_CARD, processingState: 'presque_fini' }).success).toBe(false)
  })
})

// L1 (31/10/2026) — #2095.34 : la permission DÉRIVÉE du catalogue peut nommer
// plusieurs droits (« l'UNE suffit »), jamais une liste vide.
describe('#2095.34 — la permission requise par la carte', () => {
  it('accepte un droit seul ou plusieurs droits dont l’un suffit', () => {
    expect(briefingActionSchema.parse({ ...SERVED_CARD, permission: 'finance:read' }).permission).toBe('finance:read')
    expect(
      briefingActionSchema.parse({ ...SERVED_CARD, permission: ['finance:read', 'finance:read:own'] }).permission,
    ).toEqual(['finance:read', 'finance:read:own'])
  })

  it('sait dire NON : une liste vide n’est pas « aucun droit requis »', () => {
    expect(briefingActionSchema.safeParse({ ...SERVED_CARD, permission: [] }).success).toBe(false)
  })
})

// #2391.54 / #2391.55 — ce qu'un bloc du plan de journée a déclaré, relu.
describe('#2391.54 / #2391.55 — le résultat et la durée réelle d’un bloc', () => {
  const READ = {
    eventId: 'evt-1',
    outcome: 'realized',
    note: null,
    actualMinutes: null,
    updatedAt: '2026-10-31T10:00:00Z',
  }

  it('un clic seul se relit sans note ni durée', () => {
    expect(focusPlanBlockOutcomeReadSchema.parse(READ)).toMatchObject({ note: null, actualMinutes: null })
  })

  it('sait dire NON : « 0 minute » n’est jamais « non déclaré »', () => {
    expect(focusPlanBlockOutcomeReadSchema.safeParse({ ...READ, actualMinutes: 0 }).success).toBe(false)
  })
})
