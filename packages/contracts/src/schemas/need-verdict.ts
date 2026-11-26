import { z } from 'zod'
import { MIN_AXES_FOR_SCORE } from './mission-scores.js'
import { accountStrategy5PReadinessSchema, ACCOUNT_STRATEGY_5P_DIMENSIONS } from './account-strategy-5p.js'
import { commercialMethodChoiceSchema } from './commercial-method-engine.js'
import { matchInClearSchema } from './match-in-clear.js'

/**
 * LE VERDICT « GO / NO-GO » D'UN BESOIN — six axes, trois issues, zéro modèle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * Le dépôt portait déjà DEUX moitiés de cette question, et aucune ne parlait à
 * l'autre :
 *
 *  - `staffable-gate.ts` (la porte G3, PDF 2 §7.6) porte les TROIS ISSUES —
 *    `yes` / `no` / `unknown` — mais elles sont posées à la MAIN par un humain,
 *    sans un seul axe. Rien ne dit POURQUOI ;
 *  - `consultants/matching/axes.ts` porte DOUZE AXES déterministes et sait déjà
 *    sortir un axe non évaluable du dénominateur — mais il classe des
 *    PERSONNES, pas des besoins. Il répond à « qui présenter ? », jamais à
 *    « faut-il y aller ? ».
 *
 * Ce fichier est le pont. Il n'invente aucun moteur : il applique la MÊME
 * discipline (un axe non évaluable sort du dénominateur, ce qui manque est
 * NOMMÉ, rien n'est deviné) à l'objet BESOIN, et rend une décision que la porte
 * G3 continue de trancher — voir « la porte humaine ne disparaît pas », plus
 * bas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ AUCUNE PROBABILITÉ — ET AUCUN SCORE NON PLUS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le refus de la probabilité a été prononcé six fois (registre `c26_probabilite`,
 * garde GA-64). Ce fichier va une marche plus loin et ne rend AUCUN NOMBRE
 * agrégé du tout : pas de « fit », pas de note sur 100, pas de pourcentage.
 *
 * La raison est celle que GA-64 nomme comme sa propre limite : « elle ne peut
 * pas dire qu'un `fit_score` de 0 à 100 est présenté comme une chance de
 * signer — “0,72” ne dit pas de lui-même s'il est une part ou une chance ».
 * Un verdict go/no-go accompagné d'un « 78 » serait lu comme une chance, quoi
 * qu'on écrive à côté. Ce qui sort d'ici est donc entièrement QUALITATIF : des
 * états nommés, et des COMPTES d'axes — qui sont vrais tout seuls.
 *
 * C'est aussi pourquoi le poids d'un axe ({@link NEED_VERDICT_AXIS_WEIGHTS}) est
 * un MOT et non un coefficient. Un coefficient qui ne multiplie rien est une
 * décoration ; celui-ci décide vraiment de quelque chose — un axe `decisive`
 * peut dire non, un axe `advisory` ne le peut jamais.
 *
 * La carte « Laura te recommande » du même écran ne porte plus aucun taux
 * (#3486, 01/10/2026) : ce verdict est son unique source de profils.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ LA RÈGLE QUI COMPTE LE PLUS : UNE IGNORANCE N'EST PAS UNE PROMESSE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Un axe non mesuré sort du dénominateur » est la doctrine du dépôt, et elle
 * vaut pour un SCORE. Appliquée telle quelle à un VERDICT, elle transforme une
 * ignorance en promesse — c'est exactement le défaut corrigé dans
 * `discoverFamily` (`access.ts`) après la recette live du 22/08 : un compte noté
 * sur la seule proportion sortait « rien ne semble bloquer l'entrée » alors que
 * personne n'avait regardé la porte.
 *
 * Les deux règles cohabitent donc ici, et elles ne se contredisent pas :
 *
 *  - un axe non renseigné SORT du décompte (`measuredCount`), il ne vaut ni
 *    zéro ni « attention ». Il est NOMMÉ dans {@link NeedVerdict.unmeasuredAxes} ;
 *  - et un OUI exige que les deux axes DÉCISIFS aient été RENSEIGNÉS. Ne pas
 *    savoir si l'on peut staffer n'autorise pas à dire « fais-le ». Le verdict
 *    devient alors « je manque de données », qui est une réponse à part entière.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PORTE HUMAINE NE DISPARAÎT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce verdict PROPOSE. `staffableGateEffect` (`staffable-gate.ts`) reste la seule
 * chose qui DÉCIDE : elle fait avancer le besoin, elle le clôt, ou elle ne
 * bouge rien. Un contournement humain se journalise (`staffable_reason`,
 * `GET /projects/needs/:id/history`) — « une correction humaine gagne toujours ».
 */

