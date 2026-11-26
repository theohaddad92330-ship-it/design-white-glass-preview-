import { z } from 'zod'
import { PROJECT_STAGES, type ProjectStage } from './project.js'
import { missionStatusSchema, type MissionStatus } from './mission.js'

/**
 * Le board Missions à douze colonnes — une VUE DE PROJECTION (décision D2).
 *
 * Le besoin est réel : un commercial suit une affaire du besoin détecté jusqu'à
 * la mission terminée, et le produit la lui montre aujourd'hui sur DEUX écrans
 * qui ne se parlent pas — le pipe des Projets, cinq colonnes, et la liste des
 * Missions, six statuts.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI EST PROJETÉ, ET CE QUI NE L'EST PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Douze colonnes, mais AUCUN nouvel état. Chaque carte reste possédée par son
 * objet d'origine : un projet garde son `stage`, une mission garde son `status`,
 * et cette table ne fait que dire dans quelle colonne les afficher côte à côte.
 *
 * C'est la seule forme acceptable. Dupliquer les étapes amont dans un statut de
 * mission créerait deux vérités de pipe — exactement ce que l'invariant n°1
 * interdit, et exactement le bug que le pivot Projet avait corrigé. La règle qui
 * en découle : **on ne déplace pas une carte dans ce board**. Le mouvement se
 * fait sur l'écran qui possède l'objet ; ici, on regarde.
 *
 * Chaque carte porte son ORIGINE (`source`), et ce n'est pas décoratif : deux
 * cartes voisines dans la colonne « gagnée » ne veulent pas dire la même chose
 * selon qu'elles viennent d'un projet signé ou d'une mission démarrée.
 */

export const MISSION_BOARD_COLUMNS = [
  'a_creer',
  'qualification',
  'matching',
  'shortlist_prete',
  'profil_propose',
  'validation_client',
  'gagnee',
  'en_cours',
  'renouvellement',
  'terminee',
  'perdue',
  'en_veille',
] as const
export const missionBoardColumnSchema = z.enum(MISSION_BOARD_COLUMNS)
export type MissionBoardColumn = (typeof MISSION_BOARD_COLUMNS)[number]

/** Les libellés par défaut. FR et EN, parce que la colonne est une surface
 *  produit au même titre que les étapes du pipe. */
export const MISSION_BOARD_LABELS: Readonly<Record<MissionBoardColumn, { fr: string; en: string }>> = {
  a_creer: { fr: 'À créer', en: 'To create' },
  qualification: { fr: 'Qualification', en: 'Qualification' },
  matching: { fr: 'Matching', en: 'Matching' },
  shortlist_prete: { fr: 'Shortlist prête', en: 'Shortlist ready' },
  profil_propose: { fr: 'Profil proposé', en: 'Profile submitted' },
  validation_client: { fr: 'Validation client', en: 'Client validation' },
  gagnee: { fr: 'Gagnée', en: 'Won' },
  en_cours: { fr: 'En cours', en: 'Running' },
  renouvellement: { fr: 'Renouvellement', en: 'Renewal' },
  terminee: { fr: 'Terminée', en: 'Ended' },
  perdue: { fr: 'Perdue', en: 'Lost' },
  en_veille: { fr: 'En veille', en: 'On hold' },
}

/** D'où vient la carte. Affiché sur elle — deux cartes voisines n'ont pas le
 *  même sens selon l'objet qui les porte. */
export const MISSION_BOARD_SOURCES = ['project', 'mission'] as const
export const missionBoardSourceSchema = z.enum(MISSION_BOARD_SOURCES)
export type MissionBoardSource = (typeof MISSION_BOARD_SOURCES)[number]

/**
 * L'ALERTE d'une carte — au plus UNE, la plus grave (§2.2).
 *
 * Une carte qui porte trois avertissements n'en fait lire aucun. La liste est
 * ordonnée par gravité et le board ne montre que la première : c'est ce qui
 * rend une colonne de quarante cartes lisible en un coup d'œil.
 */
