import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #2084.40/.41/.42/.45 — « Onboarding GRATUIT de bout en bout » (Louis,
 * 15/09/2026) : questionnaire, audit sur données déclarées, consultation,
 * Market Memory, corrections, imports locaux et prévisualisations = 0 crédit.
 *
 * Ce test ne mesure pas une intention, il mesure une IMPOSSIBILITÉ
 * STRUCTURELLE : les modules qui portent ces gestes ne référencent nulle part
 * `CreditsService` — ils ne peuvent donc pas débiter, quelle que soit la
 * branche empruntée à l'exécution. C'est plus fort qu'un test de
 * comportement isolé (qui ne couvrirait qu'UN chemin) et moins cher qu'un test
 * d'intégration bout en bout.
 *
 * #2084.45 — « ne jamais consommer à chaque sous-étape du questionnaire » :
 * `onboarding.service.ts` porte `saveAnswers`/`advanceStage`, appelées à
 * chaque sous-étape (cf. `useOnboardingNavigation.ts` côté web) — la même
 * absence de référence aux crédits les couvre.
 *
 * Preuve que la garde sait dire NON : introduire `import { CreditsService }`
 * (ou une simple référence textuelle au nom) dans l'un des fichiers listés
 * fait échouer ce test.
 */

const API_SRC = join(__dirname, '..', '..')

const FREE_ONBOARDING_FILES = [
  'modules/onboarding/onboarding.service.ts',
  'modules/onboarding/onboarding.controller.ts',
  'modules/onboarding/activation.service.ts',
  'modules/esn-profile/esn-profile.controller.ts',
  'modules/esn-profile/esn-profile.service.ts',
  'modules/profile-context/profile-context.service.ts',
  'modules/profile-context/profile-context.controller.ts',
  'modules/import/import.service.ts',
  'modules/import/import.controller.ts',
]

function read(relativePath: string): string {
  return readFileSync(join(API_SRC, relativePath), 'utf8')
}

describe('#2084.40/.41/.42/.45 — onboarding gratuit de bout en bout', () => {
  it.each(FREE_ONBOARDING_FILES)('%s ne référence pas CreditsService', relativePath => {
    const source = read(relativePath)
    expect(source.length).toBeGreaterThan(0) // une garde qui ne lit rien ne garde rien
    expect(source).not.toMatch(/CreditsService/)
  })
})
