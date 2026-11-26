/**
 * La GRILLE de qualification de Laura Site et ce qui en découle — §4.6 et §4.9
 * du PDF 10 (ticket BEL-LAU-903).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS PROPRIÉTÉS, ET CHACUNE RÉPARE UN DÉFAUT DU TRANSCRIPT TEST
 * ─────────────────────────────────────────────────────────────────────────
 *
 * 1. **Déterministe.** Un modèle qui noterait le même visiteur différemment d'un
 *    tour à l'autre lui proposerait tantôt un créneau, tantôt une documentation,
 *    sans que personne puisse dire pourquoi.
 *
 * 2. **Interne, et pas seulement invisible.** Le §4.6 ajoute une règle que la
 *    version précédente n'avait pas : le score n'est « jamais montré, jamais
 *    mentionné, **jamais déductible d'une formulation** ». C'est pour ça que le
 *    prompt ne reçoit pas le nombre, ni même le nom du palier, mais une POSTURE
 *    nommée par ce que Laura fait — `engage`, `guide`, `inform`, `be_honest`.
 *    « Tu es un lead tiède » se devine ; « je te montre la démo » ne se devine
 *    pas.
 *
 * 3. **Branchée.** C'est le défaut n°14 du PDF, et le plus coûteux : la grille
 *    précédente était juste, testée — et n'atteignait jamais le modèle. Elle ne
 *    servait qu'à choisir un bouton. `promptState` est la fonction qui la relie
 *    à la conversation ; sans elle, tout ce fichier est décoratif.
 *
 * ⚠️ **Le §4.6 annonce « 30 points » et ses propres tables en font 32.** On
 * garde les valeurs des tables (ce sont elles qui décident) et `MAX_SCORE` est
 * CALCULÉ, jamais écrit à la main : un total recopié diverge du barème le jour
 * où quelqu'un ajuste une ligne. Les paliers sont des seuils absolus, la
 * différence ne change donc aucun comportement.
 */

/* ------------------------------------------------------------------ */
/*  Les huit axes                                                      */
/* ------------------------------------------------------------------ */

export const COMPANY_TYPES = ['esn', 'staffing', 'recruitment', 'internal_sales', 'other'] as const
type CompanyType = (typeof COMPANY_TYPES)[number]

/** Le nombre de CONSULTANTS, pas de commerciaux — c'est la question du §4.6
 *  (« Vous êtes combien de consultants ? »). Une ESN de 16 à 150 est le cœur de
 *  cible : en dessous le besoin existe mais le budget rarement, au-dessus les
 *  achats passent par un référencement que Laura ne débloque pas. */
export const TEAM_SIZES = ['1', '2-5', '6-15', '16-150', '150+'] as const
type TeamSize = (typeof TEAM_SIZES)[number]

export const PERSONAS = ['founder', 'sales_director', 'business_manager', 'recruiter', 'ops', 'other'] as const
type Persona = (typeof PERSONAS)[number]

/** À quel point la douleur nommée est couverte. Trois niveaux et non un
 *  booléen : une douleur ADJACENTE est un vrai signal d'achat, elle ne vaut
 *  simplement pas une douleur que le produit traite de front. */
export const PAIN_FITS = ['covered', 'adjacent', 'uncovered'] as const
type PainFit = (typeof PAIN_FITS)[number]

export const TOOLINGS = ['excel_or_none', 'generic_crm', 'esn_erp', 'direct_competitor'] as const
type Tooling = (typeof TOOLINGS)[number]

export const TRIGGERS = ['funded_project', 'acute_problem', 'active_watch', 'curiosity'] as const
type Trigger = (typeof TRIGGERS)[number]

export const DECISION_POWERS = ['decider', 'prescriber', 'influencer', 'none'] as const
type DecisionPower = (typeof DECISION_POWERS)[number]

export const HORIZONS = ['this_quarter', 'this_semester', 'no_date'] as const
type Horizon = (typeof HORIZONS)[number]

