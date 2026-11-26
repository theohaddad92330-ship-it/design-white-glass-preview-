import { z } from 'zod'
import { fieldSourceSchema, provenanceEntityTypeSchema, type FieldSource } from './provenance.js'
import { INTERNAL_CLIENT_MODES } from './account.js'
import { personCompanyRelationSchema } from './contact.js'
import { marketLocaleSchema } from './workspace.js'

/**
 * Édition des fiches — ce qu'un humain a le droit de corriger à la main.
 *
 * Jusqu'ici une fiche compte ou contact était en LECTURE SEULE : tout venait du
 * pipeline, et une erreur de collecte restait affichée jusqu'au run suivant (qui
 * la reproduisait). Un CRM commence exactement ici — pouvoir corriger ce qu'on
 * voit — et c'est aussi la seule façon d'obtenir une base propre : personne ne
 * signale une erreur qu'il ne peut pas réparer.
 *
 * La liste des champs est FERMÉE et volontairement courte : l'identité, les
 * coordonnées et le rattachement. Ce que le pipeline CALCULE (score, signaux,
 * organigramme, angles) n'est pas éditable — on corrige la donnée d'entrée, pas
 * le résultat, sinon le résultat ment sur ce qu'il a mesuré.
 *
 * `null` est une valeur autorisée : c'est ainsi qu'un humain EFFACE un champ.
 * Cette permission n'existe que pour lui (voir `decideFieldWrite`).
 */

/** Une chaîne de fiche : bornée, trimée, et `''` vaut « efface ». */
const recordText = (max: number) => z.string().trim().max(max).nullable()

export const accountCorePatchSchema = z
  .object({
    companyName: z.string().trim().min(1).max(200).optional(),
    tradeName: recordText(200).optional(),
    sector: recordText(120).optional(),
    employees: recordText(60).optional(),
    revenue: recordText(60).optional(),
    headquarters: recordText(200).optional(),
    website: recordText(300).optional(),
    phone: recordText(40).optional(),
    address: recordText(300).optional(),
    siren: z
      .string()
      .trim()
      .regex(/^\d{9}$/, 'Un SIREN fait 9 chiffres')
      .nullable()
      .optional(),
    nafCode: recordText(10).optional(),
    // #219.6 (#3231, lot X50) — CLIENT INTERNE déclaré ; `null` = non déclaré.
    declaredInternalClientMode: z.enum(INTERNAL_CLIENT_MODES).nullable().optional(),
    // #219.6 (J05) — les QUATRE rôles d'une direction interne, nommés à la main (jamais devinés).
    declaredInternalSponsor: recordText(200).optional(),
    declaredInternalUsers: recordText(200).optional(),
    declaredLegalEntity: recordText(200).optional(),
    declaredEndClient: recordText(200).optional(),
    // #3278.2 (lot M11) — les six critères de route sans source, déclarés à la main.
    declaredRouteScope: recordText(500).optional(),
    declaredRouteObjectives: recordText(500).optional(),
    declaredRouteAvailableRoles: recordText(500).optional(),
    declaredRoutePartners: recordText(500).optional(),
    declaredRouteHistory: recordText(500).optional(),
    declaredRouteTiming: recordText(500).optional(),
    // #3278.2b (Louis 15/10) — déclaratifs.
    declaredRouteBudget: recordText(500).optional(),
    declaredRouteAvailability: recordText(500).optional(),
    declaredRouteNetwork: recordText(500).optional(),
    // #3278.1 (décision Louis 11/10/2026) — les faits des routes « événement / communauté » et « inbound / contenu ».
    declaredRouteEvent: recordText(500).optional(),
    declaredRouteInbound: recordText(500).optional(),
    // #219.6 (#3231) — les filiales déclarées, en saisie texte (virgule, point-virgule, ligne).
    subsidiaries: recordText(2000).optional(),
  })
  .strict()
  .refine(value => Object.keys(value).length > 0, { message: 'Rien à modifier' })
export type AccountCorePatch = z.infer<typeof accountCorePatchSchema>

