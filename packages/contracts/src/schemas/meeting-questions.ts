import { z } from 'zod'

/**
 * Les bibliothèques de questions — LEGACY-003 du paquet de récupération.
 *
 * Trois moments, trois banques : la DÉCOUVERTE (12 familles), la SOUTENANCE
 * (25 questions en 5 blocs) et l'APPEL (5 étapes + une checklist en 8 points).
 *
 * ## Les trois familles ajoutées après coup (GA-142)
 *
 * La découverte n'en portait que 9 : `enjeux/priorités`, `budget/timing/urgence`
 * et `objections/risques` manquaient — un « LIVRÉ » les avait closes sans les
 * nommer (recomptage du 30/08, `agent_docs/iteration-3-trous-2026-08-30.md:507,538`).
 * Leur contenu vient d'une autre source du dépôt, réellement présente :
 * `agent_docs/kb/pitch-telephonique.md` et `agent_docs/kb/bible-sales-hacks.md`
 * — verbatim, jamais inventé. `stakes_priorities` (enjeux/priorités) n'a qu'UNE
 * question : c'est tout ce que ces fiches contiennent sur ce thème précis
 * adressé au prospect ; le reste de la matière disponible est un CHECKLIST
 * interne au commercial (« avons-nous… »), pas une question de découverte, et
 * n'a pas été détourné pour gonfler le compte. Ajoutées EN FIN de liste
 * (GA-08 : un enum n'insère jamais au milieu).
 *
 * ## La règle qui décide de tout : on SÉLECTIONNE, on ne récite pas
 *
 * « Sélection contextuelle de 3 à 8 questions ; ne jamais afficher toute la
 * banque par défaut. » Une banque de cinquante questions posée à plat devant
 * quelqu'un qui entre en rendez-vous dans dix minutes n'est pas un outil, c'est
 * un document. Et une question déjà renseignée ne se repose pas : la reposer
 * dit à l'interlocuteur qu'on n'a pas écouté la première fois.
 *
 * Cette logique existait — sur le site vitrine, pour Laura, avec ses tests
 * (`nextQuestion` / `answeredAxes`). Côté produit, aucune banque. C'est le même
 * principe, écrit une fois pour les deux.
 *
 * ## Ce qui n'est PAS repris
 *
 * Les réponses-types verbatim des documents source. Une réponse recopiée devient
 * une réponse récitée, et le guide d'appel le dit lui-même dans ses « à éviter » :
 * « dérouler son pitch sans créer d'échange ». Ce qui est repris est la QUESTION,
 * qui ouvre, jamais la réplique, qui ferme.
 */

/* ------------------------------- découverte -------------------------------- */

/**
 * Les douze familles de l'entretien de découverte, dans l'ordre où elles se
 * posent. L'ordre porte une intention : on comprend le CONTEXTE avant de parler
 * de la mission, et on ne clôture qu'à la fin.
 *
 * Les neuf premières sont la banque LEGACY-003 d'origine — inchangées, dans le
 * même ordre. Les trois dernières (`stakes_priorities`, `budget_timing_urgency`,
 * `objections_risks`) ferment le compte à 12 (GA-142, voir le commentaire de
 * module) et sont ajoutées EN FIN, jamais au milieu (GA-08).
 */
export const DISCOVERY_FAMILIES = [
  'context',
  'role_scope',
  'pain_consequence',
  'project_mission',
  'organization',
  'decision_procurement',
  'success',
  'close',
  'submission_feedback',
  'stakes_priorities',
  'budget_timing_urgency',
  'objections_risks',
] as const
export const discoveryFamilySchema = z.enum(DISCOVERY_FAMILIES)
export type DiscoveryFamily = (typeof DISCOVERY_FAMILIES)[number]