/* ------------------------------------------------------------------ */
/* Les six axes (SOL6 §« Deterministic verdict »)                      */
/* ------------------------------------------------------------------ */

/**
 * Les six axes, dans l'ordre de la maquette.
 *
 * ⚠️ Liste ORDONNÉE et APPEND-ONLY (GA-08) : une valeur n'en disparaît jamais
 * et ne s'insère jamais au milieu — elle s'ajoute à la fin.
 */
export const NEED_VERDICT_AXES = [
  /** Y a-t-il quelqu'un à présenter ? */
  'staffing_capacity',
  /** Le vend-on au-dessus de notre plancher ? */
  'economics',
  /** Ce client nous connaît-il déjà ? */
  'relationship',
  /** Combien de fournisseurs en face ? */
  'competition',
  /** Le démarrage demandé est-il tenable ? */
  'feasibility',
  /** Sait-on par qui la décision passe ? */
  'access',
  /** #3389.9 — Les achats sont-ils dans la boucle ? (cadre d'achat) */
  'procurement',
  /** #3389.10 — Le projet porte-t-il un risque contractuel déclaré ? */
  'contract_risk',
] as const
export const needVerdictAxisSchema = z.enum(NEED_VERDICT_AXES)
export type NeedVerdictAxis = (typeof NEED_VERDICT_AXES)[number]

/**
 * Le POIDS d'un axe — un mot, pas un coefficient.
 *
 * `decisive` : cet axe peut, à lui seul, faire répondre NON. Ils sont deux, et
 * il n'y a pas de troisième candidat honnête — on ne vend personne, et on ne
 * vend pas sous son plancher. Les deux sont des faits arithmétiques, pas des
 * appréciations.
 *
 * `advisory` : cet axe se DIT, il n'écarte jamais. Une concurrence dense, un
 * logo neuf, un démarrage tendu, un décideur non identifié : ce sont les
 * difficultés du métier, pas des motifs de refus. Les traiter en bloquants
 * ferait décliner exactement les affaires qu'un commercial gagne en travaillant.
 */
export const NEED_VERDICT_AXIS_WEIGHTS: Readonly<Record<NeedVerdictAxis, 'decisive' | 'advisory'>> = {
  staffing_capacity: 'decisive',
  economics: 'decisive',
  relationship: 'advisory',
  competition: 'advisory',
  feasibility: 'advisory',
  access: 'advisory',
  // #3389.9/.10 — ils se DISENT, ils n'écartent jamais : un passage par les
  // achats ou un risque déclaré se négocie, ce n'est pas un motif de refus.
  procurement: 'advisory',
  contract_risk: 'advisory',
}

/** Les axes qui peuvent dire NON, dans l'ordre de {@link NEED_VERDICT_AXES}. */
export const NEED_VERDICT_DECISIVE_AXES: readonly NeedVerdictAxis[] = NEED_VERDICT_AXES.filter(
  axis => NEED_VERDICT_AXIS_WEIGHTS[axis] === 'decisive',
)

/**
 * L'état d'un axe RENSEIGNÉ.
 *
 * ⚠️ « non renseigné » n'en fait PAS partie, et c'est tout le point : il
 * s'écrit `state: null`, ce qui le sort du décompte au lieu de lui donner une
 * couleur. Le ranger ici en quatrième valeur le ferait compter comme un état,
 * donc peser — la faute que la doctrine nomme « le score mesure la complétude
 * de nos données ».
 */
export const NEED_VERDICT_AXIS_STATES = ['positive', 'attention', 'blocking'] as const
export const needVerdictAxisStateSchema = z.enum(NEED_VERDICT_AXIS_STATES)
export type NeedVerdictAxisState = (typeof NEED_VERDICT_AXIS_STATES)[number]

/**
 * Les trois issues (SOL6). `insufficient_data` n'est pas un échec de calcul :
 * c'est la réponse honnête quand on ne sait pas, et elle mène à un geste
 * différent des deux autres — aller chercher ce qui manque.
 */
export const NEED_VERDICTS = ['go', 'no_go', 'insufficient_data'] as const
export const needVerdictKindSchema = z.enum(NEED_VERDICTS)
export type NeedVerdictKind = (typeof NEED_VERDICTS)[number]

/**
 * Ce qui a été MESURÉ sur un axe, en CHIFFRES et non en phrase.
 *
 * Une union discriminée par l'axe : chaque axe rend ses propres grandeurs. Le
 * libellé se compose à l'écran, à partir de ces nombres et des traductions —
 * jamais ici. Un contrat qui rendrait « 3 profils » en français figerait la
 * langue du produit dans le serveur, et la garde de parité FR/EN ne pourrait
 * plus rien en dire.
 */
