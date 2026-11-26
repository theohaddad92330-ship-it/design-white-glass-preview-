import {
  UNCERTAIN_AVG_LOGPROB_THRESHOLD,
  parseWhisperSegments,
  parseWhisperWords,
  wordsWithUncertainty,
} from './word-confidence'

// #2434.40 / #2434.85 — un mot est INCERTAIN quand le segment qui le couvre
// est jugé peu fiable par Whisper lui-même (`avg_logprob`), jamais un
// pourcentage inventé.

describe('word-confidence — le mot incertain', () => {
  describe('wordsWithUncertainty', () => {
    it('un segment CONFIANT ne marque aucun de ses mots — le test qui dit NON', () => {
      const words = [{ word: 'Bonjour', start: 0, end: 0.4 }]
      const segments = [{ start: 0, end: 1, avg_logprob: -0.1 }]
      expect(wordsWithUncertainty(words, segments)).toEqual([{ text: 'Bonjour', uncertain: false }])
    })

    it('un segment jugé peu fiable par le fournisseur marque ses mots incertains', () => {
      const words = [{ word: 'Belhadi', start: 0, end: 0.4 }]
      const segments = [{ start: 0, end: 1, avg_logprob: UNCERTAIN_AVG_LOGPROB_THRESHOLD - 0.1 }]
      expect(wordsWithUncertainty(words, segments)).toEqual([{ text: 'Belhadi', uncertain: true }])
    })

    it('exactement au seuil : encore confiant (le seuil marque un dessous strict)', () => {
      const words = [{ word: 'Nova', start: 0, end: 0.4 }]
      const segments = [{ start: 0, end: 1, avg_logprob: UNCERTAIN_AVG_LOGPROB_THRESHOLD }]
      expect(wordsWithUncertainty(words, segments)[0]?.uncertain).toBe(false)
    })

    it('un mot hors de tout segment n’est jamais deviné incertain', () => {
      const words = [{ word: 'orphelin', start: 5, end: 5.4 }]
      const segments = [{ start: 0, end: 1, avg_logprob: -10 }]
      expect(wordsWithUncertainty(words, segments)).toEqual([{ text: 'orphelin', uncertain: false }])
    })

    it('chaque mot suit SON segment, pas la moyenne du fil', () => {
      const words = [
        { word: 'clair', start: 0, end: 0.4 },
        { word: 'flou', start: 1, end: 1.4 },
      ]
      const segments = [
        { start: 0, end: 0.5, avg_logprob: -0.1 },
        { start: 0.5, end: 2, avg_logprob: -0.9 },
      ]
      expect(wordsWithUncertainty(words, segments)).toEqual([
        { text: 'clair', uncertain: false },
        { text: 'flou', uncertain: true },
      ])
    })
  })

  describe('parseWhisperWords', () => {
    it('rend [] sur une valeur qui n’est pas un tableau — jamais une erreur', () => {
      expect(parseWhisperWords(undefined)).toEqual([])
      expect(parseWhisperWords({ oops: true })).toEqual([])
    })

    it('ignore les entrées illisibles et les mots vides, sans deviner de valeur', () => {
      expect(parseWhisperWords([{ word: 'Bonjour', start: 0, end: 0.3 }, 'pas-un-objet', { word: '  ' }])).toEqual([
        { word: 'Bonjour', start: 0, end: 0.3 },
      ])
    })
  })

  describe('parseWhisperSegments', () => {
    it('rend [] sur une valeur qui n’est pas un tableau', () => {
      expect(parseWhisperSegments(null)).toEqual([])
    })

    it('des champs manquants ne sont jamais devinés — 0, pas une extrapolation', () => {
      expect(parseWhisperSegments([{ start: 1 }])).toEqual([{ start: 1, end: 0, avg_logprob: 0 }])
    })
  })
})
