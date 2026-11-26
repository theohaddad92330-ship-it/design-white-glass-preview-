import { z } from 'zod'

/**
 * Le registre des scénarios d'approche — LEGACY-002 du paquet de récupération.
 *
 * Quatre scénarios, définis par l'ÉTAT DE RELATION et non par le canal : on
 * n'écrit pas la même chose à quelqu'un qui vient d'accepter une connexion, à
 * un lien dormant, à une personne recommandée et à un inconnu. Ce n'est pas une
 * nuance de ton, ce sont quatre objectifs différents, quatre cadences et quatre
 * choses interdites au premier message.
 *
 * ## Ce que ce registre ne contient PAS, et pourquoi
 *
 * Le document source croise 4 scénarios × 3 personas × 3 messages = **36
 * gabarits verbatim**. Aucun n'est recopié ici. Un gabarit recopié devient un
 * message envoyé tel quel, et « envoyer le même message à tout le monde » est la
 * première des six erreurs que le document lui-même énumère. Ce qui est repris
 * est la STRUCTURE — objectif, cadence, ce qui est interdit, ce qui change selon
 * le persona — c'est-à-dire ce qu'un modèle a besoin de savoir pour écrire, et
 * ce qu'un contrôle a besoin de savoir pour vérifier.
 *
 * Les KPI historiques du document (35 % d'acceptation, 15 % de réponse au M1…)
 * ne sont pas repris non plus : ils décrivent un contexte de juin 2026 chez
 * quelqu'un d'autre, et un repère importé se lit comme un objectif.
 *
 * ## ⚑ Où vit le rythme d'une relance — la carte, écrite une fois
 *
 * Quatre tables se ressemblaient assez pour qu'on les prenne pour quatre copies
 * de la même. Elles ne le sont pas, et confondre un PLANCHER avec un CALENDRIER
 * est ce qui faisait recoder l'un à partir de l'autre. Trois survivent, chacune
 * répondant à une question différente ; la quatrième était bien une copie.
 *
 * 1. **`OUTREACH_SCENARIOS.minDelayDays` (ici) — un PLANCHER.** « Quel est le
 *    délai minimal que je REFUSE de franchir ? » Il gouverne la validation des
 *    étapes CUSTOM composées par l'appelant (`outreachMessageSpacingProblems`).
 *    Il ne planifie rien : il dit non.
 * 2. **`PATTERNS` (`apps/api/src/modules/contacts/cadence-templates.ts`) — le
 *    CALENDRIER automatique, et la SOURCE UNIQUE du rythme réel.** « À quelle
 *    date chaque touche est-elle due ? » C'est la seule table qui calcule un
 *    `due_date`, écrit `action_plan_items.cadence_step` et alimente le cron
 *    « Rappels de relance » et la carte « Mes relances ». Elle couvre les NEUF
 *    états de relation ; ce registre-ci n'en couvre que quatre. Tout ce qui
 *    ANNONCE une échéance à l'utilisateur en dérive — y compris, désormais, le
 *    prompt Python, via `relationship_playbook.CADENCE_PATTERNS` et la garde
 *    `apps/ia/tests/test_cadence_parity.py`.
 * 3. **`OUTREACH_SEQUENCE_TEMPLATES` (`outreach-sequence.ts`) — des calendriers
 *    CHOISIS.** « Quelle cadence l'utilisateur a-t-il demandée par son nom ? »
 *    Six situations qu'on sélectionne à la main. Sa divergence avec ce registre
 *    est DÉLIBÉRÉE et documentée dans `OutreachService.cadenceScenario` : un
 *    gabarit qu'on choisit par son nom est une cadence déjà tranchée, et la
 *    soumettre au scénario casserait du livré pour satisfaire une table.
 *
 * La quatrième — les jours écrits en dur dans le prompt `bellum_messages` — n'a
 * pas survécu : elle recopiait la ligne `standard` de (2) et l'appliquait aux
 * neuf états, si bien qu'un compte dormant recevait un texte annonçant « J+3 »
 * sous une échéance calculée à J+7.
 */

