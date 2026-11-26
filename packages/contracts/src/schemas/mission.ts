import { z } from 'zod'
import { contractKindSchema, type ContractKind } from './project.js'
import { deliveryModeSchema, supervisedForfaitFieldsSchema, supervisionRoleSchema } from './mission-delivery-mode.js'
import { missionEndReasonSchema } from './mission-end.js'
import { isSatisfactionLow, type MissionSatisfaction } from './mission-feedback.js'
import { missionMargin } from './staffing.js'
import { remotePreferenceSchema } from './talent-preferences.js'

/**
 * Delivery OS — les objets de la vie d'une mission (addendum final p71-72).
 *
 * Le rapport place ce bloc en LATER (12-24 mois) et pose lui-même la condition
 * (p94) : « Delivery & Finance arrivent quand les projets et missions générés
 * par Bellum justifient cette extension. » Arbitrage produit du 02/08 : on
 * construit les OBJETS et les WORKFLOWS — ce qui alimente le commerce — et pas
 * la facture à valeur légale.
 *
 * Cette frontière est délibérée et elle tient à une asymétrie de risque. Un
 * renouvellement raté coûte une mission ; une facture fausse est un problème
 * juridique. Mentions obligatoires, TVA, numérotation séquentielle sans trou,
 * archivage fiscal, facturation électronique : chacun de ces points est une
 * obligation légale, et aucun ne se rattrape par un correctif. Bellum suit donc
 * la MARGE et les ÉCHÉANCES — deux informations commerciales — et laisse
 * l'émission de la facture à l'outil comptable.
 *
 * Ce que le module apporte, et que ni le CRM ni l'ERP ne font aujourd'hui : les
 * signaux de la fin de mission arrivent AVANT la fin, et ils arrivent au
 * commercial.
 */

// ── Mission ──────────────────────────────────────────────────────────────────

export const missionStatusSchema = z.enum([
  /** Signée, pas encore démarrée : l'onboarding est en cours. */
  'onboarding',
  'active',
  /** Suspendue (congé long, décision client) — reprise attendue. */
  'paused',
  /** Terminée normalement. */
  'ended',
  /** Interrompue avant son terme — le cas dont on veut apprendre. */
  'terminated',
  'renewed',
  // #2407.5 — les statuts de l'issue qui manquaient, AJOUTÉS EN FIN (GA-08 :
  // une taxonomie gelée s'allonge par la fin). Les six historiques restent
  // acceptés. La table des transitions vit dans `status-transitions.ts`
  // (tranché par Louis 22/09 soir, decisions §9).
  /** Brouillon : saisie en cours, pas encore signée. */
  'draft',
  /** Signée, prête à démarrer (le pendant d'`onboarding`). */
  'ready_to_start',
  /** En cours, avec un risque DÉCLARÉ. */
  'at_risk',
  /** En cours, renouvellement en discussion. */
  'renewal_pending',
  /** En cours, fin annoncée. */
  'ending',
  /** Terminée normalement (le pendant d'`ended`). */
  'completed',
  /** Annulée avant d'avoir démarré. */
  'cancelled',
  /** Archivée — on archive, on ne supprime pas. */
  'archived',
])
export type MissionStatus = z.infer<typeof missionStatusSchema>

/**
 * La NATURE du contrat (D35).
 *
 * Elle décide de tout ce qui suit : une mission au FORFAIT n'a ni TJM ni jours,
 * elle se facture sur des jalons. Réclamer un relevé d'activité à un forfait est
 * une alerte qui ne se résoudra jamais, et une alerte qui ne se résout pas finit
 * par être ignorée avec toutes les autres.
 *
 * `inconnu` existe parce que les missions déjà en base n'ont jamais eu ce champ :
 * les déclarer « régie » d'office ferait naître de fausses alertes de CRA sur
 * des forfaits.
 */
/* Les quatre valeurs existent déjà sur le BESOIN (`project.ts`) : une mission
 * hérite de la nature du besoin qui l'a produite, et en déclarer une seconde
 * liste garantirait qu'elles divergent le jour où l'une gagne une valeur. */

/**
 * Un relevé d'activité n'a de sens qu'en régie. Le forfait se suit aux jalons,
 * le recrutement se termine à la signature.
 *
 * `inconnu` ne RÉCLAME pas de relevé : relancer quelqu'un sur une mission dont
 * personne n'a dit la nature produit une alerte qu'il ne peut pas résoudre.
 */
export function expectsTimesheet(kind: ContractKind): boolean {
  return kind === 'regie'
}

/**
 * La même question, du point de vue de la FACTURATION — et la réponse n'est pas
 * la même pour `inconnu`.
 *
 * Ne pas relancer sur un contrat de nature inconnue est prudent ; le déclarer
 * « prêt à facturer » sans relevé ne l'est pas du tout. Un mois sans relevé qui
 * s'affiche « prêt » fait facturer un montant que rien n'appuie, et c'est
 * l'avoir qu'on découvre trois mois plus tard.
 *
 * Seuls le forfait et le recrutement sont exemptés : eux ne PEUVENT pas avoir
 * de relevé, ce n'est pas une information manquante.
 */
export function invoicingNeedsTimesheet(kind: ContractKind): boolean {
  return kind !== 'forfait' && kind !== 'recrutement'
}

/**
 * Une date de fin est-elle ATTENDUE sur ce contrat ? (`MIS-12`, PDF 5 §12.)
 *
 * La réponse coïncide aujourd'hui avec {@link expectsTimesheet}, et c'est
 * pourtant une fonction à part — parce que ce sont deux QUESTIONS différentes,
 * et que les fondre ferait bouger l'une le jour où l'on répond à l'autre. La
 * même précaution que `accountNoNextActionDays` face à `accountUntouchedDays`.
 *
 * Ce que chaque valeur refuse, une par une :
 *  - `forfait` : il se suit aux jalons (D35). Ne pas avoir de date de fin y est
 *    un état normal, pas un oubli — relancer dessus produirait une alerte que
 *    personne ne peut résoudre ;
 *  - `recrutement` : il se termine à la signature, il n'a pas de durée ;
 *  - `inconnu` : ce qu'on ne sait pas n'alerte jamais. Le champ à remplir
 *    d'abord est la NATURE du contrat, pas la date de fin.
 *
 * Reste la régie, où l'absence de date de fin coûte deux fois : elle éteint
 * l'alerte de renouvellement (T-60/T-30) ET sort la mission du chiffre
 * d'affaires restant.
 */
export function expectsEndDate(kind: ContractKind): boolean {
  return kind === 'regie'
}

export const missionSchema = z.object({
  id: z.string().guid(),
  workspace_id: z.string().guid(),
  account_id: z.string().guid(),
  /** Le besoin qui l'a produite — c'est ce lien qui referme la boucle du produit. */
  opportunity_id: z.string().guid().nullable(),
  /**
   * #2339.7 / #2953 (#2193.48) — le POSITIONNEMENT qui l'a produite, quand la
   * mission est née d'un `createMissionRequestSchema.submissionId` (migration
   * `1796321999852`). `.optional()` : absent d'une réponse antérieure au
   * champ, même garde que `end_reason` juste au-dessus — jamais deviné.
   */
  submission_id: z.string().guid().nullable().optional(),
  label: z.string().min(1).max(300),
  status: missionStatusSchema,
  started_on: z.string().date().nullable(),
  /** Fin PRÉVUE. C'est elle qui déclenche les fenêtres de renouvellement. */
  ends_on: z.string().date().nullable(),
  /**
   * #2414 (LAU-FINAL-128) / épopée #2986 — le motif TYPÉ de fin (8 valeurs,
   * `MISSION_END_REASONS` dans `mission-end.ts`). `null` = pas encore posé.
   * `.optional()` : absent d'une API antérieure au champ, même garde que
   * `legal_entity_id` un peu plus bas.
   */
  end_reason: missionEndReasonSchema.nullable().optional(),
  /**
   * TJM facturé au client, quand il est connu. Jamais estimé.
   *
   * ⚠️ **Il n'est PAS derrière `finance:read`, et c'est délibéré.** Deux
   * relectures indépendantes l'ont signalé comme une fuite le 28/08/2026 ;
   * mesuré FAUX les deux fois. Le partage est le même que sur le vivier
   * (`ConsultantsPage.tsx:331`) : le **prix de VENTE** est visible — un
   * recruteur qui positionne un profil en a besoin pour négocier — et ce sont
   * les **entrées de la marge** (coût chargé, plancher, prix d'achat) qui sont
   * gardées. Écrit ici plutôt que dans un journal parce qu'un troisième
   * lecteur le rouvrira sinon.
   */
  daily_rate: z.number().nullable(),
  /**
   * ⚠️ N'EST PAS la source du coût chargé — et ne l'a jamais été en pratique.
   *
   * **Décision D43 du 28/08/2026.** Le coût chargé se saisit dans les
   * conditions commerciales de la mission
   * (`mission_commercial_terms.loaded_daily_cost_cents`, en CENTIMES) : c'est
   * ce que le formulaire de la fiche écrit, et c'est la seule colonne que
   * l'application alimente. Celle-ci n'était écrite par AUCUN écran, aucun
   * semis et aucun appelant interne — seulement par un champ `dailyCost` de la
   * requête de création que personne n'envoyait, retiré le même jour.
   *
   * Toute marge se calcule donc sur les conditions commerciales
   * ({@link dailyMarginPercent}). Le champ reste déclaré pour ne rien détruire
   * de ce qu'il pourrait contenir, et parce que l'API continue de le rendre.
   */
  daily_cost: z.number().nullable(),
  /** Régie, forfait, recrutement — ou `inconnu` pour l'historique (D35). */
  contract_kind: contractKindSchema,
  /** #3547 — le FORFAIT ENCADRÉ : `supervised` = les consultants sont facultatifs
   *  (réalisé par les salariés du client). Absent d'une API antérieure = `staffed`. */
  ...supervisedForfaitFieldsSchema.shape,
  /** Le rôle CHERCHÉ, distinct du nom de la mission : « Architecte de
   *  plateforme » n'est pas « Refonte du SI paiement ». */
  role_title: z.string().nullable(),
  /**
   * #2191.17 — REPRIS du besoin (`project_needs.remote`) au handoff, quand le
   * rôle d'origine est CERTAIN (même garde que `started_on`/`daily_rate`,
   * `soleNeedOf`). Mêmes quatre valeurs que `REMOTE_PREFERENCES`
   * (`consultants.remote_preference`, GA-26). `null` = non repris. `.optional()`
   * comme `legal_entity_id` juste en dessous : absent d'une API antérieure au
   * champ.
   */
  remote_preference: remotePreferenceSchema.nullable().optional(),
  /** #2191.18 — REPRIS du besoin (`project_needs.location`), même condition
   *  et même `.optional()` que `remote_preference` juste au-dessus. Texte
   *  libre. `null` = non repris. */
  location: z.string().nullable().optional(),
  /** À qui la facture part chez le client. Son absence est un bloqueur nommé. */
  billing_contact_id: z.string().guid().nullable(),
  /**
   * La SOCIÉTÉ DE L'ESN qui porte et facture cette mission (#1518).
   *
   * ⚠️ À ne pas confondre avec l'entité du CLIENT : celle-ci ÉMET la facture,
   * celle-là la REÇOIT. Le vocabulaire compte, parce que les deux existent dans
   * le produit et qu'« entité » seul est ambigu.
   *
   * `null` est le cas ordinaire — un espace mono-société n'en déclare aucune.
   * Absent d'une API antérieure au champ, d'où le `.optional()`.
   */
  legal_entity_id: z.string().guid().nullable().optional(),
  /** Qui la PORTE aujourd'hui — pas qui l'a créée. */
  owner_id: z.string().guid().nullable(),
  /** #4158.34 — objet PRIVÉ : visible de son porteur et de qui gère l'équipe. Absent = partagé. */
  is_private: z.boolean().optional(),
  /** Quand la mission est entrée dans son statut actuel. Sans elle, « en
   *  onboarding depuis 40 jours » n'est calculable nulle part. */
  stage_entered_at: z.string().datetime().nullable(),
  /**
   * #2953 (#2193.17) — CE QUE CETTE MISSION DOIT PRODUIRE, en clair. Texte
   * libre, saisi sur la fiche (`PATCH /delivery/missions/:id`) : aucune source
   * ne le porte au handoff — ni le besoin (`project_needs`) ni le projet — donc
   * rien à REPRENDRE, contrairement à `location`/`remote_preference`.
   * `.optional()` pour le deploy-skew : une API antérieure au champ ne le rend
   * pas. `null` = non renseigné, jamais une chaîne vide qui se lirait pareil.
   */
  objective: z.string().max(500).nullable().optional(),
  /** #2953 (#2193.18) — LE PÉRIMÈTRE de la mission (« TMA du portail
   *  transporteurs », « refonte du module facturation ») — distinct du
   *  PÉRIMÈTRE D'UN PARTENAIRE (`account_partners.scope`), qui décrit ce qu'une
   *  AUTRE société couvre chez ce client. Même geste et même `.optional()`
   *  qu'`objective` juste au-dessus. */
  perimeter: z.string().max(500).nullable().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})
