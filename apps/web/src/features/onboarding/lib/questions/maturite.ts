import type { QuestionVisibilityAnswers, SubStep } from './types'
import { choice } from './types'

/**
 * Sous-étape `maturite` du stage `company_info` — lot L15 (#2034).
 *
 * La situation de vie de l'ESN et son objectif de croissance : un Business
 * Manager qui démarre une activité et une ESN de 500 en croissance recevaient
 * jusqu'ici le même questionnaire. `esn_maturity_situation` est un axe
 * déclaratif — jamais affiché seul comme un score (« sous 3 axes, pas de
 * score »). `company_growth_goal` est l'objectif de l'ENTREPRISE, distinct
 * d'`individual_goal` (objectif personnel du membre, profil progressif).
 *
 * #2548.1 — Ludovic (call bêta 17/09) a créé sa société il y a quelques
 * semaines : zéro client, zéro mission, aucun consultant en poste. Le
 * questionnaire lui posait quand même des questions sur son historique
 * commercial. `esn_maturity_situation` porte DÉJÀ le signal « activité en
 * création » depuis #2034 — inutile d'inventer une colonne neuve pour la
 * même idée (GA-26, une dérivation à un seul endroit). `hasNoCommercialHistory`
 * est LE prédicat que les sous-étapes qui supposent un passé commercial
 * (base de clients, effectif géré, vivier, preuves clients) lisent via `when`
 * pour ne plus jamais être POSÉES à ce profil — masquer n'efface rien
 * (« on archive, on ne supprime pas ») : le jour où l'ESN gagne son premier
 * client, revenir sur cette réponse fait réapparaître les questions.
 */
export const ESN_ACTIVITY_IN_CREATION = 'Activité en création'

export function hasNoCommercialHistory(answers: QuestionVisibilityAnswers): boolean {
  return answers.esn_maturity_situation === ESN_ACTIVITY_IN_CREATION
}

export const maturiteStep: SubStep = {
  slug: 'maturite',
  questions: [
    {
      key: 'esn_maturity_situation',
      kind: 'single',
      label: 'questions.esnMaturitySituation.label',
      subtitle: 'questions.esnMaturitySituation.subtitle',
      // #2548.3 — même patron que #2539 (`offre-prestations.ts`) : un terme
      // de notre vocabulaire s'explique là où il est demandé. « BU » (Business
      // Unit) et « transformation d'un modèle existant » ne sont pas
      // évidents pour un métier hors ESN classique (Ludovic, ingénierie
      // industrielle) — `exampleKey` (choix COURT, carte, #2087.9) porte
      // l'explication, `choice()` ne peut pas mélanger `Choice` simples et
      // enrichis dans le même appel.
      //
      // #2087.9 — réparation 18/09 (réfuté en production le 18/09 : les
      // cartes de cette question n'avaient AUCUNE icône) : chaque situation
      // porte désormais un `iconKey` DISTINCT des six autres — une icône
      // réutilisée entre deux cartes de la même question serait aussi peu
      // parlante que pas d'icône du tout. Purement DÉCORATIF (`aria-hidden`,
      // `ChoiceRow.tsx:89-91`) : la carte reste identifiable par son libellé
      // seul, l'icône n'en est jamais le seul porteur de sens (GA-32).
      choices: [
        { value: ESN_ACTIVITY_IN_CREATION, iconKey: 'user' },
        { value: 'Premiers clients', iconKey: 'users' },
        { value: 'Activité stabilisée', iconKey: 'building' },
        { value: 'Croissance', iconKey: 'trending-up' },
        {
          value: "Transformation d'un modèle existant",
          exampleKey: 'questions.esnMaturitySituationChoices.transformationExample',
          iconKey: 'refresh',
        },
        { value: 'Nouvelle activité au sein d’un groupe', iconKey: 'globe' },
        // #2034.5 — libellé déclaratif, pas une partition (décision Louis 15/09).
        {
          value: 'Plusieurs agences / BU',
          exampleKey: 'questions.esnMaturitySituationChoices.buExample',
          iconKey: 'map-pin',
        },
      ],
    },
    {
      key: 'company_growth_goal',
      kind: 'single',
      label: 'questions.companyGrowthGoal.label',
      choices: choice(
        "Stabiliser l'activité actuelle",
        // #2641.1 — manquait : une ESN dont l'activité tourne déjà et qui veut
        // pousser PLUS FORT sur la même trajectoire n'avait aucun choix qui le
        // dise — elle devait cocher « stabiliser » (faux, l'activité n'a rien
        // à stabiliser) ou « développer un nouveau secteur » (faux aussi, rien
        // de nouveau n'est visé). Valeur persistée verbatim, comme ses voisins
        // (`types.ts` : non traduite à dessein, pattern-matchée en français
        // par `apps/ia/app/models/profile_context.py`) — aucun `labelKey` sur
        // ce choix n'existerait sans que ses cinq voisins en aient un aussi.
        'Accélérer la croissance actuelle',
        'Développer un nouveau secteur ou une nouvelle offre',
        'Ouvrir un nouveau territoire',
        'Se structurer ou lever des fonds',
        'Se préparer à une cession ou une transmission',
        "Pas d'objectif de croissance formalisé pour l'instant",
      ),
    },
  ],
}