export const needVerdictMeasureSchema = z.union([
  z.object({ count: z.number().int().min(0), threshold: z.number().int().min(0).max(100) }),
  z.object({ targetRateCents: z.number().int(), floorRateCents: z.number().int() }),
  z.object({ activeMissions: z.number().int().min(0) }),
  z.object({ competitors: z.number().int().min(0) }),
  z.object({ availabilityScore: z.number().int().min(0).max(100), startOn: z.string() }),
  z.object({
    contacts: z.number().int().min(0),
    decisionMaker: z.boolean(),
    /** #3389.8 — l'accès ORGANISATIONNEL du compte (verrou daté). Absent quand il est inconnu : on ne l'invente pas. */
    lock: z.enum(['ouvert', 'semi_ouvert', 'verrouille']).optional(),
  }),
  z.object({ procurementInvolved: z.boolean() }),
  z.object({ riskDeclared: z.literal(true) }),
])
export type NeedVerdictMeasure = z.infer<typeof needVerdictMeasureSchema>

export const needVerdictAxisResultSchema = z.object({
  axis: needVerdictAxisSchema,
  /** `null` = axe NON RENSEIGNÉ. Il sort du décompte ; il ne vaut pas zéro. */
  state: needVerdictAxisStateSchema.nullable(),
  weight: z.enum(['decisive', 'advisory']),
  /** Les grandeurs mesurées. `null` exactement quand `state` est `null`. */
  measured: needVerdictMeasureSchema.nullable(),
  /**
   * POURQUOI l'axe n'a pas pu être évalué — une clé de traduction, pas une
   * phrase. Non nulle exactement quand `state` est `null` : « trois axes non
   * évaluables » n'apprend rien, « le panel fournisseurs n'a jamais été
   * regardé » dit quoi compléter.
   */
  unmeasured: z.string().nullable(),
})
export type NeedVerdictAxisResult = z.infer<typeof needVerdictAxisResultSchema>

export const needVerdictSchema = z.object({
  verdict: needVerdictKindSchema,
  /** Tous les axes, toujours — un axe non renseigné se montre, il ne se cache pas. */
  axes: z.array(needVerdictAxisResultSchema).length(NEED_VERDICT_AXES.length),
  /** Le dénominateur, AFFICHÉ : « 6 axes · 5 renseignés · 1 attention ». */
  axisCount: z.number().int().min(0),
  measuredCount: z.number().int().min(0),
  attentionCount: z.number().int().min(0),
  /** Ce qui n'a pas pu être évalué, NOMMÉ. */
  unmeasuredAxes: z.array(needVerdictAxisSchema),
  /** Le sous-ensemble qui interdit de conclure « fais-le ». */
  unmeasuredDecisiveAxes: z.array(needVerdictAxisSchema),
  blockingAxes: z.array(needVerdictAxisSchema),
})
export type NeedVerdict = z.infer<typeof needVerdictSchema>

/* ------------------------------------------------------------------ */
/* Les six constructeurs — un par axe, tous déterministes              */
/* ------------------------------------------------------------------ */

function axisResult(
  axis: NeedVerdictAxis,
  state: NeedVerdictAxisState,
  measured: NeedVerdictMeasure,
): NeedVerdictAxisResult {
  return { axis, state, weight: NEED_VERDICT_AXIS_WEIGHTS[axis], measured, unmeasured: null }
}

/** L'axe qu'on n'a pas pu évaluer, avec la RAISON — jamais un axe muet. */
function axisUnmeasured(axis: NeedVerdictAxis, reason: string): NeedVerdictAxisResult {
  return { axis, state: null, weight: NEED_VERDICT_AXIS_WEIGHTS[axis], measured: null, unmeasured: reason }
}

/**
 * Axe 1 — CAPACITÉ À STAFFER. « Combien de profils passent le seuil ? »
 *
 * `aboveThreshold` est le compte du bloc `recommended` d'un rapprochement,
 * c'est-à-dire les profils dont le score de correspondance atteint le seuil de
 * l'espace (`MATCH_DEFAULT_THRESHOLD`, 60 par défaut). On ne recompte rien : le
 * moteur des douze axes l'a déjà fait, et une seconde règle de sélection
 * divergerait de l'écran de rapprochement dès le premier réglage de seuil.
 *
 * ⚠️ ZÉRO ÉVALUÉ N'EST PAS ZÉRO RETENU. « Personne ne passe le seuil » est un
 * fait qui bloque ; « personne n'a été évalué » est une question qu'on n'a pas
 * posée — c'est le cas d'un besoin sans compétence saisie, sur lequel le
 * rapprochement REFUSE de se lancer (`NeedMatchTab`, `launch.noSkills`). Les
 * confondre ferait dire « on ne sait pas faire » de ce que personne n'a regardé.
 */
