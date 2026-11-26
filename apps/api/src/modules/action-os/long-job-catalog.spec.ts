import {
  contactVerificationLine,
  LONG_JOB_KEYS,
  LONG_JOB_SPECS,
  longJobProgressSentence,
  longJobTrackedFromChat,
  type LongJobKey,
} from './long-job-catalog'
import { ANALYSIS_TRACKING_DEFINITION_KEY } from './copilot-card-catalog'

/**
 * #1952.1 à #1952.7 — LES SEPT TRAVAUX LONGS, ET CE QU'ON EN SAIT.
 *
 * L'issue nomme sept travaux qui prennent plusieurs minutes. Un seul est
 * réellement suivi depuis la conversation aujourd'hui ; les six autres ont
 * chacun une RAISON écrite, sur le motif de `demo-coverage.ts` — « soit couvert,
 * soit vide à dessein avec sa raison ». Ce que cette garde refuse : qu'un
 * travail long entre au registre sans dire s'il est suivi, et qu'un avancement
 * non mesuré s'affiche quand même (« 0 sur 4 » à la place de « en cours »).
 */
describe('le registre des sept travaux longs de #1952', () => {
  it('nomme les SEPT travaux de l’issue, et rien d’autre', () => {
    expect([...LONG_JOB_KEYS].sort()).toEqual(
      [
        'account_analysis',
        'bulk_contact_enrichment',
        'bulk_matching',
        'cv_generation',
        'data_export',
        'document_import',
        'multi_source_search',
      ].sort(),
    )
    // La garde LIT quelque chose : le registre n'est pas vide.
    expect(Object.keys(LONG_JOB_SPECS)).toHaveLength(LONG_JOB_KEYS.length)
  })

  it('chaque travail dit s’il est suivi depuis la conversation, ou POURQUOI il ne l’est pas', () => {
    for (const key of LONG_JOB_KEYS) {
      const spec = LONG_JOB_SPECS[key]
      expect(spec.name.fr.trim().length).toBeGreaterThan(0)
      expect(spec.name.en.trim().length).toBeGreaterThan(0)
      // #1952.34 — la page PROPRIÉTAIRE du résultat, jamais devinée à l'écran.
      expect(spec.resultScreen.startsWith('/')).toBe(true)
      if (spec.trackingDefinitionKey === null) {
        // Une raison ÉCRITE, pas un silence : c'est elle qui évite de recoder
        // demain ce qu'on a mesuré aujourd'hui.
        expect(spec.notTrackedReason?.trim().length ?? 0).toBeGreaterThan(20)
      } else {
        expect(spec.notTrackedReason).toBeNull()
      }
    }
  })

  it('l’analyse de compte est le SEUL travail suivi depuis la conversation, sous la clé déjà persistée', () => {
    expect(longJobTrackedFromChat()).toEqual(['account_analysis'])
    expect(LONG_JOB_SPECS.account_analysis.trackingDefinitionKey).toBe(ANALYSIS_TRACKING_DEFINITION_KEY)
    expect(LONG_JOB_SPECS.account_analysis.publishesMeasuredProgress).toBe(true)
  })

  it('n’attrape pas ce qu’elle ne vise pas : un travail NON suivi n’a pas à publier d’avancement', () => {
    const untracked = LONG_JOB_KEYS.filter(key => LONG_JOB_SPECS[key].trackingDefinitionKey === null)
    expect(untracked.length).toBe(6)
    for (const key of untracked) expect(LONG_JOB_SPECS[key].publishesMeasuredProgress).toBe(false)
  })
})

describe('la phrase d’avancement — MESURÉE, ou rien', () => {
  const analysis = LONG_JOB_SPECS.account_analysis

  it('dit les étapes réellement franchies, au singulier comme au pluriel', () => {
    expect(longJobProgressSentence(analysis, 2, 4)).toBe('Analyse en cours — 2 étapes sur 4 terminées.')
    expect(longJobProgressSentence(analysis, 1, 4)).toBe('Analyse en cours — 1 étape sur 4 terminée.')
    expect(longJobProgressSentence(analysis, 4, 4)).toBe('Analyse en cours — 4 étapes sur 4 terminées.')
  })

  it('REFUSE « 0 sur 4 » : aucune étape franchie ne prouve pas que le travail est à zéro, seulement qu’on n’a rien lu', () => {
    expect(longJobProgressSentence(analysis, 0, 4)).toBeNull()
  })

  it('refuse un avancement non mesuré : position inconnue, total inconnu, total absurde', () => {
    expect(longJobProgressSentence(analysis, null, 4)).toBeNull()
    expect(longJobProgressSentence(analysis, 2, null)).toBeNull()
    expect(longJobProgressSentence(analysis, 2, 0)).toBeNull()
    // Plus d'étapes franchies que le travail n'en compte : la lecture est fausse,
    // on ne publie pas une phrase qui se contredit.
    expect(longJobProgressSentence(analysis, 5, 4)).toBeNull()
  })

  it('ne parle que des travaux qui publient un avancement mesuré', () => {
    const silent = LONG_JOB_SPECS.document_import
    expect(silent.publishesMeasuredProgress).toBe(false)
    expect(longJobProgressSentence(silent, 2, 4)).toBeNull()
  })
})

describe('le registre se lit par clé, sans reconstruire la table', () => {
  it('chaque clé du registre est une clé du type', () => {
    const keys: LongJobKey[] = [...LONG_JOB_KEYS]
    for (const key of keys) expect(LONG_JOB_SPECS[key]).toBeDefined()
  })
})

/**
 * #1952.32 (#2844) — LA LIGNE « À VÉRIFIER », SUR LE MÊME SIGNAL RÉEL QUE
 * `contacts.email_confidence` (#2120.68), JAMAIS UNE VALEUR DEVINÉE.
 *
 * `high` (vérifié) et `null` (non mesuré) ne posent AUCUNE ligne — un axe non
 * évaluable sort du dénominateur, il ne se lit pas « à vérifier » par défaut
 * (GA-18/19). Pure, pour que le service ET le semis de démonstration
 * partagent la MÊME phrase (GA-26) : un « à vérifier » recopié à deux endroits
 * divergerait le jour où le libellé change.
 */
describe('contactVerificationLine — #1952.32', () => {
  it('nomme un e-mail trouvé mais non confirmé (`medium`)', () => {
    expect(contactVerificationLine('Camille Nguyen', 'medium')).toBe('Camille Nguyen — e-mail trouvé, non confirmé')
  })

  it('nomme un e-mail deviné (`low`)', () => {
    expect(contactVerificationLine('Camille Nguyen', 'low')).toBe('Camille Nguyen — e-mail deviné, à confirmer')
  })

  it('ne pose aucune ligne sur un e-mail vérifié (`high`)', () => {
    expect(contactVerificationLine('Camille Nguyen', 'high')).toBeNull()
  })

  it('ne pose aucune ligne sur une confiance NON MESURÉE (`null`) — jamais devinée', () => {
    expect(contactVerificationLine('Camille Nguyen', null)).toBeNull()
  })
})
