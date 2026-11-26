import type { SubStep } from './types'
import { hasNoCommercialHistory } from './maturite'

/**
 * Sous-étape `credibilite-preuves` du stage `offer_expertise` — #2039.10/.11.
 *
 * Deux colonnes ADDITIVES, au même titre que `client_references` (Temps 2,
 * texte libre) : aucune preuve construite, l'utilisateur saisit lui-même ce
 * qu'il peut montrer — jamais une donnée fictive. Les métadonnées PAR
 * référence — anonymisable, missions, documents, confidentialité (#2039.8/
 * .9/.12/.13) — restent HORS de ce lot : ELLES demandent un item À PART
 * rattaché à UNE expertise, avec ses propres métadonnées (un nom de client,
 * une date), qu'aucun `kind` de `Question` ne sait poser aujourd'hui (voir le
 * rapport du lot ; HORS LOT 24/09 → épopée #2880).
 *
 * #2548.1 — Ludovic (call bêta 17/09) : « ses recommandations clients » n'ont
 * pas de sens pour une activité qui vient de démarrer — ni cas client à
 * montrer, ni témoignage à citer. `max: 5` sans `optional` bloquerait déjà
 * « Continuer » sur une liste vide ; masquer les deux questions évite même la
 * question, pas seulement le blocage.
 *
 * #2039.6 (épopée #2880, tranché sans Louis dans le lot `feat/nuit-14-25-09`)
 * — `expertise_no_concrete_proof` EST le croisement expertise↔fondement pour
 * CE fondement précis (« simple volonté de développement ») : un ENSEMBLE
 * d'expertises, jamais un item par expertise avec ses propres métadonnées —
 * donc `kind: 'multi'` + `dynamicChoicesFromAnswerKey: 'expertise_areas'`
 * suffisent, sans nouveau `kind` de `Question` ni donnée relationnelle. Posée
 * seulement quand au moins une expertise est déjà déclarée (`when`) : une
 * liste sans aucun choix possible ne se pose pas (« on n'affiche pas ce qu'on
 * n'a pas »).
 *
 * #2039.2 (épopée #2880, tranché sans Louis, revient sur le « HORS LOT »
 * écrit pour #2039.2-.5 dans les lots précédents) — RELECTURE de la question
 * source (#2039) : « Pour chaque grande expertise, demander si elle repose
 * sur : […] référence client […] » pose exactement la MÊME question à un
 * paramètre près que « simple volonté de développement » (#2039.6) — quelles
 * expertises, PAS quel client nommé. `expertise_client_reference` réutilise
 * donc le même mécanisme, sans item par expertise ni métadonnée : ce que
 * #2039.6 n'était pas « le seul du groupe à s'y prêter », c'était le seul
 * ENCORE TRANCHÉ ainsi. Les métadonnées (client citable, anonymisable) restent
 * du ressort de `client_references`/`case_study_results` (Temps 2), non
 * rattachées à une expertise — c'est CE rattachement-là (item + métadonnées)
 * qui reste hors de ce lot, pas le simple « lesquelles ».
 *
 * #2039.3/.4/.5 (épopée #2880, vague G lot g10, tranché sans Louis) — les
 * trois derniers fondements à une dimension du groupe #2039.1-.6 (expérience
 * personnelle, partenaire, vivier disponible) : même relecture, même
 * mécanisme que #2039.2/.6 ci-dessus. Le groupe #2039.1-.6 est maintenant
 * entièrement couvert (« consultants en mission », #2039.1, traité ailleurs).
 * Le croisement relationnel complet (missions/documents/confidentialité PAR
 * référence, #2039.9/.12/.13) reste hors de ce lot.
 */