export function needStaffingCapacityAxis(input: {
  /** Profils au seuil ou au-dessus. `null` = aucun rapprochement lisible. */
  aboveThreshold: number | null
  threshold: number
  /** Profils réellement passés par les axes. `0` = la question n'a pas été posée. */
  evaluated: number | null
}): NeedVerdictAxisResult {
  const { aboveThreshold, threshold, evaluated } = input
  if (aboveThreshold === null || evaluated === null) {
    return axisUnmeasured('staffing_capacity', 'noRun')
  }
  if (evaluated === 0) return axisUnmeasured('staffing_capacity', 'nobodyEvaluated')
  return axisResult('staffing_capacity', aboveThreshold === 0 ? 'blocking' : 'positive', {
    count: aboveThreshold,
    threshold,
  })
}

/**
 * Axe 2 — ÉCONOMIE. « Le TJM cible tient-il notre plancher ? »
 *
 * Les deux chiffres existent déjà côte à côte sur un besoin
 * (`target_tjm_cents` et `min_tjm_cents`, « le PLANCHER acceptable — ce en
 * dessous de quoi on ne descend pas »). La comparaison est arithmétique : rien
 * n'est estimé, aucune marge n'est reconstituée.
 *
 * ⚠️ Ni l'un ni l'autre ne se déduit de `budget_cents` : « budget ÷ jours » est
 * le calcul explicitement refusé sur cette fiche (il varierait selon qu'on
 * compte vingt ou vingt-et-un jours par mois). Un plancher absent laisse donc
 * l'axe NON RENSEIGNÉ, il ne s'invente pas.
 *
 * L'égalité passe : un plancher est acceptable par définition, sinon ce serait
 * un seuil d'exclusion et il porterait un autre nom.
 */
export function needEconomicsAxis(input: {
  targetRateCents: number | null
  floorRateCents: number | null
}): NeedVerdictAxisResult {
  const { targetRateCents, floorRateCents } = input
  if (targetRateCents === null) return axisUnmeasured('economics', 'noTargetRate')
  if (floorRateCents === null) return axisUnmeasured('economics', 'noFloorRate')
  return axisResult('economics', targetRateCents >= floorRateCents ? 'positive' : 'blocking', {
    targetRateCents,
    floorRateCents,
  })
}

/**
 * Axe 3 — RELATION. « Ce client nous connaît-il déjà ? »
 *
 * Le compte des missions EN COURS chez ce compte. Zéro est une VRAIE réponse
 * ici — la requête a compté, elle n'a rien trouvé — et c'est une ATTENTION, pas
 * un refus : un logo neuf est un besoin plus dur, jamais un mauvais besoin. Le
 * traiter en bloquant ferait décliner toute conquête, ce qui est le contraire
 * du produit.
 *
 * Sans compte rattaché, il n'y a pas de relation à mesurer : l'axe sort.
 */
export function needRelationshipAxis(input: {
  activeMissions: number | null
  accountKnown: boolean
}): NeedVerdictAxisResult {
  const { activeMissions, accountKnown } = input
  if (!accountKnown || activeMissions === null) return axisUnmeasured('relationship', 'noAccount')
  return axisResult('relationship', activeMissions > 0 ? 'positive' : 'attention', { activeMissions })
}

/**
 * Axe 4 — CONCURRENCE. « Combien de fournisseurs en face ? »
 *
 * Le compte des partenaires du compte marqués CONCURRENTS
 * (`account_partners.relationship = 'competitor'`). Un fournisseur en face n'a
 * jamais interdit de répondre — c'est le quotidien d'une ESN — donc l'axe est
 * `advisory` et son état plafonne à `attention`.
 *
 * ⚠️ « Personne en face » et « personne n'a regardé » sont deux choses, et c'est
 * la distinction que porte `panelLooked`. La règle est celle d'`access.ts` :
 * « on ne sait pas si ce compte est référencé » et « ce compte est ouvert »
 * mènent à deux gestes opposés. Un panel jamais renseigné laisse donc l'axe
 * hors du décompte, il ne rend pas un « zéro concurrent » rassurant et faux.
 */
export function needCompetitionAxis(input: {
  competitorsOnAccount: number | null
  panelLooked: boolean
}): NeedVerdictAxisResult {
  const { competitorsOnAccount, panelLooked } = input
  if (!panelLooked || competitorsOnAccount === null) return axisUnmeasured('competition', 'panelNeverLooked')
  return axisResult('competition', competitorsOnAccount > 0 ? 'attention' : 'positive', {
    competitors: competitorsOnAccount,
  })
}

