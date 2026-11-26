import { PROFILE_QUESTION_OPTIONS } from '@bellum/contracts'
import type { Choice, SubStep } from './types'

/**
 * #2088.3 — réparation 18/09 (réfuté en production sur `/onboarding/.../
 * role/role` : 18 entrées, liste RECHERCHABLE, aucune description). Une
 * phrase qui distingue le rôle de ses voisins les plus proches — jamais une
 * reformulation du libellé (une description creuse alourdit l'écran sans
 * rien y apporter, cf. `types.ts` sur `Choice.descriptionKey`). Les onze
 * premières valeurs sont des TITRES, les sept dernières un axe de PARCOURS
 * (manière de travailler, #2032.2-.8, `profile-questionnaire.ts:152-160`) —
 * deux valeurs peuvent donc se lire comme des synonymes (« Talent Manager /
 * Recruteur » vs. « Recrutement / talent ») sans en être : la description dit
 * lequel des deux axes elle décrit.
 *
 * `Partial<Record>` plutôt qu'un objet indexé sur `PROFILE_QUESTION_OPTIONS.
 * user_role` à l'octet près : si ce catalogue partagé (@bellum/contracts)
 * gagne une valeur neuve avant que ce lot ne lui écrive sa phrase, cette
 * valeur reste SANS descriptionKey (rendu historique, jamais une carte
 * cassée) plutôt que de faire échouer la question entière.
 */
const USER_ROLE_DESCRIPTION_KEYS: Partial<Record<string, string>> = {
  'Fondateur / CEO': 'questions.userRoleChoices.founderCeo',
  'Directeur commercial': 'questions.userRoleChoices.directeurCommercial',
  'Head of Sales': 'questions.userRoleChoices.headOfSales',
  'Business Manager': 'questions.userRoleChoices.businessManager',
  'Account Manager': 'questions.userRoleChoices.accountManager',
  'Business Developer': 'questions.userRoleChoices.businessDeveloper',
  'SDR / BDR': 'questions.userRoleChoices.sdrBdr',
  'Talent Manager / Recruteur': 'questions.userRoleChoices.talentManagerRecruteur',
  "Consultant / Ingénieur d'affaires": 'questions.userRoleChoices.consultantIngenieurAffaires',
  'Directeur de BU': 'questions.userRoleChoices.directeurDeBu',
  "Directeur d'agence": 'questions.userRoleChoices.directeurAgence',
  // BEL-SC-222 (#3251) — deux titres ajoutés en fin de bloc titres,
  // avant les 7 valeurs de PARCOURS (voir `profile-questionnaire.ts`).
  'Responsable staffing': 'questions.userRoleChoices.responsableStaffing',
  'ADV / Finance': 'questions.userRoleChoices.advFinance',
  'Freelance / activité individuelle': 'questions.userRoleChoices.freelanceActiviteIndividuelle',
  // #3386.1 (beta #3386) — ajouté après le bloc titres, avant les 7 PARCOURS.
  'Opérations commerciales': 'questions.userRoleChoices.operationsCommerciales',
  // Théo O onboarding-couverture (22/10) — cinq titres de la V23, avant les 7 PARCOURS.
  'Responsable ADV': 'questions.userRoleChoices.responsableAdv',
  'Responsable delivery / opérations': 'questions.userRoleChoices.responsableDelivery',
  'Responsable achats / partenariats': 'questions.userRoleChoices.responsableAchatsPartenariats',
  'Responsable marketing': 'questions.userRoleChoices.responsableMarketing',
  'Responsable d’un bureau d’études': 'questions.userRoleChoices.responsableBureauEtudes',
  'Pur commercial': 'questions.userRoleChoices.purCommercial',
  'Commercial avec culture technique': 'questions.userRoleChoices.commercialCultureTechnique',
  'Hybride business / delivery': 'questions.userRoleChoices.hybrideBusinessDelivery',
  'Ancien consultant devenu commercial': 'questions.userRoleChoices.ancienConsultantDevenuCommercial',
  'Pur technique / delivery': 'questions.userRoleChoices.purTechniqueDelivery',
  'Recrutement / talent': 'questions.userRoleChoices.recrutementTalent',
  'Direction / management': 'questions.userRoleChoices.directionManagement',
}

const userRoleChoices = (values: readonly string[]): Choice[] =>
  values.map(value => ({ value, descriptionKey: USER_ROLE_DESCRIPTION_KEYS[value] }))

/**
 * #2018.2 — le rôle. Stage `role` (`stepper.steps.role`), câblé pour de bon :
 * jusqu'ici la sous-étape n'existait pas dans le questionnaire Temps-1, alors
 * que le libellé et l'introduction de l'étape existaient déjà dans le stepper
 * (`ONBOARDING_RESULT_STEPS`, `stageCodes: []`) — la nommer sans jamais la
 * remplir aurait laissé « Ton rôle » éternellement `not_started`.
 *
 * Réutilise le catalogue et le libellé DÉJÀ posés pour la même question dans
 * le profil progressif (`PROFILE_QUESTION_OPTIONS.user_role`,
 * `profileQuestions.items.user_role.*`) : c'est la MÊME question, posée
 * depuis un second point d'entrée (le wizard, pour un nouveau membre ou une
 * nouvelle entreprise) — un second catalogue dupliqué aurait divergé au
 * premier ajout de choix (#2032.2-9, qui étend cette liste plus tard).
 */
export const roleStep: SubStep = {
  slug: 'role',
  questions: [
    {
      key: 'user_role',
      kind: 'single',
      label: 'profileQuestions.items.user_role.label',
      subtitle: 'profileQuestions.items.user_role.subtitle',
      choices: userRoleChoices(PROFILE_QUESTION_OPTIONS.user_role),
    },
    // #2018.3 — le portefeuille : « ne pas faire remplir deux fois le profil
    // ESN » vaut aussi pour ce champ, DÉJÀ posé et DÉJÀ classé personnel
    // (`PROFILE_PERSONAL_ANSWER_KEYS`, `@bellum/contracts`) côté profil
    // progressif — un second catalogue dupliqué aurait divergé au premier
    // ajout de bande. Même catalogue, même libellé, second point d'entrée.
    {
      key: 'portfolio_size',
      kind: 'single',
      label: 'profileQuestions.items.portfolio_size.label',
      subtitle: 'profileQuestions.items.portfolio_size.subtitle',
      // #4972.1 — « je démarre » : la bande '0' (déjà au contrat, aucune valeur neuve) se lit comme une réponse
      // DÉCLARÉE, jamais déduite de l'âge de la société. #4972.2 — une réponse, donc pas une réponse manquante.
      choices: PROFILE_QUESTION_OPTIONS.portfolio_size.map(value =>
        value === '0' ? { value, labelKey: 'questions.portfolioSizeStarting' } : { value },
      ),
    },
  ],
}
