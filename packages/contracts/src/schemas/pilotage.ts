import { z } from 'zod'
import { measuredRate } from './measurability.js'
import { stockBaselineSchema } from './stock-snapshot.js'

/* ------------------------------------------------------------------ */
/*  Pilotage — KPI de chaîne (annexe méthodo p24)                     */
/*                                                                    */
/*  « Mesurer la chaîne, pas seulement le volume. » Le KPI roi reste  */
/*  le démarrage rentable, mais CHAQUE étape doit avoir un seuil      */
/*  d'alerte : un maillon qui décroche se voit avant le résultat.     */
/* ------------------------------------------------------------------ */

/** Les huit niveaux de la chaîne, dans l'ordre de la page p24. */
export const PILOTAGE_LEVELS = [
  'acquisition',
  'conversation',
  'qualification',
  'sourcing',
  'conversion',
  'economie',
  'expansion',
  'qualite',
] as const
export type PilotageLevel = (typeof PILOTAGE_LEVELS)[number]

/**
 * État d'un maillon — c'est une COULEUR, pas une mesure.
 *
 * `ok` = au-dessus du seuil ; `alerte` = sous le seuil (le maillon décroche) ;
 * `non_mesure` = rien à juger, et il y a DEUX raisons de ne rien juger : la
 * donnée n'a pas pu être lue, ou elle a été lue et rien n'est encore passé par
 * ce maillon (un zéro sans amont ne décroche de rien).
 *
 * ⚠️ Ce qui dit si la donnée est CAPTÉE, c'est `value` et elle seule : `null` =
 * on n'a pas pu lire, un nombre = on a lu, zéro compris. Le nom `non_mesure`
 * dit donc moins que ce qu'il promet, et c'est ce malentendu qui faisait
 * ressembler `value: 0` + `status: 'non_mesure'` à une contradiction. On ne le
 * renomme pas (GA-08 : aucune valeur d'énumération ne disparaît), on écrit ce
 * qu'il veut dire.
 *
 * Invariant tenu par `evaluatePilotageChain` et vérifié par son test :
 * `value === null` ⇒ `status === 'non_mesure'`. La réciproque est FAUSSE, et
 * délibérément.
 */
export const pilotageStatusSchema = z.enum(['ok', 'alerte', 'non_mesure'])
export type PilotageStatus = z.infer<typeof pilotageStatusSchema>

/** Un indicateur d'un niveau : sa valeur, son unité et — quand il est chiffré —
 *  son statut vis-à-vis du seuil d'alerte. */
