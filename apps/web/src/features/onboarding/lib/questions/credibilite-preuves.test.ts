import { describe, expect, it } from 'vitest'
import { isSatisfied } from '../validation'
import { credibilitePreuvesStep } from './credibilite-preuves'

/**
 * #2540 — Ludovic (call bêta 17/09) a créé sa société il y a quelques
 * semaines : zéro client, zéro mission, aucun témoignage. Les deux questions
 * de preuve (résultats chiffrés, témoignages) exigeaient au moins une puce
 * pour laisser passer « Continuer » — un blocage définitif pour une activité
 * en création, le même défaut de fond que #2027 (« ne pas forcer une fausse
 * précision »).
 *
 * `optional: true` (#2059.7) est le mécanisme EXISTANT qui laisse une
 * question avancer vide, déjà branché au bouton Continuer par
 * `OnboardingWizard.tsx` (`isSatisfied`) — la garde ci-dessous vérifie qu'il
 * est bien posé sur les deux questions de preuve, sans en inventer un second.
 * L'absence de puce reste une liste VIDE, jamais une valeur inventée
 * (`case_study_results: []` est l'état honnête d'une ESN sans référence —
 * pas un « 0 » qui prétendrait avoir mesuré quelque chose).
 */
describe('credibilite-preuves — les preuves ne bloquent plus une activité en création (#2540)', () => {
  const byKey = (key: string) => credibilitePreuvesStep.questions.find(q => q.key === key)

  it('case_study_results est facultative', () => {
    const question = byKey('case_study_results')
    expect(question?.optional).toBe(true)
  })

  it('client_testimonials est facultative', () => {
    const question = byKey('client_testimonials')
    expect(question?.optional).toBe(true)
  })

  it.each(['case_study_results', 'client_testimonials'])('%s vide laisse « Continuer » actif', key => {
    const question = byKey(key)
    if (!question) throw new Error(`question ${key} introuvable`)
    expect(isSatisfied(question, [])).toBe(true)
  })
})

/**
 * #2039.6 (épopée #2880, tranché sans Louis) — un fondement du groupe
 * #2039.1-.6 qui ne demande pas de donnée relationnelle : un ENSEMBLE
 * d'expertises (lesquelles n'ont encore aucune preuve), jamais un item par
 * expertise avec ses propres métadonnées. #2039.2 (ci-dessous) réutilise le
 * même mécanisme pour un autre fondement — voir sa propre suite.
 */
describe('credibilite-preuves — expertises sans preuve concrète (#2039.6)', () => {
  const byKey = (key: string) => credibilitePreuvesStep.questions.find(q => q.key === key)

  it('lit ses choix dans `expertise_areas`, jamais un catalogue distinct', () => {
    const question = byKey('expertise_no_concrete_proof')
    expect(question?.kind).toBe('multi')
    expect(question && 'dynamicChoicesFromAnswerKey' in question ? question.dynamicChoicesFromAnswerKey : null).toBe(
      'expertise_areas',
    )
  })

  it('ne se pose pas tant qu’aucune expertise n’est déclarée — rien à cocher, rien à demander', () => {
    const question = byKey('expertise_no_concrete_proof')
    expect(question?.when?.({})).toBe(false)
    expect(question?.when?.({ expertise_areas: [] })).toBe(false)
  })

  it('se pose dès qu’au moins une expertise est déclarée', () => {
    const question = byKey('expertise_no_concrete_proof')
    expect(question?.when?.({ expertise_areas: ['Cloud & Infrastructure (AWS, Azure, GCP, Hosting)'] })).toBe(true)
  })

  it('est facultative — ne rien cocher est un état honnête', () => {
    const question = byKey('expertise_no_concrete_proof')
    expect(question?.optional).toBe(true)
    if (!question) throw new Error('question introuvable')
    expect(isSatisfied(question, [])).toBe(true)
  })
})

/**
 * #2039.2 (épopée #2880, tranché sans Louis) — RELECTURE du « hors lot »
 * écrit par les lots précédents pour #2039.2-.5 : la question source pose
 * « pour chaque expertise, repose-t-elle sur une référence client ? », qui
 * est la MÊME question à une dimension que #2039.6 (« … sur une simple
 * volonté de développement ? »), pas le croisement relationnel (item par
 * expertise + métadonnées) que #2039.9/.12/.13 demandent. Même mécanisme,
 * même suite de tests que #2039.6 ci-dessus.
 */
describe('credibilite-preuves — expertises avec référence client (#2039.2)', () => {
  const byKey = (key: string) => credibilitePreuvesStep.questions.find(q => q.key === key)

  it('lit ses choix dans `expertise_areas`, jamais un catalogue distinct', () => {
    const question = byKey('expertise_client_reference')
    expect(question?.kind).toBe('multi')
    expect(question && 'dynamicChoicesFromAnswerKey' in question ? question.dynamicChoicesFromAnswerKey : null).toBe(
      'expertise_areas',
    )
  })

  it('ne se pose pas tant qu’aucune expertise n’est déclarée — rien à cocher, rien à demander', () => {
    const question = byKey('expertise_client_reference')
    expect(question?.when?.({})).toBe(false)
    expect(question?.when?.({ expertise_areas: [] })).toBe(false)
  })

  it('se pose dès qu’au moins une expertise est déclarée', () => {
    const question = byKey('expertise_client_reference')
    expect(question?.when?.({ expertise_areas: ['Cloud & Infrastructure (AWS, Azure, GCP, Hosting)'] })).toBe(true)
  })

  it('est facultative — ne rien cocher est un état honnête', () => {
    const question = byKey('expertise_client_reference')
    expect(question?.optional).toBe(true)
    if (!question) throw new Error('question introuvable')
    expect(isSatisfied(question, [])).toBe(true)
  })
})

/**
 * #2039.3/.4/.5 (épopée #2880, vague G lot g10, tranché sans Louis) — les
 * trois derniers fondements à une dimension du groupe #2039.1-.6 (expérience
 * personnelle, partenaire, vivier disponible) : même mécanisme, même suite de
 * tests que #2039.2/.6 ci-dessus, factorisée sur les trois clés à la fois.
 */
describe.each(['expertise_personal_experience', 'expertise_partner', 'expertise_talent_pool'])(
  'credibilite-preuves — %s (#2039.3/.4/.5)',
  key => {
    const byKey = () => credibilitePreuvesStep.questions.find(q => q.key === key)

    it('lit ses choix dans `expertise_areas`, jamais un catalogue distinct', () => {
      const question = byKey()
      expect(question?.kind).toBe('multi')
      expect(question && 'dynamicChoicesFromAnswerKey' in question ? question.dynamicChoicesFromAnswerKey : null).toBe(
        'expertise_areas',
      )
    })

    it('ne se pose pas tant qu’aucune expertise n’est déclarée — rien à cocher, rien à demander', () => {
      const question = byKey()
      expect(question?.when?.({})).toBe(false)
      expect(question?.when?.({ expertise_areas: [] })).toBe(false)
    })

    it('se pose dès qu’au moins une expertise est déclarée', () => {
      const question = byKey()
      expect(question?.when?.({ expertise_areas: ['Cloud & Infrastructure (AWS, Azure, GCP, Hosting)'] })).toBe(true)
    })

    it('est facultative — ne rien cocher est un état honnête', () => {
      const question = byKey()
      expect(question?.optional).toBe(true)
      if (!question) throw new Error('question introuvable')
      expect(isSatisfied(question, [])).toBe(true)
    })
  },
)