/** Comment Laura s'adresse au visiteur. Le site tutoie partout, comme le reste
 *  du produit : le défaut est donc `tu`, et on ne le DEMANDE pas — on bascule au
 *  vouvoiement quand la personne vouvoie, ou dans un contexte qui l'appelle. */
export const ADDRESS_FORMS = ['tu', 'vous'] as const
type AddressForm = (typeof ADDRESS_FORMS)[number]

/**
 * Ce que la session sait du visiteur.
 *
 * Tout est optionnel, et c'est la règle du §4.6 qui compte le plus : une
 * information ABSENTE vaut zéro, jamais une pénalité. Un visiteur qui n'a pas
 * répondu n'est pas un mauvais visiteur, c'est un visiteur qu'on n'a pas encore
 * qualifié — et pénaliser le silence pousse à interroger au lieu d'aider.
 */
export type LeadState = {
  companyType?: CompanyType
  teamSize?: TeamSize
  persona?: Persona
  /** Le besoin dans les mots du visiteur — cité, jamais noté tel quel. */
  pain?: string
  painFit?: PainFit
  tooling?: Tooling
  trigger?: Trigger
  decision?: DecisionPower
  horizon?: Horizon

  /* — mémoire de conversation : jamais notée, jamais dans le score — */

  /** Le prénom, s'il a été donné. Réutilisé, pas à chaque phrase. */
  firstName?: string
  addressForm?: AddressForm
  /** Combien de fois le visiteur a demandé un rendez-vous. Compté par le
   *  SERVEUR à partir de l'intention explicite : « demandé deux fois » est un
   *  fait de conversation, pas une appréciation du modèle. */
  bookRequests?: number
}

/** Les huit axes du barème, dans l'ordre du §4.6. */
export const SCORING_AXES = [
  'companyType',
  'teamSize',
  'persona',
  'painFit',
  'tooling',
  'trigger',
  'decision',
  'horizon',
] as const
export type ScoringAxis = (typeof SCORING_AXES)[number]

/** Le barème, recopié du §4.6 — une table et non des `if`, pour que le total
 *  maximal se calcule au lieu de se déclarer. */
const POINTS: { readonly [A in ScoringAxis]: Readonly<Record<string, number>> } = {
  companyType: { esn: 4, staffing: 3, recruitment: 2, internal_sales: 1, other: 0 },
  teamSize: { '16-150': 4, '6-15': 3, '150+': 2, '2-5': 2, '1': 1 },
  persona: { founder: 4, sales_director: 3, business_manager: 2, recruiter: 2, ops: 2, other: 1 },
  painFit: { covered: 5, adjacent: 3, uncovered: 1 },
  tooling: { excel_or_none: 4, generic_crm: 3, esn_erp: 2, direct_competitor: 2 },
  trigger: { funded_project: 5, acute_problem: 4, active_watch: 2, curiosity: 1 },
  decision: { decider: 3, prescriber: 2, influencer: 1, none: 0 },
  horizon: { this_quarter: 3, this_semester: 2, no_date: 1 },
}

/** Le total maximal atteignable — dérivé du barème, jamais écrit à la main. */
export const MAX_SCORE = SCORING_AXES.reduce((total, axis) => total + Math.max(...Object.values(POINTS[axis])), 0)

/* ------------------------------------------------------------------ */
/*  Le score et les paliers                                            */
/* ------------------------------------------------------------------ */

/** Les paliers du §4.6. Bornes basses, du plus chaud au plus froid. */
export const HOT_FROM = 20
export const WARM_FROM = 12
export const COLD_FROM = 6

/**
 * Ce que Laura FAIT, et non ce que le visiteur VAUT.
 *
 * Le nom est délibéré. Cette valeur traverse la frontière jusqu'au prompt ;
 * l'appeler `hot` / `warm` reviendrait à écrire le palier dans le contexte du
 * modèle, qui finirait par le laisser transparaître — exactement ce que la
 * règle ajoutée du §4.6 interdit.
 */