/**
 * Axe 5 — FAISABILITÉ. « Le démarrage demandé est-il tenable ? »
 *
 * ⚠️ CET AXE NE RECALCULE RIEN, ET C'EST TOUT LE POINT.
 *
 * `availabilityScore` est le score de l'axe 8 du RAPPROCHEMENT
 * (`axisAvailability`, `consultants/matching/axes.ts`) tel que le moteur l'a
 * ÉCRIT dans le journal, pour le profil le mieux classé. Cet axe-là est déjà le
 * propriétaire unique de la question « quand cette personne est-elle libre ? » :
 * il dérive la disponibilité des AFFECTATIONS, retombe sur le champ déclaré
 * quand il n'y en a aucune, et rend `null` plutôt que zéro sur une
 * disponibilité inconnue — « la règle la plus importante du module : on ne
 * confond jamais “je ne sais pas” avec “non” ».
 *
 * Refaire cette dérivation ici la ferait diverger au premier réglage : « une
 * dérivation vit à un seul endroit » (GA-26). Et relire la DATE dans la phrase
 * française de l'axe (« libre le 2026-09-15 (affectations) ») serait la faute
 * que `missingClearances` documente déjà — « un motif d'exclusion ne se relit
 * pas dans du texte français ». On lit donc le NOMBRE, seule chose que le
 * moteur garantisse.
 *
 * `100` est la valeur que l'axe 8 rend EXACTEMENT quand le profil est libre au
 * plus tard au démarrage demandé. En deçà, il est libre plus tard : c'est une
 * ATTENTION et jamais un refus — une date de démarrage se négocie, et elle n'a
 * jamais tué un besoin toute seule.
 */
export function needFeasibilityAxis(input: {
  /** Le score de l'axe « disponibilité » du profil le mieux classé. `null` =
   *  non évaluable, donc hors décompte — jamais « indisponible ». */
  availabilityScore: number | null
  startOn: string | null
}): NeedVerdictAxisResult {
  const { availabilityScore, startOn } = input
  if (startOn === null) return axisUnmeasured('feasibility', 'noStartDate')
  if (availabilityScore === null) return axisUnmeasured('feasibility', 'noAvailability')
  return axisResult('feasibility', availabilityScore >= 100 ? 'positive' : 'attention', {
    availabilityScore,
    startOn,
  })
}

/**
 * Axe 6 — ACCÈS. « Sait-on par qui la décision passe ? »
 *
 * Deux grandeurs, et l'ordre de lecture est la règle :
 *
 *  - AUCUN contact connu ⇒ l'axe n'est pas renseigné. On ne sait pas s'il
 *    manque un décideur, on ne sait rien du tout ;
 *  - des contacts, mais aucun rôle `decideur` ⇒ ATTENTION MESURÉE. C'est le
 *    « rang connu · décideur manquant » de la maquette : on SAIT qu'il manque,
 *    ce qui n'est pas la même chose que ne pas savoir. C'est aussi le manque
 *    `no_decision_maker` déjà nommé par `opportunity-ontology.ts`.
 *
 * ⚠️ Ce que cet axe NE reçoit PAS : rien de ce qui désigne une PERSONNE
 * autrement que par son rôle. Aucun nom, aucune photo, aucun âge, aucune
 * adresse — l'axe compte des rôles, il ne classe personne (registre
 * `c58_criteres_proteges`, gardes GA-06 et `test_protected_criteria_scoring.py`).
 */
export function needAccessAxis(input: {
  contactsKnown: number | null
  decisionMakerKnown: boolean
  /** #3389.8 — le verrou du compte (`ouvert` / `semi_ouvert` / `verrouille`) quand un fait FRAIS le dit.
   *  `inconnu`, `null` ou absent ⇒ rien n'est ajouté à l'axe : on ne conclut pas d'un silence. */
  accessLock?: 'ouvert' | 'semi_ouvert' | 'verrouille' | 'inconnu' | null
}): NeedVerdictAxisResult {
  const { contactsKnown, decisionMakerKnown } = input
  if (contactsKnown === null || contactsKnown === 0) return axisUnmeasured('access', 'noContacts')
  const lock = input.accessLock && input.accessLock !== 'inconnu' ? input.accessLock : undefined
  // Un compte verrouillé à l'entrée ne se lit pas « positif » même avec un décideur connu :
  // on SAIT que la porte est fermée, c'est une attention mesurée (consultatif — jamais un refus).
  const positive = decisionMakerKnown && lock !== 'verrouille'
  return axisResult('access', positive ? 'positive' : 'attention', {
    contacts: contactsKnown,
    decisionMaker: decisionMakerKnown,
    ...(lock ? { lock } : {}),
  })
}

/**
 * Axe 7 — CADRE D'ACHAT (#3389.9). « Les achats sont-ils dans la boucle ? »
 *
 * La valeur vient du besoin (`project_needs.procurement_involvement`, déclarée
 * par le commercial — #2174.34) : elle existait en base sans nourrir aucun
 * axe. `null` = jamais renseigné ⇒ axe NON RENSEIGNÉ, jamais « non impliqué ».
 * `implique` ⇒ ATTENTION (référencement, grille tarifaire, délai) ; ce n'est
 * pas un refus, d'où l'axe consultatif.
 */
