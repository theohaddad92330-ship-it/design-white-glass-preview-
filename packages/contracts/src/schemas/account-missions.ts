import { z } from 'zod'
import { paymentBehaviourSchema } from './invoice-readiness.js'
import { missionStatusSchema, renewalWindowSchema, type RenewalWindow } from './mission.js'
import { propagatedBlockSchema } from './propagation.js'

/**
 * L'ONGLET MISSIONS DU DOSSIER DE COMPTE (PDF 4 §3.3, ticket BEL-BO-006).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE CONTRAT EXISTE, ET POURQUOI ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * La source le dit d'elle-même : sur les quatorze onglets du dossier de compte,
 * le quatorzième — Missions — est marqué « À FAIRE ». Les missions d'un compte
 * étaient enfouies dans « Preuves & REX », réduites à un intitulé et un statut,
 * et AUCUNE route serveur ne les rendait par compte.
 *
 * Le contrat vit dans `@bellum/contracts` et pas dans le service parce que ce
 * dépôt a déjà payé « même nom, forme différente » : `MissionView` était
 * déclaré des deux côtés, le serveur rendait `{ mission: {...} }` et l'écran
 * lisait à plat — des lignes sans titre, toutes « sans date de fin », et un
 * badge affichant la clé i18n brute. `apiFetch` type par ASSERTION : les deux
 * côtés compilaient, chacun cohérent avec lui-même. Un seul schéma, importé
 * par les deux, retire la possibilité.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ §4.4 — LE BLOC PORTE SA SOURCE ET NE S'ÉDITE JAMAIS SUR PLACE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Le CA cumulé d'un compte se lit sur la fiche compte. Il se calcule dans les
 * missions. On ne le corrige pas depuis le compte. »
 *
 * Cet onglet EST la propagation du back-office dans le CRM : tout ce qu'il
 * montre se calcule ailleurs. Il étend donc {@link propagatedBlockSchema} —
 * `source` obligatoire, `editable` littéralement `false` — et ni la marge, ni le
 * tarif, ni la date de fin ne s'y corrigent. Le lien mène aux missions, là où
 * elles se saisissent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ AUCUN ZÉRO DE REMPLISSAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un compte sans mission n'a pas « rapporté 0 € », il n'a rien à montrer :
 * {@link accountMissionsSchema} rend alors des listes VIDES et `buying: null`,
 * jamais un profil d'achat rempli de zéros. Chaque moyenne est `positive()` et
 * nullable pour la même raison — « ce client achète à 0 € » est une phrase
 * qu'aucun écran ne peut rattraper.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ LE DROIT FINANCIER — CE QUI SE GARDE ET CE QUI NE SE GARDE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * La MARGE se garde (`marginPercent`, rédigée par `redactFinance`, `null` sans
 * le droit — présente et vide, jamais retirée, jamais zéro). Le **prix de
 * VENTE** ne se garde PAS : `soldDailyRateCents` sort inconditionnellement,
 * comme sur le board et le vivier. Deux fausses alertes ont déjà été levées
 * là-dessus dans ce dépôt le 28/08/2026 — la doctrine est écrite dans
 * `mission.ts`, et ce qui se garde est ce qui laisse remonter au COÛT.
 *
 * `canReadFinance` voyage avec la réponse : sans lui, « pas ton périmètre » et
 * « coût chargé non renseigné » deviennent le même `null`, et l'écran ne peut
 * plus les dire différemment.
 */

/* ── Ce que toute ligne de mission porte ──────────────────────────────────── */

const missionIdentitySchema = z.object({
  missionId: z.string().guid(),
  label: z.string(),
  /** Le rôle CHERCHÉ, distinct du nom de la mission. `null` = non renseigné. */
  roleTitle: z.string().nullable(),
  startedOn: z.string().nullable(),
  /** Fin PRÉVUE. `null` = sans date de fin — pas « très loin ». */
  endsOn: z.string().nullable(),
  status: missionStatusSchema,
  /** Qui est (ou a été) dessus. `[]` = on a lu, personne n'était affecté. */
  consultants: z.array(z.object({ consultantId: z.string().guid(), fullName: z.string() })),
  /**
   * #2124.19 — le CHARGÉ D'AFFAIRES interne (`missions.owner_id`), jamais un
   * contact client. `null` = aucun porteur renseigné sur cette mission —
   * jamais un nom inventé pour remplir la colonne.
   */
  businessManagerName: z.string().nullable(),
  /**
   * #2836 — le MANAGER CLIENT : le contact, chez le client, qui encadre le
   * consultant (`missions.client_manager_contact_id` → `contacts`). `null` =
   * non désigné — l'écran n'affiche alors AUCUNE ligne, jamais un tiret
   * inventé ni le nom d'un autre contact du compte.
   */
  clientManagerName: z.string().nullable(),
})

