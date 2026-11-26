import { z } from 'zod'
import { assignmentStatusSchema } from './status-transitions.js'
import { currencyCodeSchema, missionCostBreakdownSchema, missionCostSourceSchema } from './mission-cost-source.js'

/**
 * Le STAFFING — qui est sur quelle mission, à quelle charge, et jusqu'à quand.
 *
 * `mission_assignments` existait depuis le Delivery OS et n'était câblée à rien :
 * aucune écriture, aucune lecture, aucun écran. Conséquence directe, et c'est le
 * défaut que cette tranche corrige : la **disponibilité d'un consultant était un
 * champ saisi à la main**. Quelqu'un cochait « disponible immédiatement » en
 * mars, la personne partait en mission en avril, et le vivier continuait de la
 * proposer tout l'été. Un vivier qui propose des gens occupés est pire qu'un
 * vivier vide : il fait perdre le rendez-vous ET la crédibilité.
 *
 * La disponibilité se DÉDUIT donc des affectations. Deux précautions :
 *
 *  - le champ saisi n'est pas supprimé. Il reste la réponse quand aucune
 *    affectation n'existe — une ESN qui ne renseigne pas ses missions ne doit
 *    pas voir tout son vivier basculer en « disponible » du jour au lendemain.
 *  - une affectation SANS DATE DE FIN ne rend pas quelqu'un disponible « un
 *    jour » : elle le rend occupé, sans date. Inventer une fin ferait apparaître
 *    une disponibilité qui n'a jamais été promise.
 */

/** Ce dont le calcul de charge a besoin — jamais l'entité complète. */
export type AssignmentWindow = {
  loadPercent: number
  startsOn: string
  /** `null` = sans fin connue. Occupé, sans date. */
  endsOn: string | null
  /**
   * #3068 (NO-GO #2414/#2986) — `true` quand cette affectation porte une
   * INTERRUPTION déclarée (`mission_interruptions`) dont `availability_confirmed`
   * est encore `false`. Absent/`false` pour toute affectation ordinaire — une
   * fin normale ou expirée n'a rien à confirmer, ce n'est pas le NO-GO.
   */
  interruptionUnconfirmed?: boolean
}

export const assignmentInputSchema = z
  .object({
    consultantId: z.string().guid(),
    /** 1 à 100. Zéro n'est pas une affectation, c'est son absence. */
    loadPercent: z.number().int().min(1).max(100).default(100),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : AAAA-MM-JJ'),
    endsOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : AAAA-MM-JJ')
      .nullable()
      .default(null),
    /**
     * #2407.4 — le TAUX de cette affectation, en centimes par jour. Donnée
     * financière : ne s'écrit qu'à `finance:read` (vérifié côté service).
     * Optionnel : une affectation sans taux saisi n'en invente aucun.
     */
    dailyRateCents: z.number().int().nonnegative().nullable().optional(),
    /** #2407.4 — le LIEU d'exécution, dans les mots de celui qui le saisit. */
    workLocation: z.string().trim().min(1).max(200).nullable().optional(),
    /** #2407.4 — le MODE de travail. */
    remoteMode: z.enum(['onsite', 'hybrid', 'remote']).nullable().optional(),
    /**
     * #2407.4 (suite) — le CONSENTEMENT déclaré : oui ou non, jamais deviné.
     * `consentDate` n'a de sens QUE si `consentGiven` est renseigné (oui OU
     * non) — un « non » se date aussi, c'est le refus qui compte, pas son
     * sens (`.refine` ci-dessous, même contrainte que la base, GA-11/GA-12).
     */
    consentGiven: z.boolean().nullable().optional(),
    consentDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : AAAA-MM-JJ')
      .nullable()
      .optional(),
    /** #2407.4 (suite) — DÉCLARATIFS, texte libre : jamais un sous-système de
     *  suivi documentaire (decisions §1, version minimale). */
    documentsExpected: z.string().trim().min(1).max(2000).nullable().optional(),
    documentsReceived: z.string().trim().min(1).max(2000).nullable().optional(),
    /** #2407.4 (suite) — DÉCLARATIF, texte libre. Aucun score, aucune
     *  probabilité (doctrine : refusé six fois). */
    declaredRisks: z.string().trim().min(1).max(2000).nullable().optional(),
  })
  .strict()
  .refine(value => value.endsOn === null || value.endsOn >= value.startsOn, {
    message: 'Une affectation ne peut pas finir avant de commencer',
    path: ['endsOn'],
  })
  .refine(value => !value.consentDate || value.consentGiven !== undefined, {
    message: 'Une date de consentement suppose un consentement déclaré (oui ou non)',
    path: ['consentDate'],
  })
export type AssignmentInput = z.infer<typeof assignmentInputSchema>

export const missionAssignmentSchema = z.object({
  id: z.string().guid(),
  missionId: z.string().guid(),
  missionLabel: z.string().nullable(),
  accountName: z.string().nullable(),
  consultantId: z.string().guid(),
  consultantName: z.string().nullable(),
  loadPercent: z.number().int().min(1).max(100),
  startsOn: z.string(),
  endsOn: z.string().nullable(),
  createdAt: z.string(),
  /** #2407.4 — ABSENT sans `finance:read` : jamais `null`, qui se lirait
   *  « aucun taux saisi ». `null` = lu, et non saisi. */
  dailyRateCents: z.number().int().nullable().optional(),
  workLocation: z.string().nullable().optional(),
  remoteMode: z.enum(['onsite', 'hybrid', 'remote']).nullable().optional(),
  /** #2407.6 — le statut PROPRE de l'affectation, indépendant de la mission
   *  (decisions §9). `.optional()` : un objet écrit à la main ailleurs n'a pas
   *  à le recopier pour rester valide. */
  status: assignmentStatusSchema.optional(),
  /** #2407.4 (suite) — DÉCLARATIFS. `.optional()` : lus par la route
   *  existante, absents d'un objet plus ancien sans casser sa validité. */
  consentGiven: z.boolean().nullable().optional(),
  consentDate: z.string().nullable().optional(),
  documentsExpected: z.string().nullable().optional(),
  documentsReceived: z.string().nullable().optional(),
  declaredRisks: z.string().nullable().optional(),
})
export type MissionAssignment = z.infer<typeof missionAssignmentSchema>

/**
 * Ce qu'on peut dire de la disponibilité de quelqu'un À PARTIR de ses
 * affectations.
 *
 * `unknown` n'est pas un remplissage : il veut dire « aucune affectation
 * enregistrée », donc « je ne sais pas », et l'écran doit alors montrer ce que
 * la fiche déclare — pas conclure que la personne est libre.
 */