export function needProcurementAxis(input: {
  procurementInvolvement: 'implique' | 'non_implique' | null
}): NeedVerdictAxisResult {
  const { procurementInvolvement } = input
  if (procurementInvolvement === null) return axisUnmeasured('procurement', 'noProcurement')
  const involved = procurementInvolvement === 'implique'
  return axisResult('procurement', involved ? 'attention' : 'positive', { procurementInvolved: involved })
}

/**
 * Axe 8 — RISQUE CONTRACTUEL (#3389.10). « L'affaire porte-t-elle un risque
 * déclaré ? » — lu sur `projects.risks`, le texte que le commercial a saisi.
 *
 * ⚠️ Aucun risque déclaré n'est PAS « aucun risque » : personne ne l'a peut-être
 * posé. L'axe est alors NON RENSEIGNÉ (hors décompte), jamais « positif ».
 * Un risque déclaré ⇒ ATTENTION. Le TEXTE n'entre pas dans le contrat : on ne
 * l'interprète pas, on dit qu'il existe et l'écran renvoie vers l'affaire.
 */
export function needContractRiskAxis(input: { riskText: string | null }): NeedVerdictAxisResult {
  if (input.riskText === null || input.riskText.trim() === '') return axisUnmeasured('contract_risk', 'noRiskDeclared')
  return axisResult('contract_risk', 'attention', { riskDeclared: true })
}

/* ------------------------------------------------------------------ */
/* Le verdict                                                          */
/* ------------------------------------------------------------------ */

/**
 * Le plancher d'axes sous lequel il n'y a pas de verdict.
 *
 * C'est la borne du dépôt, pas une nouvelle : {@link MIN_AXES_FOR_SCORE} (3).
 * « Un score n'est jamais nu ; sous trois axes, il n'y a pas de score » — et
 * un verdict rendu sur deux axes serait exactement le nombre nu que la règle
 * refuse, déguisé en mot.
 */
const MIN_AXES_FOR_VERDICT = MIN_AXES_FOR_SCORE

export type NeedVerdictInput = {
  staffingCapacity: Parameters<typeof needStaffingCapacityAxis>[0]
  economics: Parameters<typeof needEconomicsAxis>[0]
  relationship: Parameters<typeof needRelationshipAxis>[0]
  competition: Parameters<typeof needCompetitionAxis>[0]
  feasibility: Parameters<typeof needFeasibilityAxis>[0]
  access: Parameters<typeof needAccessAxis>[0]
  procurement: Parameters<typeof needProcurementAxis>[0]
  contractRisk: Parameters<typeof needContractRiskAxis>[0]
}

/**
 * Les six axes, puis la décision — dans cet ordre, et jamais l'inverse.
 *
 * L'ordre des quatre règles ci-dessous EST la doctrine, et chacune a sa raison :
 *
 *  1. **sous trois axes renseignés, pas de verdict.** La borne du dépôt ;
 *  2. **un axe DÉCISIF non renseigné ⇒ pas de verdict non plus.** C'est la
 *     règle la plus importante du fichier : ignorer si l'on peut staffer
 *     n'autorise pas à dire « fais-le ». Voir le docblock de tête ;
 *  3. **un axe mesuré BLOQUANT ⇒ non.** Il vient APRÈS 2, ce qui n'est pas
 *     symétrique et c'est voulu : savoir qu'on vendrait à perte suffit à
 *     répondre non, même si l'on ignore le vivier. Ce qu'on SAIT ne s'oublie
 *     pas parce qu'on ignore autre chose ;
 *  4. **sinon, oui.** Les attentions se DISENT, elles ne renversent rien.
 *
 * Aucun modèle n'intervient. Un modèle peut RÉSUMER ces faits et rédiger les
 * questions à poser ; il ne les calcule pas, et il ne peut pas changer l'issue.
 */