export const contactCorePatchSchema = z
  .object({
    fullName: z.string().trim().min(1).max(160).optional(),
    title: recordText(200).optional(),
    entity: recordText(200).optional(),
    email: z
      .union([z.string().trim().email('Adresse e-mail invalide').max(320), z.literal(''), z.null()])
      .transform(value => (value === '' ? null : value))
      // `.optional()` APRÈS le `.transform()` : en zod 4, avant, la clé deviendrait obligatoire dans le type inféré.
      .optional(),
    phone: recordText(40).optional(),
    linkedinUrl: recordText(400).optional(),
    family: recordText(60).optional(),
    decisionRole: recordText(60).optional(),
    assignedTo: z.string().guid().nullable().optional(),
    // #2861 (#2437.2, 26/09/2026) — le niveau DESTINATAIRE de langue, même
    // catalogue que `workspace.defaultLocale` (GA-26).
    locale: marketLocaleSchema.nullable().optional(),
    // #219.8 (#3231, lot Q03) — la relation personne↔entreprise DÉCLARÉE.
    // `unknown_relationship` est refusé : l'effacer, c'est `null`.
    declaredPersonCompanyRelation: personCompanyRelationSchema.exclude(['unknown_relationship']).nullable().optional(),
  })
  .strict()
  .refine(value => Object.keys(value).length > 0, { message: 'Rien à modifier' })
export type ContactCorePatch = z.infer<typeof contactCorePatchSchema>

/**
 * Création d'un contact À LA MAIN — le geste qui manquait.
 *
 * Un contact ne naissait que d'une analyse ou d'un import. Le commercial qui
 * rencontre quelqu'un en salon n'avait donc nulle part où le mettre, et la
 * relation vivait dans son téléphone. `source` vaut `manual` : on ne maquille
 * pas une saisie en résultat d'enrichissement.
 *
 * #1473 — `accountId` est FACULTATIF et peut valoir `null` : le contact
 * rencontré sans société connue est « à qualifier ». Ce n'est pas la même chose
 * que l'entreprise pas encore analysée, qui se crée à la volée (#1317.1) :
 * ici on ne CONNAÎT pas l'entreprise, et lui en inventer une serait une donnée
 * fictive. Le rattachement se fait plus tard, quand l'information arrive.
 */
export const createContactSchema = z
  .object({
    accountId: z.string().guid().nullish(),
    fullName: z.string().trim().min(1).max(160),
    title: z.string().trim().max(200).nullish(),
    entity: z.string().trim().max(200).nullish(),
    email: z.union([z.string().trim().email('Adresse e-mail invalide').max(320), z.literal(''), z.null()]).optional(),
    phone: z.string().trim().max(40).nullish(),
    linkedinUrl: z.string().trim().max(400).nullish(),
  })
  .strict()
export type CreateContactInput = z.infer<typeof createContactSchema>

/** Une ligne du journal d'écriture, telle que l'API la rend. Append-only : rien
 *  ne modifie ni ne supprime une ligne d'audit, sinon le journal ne prouve rien. */
export const recordFieldAuditSchema = z.object({
  id: z.string().guid(),
  entityType: provenanceEntityTypeSchema,
  entityId: z.string().guid(),
  field: z.string(),
  /** Sérialisées en texte : le journal doit rester lisible même si la colonne
   *  change de type plus tard. `null` = le champ était vide. */
  oldValue: z.string().nullable(),
  newValue: z.string().nullable(),
  source: fieldSourceSchema,
  actorId: z.string().guid().nullable(),
  actorName: z.string().nullable(),
  createdAt: z.string(),
  /** #2327.21 — la RÈGLE qui a produit l'écriture ; `null` quand elle n'a pas été nommée. */
  rule: z.string().nullable().optional(),
})
export type RecordFieldAudit = z.infer<typeof recordFieldAuditSchema>

/** Réponse d'un PATCH de fiche : ce qui a été écrit, et ce qui a été REFUSÉ avec
 *  sa raison. Un champ silencieusement ignoré ferait croire à un bug d'affichage. */