export type Mission = z.infer<typeof missionSchema>

// ── Affectation ──────────────────────────────────────────────────────────────

export const assignmentSchema = z.object({
  id: z.string().guid(),
  mission_id: z.string().guid(),
  consultant_id: z.string().guid(),
  /** Charge en pourcentage d'un temps plein (100 = plein temps). */
  load_percent: z.number().int().min(1).max(100),
  starts_on: z.string().date(),
  ends_on: z.string().date().nullable(),
})
export type Assignment = z.infer<typeof assignmentSchema>

// ── CRA / relevé d'activité ──────────────────────────────────────────────────

/**
 * Les états d'un relevé d'activité (PDF 5 §7).
 *
 * Quatre existaient. Trois manquaient, et chacun disait quelque chose qu'aucun
 * des quatre ne dit :
 *
 *  - `expected` : le mois est ouvert, on ATTEND le relevé. Sans lui, un mois
 *    à venir et un mois oublié se ressemblent, alors qu'un seul mérite une
 *    relance.
 *  - `missing` : le mois est passé et rien n'est arrivé. C'est le cas le plus
 *    coûteux du module, et il n'avait pas de nom.
 *  - `not_required` : la mission ne fait pas de relevé (forfait, recrutement).
 *    Le compter comme manquant produirait une alerte permanente et fausse, et
 *    une alerte qui ne se résout jamais fait ignorer les autres.
 *
 * AJOUTÉS EN FIN d'enum (garde GA-08) : les quatre premiers gardent leur rang
 * et leur écriture, aucune donnée en base n'a à bouger.
 *
 *  - `escalated` (#2196.24, 17/09/2026) : la relance a atteint son troisième
 *    rang (`toneForReminder` rend `escalate`) sans qu'aucun relevé ne soit
 *    arrivé. « Le sujet remonte à un humain » existait en commentaire dans
 *    `dueReminders` depuis le début de la cadence ; ce statut lui donne enfin
 *    une trace POSÉE, que le résumé et la colonne « Statut » peuvent compter —
 *    sans lui, la troisième relance ne changeait rien à ce qu'affichait
 *    l'écran.
 *
 * NEUF, PAR DÉCISION (#4548, #2415.3) : la spec de #2415 en demandait treize. Quatre ne
 * sont pas des statuts — `under_review` et `client_validation_pending` sont des
 * étapes de revue déjà portées par leurs champs (#2415.6, #2415.7), `corrected` et
 * `waived` des raisons ; `approved` et `not_applicable` existent sous les noms
 * `validated` et `not_required`. Restent `not_due` et `received`, NON ajoutés :
 * rien n'écrit aujourd'hui un relevé « pas encore dû » (`statusWithoutRow` rend
 * `expected`) ni « reçu, pas examiné » (rien ne le distingue de `submitted`), et
 * un statut que personne n'écrit est du code que personne n'appelle. Le jour où
 * l'un a un producteur : migration de la contrainte D'ABORD, valeur EN FIN
 * d'enum, puis chaque liste `NOT IN ('expected', 'missing', 'not_required')`.
 */
export const TIMESHEET_STATUSES = [
  'draft',
  'submitted',
  'validated',
  'disputed',
  'expected',
  'missing',
  'not_required',
  'rejected',
  'escalated',
] as const
export const timesheetStatusSchema = z.enum(TIMESHEET_STATUSES)
export type TimesheetStatus = z.infer<typeof timesheetStatusSchema>

/** Les états où rien n'est encore arrivé — ceux qui se relancent. */
export const AWAITING_TIMESHEET_STATUSES: readonly TimesheetStatus[] = ['expected', 'missing', 'draft'] as const

export const timesheetSchema = z.object({
  id: z.string().guid(),
  mission_id: z.string().guid(),
  /** Mois couvert, au premier du mois. */
  period_month: z.string().date(),
  /** Jours déclarés. Les demi-journées existent : le champ n'est pas entier. */
  days: z.number().min(0).max(31),
  status: timesheetStatusSchema,
  /** Ce qui ne colle pas — un écart avec la charge attendue, un jour férié
   *  compté. `[]` quand rien n'a été détecté (pas « rien à signaler »). */
  anomalies: z.array(z.string().max(300)).default([]),
})
export type Timesheet = z.infer<typeof timesheetSchema>

/**
 * Les jours OUVRÉS d'un mois — la charge attendue, avant tout jugement.
 *
 * `anomalies` était un tableau de texte libre que rien ne remplissait : le
 * bloqueur `timesheet_anomalies` de « prêt à facturer » ne pouvait donc jamais
 * se déclencher, et un relevé à 3 jours sur un mois à 21 passait pour normal.
 *
 * Les jours fériés sont un PARAMÈTRE, jamais un calendrier embarqué. Un
 * calendrier français en dur serait faux pour une mission au Luxembourg, faux
 * en Alsace-Moselle, et périmé le jour où un jour férié bouge. Sans liste
 * fournie, la fonction compte les jours de semaine et ne prétend rien de plus —
 * c'est la seule chose qu'on sache vraiment d'un mois.
 */