/* ------------------------------ les scénarios ------------------------------ */

export const OUTREACH_SCENARIO_IDS = [
  'accepted_connection',
  'dormant_connection',
  'referred_contact',
  'cold_approach',
] as const
export const outreachScenarioIdSchema = z.enum(OUTREACH_SCENARIO_IDS)
export type OutreachScenarioId = (typeof OUTREACH_SCENARIO_IDS)[number]

/** Les canaux qu'un scénario autorise. `linkedin_draft` est un BROUILLON que le
 *  commercial copie lui-même : aucune automatisation LinkedIn, jamais. */
export const OUTREACH_CHANNELS = ['linkedin_draft', 'email_draft', 'call_brief'] as const
export type OutreachChannel = (typeof OUTREACH_CHANNELS)[number]

export type OutreachScenario = {
  readonly id: OutreachScenarioId
  /** L'état de relation qui déclenche ce scénario. */
  readonly relationshipState: string
  readonly allowedChannels: readonly OutreachChannel[]
  /** Ce que la séquence cherche à obtenir — pas « vendre », l'étape d'après. */
  readonly objective: string
  readonly maxSteps: number
  /**
   * Le délai MINIMAL avant chaque pas, en jours depuis le pas précédent.
   * `minDelayDays[0]` vaut 0 : le premier pas part le jour même.
   */
  readonly minDelayDays: readonly number[]
  /** Une réponse ARRÊTE la séquence. Vrai pour les quatre — et ça se vérifie. */
  readonly stopOnReply: true
  /** Ce que le PREMIER message doit faire, et ce qu'il ne doit pas faire. */
  readonly firstStepRules: readonly string[]
}

export const OUTREACH_SCENARIOS: Readonly<Record<OutreachScenarioId, OutreachScenario>> = {
  accepted_connection: {
    id: 'accepted_connection',
    relationshipState: 'newly_connected',
    allowedChannels: ['linkedin_draft'],
    objective: 'ouvrir une conversation sans pitch',
    maxSteps: 3,
    minDelayDays: [0, 5, 7],
    stopOnReply: true,
    firstStepRules: ['remercier', 'partir d’un contexte réel', 'une question simple', 'pas de demande de RDV'],
  },
  dormant_connection: {
    id: 'dormant_connection',
    relationshipState: 'existing_no_recent_thread',
    allowedChannels: ['linkedin_draft', 'email_draft'],
    objective: 'réactiver un lien existant',
    maxSteps: 3,
    minDelayDays: [0, 5, 7],
    stopOnReply: true,
    firstStepRules: ['reconnaître le lien ancien', 'raison de reprendre contact', 'pas de fausse proximité'],
  },
  referred_contact: {
    id: 'referred_contact',
    relationshipState: 'introduced_or_referred',
    allowedChannels: ['linkedin_draft', 'email_draft', 'call_brief'],
    objective: 'transformer la recommandation en échange',
    maxSteps: 3,
    minDelayDays: [0, 4, 7],
    stopOnReply: true,
    firstStepRules: ['citer la source seulement si autorisée', 'préserver le contexte', 'question liée au projet'],
  },
  cold_approach: {
    id: 'cold_approach',
    relationshipState: 'no_relationship',
    allowedChannels: ['linkedin_draft', 'email_draft', 'call_brief'],
    objective: 'créer une raison crédible de répondre',
    maxSteps: 3,
    minDelayDays: [0, 5, 7],
    stopOnReply: true,
    firstStepRules: ['signal vérifié', 'pas de brochure', 'pas de RDV au premier message', 'aucune fausse preuve'],
  },
}

/* -------------------------------- personas --------------------------------- */