export const recordPatchResultSchema = z.object({
  updated: z.array(z.string()),
  rejected: z.array(z.object({ field: z.string(), reason: z.string() })),
})
export type RecordPatchResult = z.infer<typeof recordPatchResultSchema>

/**
 * #2318.6 — LAU-FINAL-059, CORRECTION UTILISATEUR : « le système doit montrer
 * avant, après, source contestée, portée, surfaces impactées, actions
 * impactées, confirmation ». `RecordFieldAudit` (ci-dessus) porte déjà
 * avant/après/source/auteur/date ; cette vue assemble les SEPT éléments de
 * l'issue, sans en fabriquer aucun de plus que ce que le journal sait.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CHAQUE CHAMP VEUT DIRE ICI
 * ─────────────────────────────────────────────────────────────────────────
 *  · `contestedSource` — la source que CETTE correction a fait céder. `null`
 *    quand le champ était vide avant (rien à contester) ; jamais `'human'`
 *    (une correction humaine ne « conteste » jamais une autre correction
 *    humaine — la plus récente gagne, elle ne dispute rien, `decideFieldWrite`
 *    dans `provenance.ts`) ;
 *  · `scope` — une correction de fiche ne cascade JAMAIS d'elle-même : elle
 *    porte sur CE champ, CETTE fiche. Une valeur fixe, pas un calcul —
 *    proposer une fusion ou une propagation groupe est un geste séparé et
 *    volontaire ailleurs dans le produit (doctrine « on propose, on ne
 *    fusionne jamais ») ;
 *  · `impactedSurfaces` — #2318.7 : une MESURE, désormais. Chaque surface porte
 *    son statut (`reached` / `not_reached` / `not_measurable`) et le fichier qui
 *    le prouve. Ce que ce champ était avant — neuf noms fixes, renvoyés tels
 *    quels, que le code lui-même annonçait comme « la PROMESSE du produit… pas
 *    une mesure » — était la faute GA-18 / GA-19 dans l'autre sens : là où un
 *    « 0 » affiché à la place d'un « non mesuré » ment en minimisant, neuf
 *    promesses présentées comme une propagation mentent en rassurant. Le
 *    registre est `CORRECTION_SURFACE_TRACES` ci-dessous, et la garde GA-364
 *    ouvre chaque fichier cité pour vérifier que l'ancrage y est encore ;
 *  · `impactedActions` — vide par défaut : ce journal ne sait pas relier un
 *    champ de fiche à une action du plan. Un tableau vide ici, ce n'est PAS
 *    « aucune action liée » : c'est « non mesuré », et l'appelant doit
 *    l'afficher ainsi plutôt que comme une absence ;
 *  · `confirmed` — toujours `true` : une ligne de `record_field_audit` est,
 *    par construction, une écriture déjà validée (append-only, jamais un
 *    brouillon). Il n'existe aujourd'hui aucun état "en attente" à côté.
 */
export const CORRECTION_IMPACTED_SURFACES = [
  'laura',
  'account_file',
  'contacts',
  'influence_map',
  'coverage',
  'score',
  'plan',
  'meetings',
  'future_research',
] as const
// Pas exporté : consommé uniquement ici (`FieldCorrectionView`). Un type
// exporté mais lu dans son seul fichier échoue `pnpm lint:exports:types`.
type CorrectionImpactedSurface = (typeof CORRECTION_IMPACTED_SURFACES)[number]

/**
 * #2318.7 — les TROIS états d'une surface, et pourquoi il en faut trois.
 *
 *  · `reached` — la surface RELIT la correction quand elle s'affiche. Ce n'est
 *    pas une intention, c'est un chemin de code : un service qui interroge la
 *    ligne vivante (`accounts` / `contacts`), et un écran qui rend ce qu'il en
 *    reçoit. Le fichier qui le prouve est cité.
 *  · `not_reached` — la surface lit un INSTANTANÉ figé (`raw_analysis`, écrit
 *    une fois par l'analyse), ou ne consulte simplement pas le champ corrigé.
 *    La correction y restera invisible jusqu'à une nouvelle analyse. C'est
 *    précisément le NO-GO de LAU-FINAL-059, et il vaut mieux l'afficher que
 *    l'enterrer sous une promesse.
 *  · `not_measurable` — on ne sait pas trancher depuis le code. Aucun cas
 *    aujourd'hui, et le mot reste : le jour où une surface perd son appelant,
 *    elle doit pouvoir le dire sans être rangée d'office parmi les échecs.
 *    « Non mesuré » n'est pas « non atteint », comme il n'est pas « 0 ».
 */