/**
 * #3068 — `a_confirmer` REJOINT EN FIN DE LISTE (GA-08) : une interruption
 * déclarée dont la disponibilité n'est pas encore confirmée. Homogène avec
 * `a_confirmer` du DÉCLARATIF périmé (#2186.14, `declared-availability.ts`) —
 * même mot, même refus de dire « disponible » sans confirmation.
 */
export const DERIVED_AVAILABILITIES = [
  'available',
  'partial',
  'busy',
  'busy_open_ended',
  'unknown',
  'a_confirmer',
] as const
export const derivedAvailabilitySchema = z.enum(DERIVED_AVAILABILITIES)
export type DerivedAvailability = (typeof DERIVED_AVAILABILITIES)[number]

export const staffingStateSchema = z.object({
  availability: derivedAvailabilitySchema,
  /** Charge cumulée aujourd'hui, en pourcentage. Peut dépasser 100 : c'est un
   *  fait, et le masquer cacherait un sur-staffing réel. */
  loadPercent: z.number().int().nonnegative(),
  /** Quand la personne se libère. `null` = inconnu OU sans fin — les deux se
   *  distinguent par `availability`, jamais par une date inventée. */
  freeFrom: z.string().nullable(),
  assignments: z.number().int().nonnegative(),
})
export type StaffingState = z.infer<typeof staffingStateSchema>

/** Un jour `YYYY-MM-DD` dans le fuseau du lecteur. */
function dayKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * La disponibilité DÉDUITE des affectations.
 *
 * Trois règles, chacune contre une réponse fausse :
 *
 *  - **sans affectation, on ne conclut rien** (`unknown`). Une ESN qui ne
 *    renseigne pas ses missions verrait sinon tout son vivier basculer en
 *    « disponible » et proposerait des gens en poste.
 *  - **une affectation sans fin rend occupé SANS DATE** (`busy_open_ended`).
 *    Inventer une fin ferait apparaître une disponibilité jamais promise.
 *  - **la date de libération est la PLUS TARDIVE** des affectations en cours.
 *    Prendre la plus proche annoncerait quelqu'un libre le 1er alors qu'une
 *    autre mission court jusqu'au 30.
 */
export function deriveStaffing(assignments: readonly AssignmentWindow[], now: Date): StaffingState {
  const today = dayKey(now)
  const active = assignments.filter(a => a.startsOn <= today && (a.endsOn === null || a.endsOn >= today))

  if (assignments.length === 0) {
    return { availability: 'unknown', loadPercent: 0, freeFrom: null, assignments: 0 }
  }
  if (active.length === 0) {
    // #3068 — une interruption déclarée et pas encore confirmée reste « à
    // confirmer » ICI AUSSI, pas seulement dans l'écran d'interruption
    // (`MissionEndService`) : c'est exactement le NO-GO que `#2414.49` pose.
    if (assignments.some(a => a.interruptionUnconfirmed === true)) {
      return { availability: 'a_confirmer', loadPercent: 0, freeFrom: null, assignments: assignments.length }
    }
    // Des affectations existent mais aucune ne court : la personne est libre, et
    // on le sait pour de bon — ce n'est pas la même chose que « on ne sait pas ».
    return { availability: 'available', loadPercent: 0, freeFrom: today, assignments: assignments.length }
  }

  const loadPercent = active.reduce((sum, a) => sum + a.loadPercent, 0)
  const openEnded = active.some(a => a.endsOn === null)
  if (openEnded) {
    return { availability: 'busy_open_ended', loadPercent, freeFrom: null, assignments: assignments.length }
  }

  // La plus TARDIVE : la personne n'est libre que quand la dernière mission est
  // finie, pas quand la première l'est.
  const freeFrom = active.reduce<string | null>((latest, a) => {
    if (a.endsOn === null) return latest
    return latest === null || a.endsOn > latest ? a.endsOn : latest
  }, null)

  return {
    availability: loadPercent >= 100 ? 'busy' : 'partial',
    loadPercent,
    freeFrom,
    assignments: assignments.length,
  }
}

// ──────────────────────────── conditions commerciales ────────────────────────

export const BILLING_CADENCES = ['monthly', 'milestone', 'fixed_price'] as const
export const billingCadenceSchema = z.enum(BILLING_CADENCES)
export type BillingCadence = (typeof BILLING_CADENCES)[number]

/** Le point de départ du délai de règlement — date de FACTURE, ou fin de MOIS
 *  de la facture. Deux valeurs seulement : un troisième régime (fin de
 *  trimestre, etc.) n'a jamais été observé dans le produit et s'ajouterait en
 *  fin de liste le jour où il l'est (GA-08). */
export const PAYMENT_TERMS_BASES = ['invoice_date', 'end_of_month'] as const
export const paymentTermsBasisSchema = z.enum(PAYMENT_TERMS_BASES)
export type PaymentTermsBasis = (typeof PAYMENT_TERMS_BASES)[number]

/**
 * Les conditions commerciales d'une mission — la partie que seul un profil
 * `finance:read` voit.
 *
 * Le **coût chargé** est saisi à la main (arbitrage Louis #5). Aucune formule ne
 * le devine : il dépend du statut, de la convention collective, des charges
 * patronales et de la politique de l'ESN. Un coût moyen appliqué à tout le monde
 * produirait une marge fausse, plus dangereuse qu'une marge absente parce
 * qu'elle fait renoncer à une mission rentable ou accepter une mission à perte.
 */
/**
 * Par quel CHEMIN cette mission est arrivée (PDF 8 §5.3).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI C'EST SAISI ET NON DÉDUIT
 * ─────────────────────────────────────────────────────────────────────────────
 * On pourrait croire le canal dérivable : un partenaire connu sur le compte
 * ferait « rang 2 ». C'est faux une fois sur deux — un compte peut être servi en
 * direct ET via un intermédiaire, parfois la même année. Déduire le canal
 * produirait un écart de marge chiffré, présenté comme l'argument d'un chantier
 * rang 2 → rang 1, et fondé sur une supposition.
 *
 * `unknown` est le défaut, et il n'est pas un trou : les missions dont le canal
 * n'est pas renseigné sont comptées À PART dans le calcul, jamais versées dans
 * « direct » parce que c'est le cas le plus fréquent.
 */