export function expectedWorkingDays(periodMonth: string, holidays: readonly string[] = []): number | null {
  const match = /^(\d{4})-(\d{2})/.exec(periodMonth)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isFinite(year) || month < 1 || month > 12) return null

  const excluded = new Set(holidays)
  let days = 0
  const cursor = new Date(Date.UTC(year, month - 1, 1))
  while (cursor.getUTCMonth() === month - 1) {
    const weekday = cursor.getUTCDay()
    const iso = cursor.toISOString().slice(0, 10)
    if (weekday !== 0 && weekday !== 6 && !excluded.has(iso)) days += 1
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

/**
 * Les jours ouvrés d'un mois PARTIEL — celui où la mission commence ou finit.
 *
 * Sans ce calcul, une mission qui démarre le 20 septembre se voit reprocher
 * treize jours manquants, tous les mois où elle commence et tous ceux où elle
 * s'arrête. L'écart devient du bruit, et un écart qui est du bruit ne se
 * regarde plus.
 *
 * Les bornes sont INCLUSIVES et facultatives : une mission sans date de fin
 * court jusqu'au bout du mois, ce qui est vrai — pas une hypothèse.
 */
export function expectedWorkingDaysInWindow(
  periodMonth: string,
  window: { startedOn?: string | null; endsOn?: string | null } = {},
  holidays: readonly string[] = [],
): number | null {
  const match = /^(\d{4})-(\d{2})/.exec(periodMonth)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isFinite(year) || month < 1 || month > 12) return null

  const from = window.startedOn ?? null
  const to = window.endsOn ?? null
  // Une mission entièrement hors du mois ne compte AUCUN jour attendu — et
  // c'est 0, pas `null` : on sait qu'on n'attend rien.
  const excluded = new Set(holidays)
  let days = 0
  const cursor = new Date(Date.UTC(year, month - 1, 1))
  while (cursor.getUTCMonth() === month - 1) {
    const iso = cursor.toISOString().slice(0, 10)
    const weekday = cursor.getUTCDay()
    const inside = (!from || iso >= from) && (!to || iso <= to)
    if (inside && weekday !== 0 && weekday !== 6 && !excluded.has(iso)) days += 1
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

/**
 * L'écart entre ce qui a été déclaré et ce qui était attendu.
 *
 * `null` quand l'un des deux est inconnu — et c'est le point. Un écart inconnu
 * rendu `0` se lirait « le relevé est juste », ce qui est exactement le
 * contraire de ce qu'on sait. C'est la même règle que partout ailleurs dans le
 * produit : un inconnu vaut `null`, jamais une valeur de remplissage.
 *
 * Le signe porte du sens : négatif = il manque des jours, positif = il y en a
 * plus que le mois n'en compte, ce qui arrive et mérite d'être vu.
 */
export function dayGap(
  declaredDays: number | null | undefined,
  expectedDays: number | null | undefined,
): number | null {
  if (typeof declaredDays !== 'number' || !Number.isFinite(declaredDays)) return null
  if (typeof expectedDays !== 'number' || !Number.isFinite(expectedDays)) return null
  return Number((declaredDays - expectedDays).toFixed(2))
}

/**
 * Les quatre cas d'écart du §7, nommés.
 *
 * Le point qui manquait : un écart NÉGATIF ne produisait aucune anomalie. Un
 * relevé à 12 jours sur un mois à 21 passait donc « prêt à facturer » — c'est
 * neuf jours qu'on ne facture pas, et personne ne le voit.
 */
export const GAP_KINDS = ['none', 'unknown', 'under', 'over'] as const
export type GapKind = (typeof GAP_KINDS)[number]

export function classifyGap(gap: number | null): GapKind {
  if (gap === null) return 'unknown'
  if (gap === 0) return 'none'
  return gap < 0 ? 'under' : 'over'
}

/**
 * Un écart doit-il empêcher de facturer ?
 *
 * Oui dans les DEUX sens (§7 : « écart ≠ 0 »), et non quand il est inconnu.
 * Bloquer sur un écart inconnu arrêterait toute la facturation d'un espace qui
 * ne renseigne pas ses jours fériés — la garde deviendrait un obstacle, et
 * quelqu'un la débrancherait.
 *
 * Une EXPLICATION lève le blocage : c'est ce qui distingue « personne n'a
 * regardé » de « on sait pourquoi, et c'est normal ».
 */
/**
 * Les messages d'anomalie qu'une EXPLICATION D'ÉCART répond.
 *
 * Ils vivent ici, et pas dans le détecteur du service, parce que DEUX lecteurs
 * en ont besoin : celui qui les ÉCRIT au dépôt (`detectAnomalies`) et celui qui
 * décide si une anomalie archivée bloque encore la facturation
 * (`computeInvoiceBlockers`). Deux copies de ces phrases diveregeraient au
 * premier mot changé, et le second lecteur cesserait silencieusement de
 * reconnaître ce que le premier a écrit.
 *
 * ⚠️ La liste ne contient QUE les anomalies d'écart. Un chevauchement de
 * mission, un doublon déjà validé ou une fraction de journée inhabituelle ne
 * sont PAS répondus par « pourquoi il manque quatre jours » — ils continuent
 * de bloquer, et c'est le point.
 */
export function gapAnomalyMessages(days: number | null, expected: number | null): string[] {
  const messages: string[] = []
  const gap = dayGap(days, expected)
  if (gap !== null && gap > 0) {
    messages.push(`Nombre de jours supérieur aux jours ouvrés du mois (${expected}) — possible, mais à vérifier.`)
  }
  if (gap !== null && gap < 0) {
    messages.push(`Il manque ${Math.abs(gap)} jour(s) par rapport aux jours ouvrés du mois (${expected}).`)
  }
  if (days === 0) messages.push('Aucun jour déclaré sur la période.')
  return messages
}

export function gapBlocksInvoicing(gap: number | null, explanation?: string | null): boolean {
  if (gap === null || gap === 0) return false
  return (explanation ?? '').trim().length === 0
}

// ── Renouvellement (p72 « J-60 / J-30 ») ─────────────────────────────────────

/**
 * Les jalons du rapport, plus l'après.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #2195.2 à #2195.7 — L'ÉCHELLE PASSE DE QUATRE JALONS À SIX (16/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * L'issue nomme six fenêtres : J-60 · J-45 · J-30 · J-15 · échéance dépassée ·
 * sans date de fin. Deux manquaient — J-45 et J-15 — et leur absence n'était
 * pas décorative : entre J-60 et J-30 il y avait UN mois sans palier, c'est-à-
 * dire un mois pendant lequel une mission ne changeait pas de couleur alors que
 * la fenêtre de négociation se refermait.
 *
 * ⚠️ `imminent` (≤ 10 jours) SURVIT, et ce n'est pas un doublon de J-15. Les
 * deux paliers comptent des populations DISJOINTES — 11 à 15 jours d'un côté,
 * 0 à 10 de l'autre — et fondre le second dans le premier aurait perdu
 * l'urgence la plus courte au moment précis où l'on affine l'échelle. Le
 * produit porte donc SEPT valeurs pour les six fenêtres nommées, la septième
 * (`far`) étant « rien à faire », qui n'a jamais eu de pastille.
 *
 * ⚠️ **Les deux valeurs neuves sont ajoutées EN FIN de liste** (GA-08 : un enum
 * ne perd jamais de valeur et n'en insère jamais au milieu). L'ordre de cette
 * constante n'est donc PAS l'ordre d'urgence — celui-ci vit dans
 * `RENEWAL_WINDOWS_IN_URGENCY_ORDER`, côté web, et c'est le seul qui s'affiche.
 */
export const RENEWAL_WINDOWS = ['far', 'j60', 'j30', 'imminent', 'overdue', 'unknown', 'j45', 'j15'] as const
export const renewalWindowSchema = z.enum(RENEWAL_WINDOWS)
export type RenewalWindow = z.infer<typeof renewalWindowSchema>

export const RENEWAL_J60_DAYS = 60
/** #2195.3 — le palier qui manquait entre deux mois et un mois. */
export const RENEWAL_J45_DAYS = 45
export const RENEWAL_J30_DAYS = 30
/** #2195.5 — la quinzaine : au-delà d'ici, une proposition a encore le temps d'être lue. */
export const RENEWAL_J15_DAYS = 15
/** En dessous, ce n'est plus une relance de renouvellement, c'est une urgence. */
export const RENEWAL_IMMINENT_DAYS = 10

/**
 * Combien de jours avant la fin d'une mission — `null` quand on ne sait pas.
 *
 * `null` et non un grand nombre : « pas de date de fin » n'est pas « très
 * loin ». Une mission sans fin connue est justement celle qu'on ne relance
 * jamais à temps, et lui prêter une échéance lointaine la ferait disparaître de
 * toutes les questions bornées.
 */
export function daysUntilEnd(endsOn: string | null | undefined, today: Date = new Date()): number | null {
  if (!endsOn) return null
  const end = new Date(endsOn)
  if (Number.isNaN(end.getTime())) return null
  return Math.floor((end.getTime() - startOfDay(today).getTime()) / 86_400_000)
}

/* ─────────────────────────────────────────────────────────────────────────────
 * #2195.8 — CHAQUE ESPACE RÈGLE SES FENÊTRES (décision de Louis, 16/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * L'échelle cesse d'être quatre NOMS et devient une liste ORDONNÉE de bornes en
 * JOURS, réglable par espace. La raison tient en une phrase : `j15`…`j60`
 * MENTIRAIENT chez une ESN qui règle [20, 40, 70, 100] — une pastille « J-15 »
 * sur une fenêtre qui s'ouvre à vingt jours est une étiquette fausse, et un
 * commercial la répète en rendez-vous.
 *
 * ⚠️ LES QUATRE VALEURS SURVIVENT, ET CE N'EST PAS UNE COMMODITÉ (GA-08).
 * `j15`, `j30`, `j45` et `j60` deviennent des IDENTIFIANTS DE POSITION : le
 * premier palier, le deuxième, le troisième, le quatrième. Rien n'est retiré de
 * l'énumération, rien n'y est inséré, et tout ce qui sérialisait ces valeurs
 * hier continue de les lire. Ce qui change est ce qui s'AFFICHE : le libellé se
 * calcule depuis le nombre de jours (`renewalWindowBoundDays`), à un seul
 * endroit (GA-26). Une deuxième dérivation du libellé divergerait, exactement
 * comme « J-28 » et « J-30 » avaient divergé sur la même mission le 03/09.
 *
 * LES TROIS GARDE-FOUS, nommés par la décision et tenus par
 * `renewal-scale.test.ts` :
 *  1. jamais sous J-15 — sous ce délai un renouvellement ne se prépare plus, il
 *     se subit. C'est aussi ce qui garantit qu'aucune borne ne mange
 *     `imminent` (≤ 10 jours) ;
 *  2. bornes strictement croissantes — une échelle qui se croise rend deux
 *     fenêtres vraies en même temps, et la ligne tombe dans les deux ;
 *  3. « sans date de fin » n'est jamais retirable — garde-fou STRUCTUREL : il
 *     n'a pas de borne, donc aucun réglage ne l'atteint. Une mission sans
 *     échéance n'entre dans aucune fenêtre, et la masquer la ferait disparaître
 *     de l'écran qui existe pour la rattraper.
 */

/** Le plancher, garde-fou n°1. Sous quinze jours, on subit. */
export const RENEWAL_WINDOW_FLOOR_DAYS = 15

/**
 * Les quatre POSITIONS de l'échelle, de la plus serrée à la plus large.
 *
 * L'ordre est celui des bornes, pas celui de `RENEWAL_WINDOWS` — là-bas les
 * valeurs neuves sont ajoutées en fin (GA-08).
 */
export const RENEWAL_WINDOW_SLOTS: readonly RenewalWindow[] = ['j15', 'j30', 'j45', 'j60'] as const

/** L'échelle du produit — celle que lit tout espace qui n'a rien réglé. */
export const DEFAULT_RENEWAL_WINDOW_DAYS: readonly number[] = [
  RENEWAL_J15_DAYS,
  RENEWAL_J30_DAYS,
  RENEWAL_J45_DAYS,
  RENEWAL_J60_DAYS,
] as const

/**
 * Le RÉGLAGE, et il vit ici seul (GA-26) — la colonne
 * `workspaces.renewal_window_days` le stocke, l'API le valide avec ce schéma et
 * l'écran de réglages l'affiche ; aucun des trois ne recopie les bornes.
 */
export const renewalWindowDaysSchema = z
  .array(z.number().int().max(730))
  .min(1)
  .max(RENEWAL_WINDOW_SLOTS.length)
  .superRefine((days, ctx) => {
    days.forEach((value, index) => {
      // Garde-fou 1.
      if (value < RENEWAL_WINDOW_FLOOR_DAYS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: `une fenêtre de renouvellement ne descend jamais sous ${RENEWAL_WINDOW_FLOOR_DAYS} jours`,
        })
      }
      // Garde-fou 2 — STRICTEMENT croissantes : deux bornes égales rendraient
      // deux fenêtres vraies en même temps.
      const previous = index === 0 ? null : days[index - 1]
      if (previous !== null && previous !== undefined && value <= previous) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: 'les bornes des fenêtres sont strictement croissantes',
        })
      }
    })
  })

/**
 * L'échelle d'un espace, telle qu'on ose la calculer avec.
 *
 * Une valeur abîmée en base — un réglage écrit par une version antérieure, un
 * `jsonb` qui n'est pas un tableau — retombe sur l'échelle du produit. Jamais
 * une erreur (l'écran des renouvellements ne s'ouvrirait plus), jamais un
 * tableau vide (toutes les missions passeraient « far », c'est-à-dire
 * disparaîtraient de la lentille).
 */