export const MISSION_BOARD_ALERTS = [
  /** Le mois est bloqué et personne ne le sait. Le plus coûteux : il passe. */
  'invoicing_blocked',
  /** Un relevé manque sur un mois clos. */
  'timesheet_missing',
  /** La fin approche et rien n'est engagé. */
  'renewal_due',
  /** Aucune fin connue — donc aucune alerte possible ensuite. */
  'no_end_date',
  /** Personne n'est affecté. */
  'unstaffed',
  /** La carte séjourne dans sa colonne au-delà du délai du §2. */
  'stale',
] as const
export const missionBoardAlertSchema = z.enum(MISSION_BOARD_ALERTS)
export type MissionBoardAlert = (typeof MISSION_BOARD_ALERTS)[number]

export const missionBoardCardSchema = z.object({
  id: z.string().min(1),
  source: missionBoardSourceSchema,
  column: missionBoardColumnSchema,
  label: z.string().min(1),
  accountName: z.string().nullable(),
  /** L'état d'origine, tel qu'il est écrit sur l'objet. Affiché tel quel :
   *  c'est ce qui permet de retrouver l'écran où la carte se déplace. */
  originState: z.string().min(1),
  /** Le rôle cherché, quand la carte en porte un. `null` sur un projet qui n'a
   *  pas encore de besoin exprimé. */
  role: z.string().nullable(),
  /** Qui est dessus. `null` = personne — l'écran écrit « à staffer », jamais un
   *  blanc qui se lirait comme un défaut d'affichage. */
  consultantName: z.string().nullable(),
  /** Fin de mission. `null` = inconnue, et c'est une information. */
  endsOn: z.string().nullable(),
  /** TJM vendu en centimes. `null` = non renseigné, jamais 0. */
  dailyRateCents: z.number().int().nonnegative().nullable(),
  /** La marge en pourcentage. `null` sans `finance:read` — PRÉSENTE et vide,
   *  jamais retirée (D45, 28/08/2026) et jamais mise à zéro : un zéro se lit
   *  comme une marge nulle. `null` aussi sur une carte de PROJET, qui n'a pas
   *  de mission dessous. Ce qui distingue les deux, c'est `canReadFinance`,
   *  rendu à côté du board. */
  marginPercent: z.number().nullable(),
  /** Depuis combien de jours la carte est dans cette colonne. */
  daysInColumn: z.number().int().nonnegative().nullable(),
  /** L'alerte la plus grave, ou `null`. Jamais une liste. */
  alert: missionBoardAlertSchema.nullable(),
})
export type MissionBoardCard = z.infer<typeof missionBoardCardSchema>

/**
 * Le délai au-delà duquel une carte est en retard dans sa colonne (§2).
 *
 * `null` pour « En cours » et « Terminée » : une mission de dix-huit mois n'est
 * pas en retard parce qu'elle dure. Mettre un seuil partout ferait clignoter
 * tout le board, et un board qui clignote partout ne signale plus rien.
 */
export const MISSION_BOARD_STALE_DAYS: Readonly<Record<MissionBoardColumn, number | null>> = {
  a_creer: 3,
  qualification: 7,
  matching: 5,
  shortlist_prete: 2,
  profil_propose: 3,
  validation_client: 7,
  gagnee: 5,
  en_cours: null,
  renouvellement: 30,
  terminee: null,
  perdue: null,
  en_veille: 90,
}

/**
 * L'alerte à montrer, parmi celles qui s'appliquent.
 *
 * L'ordre de {@link MISSION_BOARD_ALERTS} EST la gravité : la première trouvée
 * gagne. Rendre `null` quand rien ne s'applique est le cas le plus fréquent, et
 * c'est heureux.
 */
export function worstAlert(candidates: readonly MissionBoardAlert[]): MissionBoardAlert | null {
  for (const alert of MISSION_BOARD_ALERTS) {
    if (candidates.includes(alert)) return alert
  }
  return null
}