export const STANCES = ['engage', 'guide', 'inform', 'be_honest'] as const
type Stance = (typeof STANCES)[number]

export function scoreLead(state: LeadState): number {
  let score = 0
  for (const axis of SCORING_AXES) {
    const value = state[axis]
    if (typeof value !== 'string') continue
    score += POINTS[axis][value] ?? 0
  }
  return score
}

/** Combien d'axes du barème sont renseignés — la 2ᵉ condition du §4.6. */
export function answeredAxes(state: LeadState): ScoringAxis[] {
  return SCORING_AXES.filter(axis => typeof state[axis] === 'string' && String(state[axis]).length > 0)
}

export function stanceFor(score: number): Stance {
  if (score >= HOT_FROM) return 'engage'
  if (score >= WARM_FROM) return 'guide'
  if (score >= COLD_FROM) return 'inform'
  return 'be_honest'
}

/* ------------------------------------------------------------------ */
/*  Le déblocage du contact humain — §4.6 et §4.9                      */
/* ------------------------------------------------------------------ */

type UnlockContext = {
  state: LeadState
  /** Le visiteur a-t-il demandé un rendez-vous à ce tour ? */
  booking: boolean
  /** Nombre de messages VISITEUR dans la conversation. */
  exchanges: number
}

type BookingVerdict = {
  /** Le lien peut-il partir maintenant ? */
  unlocked: boolean
  /**
   * Pourquoi. `qualified` = les trois conditions sont réunies ; `insisted` = le
   * visiteur a redemandé, et le §4.9 est catégorique — « retenir, c'est
   * perdre » ; `ask_first` = une question AVANT le lien, mais le lien vient au
   * tour suivant quelle que soit la réponse.
   */
  reason: 'qualified' | 'insisted' | 'ask_first' | 'not_requested'
}

/**
 * Le lien de rendez-vous sort-il ?
 *
 * Le défaut n°7 du transcript est le plus coûteux du document : le lien tombait
 * au premier « je veux un rdv », sans savoir à qui on parlait. Il ne tombe plus
 * qu'à trois conditions cumulées — score suffisant OU insistance, trois axes
 * renseignés, trois échanges — et l'insistance passe outre les deux autres,
 * parce qu'on ne retient JAMAIS un lien plus d'un tour.
 */
export function bookingVerdict(context: UnlockContext): BookingVerdict {
  if (!context.booking) return { unlocked: false, reason: 'not_requested' }
  // Redemandé : le lien tombe, sans condition. Le §4.9 le pose comme une règle
  // absolue, et elle prime sur la qualification — un visiteur qui insiste a
  // déjà dit tout ce qu'on voulait savoir de son intention.
  if ((context.state.bookRequests ?? 0) >= 2) return { unlocked: true, reason: 'insisted' }

  const qualified =
    scoreLead(context.state) >= WARM_FROM && answeredAxes(context.state).length >= 3 && context.exchanges >= 3
  return qualified ? { unlocked: true, reason: 'qualified' } : { unlocked: false, reason: 'ask_first' }
}

/* ------------------------------------------------------------------ */
/*  La route — quel bouton proposer                                    */
/* ------------------------------------------------------------------ */

/** Les intentions EXPLICITES qui court-circuitent la qualification. */
export type ExplicitIntent = 'book' | 'demo' | 'signup' | 'existing_customer' | 'bug' | 'press' | 'candidate' | null

export type Route = 'calendly' | 'demo' | 'signup' | 'support' | 'human' | 'resource'

/**
 * Où mener ce visiteur.
 *
 * L'intention explicite gagne toujours — sauf pour le rendez-vous, et c'est le
 * seul changement de fond depuis la version précédente. « Je veux la démo » ou
 * « je veux créer un compte » sont des gestes que retenir n'apporte rien ;
 * « je veux un rendez-vous » engage le temps de quelqu'un d'autre, et le donner
 * à un inconnu qui vient de dire « t'es trop cher » ne remplit qu'un agenda.
 */