export type CorrectionSurfaceStatus = 'reached' | 'not_reached' | 'not_measurable'

export type CorrectionSurfaceTrace = {
  surface: CorrectionImpactedSurface
  status: CorrectionSurfaceStatus
  /**
   * Le fichier qui PROUVE le statut, relatif à la racine du dépôt. Pour une
   * surface atteinte : la lecture vivante. Pour une surface non atteinte : la
   * lecture figée qui explique pourquoi la correction n'y arrive pas.
   */
  evidenceFile: string
  /**
   * Le texte EXACT attendu dans ce fichier — un ancrage, jamais un numéro de
   * ligne. GA-364 ouvre le fichier et le cherche : une garde qui rougirait au
   * premier décalage de ligne deviendrait une nuisance, et une nuisance finit
   * supprimée. L'ancrage, lui, ne survit pas à la disparition du comportement,
   * ce qui est le seul changement dont on veut être averti.
   */
  evidenceAnchor: string
  /** La clé i18n qui DIT pourquoi, en fr et en en. Obligatoire dès que le
   *  statut n'est pas `reached` : ce qui n'a pas pu être atteint se NOMME. */
  reasonKey: string
}

/**
 * #2318.7 — CE QU'UNE CORRECTION ATTEINT VRAIMENT, mesuré le 20/09/2026.
 *
 * Cinq surfaces sur neuf. Les quatre autres sont nommées avec leur raison,
 * parce que quatre absences dites valent mieux que neuf promesses tues — et
 * parce que trois d'entre elles (score, plan, carte d'influence) sont
 * littéralement le NO-GO écrit dans l'issue : « une correction est visible dans
 * une page mais l'ancienne information continue d'alimenter Laura, le score ou
 * le plan ».
 *
 * Ce qu'une correction PEUT toucher borne la mesure : `RecordEditService` est
 * l'unique chemin d'écriture humain, et il n'écrit que les colonnes de
 * `ACCOUNT_FIELD_COLUMNS` / `CONTACT_FIELD_COLUMNS` — jamais `raw_analysis`.
 * Une surface est donc « atteinte » si elle relit ces colonnes-là.
 *
 * ⚠️ Ce registre se MODIFIE par la mesure, jamais par l'espoir. GA-364 relit
 * chaque fichier cité ; le jour où un ancrage disparaît, il faut remesurer la
 * surface, pas réécrire l'ancrage.
 */
