import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LANGUAGE_LEVELS, languageLevelRank } from '@bellum/contracts'
import { languageRank } from './axes'

/**
 * GA-54 — L'ÉCHELLE DES NIVEAUX DE LANGUE VIT À UN SEUL ENDROIT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le contrat déclare l'échelle (`packages/contracts/src/schemas/language.ts`) :
 * sept niveaux ORDONNÉS, et l'ordre est tout ce qu'on leur demande — comparer un
 * niveau tenu à un niveau exigé. Le formulaire de saisie la lit déjà depuis le
 * contrat (`consultantForm.ts`). Le moteur de matching, lui, en gardait une
 * COPIE littérale, avec sa propre fonction de rang.
 *
 * Deux copies d'une même échelle ordonnée ne se trompent pas bruyamment, elles
 * se trompent en silence : le jour où le contrat gagne un niveau, le formulaire
 * l'accepte, la base l'accepte, et le moteur le classe `null` — « niveau non
 * précisé ». L'axe 6 sort alors du dénominateur sur un profil qui l'a rempli, et
 * personne ne voit passer d'erreur. C'est la forme la plus coûteuse du défaut :
 * un axe qui se tait au lieu de se tromper.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne déplace pas la NORMALISATION. `languageRank` continue d'appliquer le
 * `normalise()` du moteur (NFD, sans accent, ponctuation réduite) avant de
 * demander son rang au contrat : le moteur reçoit du texte saisi, le contrat
 * reçoit un niveau. Retirer cette étape changerait le comportement sur une
 * saisie accentuée — ce n'était pas le sujet.
 */

const AXES = join(__dirname, 'axes.ts')

/** Le fichier surveillé. Il est lu à chaque test : une garde qui ne lit rien ne garde rien. */
function axesSource(): string {
  return readFileSync(AXES, 'utf8')
}

/**
 * Une source déclare-t-elle SA PROPRE échelle ordonnée ?
 *
 * On cherche la suite des niveaux dans une même expression, pas le mot
 * « langue » : un commentaire qui parle du Cadre européen n'est pas une échelle,
 * et c'est exactement le faux positif qui rendrait la garde inutile.
 */
export function declaresOwnLanguageScale(source: string): boolean {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  return /\[[^\]]*'a1'[^\]]*'c2'[^\]]*\]/.test(withoutComments)
}

describe('GA-54 — la garde LIT vraiment le moteur, et sait dire NON', () => {
  it('lit le fichier des axes, et son corpus n’est pas vide', () => {
    const source = axesSource()
    expect(source.length).toBeGreaterThan(5_000)
    expect(source).toContain('export function axisLanguage')
    expect(source).toContain('export function languageRank')
  })

  it('le détecteur sait dire NON : une échelle recopiée est vue', () => {
    const tampered = `const LANGUAGE_LEVELS = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'natif']\n${axesSource()}`
    expect(declaresOwnLanguageScale(tampered)).toBe(true)
  })

  it('le détecteur ne confond pas un commentaire avec une échelle', () => {
    const onlyAComment = `/* l'échelle va de 'a1' à 'c2', plus « natif » */\nconst x = 1`
    expect(declaresOwnLanguageScale(onlyAComment)).toBe(false)
  })
})

describe('GA-54 — l’échelle des niveaux de langue vit à un seul endroit', () => {
  it('le moteur de matching ne redéclare pas l’échelle', () => {
    if (declaresOwnLanguageScale(axesSource())) {
      throw new Error(
        [
          '`apps/api/src/modules/consultants/matching/axes.ts` redéclare l’échelle',
          'des niveaux de langue.',
          '',
          'Elle est déclarée une fois, dans `packages/contracts/src/schemas/language.ts`',
          '(`LANGUAGE_LEVELS`), et son rang se demande à `languageLevelRank`.',
          '',
          'Deux copies ne divergent pas bruyamment : le jour où le contrat gagne un',
          'niveau, le moteur le classe « non précisé » et l’axe 6 sort du dénominateur',
          'sur un profil qui l’avait rempli.',
        ].join('\n'),
      )
    }
    expect(declaresOwnLanguageScale(axesSource())).toBe(false)
  })

  it('le rang du moteur est celui du contrat, pour chaque niveau', () => {
    expect(LANGUAGE_LEVELS.length).toBeGreaterThanOrEqual(7)
    for (const level of LANGUAGE_LEVELS) {
      expect(languageRank(level)).toBe(languageLevelRank(level))
    }
  })

  it('un niveau inconnu ou absent n’a pas de rang — il ne vaut pas zéro', () => {
    expect(languageRank(null)).toBeNull()
    expect(languageRank('')).toBeNull()
    expect(languageRank('bilingue')).toBeNull()
  })

  it('la normalisation du moteur reste la sienne : une saisie accentuée est classée', () => {
    expect(languageRank('Natif')).toBe(languageLevelRank('natif'))
    expect(languageRank(' C1 ')).toBe(languageLevelRank('c1'))
  })
})
