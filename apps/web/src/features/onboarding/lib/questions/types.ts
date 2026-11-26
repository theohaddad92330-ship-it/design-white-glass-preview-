import type { EsnAnswers } from '@bellum/contracts'

/**
 * Le vocabulaire de types du questionnaire Temps-1 (cadrage onboarding), partagé
 * par les neuf fichiers de sous-étape. Il vit ici, et nulle part ailleurs : deux
 * définitions de `Question` divergeraient au premier champ ajouté.
 *
 * Chaque question correspond 1:1 à une colonne `esn_profiles` via `key`. Les
 * `value` des choix sont les chaînes PERSISTÉES en base (on stocke le libellé
 * verbatim).
 *
 * i18n : `label`/`subtitle`/`placeholder`, le `title` d'un stage et le `label`
 * d'un groupe sont des CLÉS de traduction du namespace `onboarding` (traduites
 * au rendu avec `t(...)`), PAS du texte littéral. Les `value` des choix restent
 * non traduites à dessein — elles sont persistées verbatim (colonnes
 * `esn_profiles`) et pattern-matchées en français par le constructeur de prompt
 * de l'IA (`apps/ia/app/models/profile_context.py`) : les localiser casserait le
 * pipeline d'analyse en silence.
 */

type AnswerKey = keyof EsnAnswers

/**
 * `labelKey` (optionnel) : clé de traduction du libellé AFFICHÉ quand la `value`
 * persistée est un code machine stable (p. ex. les codes d'enum `offer_domain`)
 * plutôt que du français verbatim. Les questions sans `labelKey` gardent le
 * rendu historique « la valeur EST le libellé ».
 *
 * #2088.3 / #2087.9 — `descriptionKey` (choix LONG, liste recherchable) et
 * `exampleKey` (choix COURT, carte) sont des clés i18n OPTIONNELLES, au même
 * titre que `labelKey` : leur absence ne change rien au rendu historique. Le
 * mécanisme était prouvé par `ChoiceRow.test.tsx` / `QuestionField.test.tsx`
 * sur des questions FABRIQUÉES par le test, mais AUCUN choix réel ne les
 * portait — réfuté en production le 18/09 sur `/onboarding/.../company_info/
 * maturite` (icônes) et `/onboarding/.../role/role` (descriptions). Réparé le
 * même jour : `esn_maturity_situation` (`maturite.ts`, iconKey) et
 * `user_role` (`role.ts`, descriptionKey) sont désormais les questions RÉELLES
 * qui prouvent le mécanisme (`maturite.test.ts`, `role.test.ts`), en plus du
 * corpus fabriqué de `ChoiceRow.test.tsx`.
 */
/**
 * #2087.9 — le sous-ensemble d'icônes qu'une carte `layout="card"` peut porter.
 * Une LISTE FERMÉE (pas un nom `lucide-react` arbitraire) : `ChoiceRow` reste
 * la seule à savoir quel composant chaque clé dessine (GA-26, un seul endroit).
 * `CHOICE_ICON_KEYS` EST la liste — `ChoiceIconKey` en est dérivé, jamais
 * l'inverse, pour qu'un test (ou tout autre appelant) puisse énumérer le
 * registre sans dupliquer les clés en dur. `ChoiceRow.tsx` type son
 * `Record<ChoiceIconKey, …>` sur ce même type : ajouter une clé ici sans lui
 * donner un composant dans `ChoiceRow` ne compile pas (exhaustivité TS).
 * `trending-up`/`refresh` ont rejoint le registre avec #2087.9 (réparation
 * 18/09) pour porter « Croissance » et « Transformation d'un modèle
 * existant » (`maturite.ts`) — aucune des six clés précédentes n'aurait porté
 * un sens juste pour ces deux-là.
 */
export const CHOICE_ICON_KEYS = [
  'building',
  'users',
  'map-pin',
  'briefcase',
  'globe',
  'user',
  'trending-up',
  'refresh',
] as const
export type ChoiceIconKey = (typeof CHOICE_ICON_KEYS)[number]

export type Choice = {
  value: string
  labelKey?: string
  descriptionKey?: string
  exampleKey?: string
  iconKey?: ChoiceIconKey
}
type ChoiceGroup = { label: string; choices: Choice[] }