export function resolveRenewalWindowDays(raw: unknown): readonly number[] {
  const parsed = renewalWindowDaysSchema.safeParse(raw)
  return parsed.success ? parsed.data : DEFAULT_RENEWAL_WINDOW_DAYS
}

/**
 * LA dérivation du nombre de jours d'une fenêtre — celle que tout affichage
 * appelle, et la seule (GA-26).
 *
 * `null` pour `overdue`, `imminent`, `far` et `unknown` : elles n'ont pas de
 * borne réglable, et rendre `0` ferait écrire « à 0 jour » là où la vérité est
 * « cette fenêtre ne se règle pas ».
 */
export function renewalWindowBoundDays(
  window: RenewalWindow,
  scale: readonly number[] = DEFAULT_RENEWAL_WINDOW_DAYS,
): number | null {
  const bounds = resolveRenewalWindowDays(scale)
  const slot = RENEWAL_WINDOW_SLOTS.indexOf(window)
  if (slot < 0) return null
  return bounds[slot] ?? null
}

/**
 * Les fenêtres qu'un espace VOIT, dans l'ordre de l'urgence.
 *
 * `overdue` et `unknown` y sont TOUJOURS — c'est le garde-fou n°3 rendu
 * lisible. `far` n'y est pas : la lentille ne sert que ce qui demande une
 * action, et compter une population que le serveur n'envoie pas afficherait un
 * « 0 » qui n'est le zéro de rien.
 */
export function renewalWindowsOf(scale: readonly number[] = DEFAULT_RENEWAL_WINDOW_DAYS): readonly RenewalWindow[] {
  const bounds = resolveRenewalWindowDays(scale)
  return ['overdue', 'imminent', ...RENEWAL_WINDOW_SLOTS.slice(0, bounds.length), 'unknown']
}

/**
 * Dans quelle fenêtre de renouvellement se trouve une mission.
 *
 * `unknown` quand la fin n'est pas connue — et c'est un état utile : une mission
 * sans date de fin ne peut pas être relancée au bon moment, ce qui est
 * exactement le trou que le module comble. La déclarer « loin » l'aurait fait
 * disparaître des alertes pour toujours.
 */
export function renewalWindow(
  endsOn: string | null | undefined,
  today: Date = new Date(),
  // #2195.8 — l'échelle de l'espace, en JOURS. Absente = celle du produit, et
  // le chemin est alors identique à celui d'avant le 16/09/2026.
  scale: readonly number[] = DEFAULT_RENEWAL_WINDOW_DAYS,
): RenewalWindow {
  const days = daysUntilEnd(endsOn, today)
  if (days === null) return 'unknown'
  if (days < 0) return 'overdue'
  // #2195.2 à #2195.7 — les bornes sont INCLUSIVES et l'échelle se lit du plus
  // urgent au moins urgent : chaque palier exclut le suivant par construction,
  // donc les sept populations sont disjointes et s'additionnent au total.
  if (days <= RENEWAL_IMMINENT_DAYS) return 'imminent'
  const bounds = resolveRenewalWindowDays(scale)
  for (let slot = 0; slot < bounds.length; slot += 1) {
    const bound = bounds[slot]
    const name = RENEWAL_WINDOW_SLOTS[slot]
    if (bound !== undefined && name !== undefined && days <= bound) return name
  }
  return 'far'
}

/**
 * Les fenêtres qui méritent une action du commercial, maintenant.
 *
 * ⚠️ #2195.49 — `j45` et `j15` y entrent EN MÊME TEMPS qu'elles naissent. Les
 * oublier aurait fait disparaître de `renewalsToAct` toutes les missions à
 * 11-15 et 31-45 jours, qui y figuraient la veille sous `j30` et `j60` : une
 * régression silencieuse, et exactement celle que le critère de recette n°1 de
 * l'issue interdit (« toutes les missions à échéance visibles »).
 */
export const ACTIONABLE_RENEWAL_WINDOWS: readonly RenewalWindow[] = [
  'j60',
  'j45',
  'j30',
  'j15',
  'imminent',
  'overdue',
] as const

// ── Le STATUT d'un renouvellement (#2195.22 à .29) ───────────────────────────

/**
 * Où en est la RECONDUCTION d'une mission — saisi par un humain, jamais calculé.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * #2195.25 — ON NOMME LE FAIT, PAS LE PRONOSTIC (décision de Louis, 16/09/2026)
 * ═════════════════════════════════════════════════════════════════════════════
 * L'issue demandait un palier « Renouvellement probable ». Il n'existe pas ici,
 * et son absence est la décision : la doctrine du produit refuse toute
 * PROBABILITÉ affichée (`c26_probabilite`, refusée SIX fois). Un statut saisi
 * par un humain n'est certes pas un calcul du produit — mais son libellé se lit
 * HORS CONTEXTE, sur une ligne de tableau, et « probable » y ressemble à un
 * pronostic que le produit aurait rendu.
 *
 * La règle qui en sort vaut pour les huit : **un statut nomme un ÉVÉNEMENT qui
 * a eu lieu, ou une ÉCHÉANCE qui arrive — jamais une chance.** Le palier
 * survit donc, renommé par le FAIT qui le fonde : `reconduction_annoncee`,
 * « Reconduction annoncée par le client ». Ce qui est affirmé est vérifiable —
 * le client l'a dit, ou il ne l'a pas dit.
 *
 * ⚠️ Et il n'y a PAS de valeur « incertain ». Ne pas savoir, c'est
 * `non_engage` : « incertain » serait le même pronostic déguisé en prudence.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * L'ORDRE EST GELÉ (GA-08), ET LA CONTRAINTE SQL EST PARTIE DEVANT (GA-11/12)
 * ═════════════════════════════════════════════════════════════════════════════
 * Les huit valeurs s'écrivent dans cet ordre et on n'y touche plus : un enum ne
 * perd jamais de valeur et n'en insère jamais au milieu. La contrainte
 * `missions_renewal_status_check` les couvre TOUTES depuis la migration
 * `1795100000001-MissionRenewalStatus`, posée AVANT le code qui écrit — c'est
 * l'ordre que GA-11 et GA-12 imposent, et que `account_vocabulary.kind` a payé
 * le 21/07 en dossiers marqués « erreur ».
 *
 * ⚠️ L'ordre de cette constante n'est PAS un ordre de progression : un
 * renouvellement ne traverse pas les huit paliers l'un après l'autre. Une
 * mission peut passer de `non_engage` à `fin_confirmee` sans rien entre.
 */
export const RENEWAL_STATUSES = [
  /** Rien n'a été engagé — et c'est aussi ce qu'on écrit quand on ne sait pas. */
  'non_engage',
  /** Un retour a été DEMANDÉ au client ou au consultant, et on attend. */
  'feedback_demande',
  /** La reconduction se discute — un échange est ouvert, rien n'est acté. */
  'discussion_en_cours',
  /** #2195.25 — le client a ANNONCÉ qu'il reconduit. Un fait, pas une chance. */
  'reconduction_annoncee',
  /** C'est signé : la mission est reconduite. */
  'renouvele',
  /** Le client a confirmé que la mission s'arrête à son terme. */
  'fin_confirmee',
  /** Le consultant est en repositionnement — la suite se joue ailleurs. */
  'repositionnement_lance',
  /** Quelque chose empêche d'avancer, et ce quelque chose n'est pas le délai. */
  'bloque',
] as const
export const renewalStatusSchema = z.enum(RENEWAL_STATUSES)
export type RenewalStatus = z.infer<typeof renewalStatusSchema>

/**
 * `null` n'est pas `non_engage` — et cette distinction est la règle « non mesuré
 * n'est pas mesuré à zéro » appliquée à une énumération.
 *
 * `null` veut dire « personne n'a encore ouvert cette ligne » ; `non_engage`
 * veut dire « quelqu'un l'a ouverte et a constaté que rien n'était engagé ».
 * L'écran les REND différemment : « non renseigné » d'un côté, « Non engagé »
 * de l'autre. Replier le premier sur le second aurait affirmé un constat que
 * personne n'a fait.
 */
export const renewalStatusOrNullSchema = renewalStatusSchema.nullable()

/**
 * Les statuts qui FERMENT la question du renouvellement (#2195.37 « Clôturer »).
 *
 * Une ligne qui porte l'un d'eux n'attend plus de décision : elle est reconduite,
 * elle s'arrête, ou le consultant part ailleurs. L'écran de décision cesse de la
 * réclamer — sans la faire disparaître, parce qu'une mission close ce matin doit
 * rester lisible ce soir.
 */
export const CLOSED_RENEWAL_STATUSES: readonly RenewalStatus[] = [
  'renouvele',
  'fin_confirmee',
  'repositionnement_lance',
] as const

/** #2195.37 — un statut déjà clos ne se re-clôture pas. */
export function isRenewalDecided(status: RenewalStatus | null | undefined): boolean {
  return status !== null && status !== undefined && CLOSED_RENEWAL_STATUSES.includes(status)
}

/**
 * #2410.60 (LAU-FINAL-124) — LA DISPONIBILITÉ N'EST JAMAIS CERTAINE SUR UN
 * RENOUVELLEMENT OUVERT.
 *
 * Le NO-GO du chapitre planning : `availabilityFrom` (planning du vivier)
 * ignorait tout signal de renouvellement — une mission à fin connue mais
 * « à renouveler » ou « en discussion » affichait quand même une
 * disponibilité CERTAINE, en vert. C'est le pronostic que la doctrine
 * interdit (`c26_probabilite`), habillé en fait.
 *
 * Trois états, GA-26 (un seul endroit) :
 *  - `certaine` — le client a confirmé la fin (`fin_confirmee`), ou le
 *    consultant est en repositionnement (`repositionnement_lance` : la
 *    mission ne sera pas reconduite ICI). La date de fin peut se lire
 *    comme une disponibilité.
 *  - `renouvelee` — c'est SIGNÉ (`renouvele`). `ends_on` ne libère plus
 *    personne : il n'y a pas de disponibilité à cette date.
 *  - `incertaine` — tout le reste : rien d'engagé, un retour demandé, une
 *    discussion ouverte, une reconduction seulement ANNONCÉE (pas signée),
 *    un blocage, ou AUCUN statut. Un statut absent n'est jamais promu
 *    `certaine` — même règle que « non mesuré n'est pas mesuré à zéro ».
 */
