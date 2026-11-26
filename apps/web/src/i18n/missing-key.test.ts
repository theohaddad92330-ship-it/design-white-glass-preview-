import i18next from 'i18next'
import { i18n } from '@/i18n'

/**
 * #2437.14 — une clé i18n manquante ne doit JAMAIS afficher sa forme technique
 * brute à l'écran (« chat.errors.someKey ») : ça se journalise, et l'écran
 * reste silencieux plutôt que de montrer un artefact de développeur à un client.
 *
 * Témoin : une instance i18next DEFAULT (sans le handler du dépôt) prouve que
 * le comportement par défaut est bien celui qu'on corrige — sinon ce test
 * serait vert pour la mauvaise raison.
 */
describe('i18n — clé manquante ne s’affiche jamais brute (#2437.14)', () => {
  const MISSING_KEY = 'test.definitelyMissingKey404'

  it('témoin — sans notre handler, i18next par défaut renvoie la clé brute', async () => {
    const witness = i18next.createInstance()
    await witness.init({ lng: 'fr', fallbackLng: 'fr', resources: { fr: { common: {} } }, initAsync: false })
    expect(witness.t(MISSING_KEY, { ns: 'common' })).toBe(MISSING_KEY)
  })

  it('journalise la clé manquante en console.warn, jamais ne lève', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => i18n.t(MISSING_KEY, { ns: 'common' })).not.toThrow()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[i18n]'),
      expect.objectContaining({ key: MISSING_KEY }),
    )
    warnSpy.mockRestore()
  })

  it('n’affiche JAMAIS la clé technique brute — chaîne vide à la place', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const value = i18n.t(MISSING_KEY, { ns: 'common' })
    expect(value).toBe('')
    expect(value).not.toContain(MISSING_KEY)
    warnSpy.mockRestore()
  })

  it('garde le defaultValue de l’appelant quand la clé manque', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(i18n.t(MISSING_KEY, { ns: 'common', defaultValue: 'repli' })).toBe('repli')
    warnSpy.mockRestore()
  })
})