export const MISSION_CHANNELS = [
  /** Contrat direct avec le client final. La référence à laquelle on compare. */
  'direct',
  /** Par un intermédiaire référencé. L'écart avec le direct EST le coût de l'intermédiation. */
  'partner',
  /** Nos consultants prêtés à une autre ESN. */
  'subcontracting',
  /** Non renseigné. Compté à part, jamais rangé avec le direct. */
  'unknown',
  /**
   * Le consultant est porté : une société de portage l'emploie et facture ses
   * frais de gestion par-dessus le TJM d'achat.
   *
   * ⚠️ EN FIN DE LISTE, APRÈS `unknown`, et ce n'est pas une coquille (GA-08) :
   * une taxonomie gelée s'allonge par la fin, même quand la valeur ajoutée se
   * lirait mieux ailleurs. L'ordre de cette énumération est un HISTORIQUE, pas
   * un classement de lecture — l'écran ordonne ses lignes comme il l'entend.
   *
   * Il manquait, et son absence ne se voyait pas : ces missions tombaient sur le
   * défaut `unknown`, c'est-à-dire dans le seau des ABSENCES. Un chemin
   * commercial parfaitement connu se lisait comme une fiche mal remplie, et
   * « la marge par canal » — l'indicateur sur lequel on lance ou non un chantier
   * de référencement — les comptait comme non renseignées.
   */
  'portage',
] as const
export const missionChannelSchema = z.enum(MISSION_CHANNELS)
export type MissionChannel = (typeof MISSION_CHANNELS)[number]

export const missionCommercialTermsSchema = z.object({
  missionId: z.string().guid(),
  /** Le canal, avec son défaut. Champ AJOUTÉ : `.default()` pour qu'une réponse
   *  d'avant le déploiement se lise encore. */
  channel: missionChannelSchema.default('unknown'),
  /** Coût CHARGÉ journalier, en centimes. `null` = non renseigné, jamais 0. */
  loadedDailyCostCents: z.number().int().nonnegative().nullable(),
  /**
   * Le client exige un bon de commande avant facturation.
   *
   * `.default(false)` pour la même raison que `channel` : une réponse d'avant le
   * déploiement se lit encore, et `false` est la valeur que porte la colonne
   * (`NOT NULL DEFAULT false`) — ce n'est pas un « on ne sait pas » déguisé.
   */
  requiresPo: z.boolean().default(false),
  poNumber: z.string().nullable(),
  /**
   * La DATE du bon de commande. `null` = non renseignée.
   *
   * `.optional()` en plus de `.nullable()`, à la différence des champs
   * d'origine : le service la fournit TOUJOURS, mais un objet `MissionCommercialTerms`
   * écrit à la main ailleurs (un test, un fixture) n'a pas à la recopier pour
   * rester valide — même raison que `poAmountCents`, `poVolumeDays`,
   * `poConsumedDays` et `poConsumption` juste en dessous.
   */
  poIssuedOn: z.string().nullable().optional(),
  /**
   * #2566.2 — La date jusqu'à laquelle le bon de commande COUVRE. `null` = non
   * renseignée : un bon de commande sans échéance connue n'est pas présumé
   * expiré. C'est elle que `assessInvoiceReadiness` compare à la fin du mois
   * facturé pour produire `po_period_mismatch` — le cas concret nommé par le
   * client, une mission longue dont le bon de commande expire en cours de
   * route. `.optional()` en plus de `.nullable()`, même raison que
   * `poIssuedOn` juste au-dessus : un objet écrit à la main ailleurs n'a pas à
   * la recopier pour rester valide.
   */
  poValidUntil: z.string().nullable().optional(),
  /** Le MONTANT du bon de commande, en CENTIMES. `null` = non renseigné, jamais
   *  0 : un bon de commande à 0 € n'existe pas. */
  poAmountCents: z.number().int().nonnegative().nullable().optional(),
  /** Le VOLUME de jours du bon de commande. `null` = non renseigné — sans lui,
   *  la barre de consommation ne s'affiche PAS (voir {@link poConsumption}). */
  poVolumeDays: z.number().nonnegative().nullable().optional(),
  /**
   * Les jours CONSOMMÉS — DÉRIVÉS de `mission_timesheets`, jamais stockés
   * (GA-26 : une dérivation vit à un seul endroit). `null` = aucun relevé
   * COMPTÉ pour cette mission : c'est « non mesuré », jamais « zéro
   * consommé » — les deux appellent des gestes différents.
   */
  poConsumedDays: z.number().nonnegative().nullable().optional(),
  /**
   * Le pourcentage consommé et les jours restants. `null` dès que
   * `poVolumeDays` OU `poConsumedDays` manque — c'est TOUT l'intérêt de
   * {@link poConsumption} : voir sa documentation.
   */
  poConsumption: z.object({ percent: z.number(), remainingDays: z.number() }).nullable().optional(),
  /**
   * #2422.7 — les AUTRES missions du même espace qui partagent ce même
   * `poNumber` — un bon de commande-cadre couvre souvent plusieurs lots. `[]`
   * quand `poNumber` est `null` ou qu'aucune autre mission ne le porte : une
   * LISTE vide n'affiche aucune ligne (doctrine « on n'affiche pas ce qu'on
   * n'a pas »), ce n'est pas un « non mesuré » à nommer. DÉRIVÉ à la lecture
   * (GA-26) — jamais stocké, jamais recalculé ailleurs.
   */
  poOtherMissions: z
    .array(z.object({ missionId: z.string().guid(), missionLabel: z.string(), accountName: z.string() }))
    .default([]),
  billingCadence: billingCadenceSchema.nullable(),
  /**
   * La commission de l'intermédiaire, en CENTIMES et par JOUR — la seconde
   * moitié du coût d'une mission `partner` ou `subcontracting`.
   *
   * `null` = non renseignée, jamais 0 : « le partenaire ne prend rien » et « on
   * ne sait pas ce qu'il prend » ne mènent pas à la même décision, et c'est
   * exactement ce que {@link trueDailyCostCents} distingue.
   */
  partnerCommissionDailyCents: z.number().int().nonnegative().nullable().default(null),
  /** Préavis contractuel, en jours. Ce qui décide quand il faut agir. */
  noticeDays: z.number().int().nonnegative().nullable(),
  notes: z.string().nullable(),
  /**
   * Le DÉLAI de règlement, en jours — « à 60 jours » (panneau de planification,
   * PDF-22 §7). Distinct de `dueOn` (`invoice-readiness.ts`), qui porte
   * l'échéance d'UNE facture précise une fois qu'elle existe : celui-ci est la
   * CONDITION contractuelle qui la produira, vraie avant toute facture.
   *
   * `.optional()` en plus de `.nullable()`, même raison que les champs du bon
   * de commande juste au-dessus : un objet écrit à la main ailleurs n'a pas à
   * le recopier pour rester valide. `null` = non renseigné, jamais 0 — un
   * délai de règlement à zéro jour n'existe pas en pratique et se lirait
   * « payé comptant », une AUTRE réponse que « on ne sait pas ».
   */
  paymentTermsDays: z.number().int().nonnegative().nullable().optional(),
  /** Le POINT DE DÉPART du délai — date de facture, ou fin de mois. `null` =
   *  non renseigné. Sans base, un délai seul ne dit pas quand il commence. */
  paymentTermsBasis: paymentTermsBasisSchema.nullable().optional(),
  /**
   * #2420 — LE MOTEUR DE MARGE (17/09/2026). Tous `.optional()`, même raison
   * que le bon de commande : une réponse d'avant la migration se lit encore.
   *  · `costSource` — freelance / salarié / partenaire / forfait ; `null` = non
   *    déclarée, le noyau historique s'applique ;
   *  · `currency` — la devise du TJM et du contrat ; `null` = non renseignée
   *    (les lignes historiques sont en euros, et le moteur le NOMME) ;
   *  · `costCurrency` — la devise du coût quand elle diffère ; `null` = la même.
   *    Deux devises différentes ne se soustraient pas : le moteur n'invente
   *    aucun taux de change ;
   *  · `costBreakdown` — la décomposition, voir `missionCostBreakdownSchema` ;
   *  · `costRecordedRateCents` — le TJM en vigueur quand le coût a été saisi,
   *    posé par le SERVEUR : c'est lui qui permet l'alerte « tarif changé ».
   */
  costSource: missionCostSourceSchema.nullable().optional(),
  currency: currencyCodeSchema.nullable().optional(),
  costCurrency: currencyCodeSchema.nullable().optional(),
  costBreakdown: missionCostBreakdownSchema.optional(),
  costRecordedRateCents: z.number().int().nonnegative().nullable().optional(),
  updatedAt: z.string(),
})
export type MissionCommercialTerms = z.infer<typeof missionCommercialTermsSchema>

