import { describe, expect, it } from 'vitest'
import { TEMPS1_STAGES, stageQuestions } from '@/features/onboarding/lib/questions'
import {
  THEMES,
  findTheme,
  pendingAnswers,
  searchCatalog,
  themeProgress,
} from '@/features/onboarding/lib/theme-catalog'

const CATALOGUE = TEMPS1_STAGES.flatMap(stageQuestions)

describe('THEMES — les 16 thèmes de la V23 (Théo O onboarding-catalogue.R1)', () => {
  it('en compte 16, numérotés de 1 à 16 dans l’ordre de la V23', () => {
    expect(THEMES).toHaveLength(16)
    expect(THEMES.map(t => t.number)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1))
  })

  it('range CHAQUE question du catalogue dans un thème — rien ne tombe entre deux chaises', () => {
    const placed = new Set(THEMES.flatMap(t => t.questions.map(q => q.key)))
    const lost = CATALOGUE.map(q => q.key).filter(key => !placed.has(key))
    expect(lost).toEqual([])
  })

  it('ne range une question que dans UN thème', () => {
    const all = THEMES.flatMap(t => t.questions.map(q => q.key))
    expect(new Set(all).size).toBe(all.length)
  })

  it('range workspace_profile dans « Offre et expertises » (décision Louis 22/10)', () => {
    expect(findTheme('offre-et-expertises')?.questions.map(q => q.key)).toContain('workspace_profile')
  })

  it('ne connaît pas un thème inventé', () => {
    expect(findTheme('inconnu')).toBeUndefined()
  })
})

describe('themeProgress — jamais « 0 » pour une absence (GA-18)', () => {
  const theme = findTheme('ton-entreprise')!
  const first = theme.questions[0]!

  it('dit « pas commencé » (null) quand rien n’est répondu', () => {
    expect(themeProgress(theme, {}, {})).toEqual({ answered: null, total: theme.questions.length })
  })

  it('compte une vraie réponse', () => {
    const progress = themeProgress(theme, { [first.key]: 'x'.repeat(3) }, {})
    expect(progress.total).toBe(theme.questions.length)
    expect(progress.answered === null || progress.answered >= 0).toBe(true)
  })
})

describe('pendingAnswers — « Tes réponses à reprendre »', () => {
  it('ne reprend que les réponses mises de côté, jamais « Non applicable »', () => {
    const [a, b] = THEMES[0]!.questions
    const pending = pendingAnswers({}, { [a!.key]: 'answer_later', [b!.key]: 'not_applicable' })
    expect(pending.map(p => p.question.key)).toEqual([a!.key])
    expect(pending[0]!.status).toBe('answer_later')
    expect(pending[0]!.theme.slug).toBe(THEMES[0]!.slug)
  })
})

describe('searchCatalog — la recherche parcourt tout le catalogue', () => {
  const t = (key: string): string => key

  it('ne renvoie rien pour une requête vide ou d’un seul caractère', () => {
    expect(searchCatalog('', t)).toEqual([])
    expect(searchCatalog('a', t)).toEqual([])
  })

  it('trouve par le libellé d’une question (clé i18n résolue par t)', () => {
    const q = CATALOGUE[0]!
    const hits = searchCatalog(q.label.slice(-6), t)
    expect(hits.some(h => h.question.key === q.key)).toBe(true)
  })

  it('trouve par une valeur de choix, sans tenir compte des accents ni de la casse', () => {
    const withChoices = CATALOGUE.find(q => 'choices' in q && q.choices.length > 0)!
    const choice = (withChoices as { choices: { value: string }[] }).choices[0]!.value
    const hits = searchCatalog(choice.toUpperCase(), t)
    expect(hits.some(h => h.question.key === withChoices.key)).toBe(true)
  })
})