/**
 * La colonne d'un PROJET.
 *
 * `null` pour `detected` et `potential` : ces deux étapes sont l'entonnoir de
 * détection, pas encore une affaire suivie. Les afficher dans « à créer »
 * noierait le board sous des centaines de signaux que personne n'a regardés —
 * c'est déjà la raison pour laquelle le pipe ne les montre pas.
 */
export function columnForProject(stage: ProjectStage): MissionBoardColumn | null {
  switch (stage) {
    case 'detected':
    case 'potential':
      return null
    case 'qualified':
      return 'qualification'
    case 'confirmed':
      return 'matching'
    case 'profiles_submitted':
      return 'profil_propose'
    case 'negotiation':
      return 'validation_client'
    case 'won':
      // Un projet gagné va en « gagnée ». C'est l'APPELANT qui le bascule en
      // « à créer » quand aucune mission ne le porte encore : la fonction ne
      // connaît pas les missions, et le lui faire deviner produirait une
      // colonne vide ou une colonne fausse.
      return 'gagnee'
    case 'lost':
      return 'perdue'
    case 'dormant':
      return 'en_veille'
  }
}

/**
 * La colonne d'une MISSION.
 *
 * `onboarding` tombe dans « gagnée » et non dans « en cours » : la mission est
 * signée mais personne n'a encore facturé un jour. Les confondre ferait
 * apparaître comme en production une mission qui n'a pas démarré.
 */
export function columnForMission(status: MissionStatus): MissionBoardColumn {
  switch (status) {
    // #2407.5 — les statuts ajoutés rejoignent la colonne de leur PHASE
    // (`status-transitions.ts`) : aucune mission ne disparaît du tableau.
    case 'draft':
    case 'onboarding':
    case 'ready_to_start':
      return 'gagnee'
    case 'active':
    case 'at_risk':
    case 'ending':
      return 'en_cours'
    case 'paused':
      return 'en_veille'
    case 'renewed':
    case 'renewal_pending':
      return 'renouvellement'
    case 'ended':
    case 'terminated':
    case 'completed':
    case 'archived':
      return 'terminee'
    case 'cancelled':
      return 'perdue'
  }
}

/**
 * Les cartes d'une colonne, projets et missions confondus.
 *
 * L'ordre n'est pas indifférent : les MISSIONS d'abord. Dans une colonne
 * partagée comme « gagnée », une mission signée est plus avancée qu'un projet
 * qui vient de l'être, et c'est elle qu'on veut voir en premier.
 */
export function cardsInColumn(cards: readonly MissionBoardCard[], column: MissionBoardColumn): MissionBoardCard[] {
  return cards
    .filter(card => card.column === column)
    .sort((a, b) => (a.source === b.source ? 0 : a.source === 'mission' ? -1 : 1))
}

/**
 * L'en-tête d'une colonne (§2.1).
 *
 * « 12 missions · 486 000 € de CA restant · 3 sans date de fin ». Les trois
 * chiffres sont dans cet ordre parce que le troisième CORRIGE le deuxième : le
 * CA restant ne compte que ce qui a une fin, et il faut dire combien de cartes
 * n'en ont pas — sinon le total se lit comme un total.
 */
export const missionBoardColumnSummarySchema = z.object({
  column: missionBoardColumnSchema,
  count: z.number().int().min(0),
  /**
   * Le CA restant à courir, en centimes. `null` quand aucune carte de la
   * colonne n'a de quoi le calculer — jamais 0, qui se lirait « plus rien à
   * facturer ».
   */
  remainingRevenueCents: z.number().int().nonnegative().nullable(),
  /**
   * Les cartes SANS date de fin, comptées à part et EXCLUES du montant.
   *
   * C'est la règle du §2.1, et c'est la seule façon honnête de présenter le
   * chiffre : estimer une fin ferait apparaître un revenu que personne n'a
   * signé.
   */
  withoutEndDateCount: z.number().int().min(0),
})
export type MissionBoardColumnSummary = z.infer<typeof missionBoardColumnSummarySchema>