/**
 * Ce qu'un `PUT /delivery/missions/:id/terms` accepte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX RÉGIMES DANS LE MÊME SCHÉMA, ET C'EST VOULU
 * ─────────────────────────────────────────────────────────────────────────────
 * Les six champs d'ORIGINE sont en REMPLACEMENT : absent vaut `null`, et le
 * client recopie ceux qu'il ne modifie pas. La fiche mission le fait déjà, avec
 * un commentaire qui dit pourquoi — « enregistrer un coût ne doit pas remettre
 * le chemin de la mission à non renseigné ».
 *
 * Les CINQ champs AJOUTÉS (`requiresPo`, `partnerCommissionDailyCents`, et
 * depuis le 30/08/2026 `poIssuedOn`, `poAmountCents`, `poVolumeDays`) sont en
 * FUSION : `undefined` veut dire « je ne parle pas de ce champ », et la valeur
 * en base ne bouge pas. Ils ne peuvent pas hériter du régime de remplacement,
 * parce qu'AUCUN client écrit avant eux ne sait les recopier : chaque
 * enregistrement de coût depuis un écran d'hier les effacerait en silence.
 * C'est le défaut « `raw_analysis` remplacé, pas fusionné », où « Actualiser »
 * détruisait les angles saisis à la main. Les trois derniers rejoignent le
 * même régime pour la même raison, exactement : ils naissent APRÈS `requiresPo`
 * et `partnerCommissionDailyCents`, et un `PUT` écrit avant eux — la fiche
 * mission elle-même, hier — ne sait pas les recopier.
 *
 * Ce que ça n'est PAS : un champ qu'on ne peut plus vider. `null` explicite
 * efface la commission ou le montant du bon de commande, `false` explicite
 * retire l'exigence de bon de commande. Seul le SILENCE est neutre.
 */
export const upsertCommercialTermsSchema = z
  .object({
    loadedDailyCostCents: z.number().int().min(0).max(1_000_000).nullable().default(null),
    channel: missionChannelSchema.default('unknown'),
    /** Absent = inchangé (voir l'entête). Explicite = décidé, `false` compris. */
    requiresPo: z.boolean().optional(),
    poNumber: z.string().trim().max(120).nullable().default(null),
    billingCadence: billingCadenceSchema.nullable().default(null),
    /**
     * Absent = inchangé ; `null` = effacée ; un entier = saisie, `0` compris.
     * Même borne que le coût chargé qu'elle complète : les deux sont des
     * centimes par jour, et deux plafonds différents sur la même unité
     * finiraient par se contredire.
     */
    partnerCommissionDailyCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
    noticeDays: z.number().int().min(0).max(365).nullable().default(null),
    notes: z.string().trim().max(2000).nullable().default(null),
    /** FUSION (voir l'entête). Absent = inchangé ; `null` = effacée. */
    poIssuedOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : AAAA-MM-JJ')
      .nullable()
      .optional(),
    /**
     * FUSION. Pas de plafond arbitraire — un bon de commande est un montant
     * TOTAL de contrat, pas un coût journalier : `loadedDailyCostCents` plafonne
     * à 1 000 000 centimes parce que c'est un TJM, une contrainte qui n'a pas de
     * sens ici. Même absence de plafond que `markInvoicedSchema.amountCents`
     * (invoice-readiness.ts), qui porte le même genre de montant agrégé.
     */
    poAmountCents: z.number().int().nonnegative().nullable().optional(),
    /** FUSION. Décimal — les demi-journées existent déjà sur
     *  `mission_timesheets.days`, et un volume de 49,5 jours n'a aucune raison
     *  de ne pas exister. Bornée à 100 000 comme garde-fou contre une saisie
     *  erronée, jamais comme limite métier réaliste. */
    poVolumeDays: z.number().nonnegative().max(100_000).nullable().optional(),
    /**
     * FUSION (30/08/2026, panneau de planification PDF-22 §7). Le DÉLAI de
     * règlement, en jours. Borné à 365 comme `noticeDays` juste au-dessus, pour
     * la même raison : un garde-fou contre une saisie fautive, pas une limite
     * métier — au-delà, ce n'est plus un délai de règlement qu'on négocie.
     */
    paymentTermsDays: z.number().int().min(0).max(365).nullable().optional(),
    /** FUSION. Le point de départ du délai — sans lui, un délai seul ne dit pas
     *  quand il commence à courir. */
    paymentTermsBasis: paymentTermsBasisSchema.nullable().optional(),
    /**
     * #2420 — FUSION, pour la raison de l'entête : aucun client écrit avant le
     * moteur ne sait les recopier. `costBreakdown` REMPLACE la décomposition
     * entière quand il est fourni — c'est un seul objet, saisi d'un seul
     * formulaire.
     */
    costSource: missionCostSourceSchema.nullable().optional(),
    currency: currencyCodeSchema.nullable().optional(),
    costCurrency: currencyCodeSchema.nullable().optional(),
    costBreakdown: missionCostBreakdownSchema.optional(),
    /**
     * #2566.2 — FUSION, AJOUTÉ EN FIN de liste pour la même raison que les
     * champs du moteur de marge juste au-dessus : il naît après eux, et un
     * `PUT` écrit avant lui — la fiche mission elle-même, hier — ne sait pas le
     * recopier. Format `YYYY-MM-DD`, comme `poIssuedOn`.
     */
    poValidUntil: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : AAAA-MM-JJ')
      .nullable()
      .optional(),
  })
  .strict()
