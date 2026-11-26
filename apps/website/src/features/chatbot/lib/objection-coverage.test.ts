import { describe, expect, it } from 'vitest'
import { coveredObjectionThemes } from './objection-library'
import {
  detectObjectionTheme,
  OBJECTION_THEMES,
  uncoveredObjectionTheme,
  type ObjectionTheme,
} from './objection-coverage'

/**
 * Le classeur qui décide si une phrase du visiteur mérite de compter comme un
 * angle mort de la bibliothèque (§9, « top 20 des objections non couvertes »).
 *
 * La règle qui porte le fichier : la PHRASE ne doit jamais réapparaître dans une
 * assertion — seul le thème compte, parce que seul le thème est censé voyager
 * hors du tour de conversation.
 */

describe('le vocabulaire fermé', () => {
  it("n'est pas vide — une garde qui ne lit rien ne garde rien", () => {
    expect(OBJECTION_THEMES.length).toBeGreaterThanOrEqual(12)
    expect(OBJECTION_THEMES).toContain('other')
  })
})

describe('la détection de thème', () => {
  it('reconnaît chaque famille sur une phrase représentative', () => {
    const cases: Array<[string, ObjectionTheme]> = [
      ["c'est trop cher pour nous", 'price'],
      ['on a déjà un CRM', 'competitor'],
      ["l'IA ça hallucine non ?", 'trust_ai'],
      ['mes données vont où exactement ?', 'data_privacy'],
      ['on est une toute petite structure', 'fit_size'],
      ['ça se connecte à mon CRM ?', 'integration'],
      ['mes commerciaux ne rempliront jamais un outil de plus', 'adoption'],
      ["je n'ai pas le temps là", 'timing'],
      ['vous avez combien de clients ?', 'proof'],
      ["c'est conforme RGPD ?", 'legal'],
      ['vos données sont hébergées où, en France ?', 'sovereignty'],
      ['je veux parler à un humain', 'support'],
    ]
    for (const [message, theme] of cases) {
      expect(detectObjectionTheme(message), message).toBe(theme)
    }
  })

  it('ignore les accents — un visiteur sur trois écrit sans eux', () => {
    expect(detectObjectionTheme('vous etes conformes RGPD ?')).toBe('legal')
    expect(detectObjectionTheme('nos donnees restent en europe ?')).toBe('sovereignty')
    expect(detectObjectionTheme('il fait beau aujourd hui')).toBeNull()
  })

  it("rend `other` sur un doute générique qu'aucun thème ne nomme", () => {
    expect(detectObjectionTheme('je ne suis pas convaincu')).toBe('other')
    expect(detectObjectionTheme('ça sert à quoi vraiment ?')).toBe('other')
  })

  it("rend `null` sur une question ordinaire — ce n'est pas une objection", () => {
    expect(detectObjectionTheme("c'est quoi BellumAI ?")).toBeNull()
    expect(detectObjectionTheme('je veux voir la démo')).toBeNull()
    expect(detectObjectionTheme('')).toBeNull()
    expect(detectObjectionTheme('   ')).toBeNull()
  })

  it("n'est pas STATEFUL — deux appels sur la même phrase rendent le même résultat", () => {
    // Le dépôt s'est déjà fait avoir par un drapeau `g` sur `RegExp.test()`.
    const message = 'vous êtes conformes RGPD ?'
    expect(detectObjectionTheme(message)).toBe(detectObjectionTheme(message))
    expect(detectObjectionTheme(message)).toBe('legal')
  })
})

describe('la couverture — ce qui ne remonte QUE sur un angle mort', () => {
  it('la bibliothèque réelle ne déclare que des thèmes du vocabulaire fermé', () => {
    const covered = coveredObjectionThemes()
    for (const theme of covered) {
      expect(OBJECTION_THEMES, theme).toContain(theme)
    }
  })

  it(
    'constat, pas un bug : « sovereignty » est un angle mort RÉEL de la bibliothèque figée du ' +
      "§4.8 — detectObjectionTheme sait le nommer, aucune entrée ne le traite. C'est exactement " +
      'ce que ce module doit voir passer au tableau des propositions, sans jamais écrire seul.',
    () => {
      const covered = coveredObjectionThemes()
      expect(covered.has('sovereignty')).toBe(false)
      expect(uncoveredObjectionTheme('vos données sont hébergées où ?', covered)).toBe('sovereignty')
    },
  )

  it("une objection déjà couverte ne remonte rien — la mesure ne regarde que l'angle mort", () => {
    const covered = coveredObjectionThemes()
    expect(uncoveredObjectionTheme("c'est trop cher", covered)).toBeNull()
  })

  it('un thème détecté mais absent de `covered` remonte, lui', () => {
    const covered = new Set<ObjectionTheme>(['price'])
    expect(uncoveredObjectionTheme("c'est conforme RGPD ?", covered)).toBe('legal')
  })

  it("une phrase qui n'est pas une objection ne remonte jamais, même avec une couverture vide", () => {
    expect(uncoveredObjectionTheme("c'est quoi BellumAI ?", new Set())).toBeNull()
  })
})