export const pilotageMetricSchema = z.object({
  key: z.string(),
  /** Valeur mesurée — zéro compris —, ou `null` quand la source n'a PAS été lue. */
  value: z.number().nullable(),
  /** `count` (un dénombrement) ou `rate` (un ratio 0-1). */
  unit: z.enum(['count', 'rate']),
  status: pilotageStatusSchema,
  /**
   * SUR COMBIEN le taux est calculé — présent sur les seuls `rate` MESURÉS.
   *
   * ⚠️ « Un score n'est jamais nu », appliqué au quotient. Mesuré en recette
   * live le 30/08/2026 : la carte Qualification affichait « Rendez-vous 0 ·
   * Besoins qualifiés 0 · Taux de qualification 0 % », et rien à l'écran ne
   * permettait de distinguer une mesure réelle (« 0 sur 43 besoins pris en
   * charge », un décrochage à crier) d'une division par rien (qui n'est pas une
   * mesure du tout). Le calcul, lui, faisait déjà la différence — il rend `null`
   * sur un dénominateur nul depuis le 27/08. C'est l'ÉCRAN qui ne pouvait pas la
   * montrer, faute d'avoir le chiffre.
   *
   * Le dénominateur du CALCUL, jamais celui qui se trouve sur la carte : le taux
   * de conversion se divise par les besoins DÉCIDÉS pendant que la carte affiche
   * les conversions, et le taux de correction se divise par les contacts pendant
   * que la carte affiche les corrections.
   *
   * ABSENT (et non `null`) quand il n'y a pas de taux : un dénominateur sans
   * numérateur ne dit rien, et un champ à `null` inviterait à l'afficher.
   */
  denominator: z.number().positive().optional(),
  /**
   * LES TABLES D'OÙ CE CHIFFRE SORT (#1440).
   *
   * « Chaque KPI doit ouvrir source, période, dénominateur, dernière mise à
   * jour. » Le dénominateur était là depuis le 30/08 ; les trois autres
   * manquaient — l'API ne rendait que `key`, `value`, `unit`, `status`, donc
   * l'écran ne pouvait rien ouvrir. Ce n'était pas un défaut d'affichage : la
   * donnée n'existait pas.
   *
   * Des NOMS DE TABLE, pas une phrase : un libellé d'affichage écrit dans un
   * contrat est français pour toujours, et « accounts, contacts » se vérifie
   * alors que « nos données commerciales » ne se vérifie pas. Vide pour un
   * indicateur non mesuré — nommer une source qu'on n'a pas lue serait affirmer
   * l'avoir lue.
   */
  source: z.array(z.string().min(1)).optional(),
  /**
   * SUR QUOI porte la mesure.
   *
   * ⚠️ `current_state`, et c'est un FAIT à dire, pas un défaut à cacher : pas
   * une seule requête de la chaîne ne porte de fenêtre temporelle — aucun
   * `INTERVAL`, aucun `now()`. Ces chiffres sont des ÉTATS COURANTS, pas des
   * mesures de période. L'écran écrivait pourtant « aucun ce mois-ci » et « pas
   * de photo le mois dernier » à côté d'eux, ce qui laisse croire à une fenêtre
   * glissante. Le jour où une métrique en gagnera une, cette énumération
   * gagnera sa valeur — et l'écran cessera de mentir par omission.
   *
   * ⚠️ `optional()` et non `default()`, pour les deux champs : un champ neuf ne
   * peut pas être obligatoire pendant un déploiement, où l'écran lit encore la
   * réponse de l'API PRÉCÉDENTE. `evaluatePilotageChain` les remplit toujours —
   * une garde le vérifie —, et l'écran lit `metric.source ?? []`. C'est ce que
   * `chain.purpose` a coûté en production le 05/09 : déclaré obligatoire, donc
   * plus rien ne le vérifiait, et tout l'écran tombait.
   */
  window: z.enum(['current_state']).optional(),
})
export type PilotageMetric = z.infer<typeof pilotageMetricSchema>

/**
 * D'OÙ SORT CHAQUE INDICATEUR — la table, à un seul endroit (#1440).
 *
 * Elle vit dans le CONTRAT et non dans le service, parce que la source est une
 * propriété de l'indicateur et non de son transport : c'est ici qu'on décide
 * quelles métriques existent, donc ici qu'on doit savoir dire d'où elles
 * viennent. Une garde vérifie que chaque clé produite y figure — un indicateur
 * sans provenance déclarée est un chiffre qu'on ne saura pas défendre.
 */
export const PILOTAGE_METRIC_SOURCES: Readonly<Record<string, readonly string[]>> = {
  contactsTargeted: ['contacts'],
  signals: ['accounts'],
  // Non mesuré à dessein : `consultant_push_feedback` n'enregistre que les
  // pushes AYANT reçu un retour. Aucune source déclarée, parce qu'aucune n'est lue.
  profilesPushed: [],
  emailsSent: ['activities'],
  replyRate: ['activities', 'contacts'],
  meetings: ['activities'],
  needsQualified: ['project_needs'],
  qualificationRate: ['project_needs'],
  benchAvailable: ['consultants'],
  conversions: ['project_needs'],
  conversionRate: ['project_needs'],
  marginBand: ['missions', 'mission_commercial_terms'],
  tjm: [],
  margin: ['missions', 'mission_commercial_terms', 'mission_timesheets'],
  dso: ['invoice_readiness'],
  activeClients: ['accounts', 'missions'],
  correctionRate: ['contacts', 'record_field_audits'],
  rejectedItems: ['contacts'],
}