/** Les filtres du §2.3. Tous facultatifs : le board s'ouvre entier. */
export const missionBoardFiltersSchema = z
  .object({
    accountId: z.string().guid().optional(),
    consultantId: z.string().guid().optional(),
    ownerId: z.string().guid().optional(),
    /** Fin avant cette date (`YYYY-MM-DD`). */
    endsBefore: z.string().optional(),
    withoutEndDate: z.boolean().optional(),
    lateTimesheet: z.boolean().optional(),
    notInvoiceable: z.boolean().optional(),
    source: missionBoardSourceSchema.optional(),
  })
  .strict()
export type MissionBoardFilters = z.infer<typeof missionBoardFiltersSchema>

/** Le contrat de lecture de `GET /missions/board`. */
export const missionBoardSchema = z.object({
  cards: z.array(missionBoardCardSchema),
  columns: z.array(missionBoardColumnSummarySchema),
  /**
   * Les projets écartés de la vue parce qu'ils sont encore dans l'entonnoir de
   * détection. Comptés À PART plutôt que masqués en silence : « 287 projets
   * détectés non affichés » est une information, leur disparition n'en est pas
   * une.
   */
  intakeCount: z.number().int().min(0),
  /**
   * Le DROIT financier de celui qui lit, rendu AVEC la réponse.
   *
   * Depuis D45 (28/08/2026), `marginPercent` vaut `null` au lieu de disparaître
   * quand `finance:read` manque. La forme du champ ne dit donc plus laquelle
   * des deux absences on tient — « pas ton périmètre » ou « coût chargé non
   * renseigné ». Sans ce drapeau, l'écran afficherait le même vide pour les
   * deux, et un vide se lit « rien de renseigné ».
   */
  canReadFinance: z.boolean(),
})
export type MissionBoard = z.infer<typeof missionBoardSchema>

/**
 * Les agrégats d'une colonne, calculés sur ses cartes.
 *
 * Le montant EXCLUT les cartes sans date de fin, et le compteur les nomme. Une
 * somme qui les inclurait supposerait une durée, donc inventerait un revenu.
 */
export function summarizeColumn(
  cards: readonly MissionBoardCard[],
  column: MissionBoardColumn,
  today: string,
): MissionBoardColumnSummary {
  const scope = cards.filter(card => card.column === column)
  const withoutEnd = scope.filter(card => card.endsOn === null)
  const measurable = scope.filter(card => card.endsOn !== null && card.dailyRateCents !== null)
  const remaining = measurable.reduce((sum, card) => sum + remainingRevenue(card, today), 0)
  return {
    column,
    count: scope.length,
    remainingRevenueCents: measurable.length === 0 ? null : remaining,
    withoutEndDateCount: withoutEnd.length,
  }
}

/**
 * Le revenu restant d'une carte : les jours ouvrés qui séparent aujourd'hui de
 * la fin, multipliés par le TJM.
 *
 * Une fin déjà passée rend zéro et non un nombre négatif : « il reste −12 jours »
 * n'a pas de sens sur un écran, et se propagerait dans le total.
 */
function remainingRevenue(card: MissionBoardCard, today: string): number {
  if (card.endsOn === null || card.dailyRateCents === null) return 0
  const start = Date.parse(`${today}T00:00:00Z`)
  const end = Date.parse(`${card.endsOn}T00:00:00Z`)
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0
  let days = 0
  const cursor = new Date(start)
  while (cursor.getTime() < end) {
    const weekday = cursor.getUTCDay()
    if (weekday !== 0 && weekday !== 6) days += 1
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days * card.dailyRateCents
}

/** Les étapes de projet qui n'entrent PAS dans le board. Exporté pour que le
 *  service compte exactement ce que la vue écarte. */
export const BOARD_INTAKE_STAGES: readonly ProjectStage[] = PROJECT_STAGES.filter(
  stage => columnForProject(stage) === null,
)

export { missionStatusSchema }