/**
 * L'axe PERSONA, que le registre source n'avait pas alors que la spécification
 * l'exige (04 §5).
 *
 * Il ne change ni l'objectif ni la cadence — il change le LEVIER. « Un CTO ne
 * réagit pas aux mêmes déclencheurs qu'un chef de projet » est le huitième point
 * de la checklist du document, et c'est la seule raison d'exister de cet axe.
 *
 * #2887 (#2371.2, moteur de classification persona × stade) — SEPT valeurs, une
 * par palier RÉEL de `classify_hierarchy_level` (`hierarchy_level.py`), pas
 * trois. Le persona était volontairement grossier (trois cases) en collapsant
 * sept paliers déjà classifiés déterministement depuis le poste — la
 * granularité existait déjà côté classification (governance/c_level/achats/
 * direction/management/expert/operationnel, tous des tests réels sur des
 * postes réels), elle était seulement jetée en aval par `personaForHierarchyLevel`.
 * Aucune donnée nouvelle, aucun signal deviné : le persona reste une PURE
 * dérivation du palier déjà produit, jamais stocké — un contact déjà en base
 * change de persona affiché au prochain calcul (prompt, contrôle avant envoi),
 * jamais par un reclassement rétroactif écrit en base.
 */
export const OUTREACH_PERSONAS = [
  'decideur',
  'gouvernance',
  'direction',
  'manager',
  'acheteur',
  'expert',
  'operationnel',
] as const
export const outreachPersonaSchema = z.enum(OUTREACH_PERSONAS)
export type OutreachPersona = (typeof OUTREACH_PERSONAS)[number]

export type OutreachPersonaProfile = {
  readonly persona: OutreachPersona
  /** Ce qui fait qu'il ouvre le message. */
  readonly lever: string
  /** L'unité dans laquelle il pense — le message doit parler dans celle-là. */
  readonly speaksIn: string
  /** Ce qui le fait décrocher immédiatement. */
  readonly turnsOff: string
}

export const OUTREACH_PERSONA_PROFILES: Readonly<Record<OutreachPersona, OutreachPersonaProfile>> = {
  decideur: {
    persona: 'decideur',
    lever: 'un arbitrage qu’il est en train de faire',
    speaksIn: 'enjeu, arbitrage, conséquence à six mois',
    turnsOff: 'le détail d’exécution, et toute forme de brochure',
  },
  /** #2887 — palier `governance` (board / conseil d'administration), séparé de
   *  `decideur` (`c_level`) : un administrateur arbitre un MANDAT, pas une
   *  décision opérationnelle. */
  gouvernance: {
    persona: 'gouvernance',
    lever: 'un enjeu de gouvernance ou de risque qu’il doit porter au conseil',
    speaksIn: 'mandat, risque, redevabilité',
    turnsOff: 'le détail opérationnel, et toute sollicitation commerciale directe',
  },
  /** #2887 — palier `direction` (directeur de fonction, rapporte au COMEX),
   *  séparé de `decideur` : un objectif de direction, pas un arbitrage
   *  d'entreprise. */
  direction: {
    persona: 'direction',
    lever: 'un objectif de sa direction pour la période en cours',
    speaksIn: 'objectif, budget de sa direction, résultat mesurable',
    turnsOff: 'le discours générique sans lien avec son périmètre',
  },
  manager: {
    persona: 'manager',
    lever: 'une contrainte d’équipe qu’il vit cette semaine',
    speaksIn: 'délai, charge, capacité à tenir un jalon',
    turnsOff: 'le discours stratégique au-dessus de son périmètre',
  },
  /** #2887 — palier `achats` (fonction achats/procurement), séparé de
   *  `manager` : un enjeu de coût contractuel, pas une contrainte d'équipe. */
  acheteur: {
    persona: 'acheteur',
    lever: 'un enjeu de coût, de contrat ou de fournisseur en cours de discussion',
    speaksIn: 'coût, conditions contractuelles, risque fournisseur',
    turnsOff: 'l’argumentaire technique sans aucun chiffrage',
  },
  /** #2887 — palier `expert` (senior/architecte, IC), séparé d'`operationnel` :
   *  un problème technique de fond, pas une pratique quotidienne. */
  expert: {
    persona: 'expert',
    lever: 'un problème technique de fond qu’il cherche à résoudre',
    speaksIn: 'architecture, choix technique, retour d’expérience',
    turnsOff: 'le discours commercial ou managérial',
  },
  operationnel: {
    persona: 'operationnel',
    lever: 'un sujet technique précis sur lequel il travaille',
    speaksIn: 'stack, pratique, ce qui marche vraiment',
    turnsOff: 'le vocabulaire commercial, sous toutes ses formes',
  },
}