/** Un niveau de la chaîne avec ses indicateurs et son statut agrégé (le pire de
 *  ses indicateurs mesurés — un maillon vaut son maillon le plus faible). */
export const pilotageLevelSchema = z.object({
  level: z.enum(PILOTAGE_LEVELS),
  status: pilotageStatusSchema,
  metrics: z.array(pilotageMetricSchema),
})
export type PilotageLevelReport = z.infer<typeof pilotageLevelSchema>

export const pilotageReportSchema = z.object({
  levels: z.array(pilotageLevelSchema),
  /**
   * La photo du mois PRÉCÉDENT des indicateurs de STOCK de cette chaîne
   * (`benchAvailable`, `activeClients`) — D2 / D49 du 26/08.
   *
   * OPTIONNELLE, et c'est le point : `evaluatePilotageChain` reste PUR et n'en
   * pose jamais. Elle est ajoutée par le contrôleur, qui seul connaît l'espace.
   * Une chaîne sans photo est un état parfaitement normal — le premier mois
   * d'un espace, ou un balayage éteint —, et l'écran n'affiche alors AUCUN
   * pourcentage : une clé absente veut dire « aucune photo », jamais « zéro ».
   */
  stockBaseline: stockBaselineSchema.optional(),
  /**
   * QUAND ces chiffres ont été calculés (#1440, « dernière mise à jour »).
   *
   * ⚠️ L'instant du CALCUL, pas celui de la donnée : rien n'est mis en cache
   * ici, chaque appel relit les tables. Écrire « mis à jour il y a 3 jours »
   * serait faux ; « calculé à 21:12 » est vérifiable, et c'est ce que le retour
   * demande de pouvoir ouvrir.
   *
   * OPTIONNEL, et posé par le CONTRÔLEUR : `evaluatePilotageChain` reste pure
   * et ne connaît aucune horloge — c'est la même règle que `stockBaseline`. Un
   * champ neuf déclaré obligatoire casserait l'écran pendant le déploiement,
   * où il lit encore l'API précédente.
   */
  generatedAt: z.string().optional(),
})
export type PilotageReport = z.infer<typeof pilotageReportSchema>

/**
 * Les métriques brutes que l'API sait produire à partir de la donnée déjà
 * présente.
 *
 * **`null` veut dire une seule chose : la source n'a pas été lue.** Ni « c'est
 * vide », ni « ce n'est pas branché » — ceux-là valent zéro et s'affichent zéro.
 * Un champ dont la donnée n'existe nulle part dans le produit (TJM, marge, DSO)
 * est donc `null` en permanence, ce qui est le même énoncé : personne ne l'a lu.
 *
 * Tous les champs sont nullables, et c'est le point : jusqu'au 27/08 un
 * `?? 0` posé sur une lecture en échec faisait dire au rapport « aucun client
 * actif » là où la vérité était « la requête n'est jamais revenue ».
 */
export type PilotageInputs = {
  // Acquisition. Le défaut vécu : un zéro affiché à côté de « 2044 contacts
  // ciblés » se lit « aucun signal », pas « pas encore agrégé ».
  contactsTargeted: number | null
  signals: number | null
  profilesPushed: number | null
  // Conversation
  emailsSent: number | null
  replied: number | null
  // Qualification
  meetings: number | null
  /** Besoins PRIS EN CHARGE dont le BTMMP est complet (les 6 axes). */
  needsQualified: number | null
  /** Besoins qu'un humain a pris en charge : ouverts, hors intake (`detected`,
   *  `potential`). C'est le dénominateur du taux de qualification — compter les
   *  projets que l'analyse vient de détecter ferait chuter le taux à chaque run,
   *  c'est-à-dire punir le pipeline de faire son travail. */
  needsTriaged: number | null
  // Sourcing
  benchAvailable: number | null // consultants poussables au vivier
  // Conversion
  conversions: number | null // besoins gagnés
  /** Besoins dont l'ISSUE est connue (gagnés + perdus). Dénominateur du taux de
   *  conversion : il CONTIENT le numérateur, contrairement aux « besoins
   *  ouverts » qui l'excluaient — le taux ne pouvait alors jamais valoir 100 %.
   *  Un besoin en veille n'a pas d'issue, il n'entre pas dans le compte. */
  needsDecided: number | null
  // Économie — TJM : non capté ⇒ null. Marge et DSO viennent de Finance
  // (`/delivery/finance/margin`, `/dso`), la MÊME source que `/pilotage/finance`
  // (GA-26) ; absents = non lus (droit finance manquant, lecture en échec).
  marginBand: number | null
  /** Marge moyenne pondérée de l'espace, en POURCENT (12,4 = 12,4 %). */
  marginPercent?: number | null
  /** Délai moyen d'encaissement (DSO), en jours. */
  dsoDays?: number | null
  // Expansion
  activeClients: number | null // comptes client actif
  // Qualité Bellum
  rejectedItems: number | null // corrections utilisateur (org_rejected_items)
  totalContacts: number | null
}