export type UpsertCommercialTermsInput = z.infer<typeof upsertCommercialTermsSchema>

/**
 * La marge journalière d'une mission, en centimes et en pourcentage.
 *
 * Rend `null` dès qu'un des deux termes manque. C'est LA règle de ce fichier :
 * une marge calculée sur un coût supposé est une décision commerciale prise sur
 * une invention.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * C'EST LE NOYAU — le seul (D43 · 28/08/2026)
 * ─────────────────────────────────────────────────────────────────────────
 * Toute marge de mission du produit passe par ici : la fiche, la liste, le
 * board, les alertes de seuil, la marge par canal, l'agrégat de l'espace et
 * l'axe « marge » du score. Il y en avait CINQ implémentations — deux exportées
 * (`dailyMarginPercent` arrondissait à l'entier, `marginPercent` à la
 * décimale), une privée dans le board, et deux formules recopiées à la main
 * dans `revenue.service.ts` et `mission-scores.service.ts`. Cinq calculs de la
 * même chose divergent, et « 32 % » sur un écran contre « 31,8 % » sur l'autre
 * suffit à ce que personne ne croie plus ni l'un ni l'autre.
 *
 * Le coût attendu est TOUJOURS
 * `mission_commercial_terms.loaded_daily_cost_cents` — jamais
 * `missions.daily_cost`, que rien n'écrit (D43).
 *
 * Un terme non fini (`NaN`, `Infinity`) vaut « on ne sait pas » et non zéro :
 * un `numeric` illisible ne doit pas produire « ∞ % de marge ».
 */
export function missionMargin(input: {
  dailyRateCents: number | null
  loadedDailyCostCents: number | null
}): { amountCents: number; percent: number } | null {
  const { dailyRateCents, loadedDailyCostCents } = input
  if (dailyRateCents === null || loadedDailyCostCents === null) return null
  if (!Number.isFinite(dailyRateCents) || !Number.isFinite(loadedDailyCostCents)) return null
  if (dailyRateCents <= 0) return null
  const amountCents = dailyRateCents - loadedDailyCostCents
  return { amountCents, percent: Math.round((amountCents / dailyRateCents) * 1000) / 10 }
}

// ── Frais de mission (30/08/2026) ────────────────────────────────────────────

/**
 * La somme des lignes de frais d'une mission, en centimes.
 *
 * `0` sur une mission sans ligne est un fait VRAI — « personne n'a saisi de
 * frais » — et non un « non mesuré » déguisé : contrairement au coût chargé,
 * l'absence de ligne EST la réponse, elle n'attend pas d'être renseignée.
 */
export function missionExpensesTotalCents(expenses: readonly { amountCents: number }[]): number {
  return expenses.reduce((sum, expense) => sum + expense.amountCents, 0)
}

/**
 * Le nombre de jours ÉCOULÉS depuis le début d'une mission — la durée sur
 * laquelle amortir ses frais.
 *
 * `null` sans date de début : une mission qui n'a pas commencé n'a pas de
 * durée sur laquelle répartir quoi que ce soit, et deviner en produirait une.
 *
 * Bornée à la date de FIN quand la mission est déjà terminée — une mission
 * finie en juillet ne doit pas voir ses frais amortis jusqu'à aujourd'hui, ce
 * qui diluerait leur coût sur des jours qu'elle n'a pas vécus.
 */
export function missionElapsedDays(
  startedOn: string | null | undefined,
  endsOn: string | null | undefined,
  today: Date = new Date(),
): number | null {
  if (!startedOn) return null
  const start = new Date(startedOn)
  if (Number.isNaN(start.getTime())) return null

  const end = endsOn ? new Date(endsOn) : null
  const hasEnded = end !== null && !Number.isNaN(end.getTime()) && end.getTime() < startOfDay(today).getTime()
  const boundary = hasEnded ? (end as Date) : startOfDay(today)

  const days = Math.floor((boundary.getTime() - start.getTime()) / 86_400_000) + 1
  return days > 0 ? days : null
}

/**
 * L'impact JOURNALIER moyen des frais engagés, amorti sur la durée écoulée.
 *
 * `null` sans durée amortissable — jamais une division par zéro ou par
 * l'inconnu déguisée en coût.
 */
export function amortizedExpenseDailyCents(expensesTotalCents: number, elapsedDays: number | null): number | null {
  if (elapsedDays === null || elapsedDays <= 0) return null
  if (!Number.isFinite(expensesTotalCents)) return null
  return Math.round(expensesTotalCents / elapsedDays)
}

/**
 * La marge journalière {@link missionMargin}, NETTE des frais engagés.
 *
 * Elle ne remplace PAS le NOYAU — elle l'appelle, et en soustrait l'impact
 * journalier moyen des frais. `missionMargin` reste donc la marge « hors
 * frais » partout où elle est déjà affichée ; celle-ci est la vue
 * complémentaire, montrée seulement quand elle est réellement calculable.
 *
 * `null` dans TROIS cas, et les trois se lisent différemment à l'écran :
 *  - la marge de base est déjà `null` (TJM ou coût chargé manquant) — rien à
 *    amortir sur un coût qu'on ne connaît pas ;
 *  - aucun frais n'a été saisi (`expensesTotalCents <= 0`) — il n'y a rien à
 *    ajouter à la marge de base, qui reste donc la seule figure pertinente ;
 *  - des frais existent mais ne sont pas amortissables faute de date de début
 *    (`elapsedDays: null`) — l'appelant garde alors `expensesTotalCents > 0`
 *    pour le DIRE, plutôt que de fabriquer un pourcentage sur une durée
 *    inconnue.
 */
export function missionMarginWithExpenses(input: {
  dailyRateCents: number | null
  loadedDailyCostCents: number | null
  expensesTotalCents: number
  elapsedDays: number | null
}): { amountCents: number; percent: number } | null {
  const base = missionMargin({
    dailyRateCents: input.dailyRateCents,
    loadedDailyCostCents: input.loadedDailyCostCents,
  })
  if (base === null) return null
  if (!Number.isFinite(input.expensesTotalCents) || input.expensesTotalCents <= 0) return null

  const amortized = amortizedExpenseDailyCents(input.expensesTotalCents, input.elapsedDays)
  if (amortized === null) return null

  // `base !== null` garantit que `dailyRateCents` est un nombre fini et > 0 —
  // c'est exactement ce que `missionMargin` vient de vérifier pour produire
  // `base`. L'assertion documente cette garantie, elle ne la contourne pas.
  const rateCents = input.dailyRateCents as number
  const amountCents = base.amountCents - amortized
  return { amountCents, percent: Math.round((amountCents / rateCents) * 1000) / 10 }
}

