import { HEARD_ABOUT_BELLUM_OPTIONS } from '@bellum/contracts'
import type { SubStep } from './types'
import { choice } from './types'

/**
 * Sous-étape `attribution` du stage `target_market` — #2059, AJOUTÉE EN FIN
 * (comme `clientIdealStep`/`interlocuteursStep`/`cheminsAccesStep` pour L17) :
 * « Comment as-tu connu {{brand}} ? ».
 *
 * 🔴 `optional: true` (#2059.7) — cette question ne bloque JAMAIS
 * l'avancement, même vide. C'est `isSatisfied` (`lib/validation.ts`) qui porte
 * ce contournement, pas une valeur par défaut : un choix « je ne réponds pas »
 * ajouté au catalogue serait persisté comme une VRAIE réponse, alors que ce
 * qu'on veut dire ici est « rien n'a été répondu ».
 *
 * 🔴 DOCTRINE (#2059.8/.9/.10) — cette réponse sert UNIQUEMENT à
 * l'attribution marketing : elle n'influence JAMAIS le scoring, les
 * recommandations, ni la qualité perçue de l'utilisateur. Gardée par
 * `packages/contracts/src/schemas/heard-about-bellum-attribution.guard.test.ts`.
 *
 * GA-44 — « LinkedIn Théo » et « Page BellumAI » sont des canaux
 * d'ACQUISITION de {{brand}}, pas des noms de fournisseur : légitimes ici.
 */
export const attributionStep: SubStep = {
  slug: 'attribution',
  questions: [
    {
      key: 'heard_about_bellum',
      kind: 'single',
      label: 'questions.heardAboutBellum.label',
      subtitle: 'questions.heardAboutBellum.subtitle',
      choices: choice(...HEARD_ABOUT_BELLUM_OPTIONS),
      optional: true,
    },
  ],
}