/** Seuils d'alerte par indicateur chiffré. Un TAUX sous son seuil, ou un compte
 *  à zéro là où l'amont a du flux, fait passer le maillon en `alerte`. Les seuils
 *  reprennent l'esprit p24 (« chaque étape doit avoir un seuil d'alerte ») ;
 *  ils sont volontairement prudents — l'objectif est de VOIR un décrochage, pas
 *  de noter. */
const RATE_ALERT_THRESHOLD = 0.1 // un taux de réponse/conversion < 10 % = alerte

/**
 * Statut d'un compte qui doit COULER (des messages partent, des rendez-vous se
 * tiennent, des besoins se convertissent).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CETTE FONCTION CORRIGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un zéro se lit de DEUX façons, et les confondre était le défaut : « le maillon
 * décroche » et « rien n'est encore passé par ici ». La version précédente
 * alertait dès que le compte valait zéro, sans regarder l'amont — donc un espace
 * neuf, où tout vaut zéro par construction, s'ouvrait en ROUGE sur la moitié de
 * sa chaîne.
 *
 * C'est le pire moment pour crier : le premier écran qu'un client voit lui
 * apprend que le rouge ne veut rien dire. Le jour où un vrai maillon décroche,
 * plus personne ne regarde.
 *
 * La règle : un zéro n'alerte QUE si l'amont a du flux. Zéro message envoyé sur
 * 2 000 contacts ciblés est un décrochage ; zéro message envoyé sur zéro contact
 * ciblé n'est pas une mesure.
 */
function flowStatus(value: number | null, upstream: number | null): PilotageStatus {
  // Une valeur qu'on n'a pas lue ne se juge pas — c'est l'invariant du module.
  if (value == null) return 'non_mesure'
  if (value > 0) return 'ok'
  return upstream != null && upstream > 0 ? 'alerte' : 'non_mesure'
}

/**
 * Statut d'un compte qui est un STOCK et non un flux (le vivier disponible, les
 * clients actifs, les corrections).
 *
 * Un stock n'alerte JAMAIS : une ESN qui n'a pas encore saisi son vivier n'a pas
 * un vivier en panne, elle a un vivier vide. Mais il ne se déclare pas vert pour
 * autant — un « Expansion : ok » sur un espace sans le moindre client serait le
 * défaut inverse, et le faux vert est le plus dangereux des deux : personne ne
 * va vérifier un indicateur qui se dit sain.
 *
 * La valeur, elle, reste affichée : l'écran montre bien « 0 », c'est la COULEUR
 * qui reste neutre parce qu'il n'y a rien à juger.
 */
function stockStatus(value: number | null): PilotageStatus {
  if (value == null) return 'non_mesure'
  return value > 0 ? 'ok' : 'non_mesure'
}

function rateStatus(value: number): PilotageStatus {
  return value >= RATE_ALERT_THRESHOLD ? 'ok' : 'alerte'
}

/** Agrège le statut d'un niveau : le PIRE de ses indicateurs mesurés. Un niveau
 *  dont tous les indicateurs sont `non_mesure` est `non_mesure`. */