export type MissionAvailabilityCertainty = 'certaine' | 'incertaine' | 'renouvelee'

export function missionAvailabilityCertainty(status: RenewalStatus | null | undefined): MissionAvailabilityCertainty {
  if (status === 'renouvele') return 'renouvelee'
  if (status === 'fin_confirmee' || status === 'repositionnement_lance') return 'certaine'
  return 'incertaine'
}

/**
 * #2195.32 — « Demander un feedback » ne se re-clique pas.
 *
 * Le bouton pose `feedback_demande`, et ce qui l'empêche de repartir n'est pas
 * un drapeau d'écran : c'est le statut lui-même, persisté. Un état d'écran se
 * perd au rechargement, et le client recevrait deux demandes.
 *
 * ⚠️ Une ligne DÉJÀ décidée ne redemande pas de retour non plus : réclamer un
 * avis sur une mission dont la fin est confirmée est au mieux inutile.
 */
export function canRequestRenewalFeedback(status: RenewalStatus | null | undefined): boolean {
  return status !== 'feedback_demande' && !isRenewalDecided(status)
}

// ── Risk Radar (p72) ─────────────────────────────────────────────────────────

export const missionRiskSchema = z.enum([
  /** La fin approche et rien n'a été engagé. */
  'renewal_not_started',
  /** Un relevé d'activité est contesté. */
  'timesheet_disputed',
  /** Un relevé manque sur un mois passé. */
  'timesheet_missing',
  /** La marge est négative ou nulle. */
  'margin_at_risk',
  /** La marge n'est pas calculable — on ne sait pas, et c'est un risque en soi. */
  'margin_unknown',
  /** Aucune fin prévue : la mission ne sera jamais relancée à temps. */
  'no_end_date',
  /**
   * #2408.18 — un bon de commande est EXIGÉ sur cette mission et aucun n'est
   * renseigné (`mission_commercial_terms.requires_po`/`po_number`, même table
   * que le coût chargé D43, même droit `finance:read`). C'est ce qui bloquera
   * la facturation en aval (`missing_po` dans `invoice-readiness.ts`) — ici,
   * le signal remonte AVANT qu'une facture ne coince.
   */
  'missing_po',
  /**
   * #2408.8 — l'échéance est à dix jours ou moins, ou déjà dépassée
   * (`imminent`/`overdue`). Distinct de `renewal_not_started`, qui répond à
   * une autre question (« un renouvellement a-t-il été engagé ? ») : une
   * mission peut porter les deux, ou seulement celui-ci si un renouvellement
   * a démarré mais que la date, elle, reste très proche. GA-08 : ajouté EN
   * FIN d'énumération, jamais au milieu.
   */
  'ending_soon',
  /**
   * #2411.7 (épopée #2881) — aucun chargé d'affaires DÉSIGNÉ sur cette
   * mission (`missions.owner_id`, déjà posé par #2836/migration
   * `1796001525994` — ce lot n'ajoute AUCUNE colonne). Une mission SANS
   * porteur chez nous est une donnée manquante, pas un fait métier avéré —
   * même famille que `margin_unknown` : ne pas savoir qui la porte EST un
   * risque. GA-08 : ajouté EN FIN d'énumération, jamais au milieu.
   */
  'missing_owner',
  /**
   * #2411.6 (reste, épopée #2881) — le mois COURANT de facturation est
   * BLOQUÉ pour cette mission (`invoice_readiness.state === 'blocked'`,
   * `InvoiceReadinessService.list`, MÊME calcul que l'onglet Facturation —
   * jamais recalculé une seconde fois ici, GA-26). C'est le premier des
   * quatre signaux financiers « PORTEFEUILLE→MISSION » demandés par #2411.6 :
   * CRA et marge sont DÉJÀ au niveau mission (`timesheet_missing`/
   * `timesheet_disputed`/`margin_at_risk`/`margin_unknown` ci-dessus) — seuls
   * les deux signaux de FACTURATION (bloquée, ici ; impayée, hors tranche —
   * voir le commentaire de `invoiceBlocked` sur `missionRisks`) restaient
   * agrégés au portefeuille. GA-08 : ajouté EN FIN d'énumération, jamais au
   * milieu.
   */
  'invoice_blocked',
  /**
   * #2408.16 — un rail de satisfaction (client OU consultant) a pour DERNIER
   * niveau déclaré `low` (`missionSatisfactionOf`, `mission-feedback.ts`).
   * Un rail jamais mesuré ne l'allume pas. GA-08 : les cinq exceptions de
   * L15 (contrat Louis 31/10/2026) s'ajoutent EN FIN, jamais au milieu.
   */
  'low_satisfaction',
  /**
   * #2408.3 — la relation client est menacée : satisfaction CLIENT basse ET
   * aucun contact avec le compte depuis {@link RELATIONSHIP_SILENCE_DAYS}
   * jours (arbitrage Louis 31/10/2026).
   */
  'relationship_threatened',
  /**
   * #2408.17 — un consultant affecté est en absence EN COURS d'au moins
   * {@link PROLONGED_ABSENCE_DAYS} jours (`consultant_absences`).
   */
  'prolonged_absence',
  /**
   * #2408.20 — fin de mission à {@link UNSECURED_CONSULTANT_DAYS} jours ou
   * moins, sans renouvellement signé ni placement suivant d'un affecté
   * (arbitrage Louis 31/10/2026).
   */
  'consultant_unsecured',
  /**
   * #2408.21 — une action OUVERTE sur le compte de la mission n'a aucun
   * porteur (`tasks.owner_id` nul). Distinct de `missing_owner`, qui vise la
   * MISSION : ici c'est l'ACTION qui n'a personne.
   */
  'action_without_owner',
])
export type MissionRisk = z.infer<typeof missionRiskSchema>

/**
 * #2408.3, .17, .20 — LES TROIS SEUILS des exceptions L15, nommés UNE fois
 * (GA-26). Les modifier ici les modifie partout — l'API ne les recopie pas.
 */
export const RELATIONSHIP_SILENCE_DAYS = 30
export const PROLONGED_ABSENCE_DAYS = 10
export const UNSECURED_CONSULTANT_DAYS = 30

const DAY_MS = 86_400_000

/**
 * #2408.17 — une absence est PROLONGÉE si elle couvre `today` (YYYY-MM-DD) et
 * dure au moins {@link PROLONGED_ABSENCE_DAYS} jours, bornes incluses. Une
 * absence passée ou à venir ne l'est pas : la mission n'en souffre pas
 * AUJOURD'HUI.
 */
export function isProlongedAbsence(absence: { startsOn: string; endsOn: string }, today: string): boolean {
  if (absence.startsOn > today || absence.endsOn < today) return false
  const length = Math.round((Date.parse(absence.endsOn) - Date.parse(absence.startsOn)) / DAY_MS) + 1
  return Number.isFinite(length) && length >= PROLONGED_ABSENCE_DAYS
}

/**
 * #2411.11 (reste, épopée #2881) — « fermer » ou « ré-ouvrir » un risque déjà
 * CALCULÉ (`missionRisks` ci-dessous). Jamais une saisie du risque lui-même :
 * `resolved: true` dit seulement « quelqu'un a vu et traité ce point », pas
 * que le fait sous-jacent a changé — voir la migration `MissionRiskResolutions`
 * pour la garde « sans changement matériel ».
 */
export const setMissionRiskResolutionRequestSchema = z.object({
  resolved: z.boolean(),
})
export type SetMissionRiskResolutionRequest = z.infer<typeof setMissionRiskResolutionRequestSchema>

/**
 * Marge journalière d'une mission, en pourcentage — ou `null`.
 *
 * `null` quand le TJM ou le coût manque. On ne suppose JAMAIS un coût moyen :
 * une marge inventée est plus dangereuse qu'une marge absente, parce qu'elle
 * fait renoncer à une mission rentable ou accepter une mission à perte.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * D'OÙ VIENT LE COÛT — décision D43 du 28/08/2026
 * ─────────────────────────────────────────────────────────────────────────
 * De `mission_commercial_terms.loaded_daily_cost_cents`, et de nulle part
 * ailleurs. Ce calcul lisait `missions.daily_cost`, une colonne qu'aucun écran,
 * aucun semis et aucun appelant interne n'écrivait : la liste des missions
 * aurait dit « coût chargé non renseigné » sur des missions dont la FICHE
 * affichait 32 %. Cause racine « colonne lue, jamais écrite », déjà payée trois
 * fois dans ce dépôt — le repli honnête ressemble exactement à une base vide.
 *
 * ⚠️ **Deux unités.** Le TJM est en EUROS (colonne `numeric` historique), le
 * coût chargé en CENTIMES. Les additionner sans convertir donne une marge de
 * 99,9 % sur toutes les missions. La conversion vit ICI, une seule fois, et
 * aucun appelant ne la refait — cinq d'entre eux la recopiaient à la main.
 *
 * Le NOYAU du calcul est {@link missionMargin}, celui-là même que la fiche
 * affiche. Deux écrans ne doivent pas rendre deux marges pour la même mission ;
 * ils ne le peuvent plus, puisqu'il n'y a qu'un calcul.
 */
export function dailyMarginPercent(input: {
  /** Le TJM FACTURÉ, en euros. */
  daily_rate: number | null
  /** Le coût CHARGÉ, en centimes — `mission_commercial_terms`. */
  loadedDailyCostCents: number | null
}): number | null {
  const rate = input.daily_rate
  return (
    missionMargin({
      dailyRateCents: rate === null || !Number.isFinite(rate) ? null : Math.round(rate * 100),
      loadedDailyCostCents: input.loadedDailyCostCents,
    })?.percent ?? null
  )
}

/**
 * Les risques d'une mission, calculés — jamais saisis.
 *
 * L'ordre de la liste est celui de l'urgence commerciale : ce qui menace la
 * poursuite de la mission avant ce qui menace sa rentabilité.
 */
