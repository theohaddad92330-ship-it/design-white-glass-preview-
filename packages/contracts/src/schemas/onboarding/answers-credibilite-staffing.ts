import { z } from 'zod'

/**
 * Crédibilité (preuves libres) et modes de réponse au besoin — lot 26
 * (#2039, #2040), sous-ensemble additif : les métadonnées PAR référence —
 * anonymisable, missions, documents, confidentialité (#2039.8/.9/.12/.13) —
 * demandent une donnée RELATIONNELLE (un item du catalogue rattaché à un
 * autre, avec ses propres métadonnées) qu'aucun `kind` de `Question` ne sait
 * poser aujourd'hui ; les ajouter ici aurait doublé le risque déjà pris par
 * ce lot sur `QuestionField.tsx`, partagé avec le lot B1 en vol. Parqués —
 * voir le rapport du lot. HORS LOT 24/09 → épopée #2880 (croisement
 * expertise↔fondement/preuve et audit à 3 états, absent).
 *
 * `case_study_results` et `client_testimonials` (#2039.10/.11) sont des
 * colonnes ADDITIVES au même titre que `client_references` (tags, texte
 * libre) : aucune preuve construite, l'utilisateur les saisit lui-même —
 * jamais une donnée fictive.
 *
 * `expertise_no_concrete_proof` (#2039.6, épopée #2880, tranché sans Louis
 * dans le lot `feat/nuit-14-25-09`) et `expertise_client_reference` (#2039.2,
 * épopée #2880, tranché sans Louis dans le lot `feat/soir-s10-26-09`) posent
 * la MÊME question source (#2039 : « pour chaque grande expertise, demander
 * si elle repose sur : […] ») réduite à un seul paramètre fixé — le
 * fondement — et l'AUTRE qui varie — l'expertise : un ENSEMBLE d'expertises
 * (lesquelles reposent sur ce fondement), jamais un item À PART rattaché à
 * UNE expertise avec ses propres métadonnées (un nom de client, une date).
 * `kind: 'multi'` + `dynamicChoicesFromAnswerKey: 'expertise_areas'`
 * (`lib/questions/types.ts`) suffit aux DEUX : chaque expertise déjà
 * déclarée devient une option sélectionnable, sans nouveau `kind` de
 * `Question` ni donnée relationnelle. ⚠️ Une lecture précédente avait rangé
 * `expertise_no_concrete_proof` comme « le SEUL fondement du groupe #2039.1-.6
 * qui ne demande pas de donnée relationnelle » et laissé #2039.2-.5 « hors de
 * ce lot » sur cette seule base — la relecture du 26/09 montre que .2-.5
 * posent la même question à une dimension que .6, à l'inverse de .9/.12/.13
 * (missions/documents/confidentialité PAR référence nommée), qui restent,
 * eux, relationnels. Missions/documents/confidentialité (#2039.9/.12/.13)
 * attendent toujours ce même chantier relationnel plus étroit.
 *
 * `expertise_personal_experience` (#2039.3), `expertise_partner` (#2039.4) et
 * `expertise_talent_pool` (#2039.5, épopée #2880, vague G lot g10) posent la
 * MÊME question source pour les trois derniers fondements à une dimension
 * (« expérience personnelle », « partenaire », « vivier disponible ») —
 * exactement le mécanisme de `expertise_no_concrete_proof`/
 * `expertise_client_reference` ci-dessus, jamais deviné : le groupe #2039.1-.6
 * est maintenant entièrement couvert par ce seul mécanisme, à l'exception de
 * « consultants en mission » (#2039.1, traité ailleurs).
 *
 * `staffing_modes` (#2040.3/.4/.5/.6) est le pendant de `service_types` :
 * `staffing_model` reste un choix UNIQUE (le mode dominant), ce nouveau champ
 * MULTI capture tous les modes réellement utilisés sans toucher au premier —
 * une ESN peut cumuler CDI, sous-traitance et nearshore, ce qu'un select
 * unique ne peut jamais dire.
 *
 * `profile_validation_methods` (#2040.9) et `contractual_constraints`
 * (#2040.12) sont des colonnes additives simples.
 */
export const CREDIBILITE_STAFFING_ANSWER_FIELDS = {
  case_study_results: z.array(z.string()).catch([]),
  client_testimonials: z.array(z.string()).catch([]),
  // #2961 (#2302.28, épopée Commercial Territory Resolver) — les mêmes
  // références que `case_study_results`, mais NOMMÉES seules (un nom
  // d'entreprise par entrée, jamais une phrase) : la forme structurée dont le
  // résolveur de territoire a besoin pour restituer une référence comparable
  // sans deviner un nom dans du texte libre.
  reference_accounts: z.array(z.string()).catch([]),
  expertise_no_concrete_proof: z.array(z.string()).catch([]),
  expertise_client_reference: z.array(z.string()).catch([]),
  expertise_personal_experience: z.array(z.string()).catch([]),
  expertise_partner: z.array(z.string()).catch([]),
  expertise_talent_pool: z.array(z.string()).catch([]),
  staffing_modes: z.array(z.string()).catch([]),
  profile_validation_methods: z.array(z.string()).catch([]),
  contractual_constraints: z.array(z.string()).catch([]),
}