function aggregate(metrics: PilotageMetric[]): PilotageStatus {
  const measured = metrics.filter(m => m.status !== 'non_mesure')
  if (measured.length === 0) return 'non_mesure'
  return measured.some(m => m.status === 'alerte') ? 'alerte' : 'ok'
}

/**
 * Évalue la chaîne p24 de façon DÉTERMINISTE à partir des métriques brutes.
 *
 * Chaque niveau porte ses indicateurs (valeur + statut vis-à-vis du seuil), et
 * son statut agrégé. Deux règles, et elles ne disent pas la même chose :
 *  - une source NON LUE ne produit aucun chiffre (`value: null`) et ne se juge
 *    pas (`status: 'non_mesure'`) — jamais un zéro qui ferait croire à un
 *    décrochage ;
 *  - un zéro LU reste un zéro et s'affiche, même quand il n'y a rien à en juger.
 *
 * Pur : mêmes entrées → même rapport.
 */
export function evaluatePilotageChain(inputs: PilotageInputs): PilotageReport {
  /** La provenance déclarée d'une clé. Vide quand rien n'est lu — jamais devinée. */
  const sourceOf = (key: string): readonly string[] => PILOTAGE_METRIC_SOURCES[key] ?? []
  const nonMesure = (key: string, unit: 'count' | 'rate'): PilotageMetric => ({
    key,
    value: null,
    unit,
    status: 'non_mesure',
    // ⚠️ Une métrique NON MESURÉE ne nomme aucune source : dire d'où viendrait
    // le chiffre qu'on n'a pas laisserait croire qu'on l'a lu.
    source: [],
    window: 'current_state',
  })
  /** Un dénombrement. Une source non lue ne produit AUCUN chiffre — c'est le
   *  seul endroit où la distinction « zéro » / « pas lu » se fabrique, donc le
   *  seul endroit où elle peut se perdre. */
  const count = (key: string, value: number | null, status: PilotageStatus): PilotageMetric =>
    value == null
      ? nonMesure(key, 'count')
      : { key, value, unit: 'count', status, source: [...sourceOf(key)], window: 'current_state' }
  /**
   * UN taux : sa valeur, son statut, et SUR COMBIEN il est calculé.
   *
   * ⚠️ Il y avait DEUX constructeurs de taux dans cette fonction — `ratio`, qui
   * appliquait le seuil d'alerte, et `correctionRate`, qui forçait `ok`. Deux
   * chemins pour un même objet, dont un seul portait la règle de bord ; c'est
   * exactement la forme que prend une divergence avant qu'elle n'arrive. Il n'en
   * reste qu'un, et la seule chose qui varie — le JUGEMENT porté sur la valeur —
   * se passe en paramètre, là où elle se voit.
   *
   * La division, elle, ne vit pas ici non plus : `measuredRate` la tient pour
   * tout le produit, et elle N'ARRONDIT PAS. C'est l'arrondi au centième posé à
   * cet endroit qui faisait ressortir douze corrections sur deux mille cinq
   * cents contacts à « 0 % ».
   */
  const ratio = (
    key: string,
    numerator: number | null,
    denominator: number | null,
    judge: (value: number) => PilotageStatus = rateStatus,
  ): PilotageMetric => {
    const value = measuredRate(numerator, denominator)
    if (value == null || denominator == null) return nonMesure(key, 'rate')
    return {
      key,
      value,
      unit: 'rate',
      status: judge(value),
      denominator,
      source: [...sourceOf(key)],
      window: 'current_state',
    }
  }
  /** Le taux de correction n'a pas de seuil : moins c'est mieux, et reprocher
   *  « zéro correction » serait reprocher le meilleur résultat possible. */
  const noThreshold = (): PilotageStatus => 'ok'
  const rejected = (value: number | null): PilotageMetric => count('rejectedItems', value, stockStatus(value))

  const byLevel: Record<PilotageLevel, PilotageMetric[]> = {
    // Tête de chaîne : aucun amont, donc zéro contact ciblé n'est pas un
    // décrochage — c'est un espace qui commence.
    acquisition: [
      count('contactsTargeted', inputs.contactsTargeted, flowStatus(inputs.contactsTargeted, null)),
      count('signals', inputs.signals, stockStatus(inputs.signals)),
      count('profilesPushed', inputs.profilesPushed, stockStatus(inputs.profilesPushed)),
    ],
    conversation: [
      count('emailsSent', inputs.emailsSent, flowStatus(inputs.emailsSent, inputs.contactsTargeted)),
      ratio('replyRate', inputs.replied, inputs.emailsSent),
    ],
    qualification: [
      count('meetings', inputs.meetings, flowStatus(inputs.meetings, inputs.replied)),
      count('needsQualified', inputs.needsQualified, flowStatus(inputs.needsQualified, inputs.needsTriaged)),
      ratio('qualificationRate', inputs.needsQualified, inputs.needsTriaged),
    ],
    // Le vivier est un STOCK : personne ne « décroche » en n'ayant pas encore
    // saisi de consultant.
    sourcing: [count('benchAvailable', inputs.benchAvailable, stockStatus(inputs.benchAvailable))],
    conversion: [
      count('conversions', inputs.conversions, flowStatus(inputs.conversions, inputs.needsTriaged)),
      ratio('conversionRate', inputs.conversions, inputs.needsDecided),
    ],
    // Économie : TJM / marge / DSO ne sont pas captés → non mesuré, jamais un zéro.
    // Marge et DSO se LISENT dans Finance quand elle les mesure ; le TJM n'a aucune
    // mesure nulle part (non mesuré, jamais 0). Mesuré 0 reste 0 : pas de seuil ici.
    economie: [
      ...(inputs.marginBand != null ? [count('marginBand', inputs.marginBand, stockStatus(inputs.marginBand))] : []),
      nonMesure('tjm', 'count'),
      inputs.marginPercent == null
        ? nonMesure('margin', 'count')
        : {
            key: 'margin',
            value: inputs.marginPercent / 100,
            unit: 'rate',
            status: 'ok',
            source: [...sourceOf('margin')],
            window: 'current_state',
          },
      inputs.dsoDays == null ? nonMesure('dso', 'count') : count('dso', inputs.dsoDays, noThreshold()),
    ],
    expansion: [count('activeClients', inputs.activeClients, stockStatus(inputs.activeClients))],
    // Qualité : ici, moins c'est mieux. Zéro correction est le MEILLEUR résultat
    // possible — l'alerter serait exactement l'inverse de la mesure. Sans aucun
    // contact, il n'y a simplement rien à mesurer.
    qualite: [
      ratio('correctionRate', inputs.rejectedItems, inputs.totalContacts, noThreshold),
      rejected(inputs.rejectedItems),
    ],
  }

  return {
    levels: PILOTAGE_LEVELS.map(level => ({
      level,
      metrics: byLevel[level],
      status: aggregate(byLevel[level]),
    })),
  }
}

/**
 * Combien de maillons ont quelque chose à DIRE.
 *
 * C'est ce chiffre qui permet à l'écran d'écrire une phrase au lieu d'afficher
 * une mosaïque grise que personne ne sait lire. Sans lui, un espace neuf montre
 * huit cases ternes et l'utilisateur conclut à une panne — le seuil d'activation
 * que le PDF réclamait cherchait à masquer ce symptôme ; le dire coûte une
 * phrase et ne cache rien.
 *
 * ⚠️ Il compte les maillons JUGEABLES, pas les maillons lus : un espace qui a
 * tout lu et dont tout vaut zéro en compte zéro. C'est volontairement conservé —
 * la phrase de l'écran (« C'est normal sur un espace qui démarre ») décrit
 * exactement cet état, et compter les valeurs à la place la ferait disparaître
 * alors qu'elle est utile. La nuance vit ici pour qu'on ne la reprenne pas pour
 * un oubli.
 */
export function pilotageCoverage(report: PilotageReport): { measured: number; total: number } {
  return {
    measured: report.levels.filter(level => level.status !== 'non_mesure').length,
    total: report.levels.length,
  }
}