/* ── Bloc 1 — les missions actives ────────────────────────────────────────── */

/**
 * Ce que la source demande, mot pour mot : « intitulé · consultant · période ·
 * jours restants · marge (droit financier) · prochaine action ».
 */
export const activeMissionRowSchema = missionIdentitySchema.extend({
  /**
   * #R37 (Servier) — la PHASE dérivée de la date de début : `upcoming` quand `startedOn` est dans le
   * futur (« à venir », jamais « en cours »), `running` sinon. `null` = pas de date de début lue :
   * on ne devine ni l'un ni l'autre. Le statut stocké ne dit rien du calendrier.
   */
  phase: z.enum(['upcoming', 'running']).nullable().optional(),
  /**
   * Jours restants — `null` quand la fin n'est pas connue.
   *
   * ⚠️ `null` et non un grand nombre : « sans date de fin » n'est pas « très
   * loin ». C'est exactement la mission qu'on ne relance jamais à temps.
   */
  daysRemaining: z.number().int().nullable(),
  renewal: renewalWindowSchema,
  /** Le TJM FACTURÉ, en centimes. Visible par design — c'est un prix de VENTE. */
  soldDailyRateCents: z.number().int().positive().nullable(),
  /** Rédigée par `redactFinance` : `null` sans `finance:read`, `null` aussi
   *  quand le coût chargé n'est pas saisi. `canReadFinance` distingue les deux. */
  marginPercent: z.number().nullable(),
  nextAction: z.enum(['renewal_overdue', 'renew_now', 'renew_soon', 'set_end_date', 'none']),
})
export type ActiveMissionRow = z.infer<typeof activeMissionRowSchema>

/**
 * Ce qu'il reste à faire sur une mission qui tourne.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE VIT ICI, ET PLUS DANS UN SERVICE (#1354, #1355, #1357, #1366)
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle était une fonction PRIVÉE d'`account-missions.service.ts`, donc
 * atteignable par le seul onglet Missions d'un dossier de compte. Pendant ce
 * temps `/missions` — la liste que le commercial ouvre tous les matins —
 * affichait « Renouvellement non engagé » et « Sans date de fin » en badges
 * MUETS : l'alerte sans la porte. Le motif habituel du dépôt, du calcul juste
 * que personne n'appelle.
 *
 * La recopier dans le second service aurait fabriqué deux échelles d'urgence
 * qui divergent au premier ajout — une dérivation vit à UN seul endroit
 * (GA-26). Elle est donc remontée au contrat, à côté du vocabulaire qu'elle
 * produit : `activeMissionRowSchema.shape.nextAction`, que `nextActionLink`
 * lit déjà pour désigner la destination.
 *
 * Dérivée de la fenêtre de renouvellement, et de rien d'autre : une seconde
 * échelle d'urgence divergerait de celle des alertes. `far` rend `none`, ce qui
 * est une vérité — pas un vide, et `nextActionLink` lui refuse toute
 * destination pour cette raison exacte.
 */
export function activeMissionNextAction(window: RenewalWindow): ActiveMissionRow['nextAction'] {
  if (window === 'overdue') return 'renewal_overdue'
  // #2195.21 — les deux fenêtres nées le 16/09/2026 se RANGENT dans l'échelle
  // existante plutôt que d'en ouvrir une seconde. `j15` rejoint « maintenant »
  // (une quinzaine ne laisse plus le temps d'une proposition qui mûrit), `j45`
  // rejoint « bientôt ». Inventer deux verbes de plus aurait fait quatre
  // degrés d'urgence là où le produit en tient trois, et le vocabulaire de
  // `nextAction` est LU par `nextActionLink` pour choisir une destination.
  if (window === 'imminent' || window === 'j15' || window === 'j30') return 'renew_now'
  if (window === 'j45' || window === 'j60') return 'renew_soon'
  // Sans date de fin, la seule action possible est d'en poser une : aucune
  // fenêtre ne se déclenchera jamais sur cette mission.
  if (window === 'unknown') return 'set_end_date'
  return 'none'
}

/* ── Bloc 2 — les missions passées ────────────────────────────────────────── */