/**
 * #2088.28 — clé i18n du texte revélé par le bouton discret « Pourquoi cette
 * question ? ». Optionnelle : une question SANS `rationaleKey` n'affiche pas
 * le bouton — un bouton qui ouvrirait un texte inventé serait une donnée
 * fictive (craft rule « jamais de donnée fictive »).
 *
 * #2059.7 — `optional` : cette question n'exige AUCUNE réponse pour avancer,
 * même vide. Absent (le défaut historique) = le comportement d'avant, à
 * l'octet près. Se lit avec `isSatisfied` (`lib/validation.ts`), jamais avec
 * `validate` directement — `validate` continue de dire la vérité (« cette
 * question a-t-elle une réponse ? ») pour la relecture et la barre de
 * progression, qui doivent rester honnêtes sur une question facultative
 * restée vide.
 */
/**
 * #2023.5 — les réponses telles qu'une CONDITION de branchement les lit.
 *
 * Volontairement plus large que `EsnAnswers` : une condition est évaluée aussi
 * bien sur les réponses du store d'écran (`OnboardingAnswers`) que sur celles
 * du serveur (`EsnAnswers`, dont `esn_objectives` n'est NI une chaîne NI un
 * tableau de chaînes). Les typer `EsnAnswers` ici obligerait chaque appelant à
 * transtyper, et un transtypage par appelant est exactement la façon dont un
 * prédicat finit par diverger. C'est `answered` (`visibility.ts`) qui referme
 * la boucle : il ne dit « rempli » que sur ce qu'il sait LIRE.
 */
export type QuestionVisibilityAnswers = Readonly<Record<string, unknown>>

/**
 * #2023.5 — `when` : la question n'est POSÉE que si la condition est vraie sur
 * les réponses déjà données. Absent (le défaut historique) = la question est
 * toujours posée, à l'octet près.
 *
 * ⚠️ Une condition ne lit QUE des réponses, jamais une date, un compteur ou un
 * réglage : c'est ce qui la rend pure, testable et identique des deux côtés.
 * Et masquer n'efface pas — voir `visibility.ts`, le seul endroit qui la lit.
 */
type WithRationale = {
  rationaleKey?: string
  optional?: boolean
  when?: (answers: QuestionVisibilityAnswers) => boolean
  /**
   * #2027.1 — quatre états d'incertitude affichés SOUS la question, distincts
   * d'une absence de réponse (`isUnknownAnswerValue`, `@bellum/contracts`) :
   * « Je ne sais pas encore », « Non applicable », « À vérifier avec mon
   * équipe », « Je préfère répondre plus tard ». Choisir l'un d'eux PERSISTE
   * cette valeur verbatim par le même canal qu'une réponse (`Choice.value`) —
   * aucune colonne neuve — et compte comme une réponse pour `validate`
   * (#2027.2). Absent (le défaut) = aucune de ces quatre options, rendu
   * historique à l'octet près. Pas sur `kind: 'tags'` (chips libres sans
   * notion de « la » réponse).
   */
  allowUnknown?: boolean
}

/**
 * #2054.19 — ce que l'app sait déjà par une connexion RÉELLE de l'espace, et
 * qui peut retirer UN choix d'une question `single` — jamais faire disparaître
 * la question. Même principe que `ProfileQuestionContext`
 * (`profile-questionnaire.ts`), pour le wizard Temps-1 : les noms n'y sont pas
 * écrits en dur, ils arrivent par injection depuis le registre d'outils
 * (`toolingMapKeysForConnectedTools`, `@bellum/contracts`).
 */
export type QuestionContext = {
  /** Les maillons de `TOOLING_MAP_KEYS` qu'une connexion confirme comme BRANCHÉS. */
  connectedToolingMapKeys: readonly string[]
}

export const DEFAULT_QUESTION_CONTEXT: QuestionContext = { connectedToolingMapKeys: [] }

/**
 * #2024.5 — LA SÉLECTION EST ORDONNÉE, ET L'ORDRE EST UNE PRIORITÉ DITE.
 *
 * L'ordre d'insertion portait DÉJÀ une priorité implicite, et #2088.9 a même
 * ajouté de quoi le corriger sans décocher-recocher. Ce qui manquait est qu'il
 * ne se LISAIT nulle part : vingt cases cochées se ressemblent toutes, et
 * « prioritaire » cesse de trier quoi que ce soit — c'est le constat exact du
 * retour. Une question qui porte ce champ affiche « Priorité 1 », « Priorité
 * 2 »… sur sa sélection, et RELANCE au-delà du seuil.
 *
 * ⚠️ La relance ne BLOQUE rien et ne retire rien. Le produit n'a aucun moyen de
 * savoir lequel des vingt secteurs compte vraiment — seule la personne le sait.
 * En couper d'office serait choisir à sa place ; ne rien dire serait la laisser
 * croire qu'une liste de vingt priorités en est une.
 *
 * ⚠️ Rien n'est PERSISTÉ de plus : la valeur reste le même `string[]`, dont
 * l'ordre est déjà celui de la priorité. Aucune colonne, aucune migration,
 * aucune contrainte SQL à élargir (GA-11 / GA-12).
 *
 * Interne au fichier : `Question` la porte, les appelants la lisent à travers
 * lui et n'ont jamais besoin de la nommer (`pnpm lint:exports:types`).
 */