export const DISCOVERY_QUESTIONS: Readonly<Record<DiscoveryFamily, readonly string[]>> = {
  context: [
    'Quelle est l’origine du projet et pourquoi maintenant ?',
    'Quels enjeux stratégiques ce projet sert-il ?',
    'Quel résultat concret est attendu à court, moyen et long terme ?',
    'Quel serait le scénario idéal dans trois à six mois ?',
  ],
  role_scope: [
    'Quels sujets pilotez-vous directement ?',
    'Sur quels objectifs êtes-vous attendu cette année ?',
    'Avec quelles équipes internes ou externes travaillez-vous le plus ?',
  ],
  pain_consequence: [
    'Quels chantiers consomment le plus de ressources ?',
    'Où manque-t-il de l’expertise ou de la bande passante ?',
    'Que se passe-t-il si rien ne change dans les six prochains mois ?',
    'Quel type de prestation vous propose-t-on souvent sans que cela corresponde au besoin réel ?',
  ],
  project_mission: [
    'Quelles compétences sont indispensables ?',
    'Quels livrables sont attendus et à quel rythme ?',
    'Quel niveau d’autonomie est attendu ?',
    'Quelles décisions devront être prises au quotidien ?',
  ],
  organization: [
    'Avec qui la personne travaillera-t-elle au quotidien ?',
    'Quels outils, méthodes ou contraintes structurent l’intervention ?',
    'À quoi ressemble une semaine type ?',
  ],
  decision_procurement: [
    'Comment passe-t-on de l’idée à la contractualisation ?',
    'Qui valide, qui influence et qui opère ?',
    'À quel moment les achats interviennent-ils ?',
    'Qui a eu le dernier mot lors du dernier recours à une prestation externe ?',
  ],
  success: [
    'Quels indicateurs définiront la réussite ?',
    'Quels éléments vous feraient préférer un profil à un autre ?',
    'Quelle serait la première priorité au démarrage ?',
  ],
  close: [
    'Quels doutes ou freins restent à lever ?',
    'Quelles sont les prochaines étapes et leurs dates ?',
    'Qui doit être impliqué avant la prochaine décision ?',
  ],
  submission_feedback: [
    'Qu’est-ce qui manque au profil présenté ?',
    'Le refus vient-il des compétences, du contexte, du timing ou du budget ?',
  ],
  // Les trois familles GA-142 — voir le commentaire de module pour la source et
  // la raison du compte inégal (1 / 3 / 4). Chaque question est reprise mot
  // pour mot d'un script adressé au prospect ; rien n'est reformulé au-delà
  // d'une majuscule de première lettre quand la phrase source démarrait au
  // milieu d'un paragraphe.
  stakes_priorities: [
    // agent_docs/kb/pitch-telephonique.md:31 (étape 4 — questions stratégiques)
    'Avez-vous une visibilité claire sur votre roadmap 2026 ?',
  ],
  budget_timing_urgency: [
    // agent_docs/kb/pitch-telephonique.md:90 (réponse à « Votre TJM est trop élevé »)
    'Quel est votre budget cible ?',
    // agent_docs/kb/pitch-telephonique.md:99 (§5 « Ancrage temporel »)
    'D’ici 6 mois, si vous deviez renforcer votre équipe, quel profil manquerait en premier ?',
    // agent_docs/kb/pitch-telephonique.md:47 (réponse à « Pas de budget »)
    'Pourriez-vous me partager un appel d’offres ou un besoin récent sur lequel vous n’avez pas trouvé le bon partenaire ?',
  ],
  objections_risks: [
    // agent_docs/kb/pitch-telephonique.md:82 (réponse à « On a déjà des partenaires »)
    'Qu’est-ce qui vous manque aujourd’hui ?',
    // agent_docs/kb/pitch-telephonique.md:89 (réponse à « On a eu des mauvaises expériences »)
    'Qu’est-ce qui vous a le plus déçu ?',
    // agent_docs/kb/pitch-telephonique.md:81 (réponse à « On ne travaille pas avec des consultants »)
    'Quelles sont les raisons sous-jacentes ?',
    // agent_docs/kb/bible-sales-hacks.md:39 (§D — sur un refus, demander un retour)
    'Quel critère a bloqué ?',
  ],
}

/* ------------------------------- soutenance -------------------------------- */

/**
 * Les cinq blocs de la soutenance, dans l'ordre de l'échange.
 *
 * ⚠️ Ce ne sont PAS les familles de la découverte, et c'est le défaut du JSON
 * source, qui n'en portait que neuf — celles de l'entretien. Une soutenance ne
 * cherche pas à comprendre un besoin : il est connu. Elle cherche à se
 * positionner comme la réponse évidente, puis à obtenir un signal.
 */
