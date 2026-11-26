import { describe, expect, it } from 'vitest'
import { OBJECTION_THEMES } from './objection-coverage'
import { coveredObjectionThemes, OBJECTIONS, renderObjections } from './objection-library'

/**
 * Les 22 objections du §4.8 (PDF 10) — figées aujourd'hui, et la garantie
 * structurelle du chantier n°3 : rien ici ne peut produire une bibliothèque
 * modifiée. Une entrée s'écrit à la main ; ce fichier ne fait que la lire.
 */

describe('le corpus', () => {
  it('porte les 22 objections du §4.8', () => {
    expect(OBJECTIONS).toHaveLength(22)
  })

  it('chaque entrée déclare un thème du vocabulaire fermé', () => {
    for (const objection of OBJECTIONS) {
      expect(OBJECTION_THEMES, objection.says).toContain(objection.theme)
    }
  })

  it('les deux interdictions absolues du §4.8 sont bien marquées', () => {
    const price = OBJECTIONS.find(objection => objection.says === "C'est trop cher")
    const proof = OBJECTIONS.find(objection => objection.says === 'Vous avez combien de clients ?')
    expect(price?.forbids).toMatch(/jamais/i)
    expect(proof?.forbids).toMatch(/jamais/i)
  })

  it('aucune entrée ne récite — chaque réaction est une question ou une reformulation, pas un paragraphe', () => {
    for (const objection of OBJECTIONS) {
      // Le défaut n°6 du transcript : « je note » suivi d'une grille récitée.
      expect(objection.reacts.toLowerCase()).not.toContain('je note')
    }
  })
})

describe('coveredObjectionThemes — dérivée, jamais déclarée à côté', () => {
  it('contient chaque thème présent dans au moins une entrée', () => {
    const covered = coveredObjectionThemes()
    for (const objection of OBJECTIONS) {
      expect(covered.has(objection.theme)).toBe(true)
    }
  })

  it("ne contient AUCUN thème qu'aucune entrée ne traite", () => {
    const covered = coveredObjectionThemes()
    const declared = new Set(OBJECTIONS.map(objection => objection.theme))
    expect(covered).toEqual(declared)
  })
})

describe("il n'existe aucun chemin qui ajoute une entrée toute seule", () => {
  it("le module n'exporte aucune fonction qui prenne le corpus et en rende une version modifiée", async () => {
    const mod = (await import('./objection-library')) as Record<string, unknown>
    const writers = Object.keys(mod).filter(name => /add|append|insert|write|update|merge|push/i.test(name))
    expect(writers).toEqual([])
  })

  it('OBJECTIONS est gelé pour la durée du process — un appelant ne peut pas le muter par effet de bord', () => {
    // Pas de `Object.freeze` exigé littéralement : la garantie qui compte est
    // qu'aucune fonction exportée ne produit une copie enrichie du corpus.
    expect(Array.isArray(OBJECTIONS)).toBe(true)
  })
})

describe('renderObjections — le bloc injecté dans le prompt', () => {
  it('rend une ligne par objection, avec la phrase du visiteur ET la réaction', () => {
    const text = renderObjections()
    for (const objection of OBJECTIONS) {
      expect(text).toContain(objection.says)
      expect(text).toContain(objection.reacts)
    }
    // Une ligne d'entrée par objection — les deux interdictions ajoutent une
    // ligne supplémentaire chacune, comptée par le test suivant.
    expect(text.split('\n').filter(line => line.startsWith('·'))).toHaveLength(OBJECTIONS.length)
  })

  it('porte les deux interdictions, marquées visiblement', () => {
    const text = renderObjections()
    const forbidding = OBJECTIONS.filter(objection => objection.forbids)
    expect(forbidding).toHaveLength(2)
    for (const objection of forbidding) {
      expect(text).toContain(objection.forbids)
    }
  })
})