export function missionRisks(
  mission: Pick<Mission, 'status' | 'ends_on' | 'daily_rate'> & {
    /** Le coût CHARGÉ des conditions commerciales, en centimes (D43). C'est lui
     *  qui décide entre `margin_at_risk` et `margin_unknown` — et il est
     *  EXIGÉ, sans valeur par défaut : un appelant qui l'oublie doit être
     *  refusé par le compilateur, pas servi en silence avec `margin_unknown`
     *  sur tout son portefeuille. */
    loadedDailyCostCents: number | null
    /**
     * #2408.18 — un bon de commande est-il exigé sur cette mission, et si oui,
     * lequel (`mission_commercial_terms`, même table que le coût chargé).
     *
     * OPTIONNELS, contrairement à `loadedDailyCostCents` : un appelant qui ne
     * les passe pas (aucun droit financier lu, ou écran qui ne les charge pas)
     * ne voit jamais `missing_po` surgir à tort — l'absence de lecture reste
     * une absence de risque affirmé, jamais un badge inventé sur un silence.
     */
    requiresPo?: boolean
    poNumber?: string | null
    /**
     * #2411.7 (épopée #2881) — `missions.owner_id`, déjà en base (#2836).
     *
     * OPTIONNEL, même garde que `requiresPo`/`poNumber` : `undefined` veut
     * dire « cet appelant ne lit pas la donnée », jamais « personne ne porte
     * la mission ». Seul un `null` MESURÉ déclenche `missing_owner` — sinon
     * un appelant qui décore une mission sans recharger son propriétaire
     * (`create`/`updateStatus`, `delivery.service.ts`) verrait le badge
     * surgir sur un silence, pas sur un fait.
     */
    owner_id?: string | null
    /**
     * #2411.6 (reste, épopée #2881) — le mois COURANT de facturation de
     * CETTE mission est-il `blocked` (`invoice_readiness.state`,
     * `InvoiceReadinessService.list`, même droit `finance:read` que
     * `loadedDailyCostCents`/`requiresPo` — la donnée vit dans le même
     * périmètre financier).
     *
     * OPTIONNEL, même garde que `requiresPo`/`owner_id` : `undefined` veut
     * dire « cet appelant ne lit pas la donnée » (aucun droit financier, ou
     * décoration d'une mission qu'il vient d'écrire), jamais « rien ne
     * bloque » — un `false` MESURÉ est la seule valeur qui éteint le risque,
     * un silence ne l'éteint ni ne l'allume.
     *
     * ⚠️ Ne couvre que la facture BLOQUÉE, pas la facture IMPAYÉE (retard
     * d'encaissement) : celle-ci vit dans `collectionStatus`
     * (`apps/web/src/features/missions/collections.ts`), une dérivation qui
     * lit une fenêtre glissante de 12 mois et n'est, à ce jour, câblée que
     * côté web — l'y rejoindre demande de la faire vivre à UN seul endroit
     * (GA-26) avant de la lire ici aussi. Hors de cette tranche.
     */
    invoiceBlocked?: boolean
    /**
     * #2408.16 / #2408.3 — le résumé de satisfaction (`missionSatisfactionOf`).
     * `undefined` = non lu, jamais « satisfait ».
     */
    satisfaction?: MissionSatisfaction
    /**
     * #2408.3 — dernier contact avec le compte (`activities.occurred_at`).
     * `null` MESURÉ = aucun contact jamais ; `undefined` = non lu, muet.
     */
    lastAccountContactAt?: string | null
    /** #2408.17 — un affecté en absence prolongée ; seul `true` allume. */
    assigneeOnProlongedAbsence?: boolean
    /** #2408.20 — un affecté sans placement après cette mission ; seul `true` allume. */
    assigneeWithoutNextPlacement?: boolean
    /** #2408.20 — le statut de reconduction : `renouvele` éteint l'exception. */
    renewal_status?: RenewalStatus | null
    /** #2408.21 — une action ouverte du compte sans porteur ; seul `true` allume. */
    ownerlessOpenAction?: boolean
  },
  timesheets: readonly Pick<Timesheet, 'status' | 'period_month'>[] = [],
  today: Date = new Date(),
): MissionRisk[] {
  const risks: MissionRisk[] = []
  if (mission.status !== 'active' && mission.status !== 'onboarding') return risks

  const window = renewalWindow(mission.ends_on, today)
  if (window === 'unknown') {
    risks.push('no_end_date')
  } else {
    // #2408.8 — « fin proche » répond à une question différente de
    // « renouvellement non engagé » : QUAND la mission finit, pas SI
    // quelqu'un a bougé. Les deux peuvent cohabiter sur la même mission.
    if (window === 'imminent' || window === 'overdue') risks.push('ending_soon')
    if (ACTIONABLE_RENEWAL_WINDOWS.includes(window)) risks.push('renewal_not_started')
  }

  // #2408.3 — la relation : satisfaction CLIENT basse ET silence mesuré.
  // `lastAccountContactAt === undefined` (non lu) reste muet.
  if (mission.satisfaction?.client === 'low' && mission.lastAccountContactAt !== undefined) {
    const last = mission.lastAccountContactAt === null ? Number.NaN : Date.parse(mission.lastAccountContactAt)
    const silentDays = Number.isNaN(last) ? Number.POSITIVE_INFINITY : (startOfDay(today).getTime() - last) / DAY_MS
    if (silentDays >= RELATIONSHIP_SILENCE_DAYS) risks.push('relationship_threatened')
  }

  // #2408.20 — fin proche, ni renouvelée ni suivie d'un placement.
  const remaining = daysUntilEnd(mission.ends_on, today)
  if (
    mission.assigneeWithoutNextPlacement === true &&
    mission.renewal_status !== 'renouvele' &&
    remaining !== null &&
    remaining >= 0 &&
    remaining <= UNSECURED_CONSULTANT_DAYS
  )
    risks.push('consultant_unsecured')

  if (timesheets.some(timesheet => timesheet.status === 'disputed')) risks.push('timesheet_disputed')
  // #2408.11 — distinct du relevé CONTESTÉ ci-dessus : ici, rien n'a même été
  // déposé sur un mois déjà passé.
  if (timesheets.some(timesheet => timesheet.status === 'missing')) risks.push('timesheet_missing')

  // #2408.16 — un rail au plus bas ; un rail non mesuré ne compte pas.
  if (isSatisfactionLow(mission.satisfaction)) risks.push('low_satisfaction')
  // #2408.17 — seul un `true` MESURÉ allume, même garde que `invoiceBlocked`.
  if (mission.assigneeOnProlongedAbsence === true) risks.push('prolonged_absence')

  // #2408.18 — `requiresPo` par défaut à `false` : un appelant qui ne connaît
  // pas la donnée ne déclenche jamais ce risque.
  if ((mission.requiresPo ?? false) && !mission.poNumber) risks.push('missing_po')

  // #2411.6 — `undefined` (pas lu) reste muet ; seul un `true` MESURÉ allume
  // le risque, même garde que `missing_po` juste au-dessus.
  if (mission.invoiceBlocked === true) risks.push('invoice_blocked')

  const margin = dailyMarginPercent(mission)
  if (margin === null) risks.push('margin_unknown')
  else if (margin <= 0) risks.push('margin_at_risk')

  // #2411.7 — `null` MESURÉ (chargé d'affaires non désigné) déclenche le
  // risque ; `undefined` (appelant qui ne lit pas `owner_id`) reste muet.
  if (mission.owner_id === null) risks.push('missing_owner')
  // #2408.21 — même garde : `undefined` (non lu) reste muet.
  if (mission.ownerlessOpenAction === true) risks.push('action_without_owner')

  return risks
}

// ── Client Expansion Map (p72) ───────────────────────────────────────────────

/**
 * Ce qu'une mission en cours ouvre chez le même client.
 *
 * Le rapport en fait un chantier à part (« Client Expansion Map »), et le
 * principe est simple : un consultant en poste voit des choses qu'aucune
 * recherche web ne verra. Le module ne fabrique pas ces informations — il
 * calcule seulement OÙ il vaut la peine d'aller les chercher.
 */
export const expansionSignalSchema = z.object({
  accountId: z.string().guid(),
  /** Missions actives sur ce compte — plus il y en a, plus la relation porte. */
  activeMissions: z.number().int().min(0),
  /** Missions qui finissent dans les 60 jours : autant de conversations ouvertes. */
  endingSoon: z.number().int().min(0),
  /** Experts en poste chez ce client, donc autant de sources terrain. */
  expertsOnSite: z.number().int().min(0),
  /**
   * Pourquoi ce compte mérite une visite maintenant. Toujours renseigné : un
   * score sans phrase n'a jamais fait décrocher un téléphone.
   */
  reason: z.string().min(1).max(300),
})
export type ExpansionSignal = z.infer<typeof expansionSignalSchema>

