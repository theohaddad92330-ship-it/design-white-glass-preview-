import { describe, expect, it } from 'vitest'
import { DEFAULT_BRAND_ACCENT, DEFAULT_BRAND_NAME, DEFAULT_COPILOT_NAME, resolveBrand } from './brand.js'

/**
 * La résolution de marque — le seul endroit qui sait comment s'appelle le
 * produit quand personne ne l'a renommé.
 *
 * Ce qui est vérifié ici tient en une phrase : **l'appelant ne voit jamais de
 * `null` sur un champ qui a un défaut.** C'est la condition pour que les 893
 * occurrences du nom disparaissent sans laisser derrière elles 893 `?? 'Bellum'`.
 */
describe('resolveBrand', () => {
  it('rend la marque du produit quand rien n’est posé', () => {
    for (const rien of [null, undefined, {}]) {
      expect(resolveBrand(rien)).toEqual({
        name: DEFAULT_BRAND_NAME,
        copilotName: DEFAULT_COPILOT_NAME,
        logoUrl: null,
        accent: DEFAULT_BRAND_ACCENT,
        isCustom: false,
      })
    }
  })

  it('traite une chaîne VIDE comme une absence, pas comme un nom', () => {
    // Un formulaire vidé envoie `''`, pas `null`. Sans ce nettoyage, l'écran
    // afficherait un titre vide — et personne ne saurait de quel produit il
    // s'agit.
    const brand = resolveBrand({ brandName: '   ', copilotName: '', brandLogoUrl: '  ' })
    expect(brand.name).toBe(DEFAULT_BRAND_NAME)
    expect(brand.copilotName).toBe(DEFAULT_COPILOT_NAME)
    expect(brand.isCustom).toBe(false)
  })

  it('normalise l’accent en minuscules', () => {
    // La contrainte SQL n'accepte que des minuscules ; une valeur arrivée
    // d'ailleurs (un import, une API) ne doit pas ressortir en majuscules et
    // faire échouer une comparaison plus loin.
    expect(resolveBrand({ brandAccent: '#AB12CD' }).accent).toBe('#ab12cd')
  })

  it('devient CUSTOM dès qu’UN seul champ est posé, même le logo', () => {
    // Un client qui ne change que son logo est déjà chez lui : l'écran ne doit
    // pas lui servir notre changelog ni notre « propulsé par ».
    expect(resolveBrand({ brandLogoUrl: 'https://acme.fr/logo.svg' }).isCustom).toBe(true)
    expect(resolveBrand({ copilotName: 'Iris' }).isCustom).toBe(true)
    expect(resolveBrand({ brandAccent: '#112233' }).isCustom).toBe(true)
  })

  it('garde le nom du copilote posé par l’espace', () => {
    // La décision du 01/09 : le NOM devient une donnée. Ce qui ne bouge pas —
    // une seule porte, la mention IA obligatoire — ne vit pas ici.
    expect(resolveBrand({ copilotName: 'Iris' }).copilotName).toBe('Iris')
  })
})
