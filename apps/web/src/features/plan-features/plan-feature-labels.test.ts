import { PLAN_FEATURE_KEYS } from '@bellum/contracts'
import { i18n } from '@/i18n'

/**
 * Toute porte de palier porte un nom, dans les DEUX langues.
 *
 * `crm_native` et `ats_native` sont entrés dans `PLAN_FEATURE_KEYS` sans entrer
 * dans les catalogues i18n de l'app. Résultat en production : la carte du
 * palier public imprimait `planFeatures.short.crm_native` tel quel, et les
 * écrans verrouillés faisaient de même. i18next rend la CLÉ quand elle manque —
 * donc rien ne casse, et la clé se lit à l'écran.
 *
 * Les catalogues de l'app ne sont pas un doublon de `PLAN_FEATURE_LABELS`
 * (@bellum/contracts) : ils tutoient (conversion du 04/08), le contrat vouvoie.
 * Deux registres, deux textes — mais la même LISTE de clés, et c'est cette
 * liste-là que cette garde tient.
 */
describe('planFeatures — chaque porte de palier est nommée, FR et EN', () => {
  const SECTIONS = ['names', 'short', 'pitches'] as const
  const LOCALES = ['fr', 'en'] as const

  afterEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('lit un corpus réel — sinon la garde est borgne', () => {
    // Une garde qui itère sur une liste vide passe au vert en ne vérifiant
    // rien. On ancre donc le corpus par le bas ET par ses deux clés connues.
    expect(PLAN_FEATURE_KEYS.length).toBeGreaterThanOrEqual(12)
    expect(PLAN_FEATURE_KEYS).toContain('crm_native')
    expect(PLAN_FEATURE_KEYS).toContain('ats_native')
  })

  it('sait dire NON — une clé absente se reconnaît (chemin brut ou chaîne vide)', () => {
    // La méthode de détection elle-même doit être prouvée : si i18next rendait
    // autre chose pour une entrée manquante, tous les tests ci-dessous
    // passeraient sur du vide. Depuis #2437.14, une clé manquante rend une
    // chaîne VIDE (jamais sa forme technique) — le filtre ci-dessous attrape
    // les deux formes.
    const path = 'planFeatures.short.cette_porte_nexiste_pas'
    const value = i18n.t(path, { ns: 'common' })
    expect(value === path || value.trim() === '').toBe(true)
  })

  for (const locale of LOCALES) {
    for (const section of SECTIONS) {
      it(`${locale} · ${section} — aucune clé ne s'imprime brute`, async () => {
        await i18n.changeLanguage(locale)
        const missing = PLAN_FEATURE_KEYS.filter(key => {
          const path = `planFeatures.${section}.${key}`
          const value = i18n.t(path, { ns: 'common' })
          return value === path || value.trim() === ''
        })
        expect(missing).toEqual([])
      })
    }
  }
})