/**
 * Minuit UTC de la date CALENDAIRE locale — pour comparer des DATES, pas des
 * instants.
 *
 * ⚠️ `started_on`/`ends_on` sont des chaînes `YYYY-MM-DD` (`z.string().date()`),
 * que `new Date(...)` analyse TOUJOURS en minuit UTC (ECMA-262). Ancrer « today »
 * sur un minuit LOCAL comparerait deux horloges différentes et décalerait le
 * compte d'un jour selon le fuseau du serveur qui exécute le calcul — mesuré :
 * 29 au lieu de 30 en UTC+2. Les deux bords doivent donc être le même minuit UTC.
 */
function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
}

/**
 * Les champs qui portent un COÛT, une MARGE ou un MONTANT FACTURÉ — les seuls
 * que l'absence de `finance:read` vide.
 *
 * ⚠️ Le prix de VENTE UNITAIRE n'y est pas, et ce n'est pas un oubli. Le TJM
 * facturé (`dailyRateCents`, `daily_rate`, `target_tjm_cents` d'un besoin) sort
 * de l'API SANS `finance:read` — le board le rend inconditionnellement, la
 * fiche mission l'affiche, les totaux de colonne du kanban des besoins se
 * calculent dessus. Deux fausses alertes financières ont déjà été levées dans ce
 * dépôt sur ce point, une troisième le 29/08/2026 : élargir la rédaction au TJM
 * masquerait un chiffre que le produit montre exprès, c'est-à-dire INVENTER une
 * règle au lieu d'en protéger une.
 *
 * Ce qui se garde tient en deux familles :
 *
 *  1. **Ce qui laisse REMONTER au coût** — les quatre noms d'origine, qui
 *     viennent du dépôt tel qu'il était et pas d'une théorie :
 *      · `margin` — `{ amountCents, percent }`, la fiche mission ;
 *      · `marginPercent` — un pourcentage nu, la liste des missions et le board ;
 *      · `loadedDailyCostCents` — le coût chargé journalier ;
 *      · `terms` — l'objet de conditions commerciales, qui CONTIENT le coût.
 *
 *  2. **L'ARGENT du mois** — ajoutés le 29/08/2026 avec « prêt à facturer ».
 *     Un TJM est une condition de vente ; le montant préparé, facturé et
 *     encaissé d'un mois est la position de trésorerie de l'ESN, et c'est
 *     exactement ce que `finance:read` garde déjà sur
 *     `/delivery/finance/revenue` et `/delivery/finance/propagation`. Les
 *     laisser sortir sur `/delivery/invoice-readiness` servait le même chiffre
 *     sous une autre porte :
 *      · `preparedAmountCents` — le montant préparatoire d'un mois, et son total ;
 *      · `invoicedAmountCents` — ce qui a réellement été facturé ;
 *      · `paidAmountCents` — ce qui a réellement été encaissé ;
 *      · `blockedAmountCents` — le total immobilisé par les bloqueurs.
 */
