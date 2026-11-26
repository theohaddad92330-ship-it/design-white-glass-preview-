import {
  TOOLING_CONFIDENCE_CHOICES,
  TOOLING_DUPLICATES_CHOICES,
  TOOLING_EXPORT_CHOICES,
  TOOLING_FRESHNESS_CHOICES,
  TOOLING_REFERENCE_CHOICES,
  TOOLING_REFERENCE_DATA_CHOICES,
} from '@bellum/contracts'
import type { SubStep } from './types'
import { choice } from './types'

/**
 * Sous-étape `outillage-qualite` du stage `company_info` — #2054.13 à #2054.18.
 *
 * Savoir QUELS outils existent ne dit pas ce qu'ils VALENT. Ces sept questions
 * portent toutes sur la même chose — la source où vivent réellement les données
 * commerciales — parce que c'est elle que l'audit doit pouvoir recommander de
 * garder, de connecter, de simplifier ou d'abandonner. Les poser pour chacun
 * des onze maillons ferait soixante-dix-sept questions et zéro réponse.
 *
 * Deux règles du produit sont visibles ici :
 *  - **aucun score.** « Niveau de confiance » (#2054.15) est un jugement DÉCLARÉ
 *    par l'utilisateur sur ses propres données : ni note, ni pourcentage, ni
 *    « chance que ce soit juste » (doctrine `c26_probabilite`) ;
 *  - **on propose une fusion, on ne fusionne jamais.** Le doublon (#2054.17) se
 *    CONSTATE ; répondre « oui » ne déclenche aucune écriture.
 */
export const outillageQualiteStep: SubStep = {
  slug: 'outillage-qualite',
  questions: [
    // #2054.13 — l'ancre : sans elle, « fraîcheur » et « confiance » porteraient
    // sur un objet flou, et chaque commercial répondrait sur un outil différent.
    {
      key: 'tooling_reference',
      kind: 'single',
      label: 'questions.toolingReference.label',
      subtitle: 'questions.toolingReference.subtitle',
      choices: choice(...TOOLING_REFERENCE_CHOICES),
    },
    // #2054.13 — ce que cette source contient réellement.
    {
      key: 'tooling_reference_data',
      kind: 'multi',
      label: 'questions.toolingReferenceData.label',
      subtitle: 'questions.toolingReferenceData.subtitle',
      choices: choice(...TOOLING_REFERENCE_DATA_CHOICES),
    },
    // #2054.14 — la fraîcheur, en bandes déclarées : aucune date n'est calculée
    // à la place de l'utilisateur, et une question passée reste INCONNUE.
    {
      key: 'tooling_reference_freshness',
      kind: 'single',
      label: 'questions.toolingReferenceFreshness.label',
      choices: choice(...TOOLING_FRESHNESS_CHOICES),
    },
    // #2054.15 — la confiance DÉCLARÉE. Voir l'entête : ce n'est pas un score.
    {
      key: 'tooling_reference_confidence',
      kind: 'single',
      label: 'questions.toolingReferenceConfidence.label',
      subtitle: 'questions.toolingReferenceConfidence.subtitle',
      choices: choice(...TOOLING_CONFIDENCE_CHOICES),
    },
    // #2054.16 — la possibilité d'export : ce que l'audit doit savoir avant de
    // recommander de garder ou d'abandonner un outil.
    {
      key: 'tooling_reference_export',
      kind: 'single',
      label: 'questions.toolingReferenceExport.label',
      choices: choice(...TOOLING_EXPORT_CHOICES),
    },
    // #2054.17 — le doublon, constaté et jamais résolu tout seul.
    {
      key: 'tooling_duplicates',
      kind: 'single',
      label: 'questions.toolingDuplicates.label',
      subtitle: 'questions.toolingDuplicates.subtitle',
      choices: choice(...TOOLING_DUPLICATES_CHOICES),
    },
    // #2054.18 — la douleur. Texte libre : une douleur rangée dans une liste
    // fermée devient la douleur de la liste, pas celle du commercial.
    {
      key: 'tooling_pain',
      kind: 'text',
      label: 'questions.toolingPain.label',
      subtitle: 'questions.toolingPain.subtitle',
      placeholder: 'questions.toolingPain.placeholder',
      // #2020.2 — Laura donne un EXEMPLE plutôt qu'une page blanche : trois
      // douleurs courantes, cliquables, qui EN FONT la réponse réelle
      // (même convention que `Choice.value` — persistées verbatim, jamais
      // traduites). Mécanisme déjà posé (#2088.20), jamais adopté par une
      // vraie question Temps-1 jusqu'ici.
      suggestions: [
        'Je ressaisis les mêmes contacts à trois endroits',
        'Je perds la trace des échanges avec un compte',
        "Je n'ai aucune vue d'ensemble de mon portefeuille",
      ],
    },
  ],
}