export function resolveRoute(state: LeadState, explicit: ExplicitIntent, booking?: BookingVerdict): Route {
  if (explicit === 'demo') return 'demo'
  if (explicit === 'signup') return 'signup'
  if (explicit === 'existing_customer' || explicit === 'bug') return 'support'
  if (explicit === 'press' || explicit === 'candidate') return 'human'
  if (explicit === 'book') return booking?.unlocked ? 'calendly' : 'demo'

  switch (stanceFor(scoreLead(state))) {
    case 'engage':
      return 'calendly'
    case 'guide':
      return 'demo'
    default:
      return 'resource'
  }
}

/* ------------------------------------------------------------------ */
/*  La question suivante                                               */
/* ------------------------------------------------------------------ */

/**
 * L'ordre de priorité du §4.13 — ce qu'on cherche à savoir, dans cet ordre.
 *
 * Il n'est PAS l'ordre du barème : on demande la douleur en deuxième et le
 * déclencheur avant l'horizon, parce qu'une conversation qui commence par
 * « vous êtes combien ? » est un formulaire. Le barème classe, cet ordre-là
 * converse.
 */
export const QUESTION_ORDER: readonly ScoringAxis[] = [
  'companyType',
  'painFit',
  'persona',
  'decision',
  'teamSize',
  'tooling',
  'trigger',
  'horizon',
]

/** Le plafond du §4.13 : « tu ne poses jamais plus de 6 questions dans toute la
 *  conversation. Au-delà, tu recommandes, tu ne demandes plus. » */
export const MAX_QUESTIONS = 6

/**
 * L'axe non renseigné le plus prioritaire, ou `null` quand il n'y a plus rien à
 * demander — soit tout est connu, soit on a atteint le plafond.
 *
 * ⚠️ La version précédente de cette fonction n'avait **aucun appelant hors son
 * propre test**. C'est le défaut n°13 du PDF, et la famille de défauts que ce
 * dépôt corrige depuis six chantiers : du code conforme, testé, que rien
 * n'appelle. `promptState` ci-dessous est son appelant.
 */
export function nextQuestion(state: LeadState): ScoringAxis | null {
  if (answeredAxes(state).length >= MAX_QUESTIONS) return null
  return QUESTION_ORDER.find(axis => typeof state[axis] !== 'string') ?? null
}

/* ------------------------------------------------------------------ */
/*  Ce que le prompt reçoit                                            */
/* ------------------------------------------------------------------ */

export type PromptState = {
  /** Ce que la conversation a appris, en clair. Jamais le score. */
  known: Partial<Record<ScoringAxis | 'pain', string>>
  /** Les axes déjà couverts — pour ne jamais reposer la même question. */
  asked: ScoringAxis[]
  /** L'axe à explorer maintenant, ou `null` : on recommande, on ne demande plus. */
  next: ScoringAxis | null
  stance: Stance
  bookingUnlocked: boolean
  addressForm: AddressForm
  firstName?: string
  exchanges: number
}

/**
 * Le pont entre la grille et le modèle — la fonction qui manquait.
 *
 * Elle rend tout ce dont le prompt a besoin et RIEN de ce qu'il ne doit pas
 * savoir : ni le score, ni le palier, ni le barème. Un modèle à qui l'on
 * donnerait « 17/32 » finirait par écrire « tu es un bon prospect », et le §4.6
 * l'interdit en toutes lettres.
 */
export function promptState(context: UnlockContext): PromptState {
  const { state } = context
  const known: PromptState['known'] = {}
  for (const axis of SCORING_AXES) {
    const value = state[axis]
    if (typeof value === 'string' && value) known[axis] = value
  }
  if (state.pain) known.pain = state.pain

  return {
    known,
    asked: answeredAxes(state),
    next: nextQuestion(state),
    stance: stanceFor(scoreLead(state)),
    bookingUnlocked: bookingVerdict(context).unlocked,
    addressForm: state.addressForm ?? 'tu',
    ...(state.firstName ? { firstName: state.firstName } : {}),
    exchanges: context.exchanges,
  }
}