export const CORRECTION_SURFACE_TRACES: readonly CorrectionSurfaceTrace[] = [
  {
    surface: 'laura',
    status: 'reached',
    // Le contexte du copilote est rebâti à CHAQUE tour depuis la ligne vivante.
    evidenceFile: 'apps/api/src/modules/ia-proxy/chat-context.service.ts',
    evidenceAnchor: 'this.accounts.findOne(resolvedId, userId)',
    reasonKey: 'correctionSurfaces.laura.why',
  },
  {
    surface: 'account_file',
    status: 'reached',
    evidenceFile: 'apps/api/src/modules/accounts/accounts.service.ts',
    evidenceAnchor: 'async findOneForWorkspace',
    reasonKey: 'correctionSurfaces.account_file.why',
  },
  {
    surface: 'contacts',
    status: 'reached',
    evidenceFile: 'apps/api/src/modules/contacts/contacts.service.ts',
    evidenceAnchor: 'where: { account_id: accountId, deleted_at: IsNull()',
    reasonKey: 'correctionSurfaces.contacts.why',
  },
  {
    surface: 'influence_map',
    status: 'not_reached',
    // La carte se construit à partir du SEUL graphe rangé dans `raw_analysis` ;
    // aucune jointure ne revient vers la ligne `contacts`. Un nom ou un titre
    // corrigé y reste invisible jusqu'à une nouvelle analyse (ou une correction
    // de graphe, qui est un geste séparé, par `OrgGraphCorrectionService`).
    evidenceFile: 'apps/web/src/features/accounts/view/account-detail/tabs/organigramme/orgInfluenceMapData.ts',
    evidenceAnchor: 'export function buildOrgInfluenceMap',
    reasonKey: 'correctionSurfaces.influence_map.why',
  },
  {
    surface: 'coverage',
    status: 'reached',
    // La couverture compte des CONTACTS relus vivants. (Le dénominateur — la
    // liste des entités à couvrir — vient bien du blob figé, mais aucune
    // correction de fiche ne l'écrit : ce n'est pas un chemin manqué.)
    evidenceFile: 'apps/api/src/modules/coverage-gaps/coverage.service.ts',
    evidenceAnchor: 'async computeForAccount',
    reasonKey: 'correctionSurfaces.coverage.why',
  },
  {
    surface: 'score',
    status: 'not_reached',
    // `priority_score` n'est pas une colonne corrigeable : il n'a pas d'auteur
    // humain, et rien ne le recalcule quand une fiche est corrigée. Il reste
    // celui que la dernière analyse a matérialisé.
    evidenceFile: 'apps/api/src/modules/accounts/accounts.service.ts',
    evidenceAnchor: 'patch.priority_score = data.priorityScore',
    reasonKey: 'correctionSurfaces.score.why',
  },
  {
    surface: 'plan',
    status: 'not_reached',
    evidenceFile: 'apps/web/src/features/accounts/view/account-detail/tabs/TabPlan.tsx',
    evidenceAnchor: 'buildPlanViewData((account.raw_analysis',
    reasonKey: 'correctionSurfaces.plan.why',
  },
  {
    surface: 'meetings',
    status: 'reached',
    // Le brief de rendez-vous relit les contacts à chaque ouverture.
    evidenceFile: 'apps/web/src/features/agenda/view/MeetingPrepDialog.tsx',
    evidenceAnchor: 'const briefContacts',
    reasonKey: 'correctionSurfaces.meetings.why',
  },
  {
    surface: 'future_research',
    status: 'not_reached',
    // Le nom et le SIREN partent bien vivants, mais le CONTEXTE qui grounde la
    // recherche suivante est le blob figé : un secteur ou un siège corrigé
    // n'est pas ce que le modèle « voit » en repartant chercher.
    evidenceFile: 'apps/api/src/modules/analysis/analysis-ondemand.service.ts',
    evidenceAnchor: 'profileData: (account.raw_analysis ?? {})',
    reasonKey: 'correctionSurfaces.future_research.why',
  },
]

export type FieldCorrectionView = {
  field: string
  before: string | null
  after: string | null
  contestedSource: FieldSource | null
  scope: 'single_record'
  impactedSurfaces: readonly CorrectionSurfaceTrace[]
  /** `null` = non mesuré (voir la note ci-dessus) — jamais confondu avec []
   *  (« mesuré, et il n'y en a aucune »). */
  impactedActions: { id: string; label: string }[] | null
  confirmed: true
}

export function buildFieldCorrectionView(
  entry: RecordFieldAudit,
  /**
   * La source de la valeur QUE `entry` remplace — celle de l'écriture
   * PRÉCÉDENTE sur ce même champ, jamais `entry.source` lui-même (qui est la
   * source de l'écriture ENTRANTE — voir `field-conflict.service.ts`, même
   * distinction). `null` quand aucune écriture antérieure n'est connue.
   */
  previousSource: FieldSource | null,
): FieldCorrectionView {
  return {
    field: entry.field,
    before: entry.oldValue,
    after: entry.newValue,
    // Rien à contester quand il n'y avait rien avant.
    contestedSource: entry.oldValue === null ? null : previousSource,
    scope: 'single_record',
    // #2318.7 — le registre MESURÉ, plus la liste de promesses d'avant.
    impactedSurfaces: CORRECTION_SURFACE_TRACES,
    impactedActions: null,
    confirmed: true,
  }
}