/**
 * Le persona d'un contact, dérivé de son palier hiérarchique.
 *
 * #2887 — UN palier, UN persona : les sept paliers réels de
 * `classify_hierarchy_level` (Python) ont chacun leur profil désormais (voir
 * `OUTREACH_PERSONA_PROFILES`) — la classification ne collapse plus rien.
 *
 * ⚠️ Un palier `unknown` rend `null` et non `operationnel` : proposer le levier
 * d'un opérationnel à quelqu'un dont on n'a jamais vu le poste, c'est deviner.
 */
export function personaForHierarchyLevel(level: string | null | undefined): OutreachPersona | null {
  switch ((level ?? '').trim()) {
    case 'governance':
      return 'gouvernance'
    case 'c_level':
      return 'decideur'
    case 'direction':
      return 'direction'
    case 'management':
      return 'manager'
    case 'achats':
      return 'acheteur'
    case 'expert':
      return 'expert'
    case 'operationnel':
      return 'operationnel'
    default:
      return null
  }
}

/* ------------------------- les règles de rédaction ------------------------- */

/**
 * Les huit règles d'or du document source. Elles vivent ici en DONNÉE pour que
 * le prompt et le contrôle avant envoi lisent la même liste — deux listes
 * divergeraient au premier ajout, et c'est le contrôle qui perdrait.
 *
 * ⚠️ C'était une intention, pas un fait : les prompts avaient leur propre liste
 * (huit règles dans `bellum_outreach`, dix dans `bellum_messages`), et rien ne
 * les reliait à celle-ci. Le service IA est un autre processus, en Python : il
 * ne peut pas importer ce fichier. Ce que la frontière interdit d'importer, une
 * garde le vérifie — `cadence-parity.test.ts` échoue si une règle d'ici n'est
 * plus énoncée par le prompt, ou si le prompt revendique un identifiant qui
 * n'existe pas ici. **Le contrôle ne refuse jamais un message sur une règle que
 * le prompt n'a pas dite.**
 *
 * `mechanical` dit si la règle se vérifie par du code. Six le sont ; deux ne le
 * sont pas (`sequence_coherence`, `right_persona` — elles demandent de
 * comprendre un texte), et c'est écrit plutôt que contourné par une
 * approximation qui dirait « conforme » sur un message qui ne l'est pas.
 */
export type OutreachWritingRule = {
  readonly id: string
  readonly rule: string
  readonly mechanical: boolean
}