/** Minuit du jour donné — la comparaison de dates ne doit pas dépendre de l'heure. */
function startOfDay(date: Date): Date {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

// ── Requêtes API ─────────────────────────────────────────────────────────────

export const createMissionRequestSchema = z.object({
  accountId: z.string().guid(),
  opportunityId: z.string().guid().optional(),
  /**
   * Le RÔLE que cette mission pourvoit (`missions.need_id`, migration
   * `1791001000001`, arbitrage du 31/08/2026).
   *
   * `opportunityId` désigne l'AFFAIRE ; une affaire porte souvent plusieurs
   * rôles. Sans ce champ, « combien de missions sont nées de ce besoin » n'a
   * aucune réponse — c'est ce que le bandeau Staffing d'une fiche besoin
   * affichait en « non mesuré ».
   *
   * ⚠️ Il ne se DEVINE pas. L'absence est le cas ordinaire (mission créée à la
   * main, affaire à plusieurs rôles), et elle veut dire « rôle d'origine
   * inconnu », jamais « aucun rôle ».
   */
  needId: z.string().guid().optional(),
  label: z.string().trim().min(1).max(300),
  startedOn: z.string().date().optional(),
  endsOn: z.string().date().optional(),
  dailyRate: z.number().positive().optional(),
  /**
   * ⚠️ Il n'y a PLUS de `dailyCost` ici — décision D43 du 28/08/2026.
   *
   * Le champ existait, il écrivait `missions.daily_cost`, et AUCUN client ne
   * l'envoyait : ni le web, ni le service IA, ni `create_mission`, le seul
   * appelant interne. Il était donc l'unique moyen de remplir une colonne que
   * plus aucune dérivation ne lit — un « écrit, jamais lu » en germe, le
   * miroir exact du défaut que D43 corrige.
   *
   * Le coût chargé se saisit dans les conditions commerciales de la mission
   * (`PUT /delivery/missions/:id/terms`, `loadedDailyCostCents`, en centimes),
   * sous `finance:read`. Le schéma n'étant pas `.strict()`, un appelant
   * historique qui enverrait encore `dailyCost` n'est pas rejeté : la clé est
   * simplement ignorée.
   */
  /** La société de l'ESN qui portera la mission (D9). Optionnel : un espace
   *  mono-société n'en déclare aucune, et c'est le cas ordinaire. */
  legalEntityId: z.string().guid().optional(),
  /** Absent ⇒ `inconnu`, et surtout PAS `regie` : ne pas répondre n'est pas
   *  répondre « régie », et c'est ce champ que lit la garde du relevé
   *  d'activité. */
  contractKind: contractKindSchema.optional(),
  /** #3547 — le FORFAIT ENCADRÉ, en camelCase comme le reste de cette requête.
   *  Cohérence (mode ⇒ forfait) vérifiée par `deliveryModeProblems` côté service. */
  deliveryMode: deliveryModeSchema.optional(),
  supervisionRole: supervisionRoleSchema.nullish(),
  clientTeamSize: supervisedForfaitFieldsSchema.shape.client_team_size,
  clientTeamNames: supervisedForfaitFieldsSchema.shape.client_team_names,
  roleTitle: z.string().trim().min(1).max(200).optional(),
  billingContactId: z.string().guid().optional(),
  ownerId: z.string().guid().optional(),
  /**
   * #2561/#2562 — le deal CRM (`crm_deal_facts.id`) dont cette mission est la
   * REPRISE, quand l'appelant vient de la proposition de reprise. Même forme
   * que `needId` juste au-dessus, même raison : une RÉFÉRENCE, jamais
   * devinée. Absent = pas de correspondance connue, le cas ordinaire.
   */
  crmDealId: z.string().guid().optional(),
  /**
   * #2560.6 — DÉCISION LOUIS 18/09/2026 : le client citait « le consultant »
   * dans son retour, mais le critère de recette de #2560 ne portait que sur
   * compte/rôle/dates/TJM/jours — l'affectation d'un consultant est restée un
   * objet séparé (`MissionAssignment`, `staffing.ts`), jamais atteignable à la
   * CRÉATION d'une mission. Absent = pas de consultant désigné à la création,
   * le cas ordinaire (on peut toujours affecter ensuite via
   * `PUT /delivery/missions/:id/assignments`) — jamais un talent deviné.
   */
  consultantId: z.string().guid().optional(),
  /**
   * #2339.7 (épopée #2795) — le POSITIONNEMENT (`submissions.id`) dont cette
   * mission est la CONVERSION. Même forme que `crmDealId` juste au-dessus :
   * une RÉFÉRENCE, jamais devinée. Absent = pas de positionnement connu, le
   * cas ordinaire (mission saisie à la main, reprise CRM).
   */
  submissionId: z.string().guid().optional(),
  /**
   * #2320.21 (épopée #2967) — « Retenu → Mission nécessite accord client ET
   * accord consultant ». Les DEUX rails, nommés SÉPARÉMENT : le geste HTTP qui
   * crée la mission prouve déjà qu'un humain a agi (garde
   * `mission-creation-is-a-human-gesture.spec.ts`), mais pas LEQUEL des deux
   * accords a été obtenu. Même garde que `consultantAgreement` des
   * positionnements (#2320.18) et `consentGiven`/`consentDate` des
   * affectations (#2407.4) : un booléen déclaré, jamais deviné.
   */
  clientAgreement: z.boolean().nullable().optional(),
  clientAgreementDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : AAAA-MM-JJ')
    .nullable()
    .optional(),
  consultantAgreement: z.boolean().nullable().optional(),
  consultantAgreementDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : AAAA-MM-JJ')
    .nullable()
    .optional(),
})
export type CreateMissionRequest = z.infer<typeof createMissionRequestSchema>

/**
 * RÉPARER une fiche de mission — les champs qu'un bloqueur de facturation
 * nomme, et que rien ne savait plus écrire après la création.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE SCHÉMA EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `BLOCKER_ACTIONS` (invoice-readiness.ts) promet un geste et une route pour
 * chacun des douze bloqueurs. Trois d'entre eux — `missing_billing_contact`,
 * `missing_rate`, `missing_start_date` — désignaient des colonnes que SEULE la
 * création écrivait : `POST /delivery/missions` les accepte, aucune route ne
 * les met à jour ensuite, et l'écran ADV annonçait pourtant qu'ils « se
 * réparent sur la fiche de mission ». Une mission créée sans eux restait donc
 * bloquée pour toujours, avec un bloqueur qui nommait un geste inexistant.
 *
 * Mesuré le 01/09/2026 sur un espace réel : `missing_billing_contact` sur
 * **11 missions sur 11**.
 *
 * ⚠️ Champ ABSENT = inchangé ; champ à `null` = EFFACÉ. Les deux gestes sont
 * légitimes et différents — « je n'y touche pas » n'est pas « il n'y en a
 * pas » —, et c'est le même régime que les conditions commerciales.
 */
export const updateMissionRequestSchema = z
  .object({
    /** À qui la facture part. `null` retire le contact — le bloqueur revient. */
    billingContactId: z.string().guid().nullable().optional(),
    startedOn: z.string().date().nullable().optional(),
    endsOn: z.string().date().nullable().optional(),
    /** Le TJM VENDU, en euros. Prix de vente, lisible par tout l'espace — ce
     *  n'est pas le coût chargé, qui reste dans les conditions commerciales
     *  sous `finance:read`. */
    dailyRate: z.number().positive().max(10_000).nullable().optional(),
    /**
     * LA SOCIÉTÉ DE L'ESN QUI PORTE LA MISSION (#1518).
     *
     * ⚠️ La colonne `missions.legal_entity_id` existe depuis la migration des
     * entités juridiques, le panneau Finance la LIT, le filtre de pilotage
     * FILTRE dessus — et son seul écrivain était le SEMIS DE DÉMO. En
     * production elle valait donc `null` partout : l'écran des sociétés
     * laissait déclarer des entités que rien ne pouvait ensuite rattacher.
     *
     * `null` retire le rattachement, et reste la réponse ordinaire : un espace
     * mono-société n'en déclare aucune. On ne pré-remplit jamais « la seule
     * entité » à la place de quelqu'un — une raison sociale apparaîtrait alors
     * sur des documents où personne ne l'a mise.
     *
     * ⚠️ À ne pas confondre avec l'entité du CLIENT (`account_entities`) :
     * celle-ci ÉMET la facture, celle-là la REÇOIT.
     */
    legalEntityId: z.string().guid().nullable().optional(),
    /** #2953 (#2193.17/.18) — texte libre, coupé et vidé en `null` par le
     *  service comme le fait terrain de `qualifyAccountPartnerSchema` : une
     *  chaîne blanche n'est pas une information. */
    objective: z.string().trim().max(500).nullable().optional(),
    perimeter: z.string().trim().max(500).nullable().optional(),
    /** X66 / #3547 — CHANGER LE MODE d'une mission déjà créée (forfait encadré).
     *  Mêmes champs, même cohérence (`deliveryModeProblems`) qu'à la création :
     *  le service vérifie la ligne FUSIONNÉE, et repasser en `staffed` efface le
     *  rôle et l'équipe (jamais un champ orphelin). */
    deliveryMode: deliveryModeSchema.optional(),
    supervisionRole: supervisionRoleSchema.nullable().optional(),
    clientTeamSize: supervisedForfaitFieldsSchema.shape.client_team_size,
    clientTeamNames: supervisedForfaitFieldsSchema.shape.client_team_names,
  })
  .strict()
  .refine(value => Object.keys(value).length > 0, { message: 'Rien à modifier' })
  /** Les deux dates ensemble ne peuvent pas s'inverser. Quand une seule est
   *  envoyée, la comparaison se refait côté service sur la ligne FUSIONNÉE :
   *  un corps partiel ne dit rien de l'autre borne. */
  .refine(value => !value.startedOn || !value.endsOn || value.endsOn >= value.startedOn, {
    message: 'Une mission ne peut pas finir avant de commencer',
    path: ['endsOn'],
  })
export type UpdateMissionRequest = z.infer<typeof updateMissionRequestSchema>

/**
 * #2195.32 / .37 — POSER le statut de renouvellement d'une mission.
 *
 * Une route À PART de `updateMissionRequestSchema`, et ce n'est pas un détail de
 * rangement : les autres champs de la fiche RÉPARENT une donnée (un contact
 * manquant, une date fausse), celui-ci enregistre une DÉCISION, avec son auteur
 * et sa date. Les mélanger aurait fait passer une décision commerciale pour une
 * correction de saisie dans le journal d'activité.
 *
 * `null` est accepté : il remet la ligne à « non renseigné ». Une correction
 * humaine gagne toujours, et un clic malheureux doit pouvoir se défaire — sinon
 * la seule sortie serait de poser un autre statut, c'est-à-dire d'affirmer un
 * fait de plus pour en effacer un.
 */
export const setRenewalStatusRequestSchema = z
  .object({
    status: renewalStatusSchema.nullable(),
  })
  .strict()
export type SetRenewalStatusRequest = z.infer<typeof setRenewalStatusRequestSchema>

/**
 * #2195.8 — le corps qui RÈGLE les fenêtres de l'espace.
 *
 * `null` remet l'échelle du PRODUIT. C'est la seule façon de « défaire » un
 * réglage : renvoyer `[15, 30, 45, 60]` à la main figerait l'échelle du jour et
 * la ferait passer pour un choix d'opérateur le jour où le produit la change.
 */
export const setRenewalWindowsRequestSchema = z
  .object({
    days: renewalWindowDaysSchema.nullable(),
  })
  .strict()
export type SetRenewalWindowsRequest = z.infer<typeof setRenewalWindowsRequestSchema>

export const submitTimesheetRequestSchema = z.object({
  periodMonth: z.string().date(),
  days: z.number().min(0).max(31),
  /** QUI dépose. Deux consultants sur une mission déposent deux relevés — sans
   *  ce champ, le second écrasait le premier en silence. */
  consultantId: z.string().guid().optional(),
  /** Pourquoi l'écart est normal. Sans elle, un écart connu bloque pour
   *  toujours ; avec, il est expliqué et reste AFFICHÉ. */
  gapExplanation: z.string().trim().min(1).max(500).optional(),
})

/** Ce que la vue du 5 du mois demande. */
export const timesheetMonthQuerySchema = z
  .object({
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/, 'Format attendu : AAAA-MM')
      .optional(),
    status: timesheetStatusSchema.optional(),
    missionId: z.string().guid().optional(),
    /** Ne rendre que ce qui EMPÊCHE de facturer. */
    blockingOnly: z.coerce.boolean().default(false),
  })
  .strict()
export type TimesheetMonthQuery = z.infer<typeof timesheetMonthQuerySchema>

export const explainGapSchema = z.object({ explanation: z.string().trim().min(1).max(500) }).strict()

