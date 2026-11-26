import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PRODUCT_SCREENS } from '@bellum/contracts'
import {
  ONBOARDING_QUESTIONNAIRE_ACTION,
  ONBOARDING_QUESTION_SCREEN,
  ONBOARDING_RESUME_ACTION,
  ONBOARDING_WELCOME_SCREEN,
} from './tracking'

/**
 * #2022.8 — « mesurer le taux de reprise et les abandons PAR QUESTION », sans
 * jamais sortir du cadre de `c64_analytique_produit`.
 *
 * Ce test est une GARDE DE CONFIDENTIALITÉ, pas un test de rendu : il relit le
 * TEXTE des deux écrans qui émettent, et refuse qu'un argument d'émission soit
 * autre chose qu'une constante d'écran, un nom d'action ou un slug de
 * sous-étape. La raison de le faire en texte plutôt que sur les exports : GA-264
 * procède exactement ainsi sur `product-tracker.ts`, et pour la même raison —
 * une garde qui fait confiance au module qu'elle surveille ne surveille rien.
 *
 * Les trois bords :
 *  - elle LIT un corpus non vide (les deux fichiers existent et portent des
 *    appels, le test l'affirme) ;
 *  - elle sait dire NON (un appel dont le 3ᵉ argument n'est pas `sub.slug` ou
 *    un littéral d'étape la fait échouer) ;
 *  - elle n'attrape pas ce qu'elle ne vise pas (`trackActionStarted`, qui
 *    n'a que deux arguments, n'est pas soumis à la règle du 3ᵉ).
 */

function source(relative: string): string {
  return readFileSync(resolve(__dirname, relative), 'utf-8')
}

const WIZARD = source('../view/OnboardingWizard.tsx')
const WELCOME = source('../view/OnboardingWelcomePage.tsx')

/** Le 3ᵉ argument de `trackActionAbandoned`, tel qu'il est ÉCRIT. */
function abandonSteps(text: string): string[] {
  return [...text.matchAll(/trackActionAbandoned\(\s*([^)]*?)\)/gs)].map(match => (match[1].split(',')[2] ?? '').trim())
}

describe('#2022.8 — la reprise et les abandons se mesurent, sans jamais désigner quelqu’un', () => {
  it('LIT un corpus non vide : les deux écrans émettent réellement', () => {
    expect(WIZARD).toContain('trackActionAbandoned(')
    expect(WELCOME).toContain('trackActionAbandoned(')
    expect(WELCOME).toContain('trackActionStarted(')
    expect(abandonSteps(WIZARD).length + abandonSteps(WELCOME).length).toBeGreaterThanOrEqual(2)
  })

  it('l’abandon du questionnaire porte la SOUS-ÉTAPE, jamais une réponse', () => {
    // `sub.slug` est l'identifiant d'écran de la sous-étape — la même nature que
    // `route` partout ailleurs dans le traceur. Rien d'autre n'est autorisé ici.
    expect(abandonSteps(WIZARD)).toEqual(['sub.slug'])
  })

  it('l’abandon de la page 0 porte le nom de l’ÉTAPE, un littéral fermé', () => {
    expect(abandonSteps(WELCOME)).toEqual(["'welcome'"])
  })

  it('SAIT DIRE NON — aucun appel ne passe une réponse, une clé de question ou un identifiant', () => {
    for (const step of [...abandonSteps(WIZARD), ...abandonSteps(WELCOME)]) {
      expect(step).not.toMatch(/answers|question\.key|value|userId|user\.|workspace|email/i)
    }
  })

  it('la REPRISE a son propre nom d’action — sinon le taux de complétion mentirait', () => {
    expect(ONBOARDING_RESUME_ACTION).not.toBe(ONBOARDING_QUESTIONNAIRE_ACTION)
    expect(WELCOME).toContain('trackActionStarted(ONBOARDING_RESUME_ACTION, ONBOARDING_WELCOME_SCREEN)')
  })

  it('LE TÉMOIN — les deux écrans émettent sur des motifs de route du CATALOGUE', () => {
    const routes = PRODUCT_SCREENS.map(screen => screen.route)
    expect(routes).toContain(ONBOARDING_WELCOME_SCREEN)
    expect(routes).toContain(ONBOARDING_QUESTION_SCREEN)
  })
})