/**
 * « + motif de fin et retour collecté ou non ».
 *
 * ⚠️ Le motif vient du JOURNAL (`record_field_audit`, champ `move_reason`) :
 * c'est le seul endroit où il est écrit, et il ne l'est que sur une perte
 * déclarée depuis le board. `null` veut donc dire « personne ne l'a écrit »,
 * jamais « il n'y en avait pas ».
 */
export const pastMissionRowSchema = missionIdentitySchema.extend({
  endReason: z.string().nullable(),
  /** Un REX existe-t-il pour cette mission ? Le retour lui-même n'est pas ici :
   *  il se lit dans « Preuves & REX », où il se collecte. */
  feedbackCollected: z.boolean(),
})
export type PastMissionRow = z.infer<typeof pastMissionRowSchema>

/* ── Bloc 3 — les consultants placés ──────────────────────────────────────── */

/**
 * « Marc a fait 3 missions ici » — un qui / quand / combien de fois, pas un
 * nombre. Le nombre seul ne dit pas s'il est encore sur place.
 */
export const placedConsultantSchema = z.object({
  consultantId: z.string().guid(),
  fullName: z.string(),
  /** `positive()` : quelqu'un qui n'a jamais été placé n'apparaît pas. */
  missions: z.number().int().positive(),
  firstStartedOn: z.string().nullable(),
  lastEndedOn: z.string().nullable(),
  /** Une affectation en cours — c'est un expert SUR PLACE aujourd'hui. */
  stillOnSite: z.boolean(),
})
export type PlacedConsultant = z.infer<typeof placedConsultantSchema>

/* ── Bloc 4 — ce que ce client achète ─────────────────────────────────────── */

/**
 * « tarif vendu moyen · durée moyenne · types de profil ».
 *
 * C'est le bloc qui prépare la prochaine vente : un tarif moyen de 640 € dit
 * tout de suite si une proposition à 750 € va passer.
 *
 * ⚠️ Le tarif vendu moyen n'est PAS recalculé ici. Il vient de
 * `PropagationService.digest()`, où il vit déjà (PDF 2 §4.3) — deux calculs du
 * même chiffre divergent le jour où l'un des deux change.
 */
export const accountBuyingProfileSchema = z.object({
  /** `null` = aucune mission de ce compte ne porte de TJM (un forfait n'en a
   *  pas). Jamais 0 : « ce client achète à 0 € » n'est pas une mesure. */
  averageSoldDailyRateCents: z.number().int().positive().nullable(),
  /** Le « sur N missions » — toutes missions confondues. */
  missions: z.number().int().positive(),
  /** Missions sorties du tarif moyen faute de TJM : la moyenne est partielle,
   *  et elle le dit. */
  missionsWithoutRate: z.number().int().nonnegative(),
  /** `null` = aucune mission n'a ses DEUX dates. Une durée moyenne de 0 jour
   *  n'existe pas. */
  averageDurationDays: z.number().int().positive().nullable(),
  /** Missions sorties de la durée moyenne faute d'une date. Comptées, jamais
   *  fondues dans le dénominateur. */
  missionsWithoutDuration: z.number().int().nonnegative(),
  /** Les rôles achetés, du plus fréquent au moins fréquent. */
  roleTitles: z.array(z.object({ roleTitle: z.string(), missions: z.number().int().positive() })),
  /** Missions sans rôle renseigné — elles ne sont pas un rôle « Non
   *  renseigné », elles sont hors du décompte, et il le dit. */
  missionsWithoutRoleTitle: z.number().int().nonnegative(),
})
export type AccountBuyingProfile = z.infer<typeof accountBuyingProfileSchema>

/* ── Bloc 5 — ce qu'il ne renouvelle pas ──────────────────────────────────── */

/**
 * « les missions terminées sans suite, avec leur motif ».
 *
 * ⚠️ « Sans suite » se lit sur le RÔLE, pas sur le compte. Une mission terminée
 * chez un client où d'autres missions tournent n'est pas « renouvelée » pour
 * autant : ce qui n'a pas repris, c'est ce profil-là. Compter au niveau du
 * compte viderait ce bloc chez tous les gros clients — c'est-à-dire chez ceux
 * pour qui la question se pose.
 */
export const notRenewedMissionRowSchema = missionIdentitySchema.extend({
  endReason: z.string().nullable(),
  /**
   * Une mission du MÊME rôle a-t-elle démarré depuis ?
   *
   * `null` = indécidable — le rôle n'est pas renseigné, ou la mission n'a pas
   * de date de fin. « On ne sait pas » n'est pas « non ».
   */
  sameRoleResumed: z.boolean().nullable(),
})
export type NotRenewedMissionRow = z.infer<typeof notRenewedMissionRowSchema>