export function buildNeedVerdict(input: NeedVerdictInput): NeedVerdict {
  const axes: NeedVerdictAxisResult[] = [
    needStaffingCapacityAxis(input.staffingCapacity),
    needEconomicsAxis(input.economics),
    needRelationshipAxis(input.relationship),
    needCompetitionAxis(input.competition),
    needFeasibilityAxis(input.feasibility),
    needAccessAxis(input.access),
    needProcurementAxis(input.procurement),
    needContractRiskAxis(input.contractRisk),
  ]

  const measured = axes.filter(axis => axis.state !== null)
  const unmeasuredAxes = axes.filter(axis => axis.state === null).map(axis => axis.axis)
  const unmeasuredDecisiveAxes = unmeasuredAxes.filter(axis => NEED_VERDICT_AXIS_WEIGHTS[axis] === 'decisive')
  const blockingAxes = axes.filter(axis => axis.state === 'blocking').map(axis => axis.axis)

  const verdict: NeedVerdictKind =
    // 3 passe avant 1 et 2 ? Non — mais un bloquant CONNU l'emporte sur une
    // ignorance, d'où l'ordre écrit ici : on ne dit « je manque de données »
    // que lorsqu'il ne reste rien de décisif à opposer.
    blockingAxes.length > 0
      ? 'no_go'
      : measured.length < MIN_AXES_FOR_VERDICT || unmeasuredDecisiveAxes.length > 0
        ? 'insufficient_data'
        : 'go'

  return {
    verdict,
    axes,
    axisCount: axes.length,
    measuredCount: measured.length,
    attentionCount: axes.filter(axis => axis.state === 'attention').length,
    unmeasuredAxes,
    unmeasuredDecisiveAxes,
    blockingAxes,
  }
}

/**
 * LA QUESTION QUE LAURA POSE D'ABORD — #2323.33, décision Louis 19/09/2026.
 *
 * Parmi les axes NON RENSEIGNÉS, ÉCONOMIE (TJM cible, plancher — ligne 95)
 * passe devant les cinq autres : c'est l'un des deux axes DÉCISIFS, et sans
 * lui aucun « oui » n'est possible — {@link buildNeedVerdict} refuse déjà de
 * conclure sur un axe décisif ignoré. La demander en premier fait donc
 * avancer le verdict le plus, quelle que soit la combinaison d'axes qui
 * manquent par ailleurs.
 *
 * À défaut (économie déjà renseignée), le premier axe non renseigné dans
 * l'ORDRE DÉCLARÉ de {@link NEED_VERDICT_AXES} est retenu — jamais un ordre
 * choisi à l'écran, qui divergerait du contrat au premier axe ajouté.
 *
 * `null` quand les six axes sont renseignés : il n'y a rien à demander.
 */
export function needVerdictPriorityQuestion(verdict: NeedVerdict): NeedVerdictAxisResult | null {
  const unmeasured = verdict.axes.filter(axis => axis.state === null)
  if (unmeasured.length === 0) return null
  return unmeasured.find(axis => axis.axis === 'economics') ?? unmeasured[0]
}

/* ------------------------------------------------------------------ */
/* Les profils, et la LECTURE D'ACCEPTATION                            */
/* ------------------------------------------------------------------ */

/**
 * Les faits SOURCÉS d'une lecture d'acceptation.
 *
 * SOL6 en demande quatre familles — « accepted/refused at this client, price
 * against permitted range, availability against date, relevant project/domain
 * practice ». Ce sont des FAITS, chacun tiré d'une donnée qu'on peut montrer,
 * jamais une appréciation.
 *
 * ⚠️ Des CLÉS, pas des phrases. Un libellé français produit par le serveur
 * figerait la langue du produit dans l'API, et la garde de parité FR/EN n'aurait
 * plus rien à lire. La phrase se compose à l'écran, à partir de la clé et du
 * `count`.
 *
 * ⚠️ Liste ORDONNÉE et APPEND-ONLY (GA-08).
 */
export const NEED_ACCEPTANCE_FACTS = [
  /** Ce client a déjà dit oui à cette personne, `count` fois. */
  'accepted_here',
  /** Ce client a déjà dit non, `count` fois. Un refus se DIT, il n'écarte pas. */
  'rejected_here',
  /** Jamais présentée chez ce client — ni oui ni non, une page blanche. */
  'never_presented_here',
  /** Le TJM tient la cible du besoin (axe 10 du rapprochement au maximum). */
  'rate_within_target',
  /** Le TJM dépasse la cible. Se négocie ; n'écarte pas. */
  'rate_above_target',
  /** Libre au plus tard au démarrage demandé (axe 8 au maximum). */
  'available_by_start',
  /** Libre plus tard que le démarrage demandé. */
  'available_later',
  /** A déjà travaillé dans le secteur de la demande (axe 4 au maximum). */
  'sector_practised',
  /** Aucune expérience déclarée dans ce secteur. */
  'sector_missing',
] as const
export const needAcceptanceFactSchema = z.enum(NEED_ACCEPTANCE_FACTS)
export type NeedAcceptanceFact = (typeof NEED_ACCEPTANCE_FACTS)[number]

