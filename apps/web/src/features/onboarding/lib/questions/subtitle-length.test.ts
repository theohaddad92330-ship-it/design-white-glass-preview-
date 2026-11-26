import { describe, expect, it } from 'vitest'
import en from '@/i18n/locales/en/onboarding.json'
import fr from '@/i18n/locales/fr/onboarding.json'
import { TEMPS1_STAGES, type Question } from './index'

/**
 * #2021.16 — pas de sous-titre trop long : ≤ 2 lignes à 70 caractères
 * (140 caractères), dans les DEUX langues. Mesuré 18/09/2026 : `subtitle` est
 * une clé i18n (`Question.subtitle`, jamais le texte lui-même), donc la
 * longueur n'était gardée nulle part — `offerDomains.subtitle` en FR
 * dépassait de 23 caractères (163), invisible tant que personne ne comptait.
 *
 * Sait dire NON : repousser cette borne, ou laisser une clé résolue absente
 * d'une des deux langues, fait rougir ce fichier.
 */
const SUBTITLE_MAX_CHARS = 140

const ALL_QUESTIONS: Question[] = TEMPS1_STAGES.flatMap(stage => stage.steps.flatMap(step => step.questions))
const QUESTIONS_WITH_SUBTITLE = ALL_QUESTIONS.filter((q): q is Question & { subtitle: string } => Boolean(q.subtitle))

function resolve(bundle: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], bundle)
}

describe('#2021.16 — sous-titre de question : ≤ 2 lignes à 70 caractères', () => {
  it('le corpus de la garde n’est pas vide', () => {
    expect(QUESTIONS_WITH_SUBTITLE.length).toBeGreaterThanOrEqual(4)
  })

  it('chaque clé de sous-titre résout un texte NON VIDE en FR et en EN', () => {
    const manquants: string[] = []
    for (const q of QUESTIONS_WITH_SUBTITLE) {
      if (typeof resolve(fr, q.subtitle) !== 'string') manquants.push(`fr:${q.key}:${q.subtitle}`)
      if (typeof resolve(en, q.subtitle) !== 'string') manquants.push(`en:${q.key}:${q.subtitle}`)
    }
    expect(manquants, `clés introuvables : ${manquants.join(', ')}`).toEqual([])
  })

  it(`aucun sous-titre résolu ne dépasse ${SUBTITLE_MAX_CHARS} caractères, ni en FR ni en EN`, () => {
    const trop_longs: string[] = []
    for (const q of QUESTIONS_WITH_SUBTITLE) {
      const frText = resolve(fr, q.subtitle)
      const enText = resolve(en, q.subtitle)
      if (typeof frText === 'string' && frText.length > SUBTITLE_MAX_CHARS) {
        trop_longs.push(`fr:${q.key} (${frText.length} car.)`)
      }
      if (typeof enText === 'string' && enText.length > SUBTITLE_MAX_CHARS) {
        trop_longs.push(`en:${q.key} (${enText.length} car.)`)
      }
    }
    expect(trop_longs, `sous-titres trop longs : ${trop_longs.join(', ')}`).toEqual([])
  })
})
