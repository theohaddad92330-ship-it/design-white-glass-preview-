/**
 * #2323.32/.34/.35/.36 — LA QUESTION QUI CHANGE LE PLUS CHAQUE AXE (LAU-FINAL-064).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PAS DE POIDS — décidé sans Louis (registre #2323, coordinateur, 25/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * L'issue demandait « choisir la question qui change LE PLUS » l'axe. Un poids
 * relatif entre champs est un jugement produit qu'aucune spec ne donne, et se
 * romprait au premier réglage sectoriel. La réponse retenue est plus simple et
 * ne se discute pas : pour chaque axe, une liste ORDONNÉE et FIXE de champs —
 * la question affichée est celle du PREMIER champ absent de cette liste. Un
 * axe dont tous les champs sont renseignés ne produit AUCUNE question (« on
 * n'affiche pas ce qu'on n'a pas »).
 *
 * Quatre axes, chacun sa liste :
 *  - matching     : compétences clés → séniorité → stack/outils → langues
 *  - feasibility  : habilitations → lieu/présence → date de démarrage → TJM/budget
 *  - consent      : type de profil validé par le client (#2323.18) → processus
 *                   de présentation (#2323.22)
 *  - timing       : date de démarrage → date de décision → urgence
 *
 * ⚠️ Ce moteur est DISTINCT de `needVerdictPriorityQuestion` (`need-verdict.ts`),
 * qui priorise les axes du verdict GO/NO-GO staffing (economics/feasibility/…) —
 * un scope différent, confirmé sur le registre #2323.32. Celui-ci qualifie le
 * BESOIN, pas la décision d'y aller.
 *
 * ⚠️ `remote` renseigné vaut `location` pour l'axe faisabilité — même règle que
 * {@link needMatcherGate} (`need-matcher-gate.ts`) : « lieu OU mode de travail »
 * est une seule question, pas deux.
 *
 * ⚠️ Sur l'axe consentement, un refus EXPLICITE (`not_agreed`) compte comme
 * RÉPONDU, jamais comme absent — même distinction que `need-presenter-gate.ts`
 * entre `unknown` (pas encore demandé) et `not_agreed` (une réponse reçue).
 */

export const NEED_QUALIFICATION_AXES = ['matching', 'feasibility', 'consent', 'timing'] as const
export type NeedQualificationAxis = (typeof NEED_QUALIFICATION_AXES)[number]

export interface NeedQualificationQuestionsInput {
  skills: readonly { term: string }[]
  seniority: string | null
  stack: readonly string[]
  languages: readonly { code: string }[]
  clearances: readonly string[]
  location: string | null
  remote?: string | null
  start_on: string | null
  budget_cents: number | null
  target_tjm_cents: number | null
  /** `unknown`/`null`/absent = pas encore demandé. `not_agreed` = répondu. */
  profile_type_agreement?: string | null
  presentation_process: string | null
  /** La date de DÉCISION attendue côté client — `project_needs.deadline_at`. */
  deadline_at: string | null
  urgency?: string | null
}

export interface NeedQualificationQuestion {
  axis: NeedQualificationAxis
  field: string
  question: { fr: string; en: string }
}

interface AxisField {
  field: string
  present: (need: NeedQualificationQuestionsInput) => boolean
  question: { fr: string; en: string }
}

const MATCHING_FIELDS: readonly AxisField[] = [
  {
    field: 'skills',
    present: need => need.skills.length > 0,
    question: {
      fr: 'Quelles sont les compétences clés indispensables pour ce poste ?',
      en: 'What are the key skills required for this role?',
    },
  },
  {
    field: 'seniority',
    present: need => need.seniority != null,
    question: { fr: 'Quelle séniorité le client attend-il ?', en: 'What seniority level does the client expect?' },
  },
  {
    field: 'stack',
    present: need => need.stack.length > 0,
    question: {
      fr: 'Quel est l’environnement technique (stack, outils) de la mission ?',
      en: 'What is the technical environment (stack, tools) for this assignment?',
    },
  },
  {
    field: 'languages',
    present: need => need.languages.length > 0,
    question: { fr: 'Quelles langues sont exigées pour ce poste ?', en: 'Which languages are required for this role?' },
  },
]

const FEASIBILITY_FIELDS: readonly AxisField[] = [
  {
    field: 'clearances',
    present: need => need.clearances.length > 0,
    question: {
      fr: 'Une habilitation est-elle exigée pour cette mission ?',
      en: 'Is a security clearance required for this assignment?',
    },
  },
  {
    field: 'locationOrRemote',
    present: need => need.location != null || (need.remote ?? null) != null,
    question: {
      fr: 'Où la mission se déroule-t-elle, et quel mode de travail est accepté ?',
      en: 'Where does the assignment take place, and what work mode is accepted?',
    },
  },
  {
    field: 'start_on',
    present: need => need.start_on != null,
    question: { fr: 'Quelle est la date de démarrage attendue ?', en: 'What is the expected start date?' },
  },
  {
    field: 'budget',
    present: need => need.budget_cents != null || need.target_tjm_cents != null,
    question: {
      fr: 'Quel est le budget ou le TJM cible pour ce besoin ?',
      en: 'What is the budget or target daily rate for this need?',
    },
  },
]

const CONSENT_FIELDS: readonly AxisField[] = [
  {
    field: 'profileTypeAgreement',
    present: need => (need.profile_type_agreement ?? 'unknown') !== 'unknown',
    question: {
      fr: 'Le client a-t-il validé le type de profil recherché ?',
      en: 'Has the client agreed on the type of profile sought?',
    },
  },
  {
    field: 'presentationProcess',
    present: need => (need.presentation_process ?? '').trim().length > 0,
    question: {
      fr: 'Quel est le processus de présentation ou de recrutement du client ?',
      en: 'What is the client’s presentation or hiring process?',
    },
  },
]

const TIMING_FIELDS: readonly AxisField[] = [
  {
    field: 'startOn',
    present: need => need.start_on != null,
    question: { fr: 'Quelle est la date de démarrage attendue ?', en: 'What is the expected start date?' },
  },
  {
    field: 'deadlineAt',
    present: need => need.deadline_at != null,
    question: {
      fr: 'À quelle date le client compte-t-il décider ?',
      en: 'By what date does the client expect to decide?',
    },
  },
  {
    field: 'urgency',
    present: need => (need.urgency ?? null) != null,
    question: { fr: 'Quel est le niveau d’urgence de ce besoin ?', en: 'How urgent is this need?' },
  },
]

const AXIS_FIELDS: Record<NeedQualificationAxis, readonly AxisField[]> = {
  matching: MATCHING_FIELDS,
  feasibility: FEASIBILITY_FIELDS,
  consent: CONSENT_FIELDS,
  timing: TIMING_FIELDS,
}

/**
 * Une question par axe au plus, jamais plus — le premier champ absent de la
 * liste fixe de chaque axe. Un axe entièrement renseigné n'apparaît PAS dans
 * le résultat.
 */
export function needQualificationQuestions(
  need: NeedQualificationQuestionsInput,
): readonly NeedQualificationQuestion[] {
  const questions: NeedQualificationQuestion[] = []
  for (const axis of NEED_QUALIFICATION_AXES) {
    const missing = AXIS_FIELDS[axis].find(candidate => !candidate.present(need))
    if (missing) questions.push({ axis, field: missing.field, question: missing.question })
  }
  return questions
}
