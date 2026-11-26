import type { SubStep } from './types'

/**
 * Sous-étape `offre-prestations` du stage `offer_expertise` — #2038.2/.3/.4/
 * .5/.6/.8/.9/.10/.11.
 *
 * `positioning` mélange la LARGEUR de spécialisation (niche/multi/généraliste)
 * et le MODE de vente (« Régie pure », « Conseil & Delivery » glissés dans les
 * mêmes choix) — le toucher casserait les fixtures dorées de l'IA. `positioning`
 * garde donc ses choix historiques intacts (doctrine « ajout seulement ») et
 * cette question ouvre un AXE NEUF : les types de prestation, à plat, un choix
 * par type réellement vendu — Régie, Forfait, Conseil et Audit y trouvent leur
 * valeur propre au lieu de rester coincés dans `positioning`.
 */
export const offrePrestationsStep: SubStep = {
  slug: 'offre-prestations',
  questions: [
    {
      key: 'service_types',
      kind: 'multi',
      label: 'questions.serviceTypes.label',
      subtitle: 'questions.serviceTypes.subtitle',
      // #2539 — Ludovic (call bêta 17/09) a hésité entre « assistance
      // technique » et « régie » : chaque choix porte désormais une phrase
      // qui dit ce qu'il recouvre (`descriptionKey`, FR + EN), pas seulement
      // les deux termes qu'il a cités. `value` reste le libellé verbatim
      // persisté (voir le commentaire de `types.ts` sur `Choice.value`) ; seule
      // la description est traduite.
      choices: [
        { value: 'Régie', descriptionKey: 'questions.serviceTypesChoices.regie' },
        { value: 'Forfait', descriptionKey: 'questions.serviceTypesChoices.forfait' },
        { value: 'Conseil', descriptionKey: 'questions.serviceTypesChoices.conseil' },
        { value: 'Audit', descriptionKey: 'questions.serviceTypesChoices.audit' },
        { value: 'Centre de services', descriptionKey: 'questions.serviceTypesChoices.centreDeServices' },
        { value: 'Assistance technique', descriptionKey: 'questions.serviceTypesChoices.assistanceTechnique' },
        { value: 'Sous-traitance', descriptionKey: 'questions.serviceTypesChoices.sousTraitance' },
        { value: 'Sous-traitance rang 2', descriptionKey: 'questions.serviceTypesChoices.sousTraitanceRang2' },
        { value: 'Produit ou formation', descriptionKey: 'questions.serviceTypesChoices.produitOuFormation' },
        { value: 'Services managés / infogérance', descriptionKey: 'questions.serviceTypesChoices.servicesManages' },
        { value: 'Produit / solution éditée', descriptionKey: 'questions.serviceTypesChoices.produitSolutionEditee' },
        { value: 'Recrutement permanent', descriptionKey: 'questions.serviceTypesChoices.recrutementPermanent' },
        {
          value: 'Bureau d’études / ingénierie de projet',
          descriptionKey: 'questions.serviceTypesChoices.bureauEtudes',
        },
      ],
    },
  ],
}