type MultiPriority = {
  /** Au-delà de ce NOMBRE de choix retenus, la relance s'affiche. */
  nudgeAbove: number
}

/**
 * #2024.3 — la question SOURCE d'une recommandation, et la clé i18n qui la
 * NOMME à l'écran.
 *
 * Le type vit ICI, avec `Question`, et pas dans
 * `lib/question-recommendations.ts` qui le consomme : l'inverse ferait importer
 * le vocabulaire de types depuis son propre lecteur.
 *
 * `sourceLabelKey` est OBLIGATOIRE, et c'est tout le point : une suggestion
 * sans sa provenance est indistinguable d'une invention, donc une
 * recommandation sans libellé de source ne peut pas se déclarer.
 */
export type RecommendationSource = {
  /** La clé de réponse d'où viennent les valeurs recommandées. */
  fromKey: AnswerKey
  /** Clé i18n du libellé affiché — « d'après vos secteurs cibles ». */
  sourceLabelKey: string
}

/**
 * #2031.5 / #2045.5 — décision Louis 18/09/2026 : « PROPOSER sans remplir ».
 *
 * Quelle propriété du vocabulaire BRUT du CRM branché (`CrmVocabulary`,
 * `@/features/crm/api`) afficher à côté de cette question, comme aide à la
 * saisie — jamais une correspondance vers `choices` : les valeurs d'un CRM
 * (« COMPUTER_SOFTWARE ») ne sont PAS celles du catalogue fermé
 * (« Tech & Startups / Scale-ups »), et aucune table ne les rapproche (voir
 * `crm-vocabulary.ts` côté API). Absent = aucun rendu, comportement
 * historique à l'octet près.
 *
 * ⚠️ Ceci ne coche RIEN et n'a pas de `resolveChoices` : le composant qui le
 * lit (`CrmVocabularyHint`) n'a pas accès à `onChange` — structurellement,
 * il ne peut pas remplir une réponse à la place de la personne.
 */
export type CrmVocabularyField = 'industries' | 'countries'