/* ── La réponse de la route ───────────────────────────────────────────────── */

export const accountMissionsSchema = propagatedBlockSchema.extend({
  accountId: z.string().guid(),
  /**
   * Le DROIT voyage avec la réponse (D45). Sans lui, `marginPercent: null` ne
   * distingue plus « pas ton périmètre » de « coût chargé non renseigné », et
   * l'écran finit par écrire un zéro pour les deux.
   */
  canReadFinance: z.boolean(),
  active: z.array(activeMissionRowSchema),
  past: z.array(pastMissionRowSchema),
  placedConsultants: z.array(placedConsultantSchema),
  /** `null` = ce compte n'a AUCUNE mission. Un profil d'achat rempli de zéros
   *  se lirait comme une mesure. */
  buying: accountBuyingProfileSchema.nullable(),
  notRenewed: z.array(notRenewedMissionRowSchema),
  /**
   * COMMENT CE CLIENT PAIE — le dire avant la négociation, pas après.
   *
   * Quatre absences distinctes, et l'écran doit pouvoir les dire différemment —
   * `canReadFinance` juste au-dessus est ce qui permet de les départager :
   *  · l'objet est `null` ET `canReadFinance === false` → **pas ton périmètre**.
   *    C'est `redactFinance` qui l'a vidé (D45) ;
   *  · l'objet est `null` ET `canReadFinance === true` → **la lecture a échoué**.
   *    « Cassé » et « non mesurable » ne se rendent jamais pareil : l'écran dit
   *    qu'il n'a pas pu lire, il n'annonce pas un client sans historique ;
   *  · `measurability.measurable === false` → **pas assez d'historique**, et le
   *    champ dit de combien de factures il manque ;
   *  · `lateCount === null` avec le droit et sous le seuil → même cause, jamais
   *    « zéro retard », qui serait une bonne nouvelle tirée d'un silence.
   *
   * Ce qui sort est un DÉCOMPTE avec son dénominateur et sa période — jamais un
   * score, jamais une probabilité, jamais un rang parmi les clients.
   */
  paymentBehaviour: paymentBehaviourSchema.nullable(),
  /**
   * #2124.26 — LE REVENU HISTORIQUE, réservé à un rôle autorisé.
   *
   * La SOMME de ce qui a été FACTURÉ à ce compte (`invoice_readiness`), toutes
   * missions confondues — distinct de `buying.averageSoldDailyRateCents`
   * (un TARIF MOYEN, pas un total) et de `paymentBehaviour` (le COMPORTEMENT
   * de paiement, pas le montant cumulé). Même source de données que
   * `paymentBehaviour`, donc la même porte : `null` sans `finance:read`
   * (redigé par `redactFinance`) ET `null` quand ce compte n'a AUCUNE facture
   * — les deux absences ne se distinguent que par `canReadFinance`, comme
   * `paymentBehaviour` juste au-dessus.
   */
  historicalInvoicedRevenueCents: z.number().int().nonnegative().nullable(),
})
export type AccountMissions = z.infer<typeof accountMissionsSchema>

/**
 * Les statuts qui font qu'une mission TOURNE — par opposition à celles qui sont
 * derrière nous.
 *
 * `paused` est du côté actif : une mission suspendue reprend, et la ranger dans
 * l'historique la ferait disparaître du seul écran où quelqu'un peut décider de
 * la relancer.
 */
// #2407.5 — les statuts ajoutés rejoignent leur côté (phase « signée » ou « en cours »).
export const RUNNING_MISSION_STATUSES = [
  'onboarding',
  'active',
  'paused',
  'ready_to_start',
  'at_risk',
  'renewal_pending',
  'ending',
] as const

/**
 * Ce qui est DERRIÈRE nous. `renewed` en fait partie : la mission renouvelée
 * est terminée, c'est celle qui lui succède qui tourne.
 */
export const FINISHED_MISSION_STATUSES = [
  'ended',
  'terminated',
  'renewed',
  'completed',
  'cancelled',
  'archived',
] as const

/**
 * Les missions qui ont fini SANS renouvellement — le vivier du bloc 5.
 *
 * `renewed` en est exclu par définition : c'est le statut qui dit qu'il y a eu
 * une suite.
 */
export const NOT_RENEWED_MISSION_STATUSES = ['ended', 'terminated', 'completed'] as const