export const REDACTED_FINANCE_FIELDS = [
  'margin',
  'marginPercent',
  'loadedDailyCostCents',
  'terms',
  'preparedAmountCents',
  'invoicedAmountCents',
  'paidAmountCents',
  'blockedAmountCents',
  // Les frais (30/08/2026) : leur somme et la marge nette qui en tient
  // compte sont un COÛT au même titre que `loadedDailyCostCents` — la même
  // porte les garde.
  'expensesTotalCents',
  'marginWithExpenses',
  // Les factures fournisseur (30/08/2026) — même famille : un montant qu'on
  // doit à un sous-traitant est un COÛT.
  'supplierInvoicesTotalCents',
  /**
   * LES DEUX MONTANTS DU PAIEMENT SORTANT (31/08/2026) — ajoutés EN FIN.
   *
   * Ce qu'on DOIT au consultant et ce qui est réellement SORTI sont des COÛTS,
   * exactement comme la facture du sous-traitant juste au-dessus : la même
   * porte les garde, et une seconde rédaction écrite à la main aurait rouvert
   * la divergence que D45 vient de refermer.
   *
   * ⚠️ Ils portent un nom PROPRE plutôt que `amountCents`, et ce n'est pas une
   * coquetterie : `amountCents` est aussi le nom du montant d'une facture
   * fournisseur et d'un frais de mission, qui passent par d'autres routes.
   * L'inscrire ici viderait des champs que personne n'a demandé de vider —
   * une garde qui INVENTE une règle au lieu d'en protéger une.
   */
  'payableAmountCents',
  'settledAmountCents',
  /** Le TOTAL d'une tuile de l'entête des paiements sortants — la somme des
   *  deux champs ci-dessus. Les quatre seaux partagent la même forme, donc une
   *  seule entrée les couvre tous les quatre. */
  'totalAmountCents',
  /**
   * LE COMPORTEMENT DE PAIEMENT D'UN CLIENT (01/09/2026) — ajouté EN FIN.
   *
   * « Trois retards sur onze factures » se lit sur les factures émises à ce
   * compte : c'est de la donnée de facturation CLIENT, au même titre que le
   * montant facturé et le montant encaissé juste au-dessus, et elle passe donc
   * par la même porte. La rédiger à la main dans le service aurait été la
   * cinquième rédiger-à-la-main que D45 vient de refermer — et pire : le champ
   * ne figurant pas dans cette liste, `finance-redaction-single-path.spec.ts`
   * serait restée VERTE dessus. Une garde ne voit que ce qui est nommé.
   *
   * ⚠️ L'objet ENTIER passe à `null`, décomptes et mesurabilité compris. Ne
   * vider que les décomptes laisserait « pas assez d'historique pour mesurer »
   * s'afficher à quelqu'un qui n'a pas le droit de le savoir — et surtout,
   * l'écran ne pourrait plus distinguer « pas ton périmètre » de « pas assez
   * de factures », qui appellent deux gestes opposés.
   */
  'paymentBehaviour',
  /**
   * LES DEUX MONTANTS DU CA NON ADRESSÉ (01/09/2026) — ajoutés EN FIN.
   *
   * « Trois besoins Kubernetes fermés faute de profil ce trimestre. TJM cibles
   * cumulés : 1 860 €/jour » (PDF 4 §8.4). Les deux sont construits à partir de
   * `project_needs.target_tjm_cents`, c'est-à-dire d'un TJM VENDU : la même
   * donnée que `daily_rate` sur une mission, et donc la même porte.
   *
   * ⚠️ Nom PROPRE, pour la raison écrite au bloc précédent : `amountCents` est
   * déjà le montant d'une facture fournisseur et d'un frais de mission.
   */
  'unaddressedRevenueCents',
  'cumulativeDayRateCents',
  /**
   * LES QUATRE CHIFFRES DE LA CESSION (31/08/2026) — ajoutés EN FIN.
   *
   * `GET /factoring` fermait la porte au niveau de la ROUTE (`finance:read`
   * sec, 403 sinon) : une cession EST un montant, et une ligne qui les retire
   * tous ne dit plus rien. Mais ça laissait sans vue « nombres seulement » —
   * ce que `CollectionsPage` offre déjà sur les encaissements. Ces quatre
   * champs sont ce qui rend la lecture REDACTABLE plutôt que TOUT-OU-RIEN :
   * le nombre de cessions, leur statut et leur mission restent lisibles, seuls
   * les montants qui les chiffrent se vident.
   *
   *  · `assignedAmountCents` — le montant CÉDÉ d'une cession, sur la ligne ;
   *  · `commissionAmountCents` — ce que le factor retient, sur la ligne ;
   *  · `settledCents` — ce que le factor a RÉELLEMENT réglé, dans le verdict
   *    de réconciliation d'une cession ;
   *  · `varianceCents` — l'écart réglé moins attendu, dans le même verdict ET
   *    au total de l'entête (`FactoringSummary.varianceCents`) — les deux
   *    partagent ce nom, et la même entrée les couvre.
   *
   * ⚠️ Les totaux PAR SEAU de l'entête (`outstanding.amountCents`,
   * `awaiting.amountCents`, `missing.amountCents`, `unreconciled.amountCents`)
   * n'y sont PAS : leur champ s'appelle `amountCents`, un nom générique que
   * `supplier-invoice.ts`, `expense-report.ts`, `mission-expense.ts` et
   * `revenue.ts` portent aussi — l'inscrire viderait des montants que
   * personne n'a demandé de vider (le piège que le docblock d'en-tête de ce
   * fichier nomme déjà pour `amountCents`). Ces quatre totaux restent donc
   * visibles sans `finance:read` : l'exposition VOULUE de ce lot est
   * « l'encours agrégé se lit, le détail par cession se rédige ».
   *
   * ⚠️ **`expectedNetCents` s'y ajoute, en CINQUIÈME** — trouvé en écrivant le
   * test de fuite, pas dans la demande initiale. Le net attendu d'une cession
   * (`assignedAmountCents` moins la commission) survivait aux quatre champs
   * ci-dessus : `reconcileAssignment` le calcule sur le montant RÉEL avant
   * toute rédaction, et rien ne le retirait ensuite — un lecteur sans
   * `finance:read` aurait donc lu le montant cédé exact par une porte dérobée,
   * à un centime près, sur toute cession `awaiting`. Un nom UNIQUE au
   * domaine (aucune collision ailleurs dans ce dépôt), donc sûr à inscrire ici.
   */
  'assignedAmountCents',
  'commissionAmountCents',
  'settledCents',
  'varianceCents',
  'expectedNetCents',
  /**
   * #2420 — LE CALCUL DU MOTEUR DE MARGE (17/09/2026), ajouté EN FIN. Il porte
   * les coûts utilisés, un à un : c'est un COÛT au même titre que
   * `loadedDailyCostCents`, et l'objet ENTIER passe à `null`, comme
   * `paymentBehaviour` — ne vider que les montants laisserait lire la
   * structure du coût à qui n'a pas le droit de la voir.
   */
  'marginEngine',
  /**
   * #2124.26 (23/09/2026) — LE REVENU HISTORIQUE D'UN COMPTE, ajouté EN FIN.
   *
   * La SOMME de ce qui a été facturé à ce compte, toutes missions confondues
   * (`invoice_readiness.invoiced_amount_cents`) — même source que
   * `paymentBehaviour` juste au-dessus, donc la même porte. « Le revenu
   * historique n'est visible que pour un rôle autorisé » (#2124.26) : c'est
   * un montant de facturation CLIENT, pas un fait public du dossier.
   */
  'historicalInvoicedRevenueCents',
] as const
type RedactedFinanceField = (typeof REDACTED_FINANCE_FIELDS)[number]

/**
 * Ce qu'on montre à quelqu'un qui n'a PAS `finance:read`.
 *
 * **Le champ est mis à `null`, jamais retiré** (D45, 28/08/2026). Trois
 * rédactions écrites à la main avaient divergé — `delivery` retirait la clé,
 * `staffing` et le vivier la mettaient à `null` — et la forme de la réponse
 * dépendait donc de la route. Un client qui lit `data.margin === undefined` ne
 * peut pas distinguer « le serveur ne me l'envoie pas » d'« il n'y a pas de clé
 * de ce nom » ; une clé PRÉSENTE et vide, elle, se lit comme une case connue
 * qu'on n'a pas le droit de voir.
 *
 * Et jamais `0` : un zéro se lit comme une marge nulle, c'est-à-dire une
 * information — fausse — là où l'absence de droit ne dit rien du tout.
 *
 * ⚠️ Un champ ABSENT de l'objet reste absent : « présent mais vide » vaut pour
 * ce que la réponse porte, pas pour ce qu'elle n'a jamais eu. Ajouter
 * `margin: null` à une réponse sans marge annoncerait une case qui n'existe pas.
 *
 * ⚠️ Corollaire pour l'appelant : le DROIT doit voyager avec la réponse
 * (`canReadFinance`), sinon « pas le droit » et « pas mesuré » deviennent le
 * même `null` et l'écran ne peut plus les dire différemment.
 */
export function redactFinance<T extends Partial<Record<RedactedFinanceField, unknown>>>(
  row: T,
  canReadFinance: boolean,
): T {
  if (canReadFinance) return row
  const redacted: Record<string, unknown> = { ...row }
  for (const field of REDACTED_FINANCE_FIELDS) {
    // `in` et non `!== undefined` : c'est la PRÉSENCE de la clé qui décide, et
    // une clé posée à `undefined` est une clé présente.
    if (field in redacted) redacted[field] = null
  }
  return redacted as T
}