/**
 * Rejeter un relevé — et le MOTIF n'est pas facultatif.
 *
 * Le dépôt applique déjà la règle deux fois : annuler un « facturé » exige un
 * motif, fermer un besoin aussi. La raison est la même à chaque fois — sans lui,
 * personne ne saura dans six mois pourquoi ce mois a fait un aller-retour, et
 * le consultant à qui on le renvoie ne sait pas quoi corriger.
 *
 * `.trim()` AVANT `.min(1)` : sans l'ordre, trois espaces passeraient pour un
 * motif. Les bornes sont celles de `explainGapSchema` — un réglage vit à un
 * seul endroit, et deux champs de motif voisins qui n'acceptent pas la même
 * longueur seraient une divergence de plus à expliquer.
 *
 * #2415.7 — la quantité CONTESTÉE et la DEADLINE de correction, conservées au
 * même titre que le motif. Sans la quantité, un relevé rejeté dit POURQUOI
 * mais pas COMBIEN de jours posent problème — un consultant peut redéposer un
 * mois entier pour corriger deux jours. Sans deadline, un rejet n'a pas
 * d'échéance, et la ligne « CRA rejeté » reste ouverte indéfiniment. REQUISES
 * comme `reason` (même garantie, même raison) : un champ optionnel ici se
 * ferait oublier sans que rien ne s'en aperçoive — exactement le défaut qu'un
 * normaliseur qui avale un champ neuf produirait.
 */
export const rejectTimesheetSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
    /** Jours contestés — jamais 0 (GA-18/GA-19) : un rejet porte toujours sur
     *  au moins une fraction de jour. Plafonné à 31, comme `days`. */
    contestedDays: z.number().positive().max(31),
    /** `AAAA-MM-JJ` — la date à laquelle la correction est attendue. */
    correctionDeadline: z.string().date(),
  })
  .strict()
export const validateByClientSchema = z.object({ at: z.string().datetime({ offset: true }).optional() }).strict()
/** #2415.6 — même forme que `validateByClientSchema` : un geste séparé, pas
 *  un champ de plus sur le même corps. */
export const internalReviewSchema = z.object({ at: z.string().datetime({ offset: true }).optional() }).strict()
export type SubmitTimesheetRequest = z.infer<typeof submitTimesheetRequestSchema>

// ── Prochaine étape suggérée, avec sa sévérité (panneau de planification, PDF-22 §7 ; #2411.8, épopée #2881) ──

/**
 * La sévérité d'une prochaine étape suggérée — l'échelle à SIX niveaux nommée
 * par #2411.8 (épopée #2881, LAU-FINAL-125) : `information`, `watch`,
 * `at_risk`, `critical`, `resolved`, `unknown`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * La fiche de lecture du panneau latéral (PDF-22, l.112-124) le nomme : « la
 * prochaine action existe sur sept écrans et aucune ne porte de niveau
 * d'impact ». Ce module portait un premier essai à TROIS niveaux
 * (`high`/`medium`/`low`, #2195) ; #2411.8 demande l'échelle DÉFINITIVE du
 * moteur de risque. AUCUNE probabilité n'entre ici — c'est un niveau
 * d'URGENCE commerciale, pas une chance de quoi que ce soit (doctrine
 * `c26_probabilite`, refusée six fois).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE N'EST PAS UNE SECONDE PRIORISATION
 * ─────────────────────────────────────────────────────────────────────────────
 * `missionRisks()` classe déjà ses risques par urgence commerciale (« perdre la
 * mission coûte plus que la faire à marge réduite »). Une seconde échelle
 * d'urgence, calculée séparément, divergerait de la première le jour où l'une
 * des deux change — GA-26, une dérivation vit à un seul endroit. Ce module
 * réutilise donc l'ORDRE de `missionRisks()` tel quel : le PREMIER risque de la
 * liste est celui qui décide, et la seule chose que ce module AJOUTE est la
 * sévérité posée sur chaque nature de risque.
 *
 * Un risque `null` (mission sans aucun signal négatif — `active`/`onboarding`
 * sans renouvellement à engager, sans relevé contesté, marge connue et saine)
 * ne rend PAS une sévérité « information » : il rend `null`, parce qu'il n'y a
 * alors rien à suggérer. Une prochaine étape inventée sur une mission qui va
 * bien serait exactement le bruit que la fiche de lecture reproche à l'écran
 * d'aujourd'hui.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `resolved` ET `information` NE SORTENT JAMAIS DE CETTE FONCTION AUJOURD'HUI
 * ─────────────────────────────────────────────────────────────────────────────
 * `resolved` nomme un risque déjà TRAITÉ (#2411.11) — `DeliveryService.list()`
 * le retire de `risks` AVANT que ce module ne le voie, précisément pour ne
 * jamais le reproposer (« fermer la notification »). Le rendre ici demanderait
 * de lire l'historique de résolution en plus du risque, ce que cette fonction
 * pure ne fait pas — c'est `missionPanel`/`DeliveryService` qui portent déjà ce
 * signal, sous une forme différente (le bouton « Marquer comme traité »
 * disparaît, pas un badge `resolved`). `information` reste RÉSERVÉ : aucun des
 * neuf risques ci-dessous n'est un simple point d'attention sans action
 * possible — le jour où `missionRisks()` en gagne un, il rejoint la table
 * ci-dessous, jamais une table parallèle.
 */
export const MISSION_RISK_SEVERITIES = ['information', 'watch', 'at_risk', 'critical', 'resolved', 'unknown'] as const
export const missionRiskSeveritySchema = z.enum(MISSION_RISK_SEVERITIES)
export type MissionRiskSeverity = (typeof MISSION_RISK_SEVERITIES)[number]

/**
 * `critical` pour ce qui menace la POURSUITE ou la RENTABILITÉ de la mission
 * de façon déjà avérée (un litige, une marge qui EST négative, une échéance
 * dépassée) ; `at_risk` pour ce qui demande un geste avant que ça devienne un
 * fait avéré ; `watch` pour ce qui mérite d'être suivi sans exiger un geste
 * immédiat ; `unknown` pour ce qu'on ne sait pas encore mesurer — grave en soi
 * d'ignorer, mais pas la preuve d'un problème (doctrine : « non mesuré » ≠ 0).
 */
const MISSION_RISK_SEVERITY: Record<MissionRisk, MissionRiskSeverity> = {
  timesheet_disputed: 'critical',
  margin_at_risk: 'critical',
  // #2408.8 — aussi près d'un fait avéré que « litige » ou « marge négative » :
  // l'échéance est là ou dépassée, rien n'attend plus.
  ending_soon: 'critical',
  // #2411.6 — même famille que `timesheet_disputed` : un fait DÉJÀ AVÉRÉ
  // (la facturation du mois est réellement bloquée), pas une donnée manquante.
  // Sévérité transposée sur l'échelle à 6 niveaux (#2411.8 a remplacé l'ancien
  // impact à 3 crans avant que ce risque n'existe) — même famille avérée que
  // `timesheet_disputed`/`margin_at_risk`/`ending_soon`, donc `critical`.
  invoice_blocked: 'critical',
  renewal_not_started: 'at_risk',
  timesheet_missing: 'at_risk',
  // #2408.18 — un geste (relancer le PO) évite que ça devienne un blocage de
  // facturation avéré ; ce n'est pas encore ce blocage.
  missing_po: 'at_risk',
  // Ni avéré ni actionnable dans l'instant : une échéance sans date n'empêche
  // rien AUJOURD'HUI, elle empêche seulement d'anticiper — un suivi, pas
  // encore un geste à poser.
  no_end_date: 'watch',
  margin_unknown: 'unknown',
  // #2411.7 — même famille que `margin_unknown` : une donnée manquante, pas
  // un fait métier avéré.
  missing_owner: 'unknown',
  // #2408.3/.16/.20 — un geste évite que ça devienne un fait (perte du client,
  // intercontrat) : `at_risk`, jamais une chance chiffrée.
  relationship_threatened: 'at_risk',
  low_satisfaction: 'at_risk',
  consultant_unsecured: 'at_risk',
  // #2408.17/.21 — à suivre, sans geste immédiat sur la mission elle-même.
  prolonged_absence: 'watch',
  action_without_owner: 'watch',
}

/**
 * La sévérité de la prochaine étape suggérée sur une mission, à partir de ses
 * risques déjà calculés (`missionRisks()`, ordonnés par urgence).
 *
 * `null` sans aucun risque : pas de prochaine étape à suggérer n'est pas une
 * étape de sévérité `information`, c'est l'absence d'étape.
 */
export function missionRiskSeverity(risks: readonly MissionRisk[]): MissionRiskSeverity | null {
  const primary = risks[0]
  return primary ? MISSION_RISK_SEVERITY[primary] : null
}

// ── Les trois contacts d'une mission (panneau de planification, PDF-22 §7) ──

/**
 * Un contact de délivrance, tel que le panneau le montre — jamais l'entité
 * complète, jamais un critère protégé : nom et moyen de contact, rien de plus.
 *
 * Les trois rôles (consultant, chargé d'affaires, contact CRA) partagent cette
 * même forme parce que l'écran les affiche à l'identique — un nom, un geste de
 * contact. Le business manager n'a pas de téléphone en base (`profiles` n'en
 * porte pas) : `phone` y est donc toujours `null`, jamais une valeur inventée.
 */
export const missionDeliveryContactSchema = z.object({
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
})
export type MissionDeliveryContact = z.infer<typeof missionDeliveryContactSchema>

/**
 * « Changer le contact CRA » — poser QUI valide le relevé côté client.
 *
 * `contactId: null` retire le contact CRA (redevient « non désigné »), jamais
 * un état à part : la mission n'a pas de contact CRA « effacé » différent de
 * « jamais renseigné ».
 */
export const setMissionCraContactSchema = z.object({ contactId: z.string().guid().nullable() }).strict()
export type SetMissionCraContactInput = z.infer<typeof setMissionCraContactSchema>

/**
 * #2836 — « Désigner le manager client » : la personne, CHEZ LE CLIENT, qui
 * encadre le consultant au quotidien (l'interlocuteur opérationnel de la
 * mission). L'autre moitié du binôme que l'ESN suit sur chaque mission : le
 * chargé d'affaires (`missions.owner_id`) est NOTRE porteur, le manager client
 * est LE SIEN.
 *
 * Une référence vers `contacts` du compte de la mission, jamais un nom libre
 * (même raison que le contact CRA : une identité, un seul endroit). Distinct
 * du contact CRA (qui VALIDE le relevé) et du rôle d'achat
 * (`orgDecisionRoleSchema`, qui DÉCIDE) : trois axes qui coïncident parfois,
 * jamais par règle.
 *
 * `contactId: null` retire le manager client — « non désigné », pas un état à
 * part.
 */
export const setMissionClientManagerSchema = z.object({ contactId: z.string().guid().nullable() }).strict()