export const DEFENSE_BLOCKS = [
  'project_context',
  'real_needs',
  'obvious_solution',
  'collaboration',
  'strong_close',
] as const
export const defenseBlockSchema = z.enum(DEFENSE_BLOCKS)
export type DefenseBlock = (typeof DEFENSE_BLOCKS)[number]

export const DEFENSE_QUESTIONS: Readonly<Record<DefenseBlock, readonly string[]>> = {
  project_context: [
    'Quelle est l’origine du projet et pourquoi avez-vous lancé cette recherche ?',
    'Quels sont les enjeux stratégiques de ce projet pour votre entreprise ?',
    'Quels résultats attendez-vous à court, moyen et long terme ?',
    'Quels sont les principaux défis que vous rencontrez actuellement sur ce projet ?',
    'Quel serait le scénario idéal selon vous d’ici trois à six mois ?',
  ],
  real_needs: [
    'Pourquoi cherchez-vous un intervenant externe plutôt qu’un recrutement ?',
    'Quelles compétences précises attendez-vous pour cette mission ?',
    'Quels types de livrables attendez-vous au fur et à mesure de la mission ?',
    'Y a-t-il des compétences complémentaires qui pourraient être un vrai plus ?',
    'Avez-vous déjà travaillé avec des consultants externes sur ce type de projet ?',
  ],
  obvious_solution: [
    'À quoi ressemble le candidat idéal pour cette mission selon vous ?',
    'Quels éléments vous feraient préférer un profil à un autre ?',
    'Quels sont les indicateurs sur lesquels vous évaluez la réussite de cette mission ?',
    'Quel niveau d’autonomie attendez-vous sur cette mission ?',
    'Quels types de décisions seront à prendre au quotidien ?',
  ],
  collaboration: [
    'Avec qui la personne va-t-elle travailler au quotidien ?',
    'Quels sont les outils, méthodologies ou frameworks utilisés en interne ?',
    'À quoi ressemble une semaine type sur cette mission ?',
    'Y a-t-il des contraintes spécifiques — télétravail, horaires, accès aux données, conformité ?',
    'Comment sont gérées les validations, arbitrages et interactions avec les autres équipes ?',
  ],
  strong_close: [
    'Avez-vous déjà des doutes sur le profil présenté ?',
    'Quelles sont les prochaines étapes — calendrier, décisions, processus achats ?',
    'Avez-vous des freins ou des interrogations que nous pouvons lever maintenant ?',
    'Quels sont les autres profils que vous avez rencontrés ?',
    'Si on démarrait demain, quelle serait la première mission prioritaire ?',
  ],
}

/**
 * Les trois règles de conduite d'une soutenance. Ce ne sont pas des questions :
 * ce sont les gestes qui font qu'une soutenance n'est pas un monologue.
 */
export const DEFENSE_CONDUCT_RULES: readonly string[] = [
  'Reformuler leurs réponses pour confirmer que vous avez bien compris.',
  'Partager des expériences similaires avec des résultats concrets.',
  'Les faire se projeter : « si je prends la mission, voilà ce que je propose à J+30 ».',
]

/* ---------------------------------- appel ---------------------------------- */

/** Les cinq temps d'un appel, dans l'ordre. */
export const CALL_STEPS = ['open', 'ego', 'authority', 'strategic_questions', 'close'] as const
export const callStepSchema = z.enum(CALL_STEPS)
export type CallStep = (typeof CALL_STEPS)[number]

export type CallStepGuide = {
  readonly step: CallStep
  /** Ce que ce temps de l'appel doit OBTENIR. */
  readonly goal: string
  /** Le geste concret, sans script à réciter. */
  readonly move: string
}

export const CALL_STEP_GUIDES: Readonly<Record<CallStep, CallStepGuide>> = {
  open: {
    step: 'open',
    goal: 'désamorcer et obtenir trente secondes',
    move: 'reconnaître qu’on dérange, se présenter, demander explicitement le temps',
  },
  ego: {
    step: 'ego',
    goal: 'dire pourquoi CETTE personne',
    move: 'nommer son périmètre et la raison précise de l’appeler, elle et pas une autre',
  },
  authority: {
    step: 'authority',
    goal: 'établir la crédibilité par les faits',
    move: 'citer des références réelles du même secteur, jamais une auto-description',
  },
  strategic_questions: {
    step: 'strategic_questions',
    goal: 'faire parler, pas présenter',
    move: 'deux questions ouvertes au maximum, puis se taire',
  },
  close: {
    step: 'close',
    goal: 'obtenir une action concrète',
    move: 'proposer un créneau précis et vérifier l’adresse à voix haute',
  },
}

