import type { SubStep } from './types'
import { choice } from './types'

/**
 * Sous-étape `effectif-reel` du stage `company_info` — lot L15 (#2035).
 *
 * `consultant_size` (sous-étape `entreprise`) donne une seule bande pour toute
 * l'ESN. Ces deux questions décomposent l'effectif RÉEL : combien de
 * consultants l'utilisateur gère-t-il directement, et combien sont
 * disponibles maintenant (intercontrat).
 *
 * `available_consultants_band` (#2035.5) n'est pas une colonne neuve : elle
 * existe dans `esn_profiles` depuis la migration 1780000000000 et son lecteur
 * IA (`sales_context.py::_bench_band`) l'attend déjà — seule la question
 * manquait. Les valeurs portent donc les mots-clés que `_bench_band` sait
 * déjà classer (« aucun »/« plein » → bas, « quelques » → moyen,
 * « beaucoup »/« fort » → haut).
 */
export const effectifReelStep: SubStep = {
  slug: 'effectif-reel',
  questions: [
    {
      key: 'consultants_managed_by_user_band',
      kind: 'single',
      label: 'questions.consultantsManagedByUserBand.label',
      subtitle: 'questions.consultantsManagedByUserBand.subtitle',
      // #2548.2 (#2027.1) — pas d'`allowUnknown` ici à dessein : « Aucun
      // consultant géré directement » est déjà le zéro MESURÉ et honnête
      // (contrairement à `available_consultants_band` ci-dessous, dont
      // aucun choix ne dit « pas de consultant du tout ») — ajouter les
      // quatre états d'incertitude sur une question qui a DÉJÀ sa réponse
      // « rien » ferait deux boutons « Non applicable » sur le même écran
      // (`SubStepQuestions.test.tsx`, #2027 — la sous-étape `effectif-reel`
      // rend les deux questions ensemble).
      choices: choice(
        'Aucun consultant géré directement',
        '1 à 5 consultants',
        '6 à 15 consultants',
        '16 à 30 consultants',
        'Plus de 30 consultants',
      ),
    },
    {
      key: 'available_consultants_band',
      kind: 'single',
      label: 'questions.availableConsultantsBand.label',
      choices: choice(
        'Aucune disponibilité, planning plein',
        'Quelques consultants disponibles en intercontrat',
        'Beaucoup de disponibilité, fort intercontrat',
      ),
      // #2035.9 — une inconnue de DISPONIBILITÉ reste inconnue : ce champ
      // varie chaque semaine et une bande devinée serait une donnée fictive.
      // `_bench_band` (`sales_context.py`) rend déjà "inconnu" sur un texte
      // qu'il ne reconnaît pas — les quatre libellés #2027 y retombent sans
      // changement côté IA.
      allowUnknown: true,
    },
    // #2035.1 — « 120 consultants » ne dit pas s'il s'agit de CETTE activité
    // ou du GROUPE qui la porte. `optional: true` : ne bloque jamais — une
    // ESN indépendante laisse ce champ vide, et vide reste `null`, jamais `0`
    // (GA-18/GA-19). Toujours posée (pas de `when` sur `esn_maturity_situation` :
    // celle-ci est un choix UNIQUE de situation de vie, incompatible avec un
    // filtre qui la lirait comme excluant « appartient à un groupe » —
    // une ESN « en croissance » peut très bien appartenir à un groupe).
    {
      key: 'consultant_size_group_band',
      kind: 'single',
      label: 'questions.consultantSizeGroupBand.label',
      subtitle: 'questions.consultantSizeGroupBand.subtitle',
      optional: true,
      choices: choice('1-10', '10-30', '30-80', '80-200', '200-500', '500+'),
    },
    // #2035.2 — même geste pour la BU/agence : un libellé déclaratif (décision
    // Louis 15/09), jamais une partition avec ses propres droits — voir
    // `apps/api/src/database/entities/business-unit.entity.ts` pour le module
    // structurel homonyme (le périmètre de travail RÉEL d'un espace), que
    // cette bande ne remplace pas : elle ne fait qu'enregistrer ce que CETTE
    // personne déclare pour SA BU, au moment où elle répond.
    {
      key: 'consultant_size_business_unit_band',
      kind: 'single',
      label: 'questions.consultantSizeBusinessUnitBand.label',
      subtitle: 'questions.consultantSizeBusinessUnitBand.subtitle',
      optional: true,
      choices: choice('1-10', '10-30', '30-80', '80-200', '200-500', '500+'),
    },
  ],
}