export const needVerdictProfileSchema = z.object({
  consultantId: z.string().guid(),
  /**
   * Le nom, rattaché APRÈS le classement — comme `matchRunSchema.identities`.
   * Il DÉSIGNE la personne, il n'a jamais servi à la classer : c'est l'une des
   * deux exceptions nommées de `c58_criteres_proteges`. Ni photo, ni âge, ni
   * adresse ne voyagent ici.
   */
  fullName: z.string(),
  correspondenceScore: z.number().int().min(0).max(100),
  pushableScore: z.number().int().min(0).max(100),
  /** La lecture d'acceptation — vide quand rien n'est mesurable, jamais inventée. */
  acceptance: z.array(z.object({ fact: needAcceptanceFactSchema, count: z.number().int().min(0).nullable() })),
  /**
   * `none` | `valid` | `expiring` | `expired` — l'échelle de `talent-consent.ts`,
   * pas une seconde.
   *
   * ⚠️ `expired` REFUSE un positionnement, et c'est le seul refus dur du
   * produit. `none` AVERTIT et laisse passer, avec l'avertissement visible et la
   * décision journalisée (`c45_consentement_positionnement`). Ce verdict ne
   * durcit ni l'un ni l'autre : il les AFFICHE, et c'est `submissionPreflight`
   * qui continue de tenir la porte au moment du positionnement.
   */
  consentState: z.enum(['none', 'valid', 'expiring', 'expired']),
  /** Jours restants avant l'échéance. `null` quand il n'y en a pas — jamais 0. */
  consentDaysLeft: z.number().int().min(0).nullable(),
  /**
   * Refonte Théo (23/10) — la correspondance EN CLAIR (« Correspond : … · Manque : … »),
   * lue sur les axes du même rapprochement (`matchInClear`). `.optional()` : déploiement web-avant-API.
   */
  inClear: matchInClearSchema.optional(),
})
export type NeedVerdictProfile = z.infer<typeof needVerdictProfileSchema>

/**
 * #3390.9 — le CONTEXTE COMMERCIAL réel lu à côté de la méthode : la capacité DÉCLARÉE du
 * commercial (`workspace_commercial_load_settings.weekly_available_hours`) et les 5P du compte
 * du besoin. Chaque champ absent reste `null` — jamais 0 h, jamais « prêt » par défaut — et
 * l'écran ne fait AUCUNE ligne pour une absence. Ce contexte N'INFLUENCE PAS la décision du
 * moteur (aucun seuil produit n'existe) : il est dit, pas pondéré.
 */
const needCommercialContextSchema = z.object({
  weeklyAvailableHours: z.number().int().min(1).nullable(),
  fiveP: z
    .object({
      readiness: accountStrategy5PReadinessSchema,
      nextDimension: z.enum(ACCOUNT_STRATEGY_5P_DIMENSIONS).nullable(),
    })
    .nullable(),
  /**
   * #3390.9 (reste) — les actions OUVERTES ET EN RETARD du commercial qui lit la
   * fiche : sa charge réelle. Dite, jamais pondérée (aucun seuil produit, le
   * moteur ne change pas). `null` = non lue (lecteur inconnu) ; l'écran ne
   * fait aucune ligne pour `null` ni pour 0.
   */
  overdueActions: z.number().int().min(0).nullable().optional(),
})

export const needVerdictResponseSchema = z.object({
  verdict: needVerdictSchema,
  /** Au plus trois — ceux de la maquette. Vide quand aucun ne passe le seuil. */
  profiles: z.array(needVerdictProfileSchema),
  /**
   * Refonte Théo (23/10) — les profils POSITIONNÉS sur ce besoin, avec leur correspondance en clair
   * lue sur le dernier rapprochement. Un positionné absent du rapprochement n'a pas de ligne :
   * on ne devine pas sa correspondance. `.optional()` : déploiement web-avant-API.
   */
  positionedInClear: z.array(z.object({ consultantId: z.string().guid(), inClear: matchInClearSchema })).optional(),
  /**
   * Quand le rapprochement qui alimente les axes 1 et 5 a été exécuté.
   *
   * `null` = aucun rapprochement lisible, et les deux axes le disent. Une
   * mesure sans date se relit comme fraîche six semaines plus tard — c'est la
   * discipline de `Provenance` (la source ET la date), appliquée ici parce que
   * ce verdict est LU dans un journal, pas recalculé à chaque ouverture.
   */
  runAt: z.string().nullable(),
  /**
   * #3390 — la méthode choisie À PARTIR de ce verdict, par
   * `chooseCommercialMethod` (`commercial-method-engine.ts`). `.optional()`
   * pour le déploiement web-avant-API, même patron que `readiness` sur
   * `projectReadinessRowSchema` : un client qui ne l'a pas encore ne casse pas.
   */
  method: commercialMethodChoiceSchema.optional(),
  /** #3390.9 — voir `needCommercialContextSchema`. `.optional()` : même déploiement web-avant-API. */
  commercialContext: needCommercialContextSchema.optional(),
})
export type NeedVerdictResponse = z.infer<typeof needVerdictResponseSchema>