/** La checklist d'avant-appel, en huit points. Tous se préparent AVANT de
 *  décrocher — c'est ce qui distingue un appel d'une improvisation. */
export const CALL_PREP_CHECKLIST: readonly string[] = [
  'Référencement : les noms des acheteurs et du processus achats sont identifiés.',
  'Projets identifiés : nom du projet, contexte, technologies concernées.',
  'Références prêtes : collègues connus, clients similaires, preuves sectorielles.',
  'Entités et filiales : on sait de quelle branche dépend l’interlocuteur.',
  'Profil relu : poste, ancienneté, publications récentes.',
  'Objections probables anticipées, selon le secteur et le contexte.',
  'Créneau de proposition prêt : jour, heure, lieu si sur site.',
  'CRM à jour : dernière interaction et historique des échanges précédents.',
]

/** Un appel se termine par une ACTION. « Ne jamais raccrocher sans next step »
 *  est la seule règle du document qui vaut pour les cinq temps. */
export const CALL_GOLDEN_RULE = 'Chaque appel aboutit à une action concrète : rendez-vous, envoi, ou redirection.'

/* -------------------------------- sélection -------------------------------- */

/** Les bornes de la règle de sélection. Elles vivent ici et pas dans un écran :
 *  deux écrans qui choisiraient chacun leur nombre produiraient deux outils. */
export const QUESTION_SELECTION_MIN = 3
export const QUESTION_SELECTION_MAX = 8

export type QuestionSelectionInput = {
  /** Les familles pertinentes pour ce moment, dans l'ordre de priorité. */
  readonly families: readonly string[]
  /** La banque : famille → questions. */
  readonly bank: Readonly<Record<string, readonly string[]>>
  /**
   * Les familles DÉJÀ renseignées — elles sont sautées.
   *
   * C'est la moitié qui compte : reposer une question dont on a la réponse dit à
   * l'interlocuteur qu'on n'a pas écouté la première fois, et c'est la faute la
   * plus coûteuse d'un rendez-vous de découverte.
   */
  readonly answered?: readonly string[]
  /** Combien en proposer. Ramené dans [3, 8]. */
  readonly limit?: number
}

/**
 * Sélectionne 3 à 8 questions, contextuellement.
 *
 * Déterministe : mêmes entrées, même sortie. Un tirage aléatoire donnerait deux
 * listes différentes à deux commerciaux qui préparent le même rendez-vous, et
 * rendrait impossible de dire « on avait posé celle-là ».
 *
 * Prend d'abord la PREMIÈRE question de chaque famille non renseignée — une
 * famille couverte à une question vaut mieux que trois questions d'une seule
 * famille — puis complète famille par famille jusqu'à la borne.
 *
 * ⚠️ Rend une liste VIDE quand tout est renseigné, et c'est une réponse : il n'y
 * a plus rien à demander. Retomber sur la banque entière à ce moment-là ferait
 * exactement ce que la règle interdit.
 */
export function selectQuestions(input: QuestionSelectionInput): string[] {
  const answered = new Set(input.answered ?? [])
  const open = input.families.filter(family => !answered.has(family))
  const limit = Math.max(QUESTION_SELECTION_MIN, Math.min(QUESTION_SELECTION_MAX, input.limit ?? 5))

  const picked: string[] = []
  // Premier tour : une question par famille — la couverture avant la profondeur.
  for (const family of open) {
    const question = input.bank[family]?.[0]
    if (question && picked.length < limit) picked.push(question)
  }
  // Tours suivants : on approfondit, famille par famille, dans le même ordre.
  let depth = 1
  while (picked.length < limit) {
    const before = picked.length
    for (const family of open) {
      const question = input.bank[family]?.[depth]
      if (question && picked.length < limit) picked.push(question)
    }
    if (picked.length === before) break // la banque est épuisée
    depth += 1
  }
  return picked
}