/**
 * La marge par CANAL — « l'indicateur le plus stratégique » du PDF 8 §5.3.
 *
 * L'écart entre le direct et le passage par un intermédiaire est ce qui justifie
 * ou non un chantier de référencement. Sans lui, la décision se prend au feeling.
 *
 * Trois règles, les mêmes que partout :
 *  · pondéré par les JOURS — une mission d'un jour ne pèse pas comme une mission
 *    d'un an, et une moyenne de pourcentages donnerait le contraire ;
 *  · une mission dont la marge n'est pas calculable sort du numérateur ET du
 *    dénominateur, et elle est COMPTÉE ;
 *  · un canal sans aucune mission mesurable rend `marginPercent: null`, jamais 0 —
 *    « 0 % de marge en rang 2 » se lirait comme un désastre plutôt que comme une
 *    absence de données.
 */
export function marginByChannel(
  rows: readonly {
    channel: MissionChannel
    dailyRateCents: number | null
    loadedDailyCostCents: number | null
    days: number | null
  }[],
): { channel: MissionChannel; marginPercent: number | null; missions: number; unmeasured: number }[] {
  return MISSION_CHANNELS.map(channel => {
    let revenue = 0
    let cost = 0
    let missions = 0
    let unmeasured = 0
    for (const row of rows) {
      if (row.channel !== channel) continue
      if (row.dailyRateCents === null || row.loadedDailyCostCents === null || row.days === null || row.days <= 0) {
        unmeasured += 1
        continue
      }
      revenue += row.dailyRateCents * row.days
      cost += row.loadedDailyCostCents * row.days
      missions += 1
    }
    return {
      channel,
      marginPercent: missions === 0 || revenue <= 0 ? null : Number((((revenue - cost) / revenue) * 100).toFixed(1)),
      missions,
      unmeasured,
    }
  })
}

/**
 * Le coût RÉEL d'une journée, commission d'intermédiaire comprise.
 *
 * Le coût tenait en une seule colonne saisie. Pour un salarié c'est juste ; pour
 * une mission passée par un partenaire ou en sous-traitance, le coût réel est le
 * TJM d'achat **plus la commission** — et rien ne portait cette seconde moitié.
 * La marge de ces missions était donc surévaluée, et c'est ce chiffre qui
 * alimente {@link marginByChannel} et {@link intermediationCost} : le calcul
 * censé mesurer le coût de l'intermédiation était faussé du montant même qu'il
 * cherche.
 *
 * **La règle dépend du canal, et c'est le point.** Sur `partner` ou
 * `subcontracting`, une commission INCONNUE rend le coût inconnu — le remplacer
 * par le TJM d'achat reviendrait à dire que l'intermédiaire travaille
 * gratuitement, exactement sur les missions où l'écart compte.
 *
 * `unknown` garde le comportement d'avant : on ne devine pas un canal, et le
 * faire retirerait sa marge à toute mission dont personne n'a renseigné le
 * chemin. Une commission à ZÉRO, elle, est une réponse — un partenaire qui ne
 * prend rien, ça existe.
 */
export function trueDailyCostCents(
  channel: MissionChannel,
  loadedDailyCostCents: number | null,
  partnerCommissionDailyCents: number | null,
): number | null {
  if (loadedDailyCostCents === null || !Number.isFinite(loadedDailyCostCents)) return null
  // `portage` rejoint les canaux intermédiés le 29/08/2026, à sa création : une
  // société de portage prend des frais de gestion, et une commission inconnue y
  // rend le coût inconnu pour la même raison que chez un partenaire — le
  // remplacer par le TJM d'achat ferait passer l'intermédiaire pour gratuit,
  // et afficherait une marge MEILLEURE que la réalité sur le canal qu'on vient
  // d'ajouter pour pouvoir le comparer aux autres.
  const needsCommission = channel === 'partner' || channel === 'subcontracting' || channel === 'portage'
  if (partnerCommissionDailyCents === null) return needsCommission ? null : loadedDailyCostCents
  if (!Number.isFinite(partnerCommissionDailyCents)) return null
  return loadedDailyCostCents + partnerCommissionDailyCents
}

/**
 * L'écart chiffré entre le direct et le passage par un intermédiaire.
 *
 * `null` dès qu'un des deux manque : annoncer « 12 points de coût
 * d'intermédiation » en comparant une valeur réelle à une valeur absente est
 * exactement le genre de chiffre sur lequel on lance un chantier d'un an.
 */
export function intermediationCost(
  byChannel: readonly { channel: MissionChannel; marginPercent: number | null }[],
): number | null {
  const direct = byChannel.find(entry => entry.channel === 'direct')?.marginPercent
  const partner = byChannel.find(entry => entry.channel === 'partner')?.marginPercent
  if (direct == null || partner == null) return null
  return Number((direct - partner).toFixed(1))
}

// ──────────────────────── consommation du bon de commande ────────────────────

/**
 * La consommation d'un bon de commande — pourcentage et jours restants.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * N'EXISTE QUE SI LES DEUX TERMES SONT CONNUS
 * ─────────────────────────────────────────────────────────────────────────
 * `null` dès que `volumeDays` OU `consumedDays` manque — et c'est TOUT
 * l'intérêt de la fonction. Un volume non renseigné ne donne PAS une barre à
 * 0 % : ce serait annoncer « rien consommé » alors qu'on n'a même pas la
 * taille du bon de commande. Une consommation non mesurable (aucun relevé
 * compté dans `mission_timesheets`) ne donne pas non plus « 0 % consommé » :
 * c'est l'absence d'une mesure, pas une mesure de zéro.
 *
 * Cette fonction ne dit PAS lequel des deux manque quand elle rend `null` —
 * et ce n'est pas un oubli. `poVolumeDays` et `poConsumedDays` restent deux
 * champs séparés sur la réponse (`missionCommercialTermsSchema`) précisément
 * pour ça : « volume non renseigné » et « consommation non mesurée » sont deux
 * messages différents à l'écran, et c'est l'APPELANT — qui a les deux valeurs
 * sous la main — qui les distingue, pas cette fonction.
 *
 * Un dépassement (`remainingDays` négatif) est un FAIT qu'on montre, pas un
 * plancher silencieux à zéro : c'est exactement l'information qui vaut quelque
 * chose — le bon de commande est en train de manquer.
 */
export function poConsumption(
  volumeDays: number | null,
  consumedDays: number | null,
): { percent: number; remainingDays: number } | null {
  if (volumeDays === null || consumedDays === null) return null
  if (!Number.isFinite(volumeDays) || !Number.isFinite(consumedDays)) return null
  // Un volume à zéro (ou négatif, en théorie impossible mais jamais garanti
  // par le seul typage) ne se divise pas — traité comme non calculable plutôt
  // que de produire un pourcentage infini.
  if (volumeDays <= 0) return null
  return {
    percent: Math.round((consumedDays / volumeDays) * 1000) / 10,
    remainingDays: Math.round((volumeDays - consumedDays) * 10) / 10,
  }
}