export type Question =
  | ({
      key: AnswerKey
      kind: 'text'
      label: string
      subtitle?: string
      placeholder?: string
      /**
       * #2088.20 — suggestions de réponse cliquables, sous un champ libre non
       * intimidant. Ce sont des VALEURS PERSISTÉES verbatim (même convention
       * que `Choice.value`) : cliquer une suggestion en fait la réponse RÉELLE
       * de l'utilisateur, jamais une donnée inventée en son nom — la
       * suggestion ignorée ne laisse aucune trace. Optionnel : absent, le
       * champ garde son rendu historique.
       */
      suggestions?: readonly string[]
    } & WithRationale)
  | ({
      key: AnswerKey
      kind: 'number'
      label: string
      subtitle?: string
      /**
       * #2088.12 (DÉCISION Louis 18/09, point 16) — l'UNITÉ VISIBLE à côté du
       * champ (clé i18n : « € », « consultants »…). Obligatoire pour ce kind
       * — un nombre sans unité ne dit pas ce qu'il compte, c'est exactement
       * ce que #2088.12 reproche à un `number` nu.
       */
      unitKey: string
      placeholder?: string
      /** Borne basse, `0` par défaut (un effectif ou un chiffre d'affaires
       *  négatif n'a pas de sens — même contrainte que côté SQL, GA-11/GA-12). */
      min?: number
    } & WithRationale)
  | ({
      key: AnswerKey
      kind: 'single'
      label: string
      subtitle?: string
      choices: Choice[]
      /** Pre-selected value when the answer is unset (e.g. `esn_it` for the
       *  offer domain). Also counts the question as "filled" — it is never a
       *  completion blocker. */
      defaultValue?: string
      /**
       * #2054.19 — recalcule `choices` à partir du contexte : retire UN choix
       * déjà déduit d'une connexion réelle, SANS faire disparaître la
       * question. Absent = `choices` reste le catalogue statique.
       */
      resolveChoices?: (context: QuestionContext) => Choice[]
    } & WithRationale)
  | ({
      key: AnswerKey
      kind: 'multi'
      label: string
      subtitle?: string
      choices: Choice[]
      max?: number
      allowOther?: boolean
      priority?: MultiPriority
      /**
       * #2024.3 — les options mises EN TÊTE viennent d'une RÉPONSE ANTÉRIEURE
       * de la personne, et l'écran NOMME laquelle. Voir
       * `lib/question-recommendations.ts` pour la décision (Louis, 16/09/2026)
       * et pour ce qui a été explicitement refusé (la mémoire marché). Absent
       * = aucune recommandation, rendu historique à l'octet près.
       */
      recommendedFrom?: RecommendationSource
      /** #2031.5 / #2045.5 — voir {@link CrmVocabularyField}. */
      crmVocabularyField?: CrmVocabularyField
      /**
       * #2039.6 (épopée #2880) — EN PLUS de `choices` (souvent `[]` pour ces
       * questions-là), un choix par valeur déjà saisie par LA MÊME personne
       * sous cette clé de réponse : chaque expertise qu'elle a déclarée
       * (`expertise_areas`) devient une option sélectionnable ici.
       *
       * ⚠️ Jamais une clé DEVINÉE ni un catalogue recopié : la valeur est
       * relue à la même adresse (`answers[key]`), donc elle voyage sans
       * jamais diverger de ce que l'autre question a réellement posé. Une clé
       * dont la valeur n'est pas un tableau de chaînes ne produit AUCUN choix
       * — jamais une option fabriquée sur un type inattendu.
       *
       * Ce n'est PAS le croisement expertise↔preuve relationnel que #2880
       * demande dans son ensemble (un item À PART entière rattaché à UNE
       * expertise, avec ses propres métadonnées) : c'est un SOUS-ENSEMBLE
       * plus étroit — « pour lesquelles de tes expertises la réponse est
       * X ? » — qui ne suppose aucun nouveau `kind` de `Question` ni aucune
       * donnée relationnelle neuve. Réutilisé par `expertise_client_reference`
       * (#2039.2, `credibilite-preuves.ts`) en plus de `expertise_no_concrete_
       * proof` (#2039.6) : les DEUX posent « lesquelles », jamais « avec quel
       * client nommé ». Le croisement relationnel complet — un item par
       * expertise avec ses propres métadonnées (#2039.9, .12, .13) — reste
       * hors de ce lot.
       */
      dynamicChoicesFromAnswerKey?: AnswerKey
    } & WithRationale)
  | ({
      key: AnswerKey
      kind: 'multi-grouped'
      label: string
      subtitle?: string
      groups: ChoiceGroup[]
      max?: number
      allowOther?: boolean
      priority?: MultiPriority
      /** #2031.5 / #2045.5 — voir {@link CrmVocabularyField}. */
      crmVocabularyField?: CrmVocabularyField
    } & WithRationale)
  /** Free-text chips — no catalog to pick from (client references). Used by the
   *  Temps-2 complement; the persisted value is a plain `string[]`. */
  | ({
      key: AnswerKey
      kind: 'tags'
      label: string
      subtitle?: string
      placeholder?: string
      max?: number
      /**
       * #2088.19 — clé i18n d'un exemple de FORME attendue (« Nom du client,
       * secteur »), jamais un nom d'entreprise réel suggéré comme référence :
       * `TagsField.tsx` documente déjà que ce champ n'a AUCUN catalogue à
       * proposer (une référence est un nom de client, en inventer une liste
       * est exactement ce que ce produit ne fait jamais). Optionnelle.
       */
      exampleKey?: string
    } & WithRationale)

/**
 * A sub-step within a stage: a short screen of 1-2 questions. The `slug`
 * appears in the URL (`/onboarding/{id}/{stage}/{slug}`) so each sub-step is
 * shareable/restorable and never crams 3+ questions onto one page.
 */
export type SubStep = { slug: string; questions: Question[] }
export type OnboardingStageDef = { code: string; title: string; steps: SubStep[] }

/** Raccourci pour les questions dont la valeur persistée EST le libellé. */
export const choice = (...values: string[]): Choice[] => values.map(value => ({ value }))

/**
 * #2039.6 (épopée #2880) — lit `dynamicChoicesFromAnswerKey` : un choix par
 * valeur RÉELLEMENT saisie sous cette clé, jamais un catalogue deviné.
 *
 * `undefined` (question pas encore atteinte), un type inattendu (une chaîne
 * seule, un objet) ou des entrées vides ne produisent AUCUN choix — jamais
 * une option fabriquée sur une valeur qui n'est pas un tableau de chaînes.
 */
export function choicesFromAnswerTags(value: unknown): Choice[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map(entry => ({ value: entry }))
}
