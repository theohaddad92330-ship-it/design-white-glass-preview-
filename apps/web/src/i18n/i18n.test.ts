import { i18n } from '@/i18n'
import { LANGUAGE_STORAGE_KEY } from '@/i18n/config'

describe('i18n core', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  afterEach(async () => {
    await i18n.changeLanguage('fr')
    window.localStorage.removeItem(LANGUAGE_STORAGE_KEY)
  })

  it('defaults to French', () => {
    expect(i18n.resolvedLanguage).toBe('fr')
    expect(i18n.t('actions.save', { ns: 'common' })).toBe('Enregistrer')
    expect(i18n.t('items.dashboard', { ns: 'nav' })).toBe('Tableau de bord')
    expect(i18n.t('login.title', { ns: 'auth' })).toBe('Se connecter')
  })

  it('renders English after changeLanguage', async () => {
    await i18n.changeLanguage('en')
    expect(i18n.t('actions.save', { ns: 'common' })).toBe('Save')
    expect(i18n.t('items.dashboard', { ns: 'nav' })).toBe('Dashboard')
    expect(i18n.t('login.title', { ns: 'auth' })).toBe('Sign in')
  })

  it('falls back to French when an English key is missing', async () => {
    i18n.addResource('fr', 'common', 'test.onlyInFrench', 'Valeur uniquement en français')
    await i18n.changeLanguage('en')
    expect(i18n.t('test.onlyInFrench', { ns: 'common' })).toBe('Valeur uniquement en français')
  })

  it('interpolates variables', () => {
    expect(i18n.t('emailCode.codeSubtitle', { ns: 'auth', email: 'jean@esn.fr' })).toBe(
      'Saisis le code à 6 chiffres envoyé à jean@esn.fr.',
    )
  })

  it('persists the language choice to localStorage', async () => {
    await i18n.changeLanguage('en')
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en')
  })
})