export const OUTREACH_WRITING_RULES: readonly OutreachWritingRule[] = [
  { id: 'variables_filled', rule: 'Chaque variable est remplacée par un élément réel et vérifié.', mechanical: true },
  { id: 'under_200_words', rule: 'Moins de 200 mots — un message se lit sur mobile.', mechanical: true },
  { id: 'easy_question', rule: 'La question finale se répond en une phrase.', mechanical: true },
  {
    id: 'no_esn_jargon',
    rule: 'Zéro jargon : ni « expertises reconnues », ni « méthodologie éprouvée ».',
    mechanical: true,
  },
  { id: 'no_company_in_first', rule: 'Le premier message ne mentionne pas son entreprise.', mechanical: true },
  { id: 'sequence_coherence', rule: 'Le M2 suit le M1, le M3 clôture sans répéter.', mechanical: false },
  { id: 'timing_respected', rule: 'Aucune relance avant le délai du scénario.', mechanical: true },
  { id: 'right_persona', rule: 'Le levier correspond au persona du destinataire.', mechanical: false },
  // #2123.74/.76/.78/.79 — les quatre interdits de ton du premier message. Le
  // prompt les disait déjà (`contact_specific_fact`, `no_forbidden_behaviours`,
  // « donnée historique inquiétante ») ; le contrôle avant envoi ne les
  // vérifiait pas. Ajoutés EN DERNIER : l'ordre des huit premiers est celui du
  // document source, et l'écran le suit.
  { id: 'names_real_context', rule: 'Le premier message nomme un contexte réel du dossier.', mechanical: true },
  { id: 'no_full_offer_pitch', rule: 'Le premier message ne déroule pas toute l’offre de l’ESN.', mechanical: true },
  { id: 'no_false_urgency', rule: 'Aucune urgence que le contexte ne porte pas.', mechanical: true },
  {
    id: 'no_worrying_history',
    rule: 'Le premier message n’accroche pas sur une observation historique inquiétante.',
    mechanical: true,
  },
  // #2371.7 (LAU-FINAL-086) — le C-level ne parle pas le langage du catalogue
  // technique : `PERSONA_PROFILES.decideur.turnsOff` le dit déjà en prose
  // ("le détail d'exécution"), cette règle le rend mécaniquement vérifiable.
  {
    id: 'no_tech_catalogue_for_decision_maker',
    rule: 'Le décideur ne reçoit pas un catalogue de technologies.',
    mechanical: true,
  },
  // #2372.6 (LAU-FINAL-087, « ASSET UTILE ») — un document utile (analyse,
  // retour d'expérience, checklist, benchmark) s'ANNONCE ; il ne part qu'après
  // un intérêt confirmé, donc jamais joint à un message de séquence.
  {
    id: 'asset_after_interest',
    rule: 'Un document utile s’annonce ; il n’est envoyé qu’après un intérêt confirmé.',
    mechanical: true,
  },
]

/**
 * Les six erreurs qui tuent le taux de réponse (p.5 du document source).
 *
 * Quatre alimentent un contrôle mécanique, deux n'en alimentent aucun : « ne pas
 * avoir lu le profil avant d'écrire » ne se vérifie pas depuis un texte, et
 * « abandonner après un silence au M1 » est une règle de SÉQUENCE — elle vit
 * dans `maxSteps`, pas dans une relecture de message.
 */
export const OUTREACH_KILLER_MISTAKES: readonly { readonly id: string; readonly mistake: string }[] = [
  { id: 'same_message_to_everyone', mistake: 'Envoyer le même message à tout le monde.' },
  { id: 'self_before_other', mistake: 'Parler de soi avant de parler de l’autre.' },
  { id: 'meeting_in_first_message', mistake: 'Demander un rendez-vous dès le premier message.' },
  { id: 'empty_follow_up', mistake: 'Relancer avec « juste un petit follow-up ».' },
  { id: 'wrote_without_reading', mistake: 'Écrire sans avoir lu le profil.' },
  { id: 'gave_up_after_m1', mistake: 'Abandonner après un silence au M1.' },
]

/* -------------------------------- résolution ------------------------------- */

/**
 * Le scénario qui correspond à un état de relation de compte.
 *
 * Rend `null` pour un état qu'aucun scénario ne couvre — les neuf états de
 * relation du produit ne se réduisent pas aux quatre du document, et forcer une
 * correspondance approximative ferait appliquer la cadence d'un inconnu à un
 * client actif.
 */
export function scenarioForRelationship(state: string | null | undefined): OutreachScenario | null {
  switch ((state ?? '').trim()) {
    case 'linkedin':
      return OUTREACH_SCENARIOS.accepted_connection
    case 'dormant':
    case 'ancien_client':
      return OUTREACH_SCENARIOS.dormant_connection
    case 'refere':
      return OUTREACH_SCENARIOS.referred_contact
    case 'froid':
      return OUTREACH_SCENARIOS.cold_approach
    default:
      return null
  }
}

/**
 * Le délai minimal, en jours, avant le pas d'indice `position`.
 *
 * Au-delà de la cadence déclarée, le dernier délai connu s'applique — une
 * séquence plus longue que son scénario ne doit pas retomber à zéro sur son
 * cinquième pas.
 */
export function minDelayBeforeStep(scenario: OutreachScenario, position: number): number {
  if (position <= 0) return 0
  const delays = scenario.minDelayDays
  return delays[position] ?? delays[delays.length - 1] ?? 0
}