export const credibilitePreuvesStep: SubStep = {
  slug: 'credibilite-preuves',
  questions: [
    {
      key: 'case_study_results',
      kind: 'tags',
      label: 'questions.caseStudyResults.label',
      subtitle: 'questions.caseStudyResults.subtitle',
      placeholder: 'questions.caseStudyResults.placeholder',
      // #2548.1 — Ludovic (call bêta 17/09) : une activité SANS AUCUN
      // historique commercial n'a ni cas client ni témoignage possibles ; la
      // question ne se pose même pas.
      when: answers => !hasNoCommercialHistory(answers),
      // #2540 — pour qui A un historique mais n'a encore aucun résultat à
      // montrer, la liste VIDE reste l'état honnête — `optional` (#2059.7)
      // laisse « Continuer » avancer sans inventer une donnée.
      // #2540.1 — « je n'en ai pas encore » n'est pas un zéro : une liste
      // vide sort du dénominateur (GA-18/GA-19), elle ne se rend jamais
      // plus tard comme un score à zéro.
      optional: true,
    },
    {
      key: 'client_testimonials',
      kind: 'tags',
      label: 'questions.clientTestimonials.label',
      subtitle: 'questions.clientTestimonials.subtitle',
      placeholder: 'questions.clientTestimonials.placeholder',
      // #2548.1 — même raison que `case_study_results` ci-dessus.
      when: answers => !hasNoCommercialHistory(answers),
      // #2540 — même raison que `case_study_results` ci-dessus.
      // #2540.1 — « je n'en ai pas encore » n'est pas un zéro.
      optional: true,
    },
    {
      // #2961 (#2302.28, épopée Commercial Territory Resolver, tranché sans
      // Louis) — le NOM de l'entreprise seul, jamais une phrase : distinct de
      // `case_study_results` (texte libre) pour rester exploitable sans
      // invention par le résolveur de territoire, qui a besoin d'un nom
      // extractible, pas d'un résultat décrit.
      key: 'reference_accounts',
      kind: 'tags',
      label: 'questions.referenceAccounts.label',
      subtitle: 'questions.referenceAccounts.subtitle',
      placeholder: 'questions.referenceAccounts.placeholder',
      // #2548.1 — même raison que `case_study_results` ci-dessus.
      when: answers => !hasNoCommercialHistory(answers),
      // #2540 — même raison que `case_study_results` ci-dessus.
      optional: true,
    },
    {
      key: 'expertise_no_concrete_proof',
      kind: 'multi',
      label: 'questions.expertiseNoConcreteProof.label',
      subtitle: 'questions.expertiseNoConcreteProof.subtitle',
      choices: [],
      // #2039.6 (épopée #2880) — un choix par expertise déjà déclarée
      // (`expertise_areas`, `domaines.ts`), jamais un catalogue distinct.
      dynamicChoicesFromAnswerKey: 'expertise_areas',
      // Sans expertise déclarée, il n'y a rien à cocher — la question ne se
      // pose même pas plutôt que d'afficher une liste vide.
      when: answers => (Array.isArray(answers.expertise_areas) ? answers.expertise_areas.length > 0 : false),
      // Ne pas en cocher est l'état honnête (toutes les expertises ont déjà
      // une preuve, ou aucune ne s'y prête) — jamais un blocage.
      optional: true,
    },
    {
      key: 'expertise_client_reference',
      kind: 'multi',
      label: 'questions.expertiseClientReference.label',
      subtitle: 'questions.expertiseClientReference.subtitle',
      choices: [],
      // #2039.2 (épopée #2880) — même mécanisme que `expertise_no_concrete_proof`
      // ci-dessus : un choix par expertise déjà déclarée.
      dynamicChoicesFromAnswerKey: 'expertise_areas',
      when: answers => (Array.isArray(answers.expertise_areas) ? answers.expertise_areas.length > 0 : false),
      // Ne pas en cocher est l'état honnête (aucune expertise n'a encore de
      // référence client à montrer) — jamais un blocage.
      optional: true,
    },
    {
      key: 'expertise_personal_experience',
      kind: 'multi',
      label: 'questions.expertisePersonalExperience.label',
      subtitle: 'questions.expertisePersonalExperience.subtitle',
      choices: [],
      // #2039.3 (épopée #2880) — même mécanisme que ses voisines ci-dessus.
      dynamicChoicesFromAnswerKey: 'expertise_areas',
      when: answers => (Array.isArray(answers.expertise_areas) ? answers.expertise_areas.length > 0 : false),
      optional: true,
    },
    {
      key: 'expertise_partner',
      kind: 'multi',
      label: 'questions.expertisePartner.label',
      subtitle: 'questions.expertisePartner.subtitle',
      choices: [],
      // #2039.4 (épopée #2880) — même mécanisme que ses voisines ci-dessus.
      dynamicChoicesFromAnswerKey: 'expertise_areas',
      when: answers => (Array.isArray(answers.expertise_areas) ? answers.expertise_areas.length > 0 : false),
      optional: true,
    },
    {
      key: 'expertise_talent_pool',
      kind: 'multi',
      label: 'questions.expertiseTalentPool.label',
      subtitle: 'questions.expertiseTalentPool.subtitle',
      choices: [],
      // #2039.5 (épopée #2880) — même mécanisme que ses voisines ci-dessus.
      dynamicChoicesFromAnswerKey: 'expertise_areas',
      when: answers => (Array.isArray(answers.expertise_areas) ? answers.expertise_areas.length > 0 : false),
      optional: true,
    },
  ],
}
