import { z } from 'zod'
import {
  NEED_PROCUREMENT_INVOLVEMENTS,
  contractKindSchema,
  needUrgencySchema,
  projectContactRoleSchema,
  requiredSkillSchema,
} from './project.js'
import { remotePreferenceSchema, travelAcceptanceSchema } from './talent-preferences.js'

/**
 * #2322 — LE COMPILATEUR DE BESOIN : ce qu'une source DIT, et ce qu'elle ne dit pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN FICHIER À PART DE `project.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 * `projectNeedSchema` décrit un besoin TEL QU'IL EST ENREGISTRÉ. Ce fichier-ci
 * décrit un besoin TEL QU'IL VIENT D'ÊTRE LU dans un email, un compte rendu ou
 * une fiche CRM : la même matière, plus ce que l'enregistrement ne porte pas —
 * d'où vient chaque valeur, ce qui manque, ce qui se contredit.
 *
 * Il ne DOUBLE rien (GA-26) : les compétences restent `requiredSkillSchema`, le
 * télétravail reste `remotePreferenceSchema`, le TJM reste des centimes. Ce qui
 * est ajouté ici est ce que le besoin enregistré n'a jamais porté.
 *
 * ⚠️ **Un besoin compilé est une PROPOSITION, pas une écriture.** Rien, dans ce
 * fichier, n'écrit en base : la compilation produit un objet qu'un humain lit,
 * corrige et valide. « On PROPOSE, on n'écrit jamais tout seul. »
 *
 * ⚠️ **Aucune probabilité.** Ni « 80 % sûr », ni « chance que ce besoin sorte ».
 * La seule graduation admise est un NIVEAU NOMMÉ ({@link NEED_FIELD_CONFIDENCES},
 * {@link NEED_CONFIRMATION_LEVELS}) — refusé six fois, ça ne se re-litige pas.
 *
 * ⚠️ **Ce qu'on n'a pas ne fait pas de ligne.** Les listes de ce fichier
 * (preuves attendues, étapes du processus, exigences de sécurité) sont vides
 * quand la source n'en dit rien — jamais un « non communiqué » de remplissage.
 * Ce qui MANQUE se dit ailleurs, nommément : {@link needUnknownSchema}.
 */

/* ------------------------------------------------------------------ */
/* Les sources — #2322.1 à #2322.13                                    */
/* ------------------------------------------------------------------ */

/**
 * D'où un besoin peut être compilé.
 *
 * - `chat_message` (#2322.1) — ce que la personne tape à Laura.
 * - `free_brief` (#2322.2) — du texte collé, sans autre indice.
 * - `email` (#2322.3) — un fil reçu du client.
 * - `meeting_report` (#2322.4) — un compte rendu rédigé après coup.
 * - `transcript` (#2322.5) — une transcription d'appel, mot à mot.
 * - `document` (#2322.6 / #2322.7) — PDF, Word : l'import de fiches de poste
 *   existait AVANT ce chantier (`ImportNeedsDialog`), la source est nommée ici
 *   pour que la provenance d'un champ puisse le dire.
 * - `screenshot` (#2322.8) — une capture d'écran.
 * - `crm_record` (#2322.10) — une fiche lue chez le CRM branché.
 * - `field_notes` (#2322.13) — des notes prises sur place.
 * - `job_posting` (#2322.11) — une offre d'emploi publiée.
 * - `rfp` (#2322.12) — un appel d'offres.
 *
 * ⚠️ **`spreadsheet` n'existe pas, et ce n'est pas un oubli** (#2322.9) : « jamais
 * un tableur, jamais un mapping de colonnes » (décision du 18/09/2026). Un
 * tableur se REFUSE, avec une phrase — voir {@link identifyNeedSource}.
 */
export const NEED_COMPILATION_SOURCE_KINDS = [
  'chat_message',
  'free_brief',
  'email',
  'meeting_report',
  'transcript',
  'document',
  'screenshot',
  'crm_record',
  'field_notes',
  'job_posting',
  'rfp',
] as const
export type NeedCompilationSourceKind = (typeof NEED_COMPILATION_SOURCE_KINDS)[number]
export const needCompilationSourceKindSchema = z.enum(NEED_COMPILATION_SOURCE_KINDS)

/** Les sources qu'aucun indice technique ne distingue : seule la personne peut
 *  dire qu'un texte est un compte rendu plutôt qu'une transcription. On ne les
 *  déduit JAMAIS — les proposer au hasard mettrait une étiquette fausse sur la
 *  provenance de chaque champ, c'est-à-dire sur la seule chose qui rende un
 *  besoin compilé vérifiable. */
const DECLARED_ONLY_SOURCE_KINDS: readonly NeedCompilationSourceKind[] = [
  'meeting_report',
  'transcript',
  'field_notes',
  'job_posting',
  'rfp',
  'crm_record',
]

const SPREADSHEET_EXTENSIONS = ['.csv', '.tsv', '.xls', '.xlsx', '.xlsm', '.ods', '.numbers']
const SPREADSHEET_MIME_MARKERS = ['text/csv', 'text/tab-separated-values', 'spreadsheet', 'ms-excel', 'excel']
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.heic', '.gif', '.bmp']
const DOCUMENT_EXTENSIONS = ['.pdf', '.doc', '.docx', '.odt', '.rtf']
const DOCUMENT_MIME_MARKERS = ['pdf', 'msword', 'wordprocessingml', 'opendocument.text']

/** Le canal d'arrivée, quand il est connu et qu'il suffit à nommer la source. */
const CHANNEL_SOURCE_KINDS: Record<string, NeedCompilationSourceKind> = {
  chat: 'chat_message',
  email: 'email',
  mailbox: 'email',
  crm: 'crm_record',
}

function lower(raw: string | null | undefined): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : ''
}

function endsWithAny(value: string, suffixes: readonly string[]): boolean {
  return suffixes.some(suffix => value.endsWith(suffix))
}

function includesAny(value: string, markers: readonly string[]): boolean {
  return value.length > 0 && markers.some(marker => value.includes(marker))
}

/**
 * Étape 1 du compilateur (#2322.15) — IDENTIFIER LA SOURCE.
 *
 * Rend le type de source, ou `null` quand rien de lisible ne le dit : un type
 * deviné ferait porter à chaque champ une provenance fausse, ce qui est pire
 * que pas de provenance du tout.
 *
 * `refusal` = `'tableur'` quand la source est un tableur (#2322.9) : ce n'est
 * pas une absence, c'est un NON qui se dit à l'écran.
 */
export function identifyNeedSource(hint: {
  declared_kind?: string | null
  channel?: string | null
  filename?: string | null
  mime?: string | null
  text?: string | null
}): { kind: NeedCompilationSourceKind | null; refusal: 'tableur' | null } {
  const filename = lower(hint.filename)
  const mime = lower(hint.mime)

  // Le no-go d'abord : un tableur reste un tableur, quel que soit le nom qu'on
  // lui donne en le déposant.
  if (endsWithAny(filename, SPREADSHEET_EXTENSIONS) || includesAny(mime, SPREADSHEET_MIME_MARKERS)) {
    return { kind: null, refusal: 'tableur' }
  }

  const declared = lower(hint.declared_kind)
  if (declared) {
    const known = NEED_COMPILATION_SOURCE_KINDS.find(kind => kind === declared)
    // Une déclaration inconnue n'est pas rattrapée par une devinette : elle
    // laisse la source sans nom, et l'écran demandera laquelle c'est.
    return { kind: known ?? null, refusal: null }
  }

  if (mime.startsWith('image/') || endsWithAny(filename, IMAGE_EXTENSIONS)) {
    return { kind: 'screenshot', refusal: null }
  }
  if (endsWithAny(filename, DOCUMENT_EXTENSIONS) || includesAny(mime, DOCUMENT_MIME_MARKERS)) {
    return { kind: 'document', refusal: null }
  }

  const channel = lower(hint.channel)
  const fromChannel = channel ? CHANNEL_SOURCE_KINDS[channel] : undefined
  if (fromChannel) return { kind: fromChannel, refusal: null }

  // Du texte collé n'est QUE du texte collé : « brief libre » est une
  // tautologie, pas une déduction. Les sources qui demandent un jugement
  // humain, elles, restent sans nom tant que personne ne l'a dit.
  if (lower(hint.text)) return { kind: 'free_brief', refusal: null }

  return { kind: null, refusal: null }
}

/** Vrai quand ce type de source ne peut venir que d'une déclaration humaine.
 *  Sert au compilateur à savoir s'il doit DEMANDER au lieu de deviner. */
export function isDeclaredOnlyNeedSource(kind: NeedCompilationSourceKind): boolean {
  return DECLARED_ONLY_SOURCE_KINDS.includes(kind)
}

/* ------------------------------------------------------------------ */
/* La provenance PAR CHAMP — #2322.72 à #2322.76                       */
/* ------------------------------------------------------------------ */

/**
 * La confiance d'UNE valeur extraite (#2322.76) — trois niveaux NOMMÉS.
 *
 * - `explicite` : la source le dit, mot pour mot.
 * - `deduit` : le modèle le déduit de ce qui est écrit, et son raisonnement
 *   reste consultable. Une hypothèse s'affiche COMME une hypothèse.
 * - `incertain` : lu, mais la source elle-même hésite.
 *
 * ⚠️ Jamais un pourcentage, jamais un score : une probabilité affichée devient
 * une promesse, et on n'en affiche aucune.
 */
export const NEED_FIELD_CONFIDENCES = ['explicite', 'deduit', 'incertain'] as const
export type NeedFieldConfidence = (typeof NEED_FIELD_CONFIDENCES)[number]
export const needFieldConfidenceSchema = z.enum(NEED_FIELD_CONFIDENCES)

/**
 * D'où vient UN champ du besoin — #2322.72 (la source), #2322.73 (l'extrait),
 * #2322.74 (la page ou le message d'origine), #2322.75 (la date), #2322.76 (la
 * confiance).
 *
 * ⚠️ `excerpt` est OBLIGATOIRE et non vide : une valeur sans citation n'est pas
 * une valeur compilée, c'est une valeur inventée. C'est le seul garde-fou qui
 * tienne à l'usage — tout le reste se remplit tout seul.
 *
 * ⚠️ `locator` et `stated_at` sont `nullable()` mais PAS `optional()` : il faut
 * DIRE qu'on ne sait pas. Une clé absente se lit comme un oubli de l'appelant ;
 * un `null` se lit comme un fait, et l'écran peut l'afficher.
 */
export const needFieldProvenanceSchema = z.object({
  source_kind: needCompilationSourceKindSchema,
  /** L'extrait exact qui porte la valeur — jamais une reformulation. */
  excerpt: z.string().trim().min(1).max(600),
  /** La page, le message, l'objet du mail… `null` = la source n'a pas d'endroit. */
  locator: z.string().trim().max(200).nullable(),
  /** La date de la SOURCE (pas celle de la lecture). `null` = non datée. */
  stated_at: z.string().trim().max(40).nullable(),
  confidence: needFieldConfidenceSchema,
})
export type NeedFieldProvenance = z.infer<typeof needFieldProvenanceSchema>

/* ------------------------------------------------------------------ */
/* Les champs qu'une compilation peut remplir — #2322.24 à #2322.51    */
/* ------------------------------------------------------------------ */

/**
 * La MOBILITÉ (#2322.43) — combien la mission fait bouger.
 *
 * ⚠️ Distincte du TÉLÉTRAVAIL (`remote`, #2322.42) : « full remote » dit où on
 * travaille d'habitude, la mobilité dit si on prend le train. Un consultant
 * full remote qui doit être à Lille un lundi sur deux n'est pas un cas rare,
 * c'est le cas normal — et les confondre fait refuser la mission au moment où
 * le déplacement se découvre.
 *
 * ⚠️ **Elle emprunte l'échelle de `TRAVEL_ACCEPTANCES`** (`aucun` / `ponctuel` /
 * `frequent`), celle des consultants, et n'en ouvre PAS une deuxième (GA-26).
 * Les deux côtés se comparent : ce que la mission demande, ce que la personne
 * accepte. Sur deux échelles différentes, ce rapprochement-là ne se ferait
 * jamais — c'est exactement la raison pour laquelle `remote` avait déjà
 * réutilisé `remotePreferenceSchema` plutôt que d'inventer un jumeau.
 *
 * ⚠️ Aucun `inconnu` dans cette échelle, et ce n'est pas un oubli : ce qu'on ne
 * sait pas ne fait AUCUNE ligne, il part dans {@link needUnknownSchema}. Une
 * valeur « inconnu » finirait affichée comme une réponse.
 */

/**
 * LES ACHATS (#2322.49) — le service achats est dans la boucle, ou il ne l'est
 * pas. Deux valeurs, pas trois : « peut-être » ferait passer une absence de
 * réponse pour un arbitrage, et c'est exactement ce qui fait perdre six
 * semaines sur un référencement qu'on n'avait pas vu venir.
 */
/**
 * #2939 (#2174.34) — L'ÉCHELLE VIT DÉSORMAIS DANS `project.ts` : depuis ce lot,
 * `procurement_involvement` est une colonne ENREGISTRÉE de `project_needs`
 * (migration `1796322191039-NeedDecisionProcessAndProcurement.ts`), pas
 * seulement une valeur de compilation. `project.ts` la possède, ce fichier
 * l'IMPORTE — jamais l'inverse : `project.ts` ne dépend de rien ici, et
 * l'inverse créerait un cycle. Ré-exportée pour ne rien casser en aval (GA-26 :
 * un seul réglage, jamais deux échelles jumelles).
 */
export { NEED_PROCUREMENT_INVOLVEMENTS, needProcurementInvolvementSchema } from './project.js'
export type { NeedProcurementInvolvement } from './project.js'

/**
 * Tout ce qu'une compilation peut remplir sur un besoin.
 *
 * Les dix-huit premiers sont les champs de `projectNeedSchema`, AU MÊME NOM :
 * le compilateur remplit le besoin qui existe, il n'en invente pas un second
 * (GA-26). Les neuf derniers sont ce que ce chantier ajoute.
 *
 * ⚠️ `decision_maker` n'est PAS dans cette liste (#2322.48), et c'est délibéré :
 * un décideur est une PERSONNE, pas une chaîne de caractères. Il sort en
 * {@link compiledNeedContactSchema} avec le rôle `decideur` de
 * `PROJECT_CONTACT_ROLES` — le rôle que la base admet déjà, que la propagation
 * lit déjà, et que personne ne construisait. Même chose pour les achats, rôle
 * `acheteur`.
 */
export const NEED_COMPILATION_FIELDS = [
  'title',
  'skills',
  'seniority',
  'headcount',
  'target_tjm_cents',
  'min_tjm_cents',
  'budget_cents',
  'start_on',
  'duration_months',
  'deadline_at',
  'location',
  'remote',
  'contract_kind',
  'urgency',
  'expertise',
  'context',
  'clearances',
  'constraints',
  // ── Ce que le besoin enregistré ne portait pas ──────────────────────────
  'entity', // #2322.24 — la filiale, la BU, l'établissement qui commande
  'scope', // #2322.25 — le périmètre couvert par la mission
  'work_to_do', // #2322.31 — le travail à réaliser, pas l'intitulé du poste
  'expected_outcome', // #2322.32 — ce qui doit avoir changé à la fin
  'expected_proofs', // #2322.38 — ce qu'il faut montrer pour être crédible
  'mobility', // #2322.43
  'process', // #2322.47 — les étapes de décision, dans l'ordre dit
  'security', // #2322.51 — NDA, charte, audit : distinct des habilitations
  'procurement', // #2322.49
] as const
export type NeedCompilationField = (typeof NEED_COMPILATION_FIELDS)[number]
export const needCompilationFieldSchema = z.enum(NEED_COMPILATION_FIELDS)

/** La forme attendue de la valeur d'un champ. `values` = liste FERMÉE. */
type NeedFieldShape = {
  kind: 'text' | 'text_list' | 'integer' | 'skills'
  values?: readonly string[]
}

/**
 * ⚠️ Record EXHAUSTIF : ajouter un champ à {@link NEED_COMPILATION_FIELDS} sans
 * dire quelle forme il a ne compile pas. C'est la garde qui empêche qu'un champ
 * neuf accepte n'importe quoi le jour où quelqu'un l'ajoute à la va-vite.
 */
const NEED_FIELD_SHAPES: Record<NeedCompilationField, NeedFieldShape> = {
  title: { kind: 'text' },
  skills: { kind: 'skills' },
  seniority: { kind: 'text' },
  headcount: { kind: 'integer' },
  target_tjm_cents: { kind: 'integer' },
  min_tjm_cents: { kind: 'integer' },
  budget_cents: { kind: 'integer' },
  start_on: { kind: 'text' },
  duration_months: { kind: 'integer' },
  deadline_at: { kind: 'text' },
  location: { kind: 'text' },
  remote: { kind: 'text', values: remotePreferenceSchema.options },
  contract_kind: { kind: 'text', values: contractKindSchema.options },
  urgency: { kind: 'text', values: needUrgencySchema.options },
  expertise: { kind: 'text' },
  context: { kind: 'text' },
  clearances: { kind: 'text_list' },
  constraints: { kind: 'text' },
  entity: { kind: 'text' },
  scope: { kind: 'text' },
  work_to_do: { kind: 'text' },
  expected_outcome: { kind: 'text' },
  expected_proofs: { kind: 'text_list' },
  mobility: { kind: 'text', values: travelAcceptanceSchema.options },
  process: { kind: 'text_list' },
  security: { kind: 'text_list' },
  procurement: { kind: 'text', values: NEED_PROCUREMENT_INVOLVEMENTS },
}

/**
 * Les valeurs admises pour un champ à liste FERMÉE, ou `null` quand le champ
 * est libre. C'est ce que l'écran lit pour peupler un choix — et c'est aussi la
 * preuve, vérifiable par un test, que `remote` et `mobility` empruntent bien
 * les échelles qui existaient déjà au lieu d'en ouvrir des jumelles (GA-26).
 */
export function allowedNeedFieldValues(field: NeedCompilationField): readonly string[] | null {
  return NEED_FIELD_SHAPES[field].values ?? null
}

const compiledValueSchema = z.union([z.string(), z.number(), z.array(z.string()), z.array(requiredSkillSchema)])

function isFilledText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * UN champ compilé : sa valeur, et d'où elle vient.
 *
 * ⚠️ Une valeur VIDE est refusée, pas stockée : « on n'affiche pas ce qu'on n'a
 * pas » — dans une liste, une absence ne fait AUCUNE ligne. Un champ qu'on n'a
 * pas su remplir n'est pas un champ vide, c'est une INCONNUE, et elle porte une
 * question ({@link needUnknownSchema}).
 */
export const compiledNeedFieldSchema = z
  .object({
    field: needCompilationFieldSchema,
    value: compiledValueSchema,
    provenance: needFieldProvenanceSchema,
  })
  .superRefine((entry, ctx) => {
    const shape = NEED_FIELD_SHAPES[entry.field]
    const refuse = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: ['value'] })

    if (shape.kind === 'integer') {
      if (typeof entry.value !== 'number' || !Number.isInteger(entry.value)) {
        refuse(`Le champ « ${entry.field} » attend un nombre entier.`)
      }
      return
    }
    if (shape.kind === 'text_list') {
      const list = Array.isArray(entry.value) ? entry.value : null
      if (!list || list.length === 0 || !list.every(isFilledText)) {
        refuse(`Le champ « ${entry.field} » attend une liste non vide de textes.`)
      }
      return
    }
    if (shape.kind === 'skills') {
      const list = Array.isArray(entry.value) ? entry.value : null
      if (!list || list.length === 0 || list.some(item => typeof item !== 'object' || item === null)) {
        refuse('Les compétences attendent une liste non vide de `requiredSkill`.')
      }
      return
    }
    if (!isFilledText(entry.value)) {
      refuse(`Le champ « ${entry.field} » attend un texte non vide.`)
      return
    }
    if (shape.values && !shape.values.includes(entry.value.trim())) {
      refuse(`« ${entry.value} » n'est pas une valeur admise pour « ${entry.field} ».`)
    }
  })
export type CompiledNeedField = z.infer<typeof compiledNeedFieldSchema>

/* ------------------------------------------------------------------ */
/* Ce qui manque, ce qui se contredit — #2322.54 à #2322.56            */
/* ------------------------------------------------------------------ */

/**
 * UNE INCONNUE (#2322.54) — un champ que la source ne dit pas, NOMMÉ, avec la
 * question qui le débloquerait.
 *
 * C'est la même règle que partout : un score n'est jamais nu, ce qui n'a pas pu
 * être évalué porte un nom. Une inconnue muette (« champ vide ») se lit comme
 * un oubli du produit ; une inconnue nommée se lit comme une question à poser
 * au client.
 */
export const needUnknownSchema = z.object({
  field: needCompilationFieldSchema,
  question: z.string().trim().min(1).max(240),
})
export type NeedUnknown = z.infer<typeof needUnknownSchema>

/**
 * UNE CONTRADICTION (#2322.55) — deux phrases de la source qui ne peuvent pas
 * être vraies ensemble (« junior » et « 900 € », « full remote » et « présence
 * obligatoire le lundi »).
 *
 * ⚠️ Les DEUX phrases sont gardées, chacune avec sa citation : on ne tranche
 * pas à la place du client. C'est précisément ce que `need-vagueness.ts` disait
 * rester `retenu` (#2178.8) — comparer des champs entre eux, pas constater une
 * absence.
 */
export const needContradictionSchema = z
  .object({
    field: needCompilationFieldSchema,
    statements: z
      .array(
        z.object({
          value: z.string().trim().min(1).max(300),
          provenance: needFieldProvenanceSchema,
        }),
      )
      .min(2),
  })
  .superRefine((entry, ctx) => {
    const seen = new Set(entry.statements.map(s => `${s.value.trim()}§${s.provenance.excerpt.trim()}`))
    if (seen.size !== entry.statements.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Deux fois la même phrase n’est pas une contradiction.',
        path: ['statements'],
      })
    }
  })

/**
 * LE NIVEAU DE CONFIRMATION (#2322.56) — qui tient ce besoin.
 *
 * - `confirme_par_le_client` : le client l'a dit, à nous, et c'est écrit.
 * - `rapporte` : quelqu'un nous l'a rapporté (un contact, une note de réunion).
 * - `hypothese` : c'est notre lecture, et elle s'affiche COMME une hypothèse.
 *
 * ⚠️ Trois mots, jamais un pourcentage ni une « chance que ça sorte » : aucune
 * probabilité ne s'affiche dans ce produit.
 */
export const NEED_CONFIRMATION_LEVELS = ['confirme_par_le_client', 'rapporte', 'hypothese'] as const
export const needConfirmationLevelSchema = z.enum(NEED_CONFIRMATION_LEVELS)

/**
 * LA CLARIFICATION (#2322.21) — UNE question, et seulement si la réponse change
 * la suite. Le champ `why` n'est pas décoratif : il force à dire en quoi la
 * réponse change quelque chose, et c'est ce qui empêche l'interrogatoire.
 */
export const needClarificationSchema = z.object({
  field: needCompilationFieldSchema,
  question: z.string().trim().min(1).max(240),
  why: z.string().trim().min(1).max(240),
  /** Ce qui rend la question nécessaire — voir {@link pickNeedClarification}. */
  reason: z.enum(['contradiction', 'blocking_unknown']),
})

/**
 * UNE PERSONNE proposée par la compilation — le décideur (#2322.48), l'acheteur
 * (#2322.49), le sponsor…
 *
 * ⚠️ Le rôle vient de `PROJECT_CONTACT_ROLES` : la base l'admet déjà
 * (`project_contacts.role`), l'écran le lit déjà, `PUT /projects/:id/contacts/
 * :contactId` l'écrit déjà. Ce qui manquait, c'était quelqu'un pour le
 * CONSTRUIRE — c'est ce compilateur.
 *
 * ⚠️ `provenance` est obligatoire : on n'invente JAMAIS un décideur (#2322.66).
 * Un nom sans citation ne sort pas d'ici.
 */
export const compiledNeedContactSchema = z.object({
  contact_id: z.string().guid().nullable(),
  full_name: z.string().trim().min(1).max(160),
  title: z.string().trim().max(160).nullable(),
  role: projectContactRoleSchema,
  provenance: needFieldProvenanceSchema,
})

/**
 * LE BESOIN COMPILÉ — ce que le compilateur rend, et que personne n'écrit en
 * base sans un geste humain.
 *
 * `status` vaut `proposition`, littéralement et pour toujours : aucun autre
 * statut n'est acceptable ici. Un jour où quelqu'un voudra écrire
 * `status: 'created'` depuis le compilateur, le schéma dira NON.
 */
export const compiledNeedSchema = z
  .object({
    source: z.object({
      kind: needCompilationSourceKindSchema,
      locator: z.string().trim().max(200).nullable(),
      stated_at: z.string().trim().max(40).nullable(),
    }),
    /** Le compte, quand il est RÉSOLU (#2322.16). `null` = pas encore. */
    account_id: z.string().guid().nullable(),
    /** Le nom d'entreprise LU dans la source, tant qu'aucun compte ne lui
     *  correspond. Jamais un compte choisi au plus proche. */
    company_hint: z.string().trim().max(200).nullable(),
    fields: z.array(compiledNeedFieldSchema),
    proposed_contacts: z.array(compiledNeedContactSchema),
    unknowns: z.array(needUnknownSchema),
    contradictions: z.array(needContradictionSchema),
    confirmation_level: needConfirmationLevelSchema,
    clarification: needClarificationSchema.nullable(),
    /**
     * Ce qui n'a pas pu être COMPRIS ({@link needUnderstandingGaps}) — transporté
     * plutôt que recalculé, parce que l'écran de chat lit du JSON et n'a pas la
     * fonction sous la main. Il ne s'invente pas pour autant : le schéma refuse
     * une liste qui ne correspond pas aux champs remplis.
     */
    not_understood: z.array(needCompilationFieldSchema).optional(),
    status: z.literal('proposition'),
  })
  .superRefine((compiled, ctx) => {
    const seen = new Set<string>()
    for (const entry of compiled.fields) {
      if (seen.has(entry.field)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Le champ « ${entry.field} » est rempli deux fois — deux valeurs pour un champ, c’est une contradiction, pas un doublon.`,
          path: ['fields'],
        })
      }
      seen.add(entry.field)
    }
    for (const unknown of compiled.unknowns) {
      if (seen.has(unknown.field)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Le champ « ${unknown.field} » ne peut pas être à la fois rempli et inconnu.`,
          path: ['unknowns'],
        })
      }
    }
    for (const contradiction of compiled.contradictions) {
      if (seen.has(contradiction.field)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Le champ « ${contradiction.field} » est contradictoire : il ne peut pas être rempli d’une valeur tranchée.`,
          path: ['contradictions'],
        })
      }
    }

    // #2322.71 — UNE OFFRE D'EMPLOI NE DEVIENT PAS UN BESOIN FREELANCE TOUTE
    // SEULE. Le champ `contract_kind` existe depuis toujours et permettait de
    // DISTINGUER les deux ; rien n'empêchait de les confondre. Maintenant si.
    if (compiled.source.kind === 'job_posting') {
      const contractKind = compiled.fields.find(entry => entry.field === 'contract_kind')
      if (
        typeof contractKind?.value === 'string' &&
        NO_AUTO_CONVERSION_CONTRACT_KINDS.includes(contractKind.value.trim())
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Une offre d’emploi ne se convertit pas toute seule en besoin freelance : c’est une décision commerciale, elle se prend par une personne.',
          path: ['fields'],
        })
      }
    }

    // #2322.77 — LE NO-GO DE L'ISSUE. Un besoin qu'on n'a pas compris peut être
    // proposé — il ne peut pas être annoncé CONFIRMÉ. Sans le travail, le
    // résultat et les critères bloquants, « confirmé par le client » ne
    // confirme qu'un intitulé de poste.
    if (compiled.confirmation_level === 'confirme_par_le_client') {
      const gaps = needUnderstandingGaps(compiled.fields)
      if (gaps.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Besoin résumé par son intitulé : ${gaps.join(', ')} manquent. Il ne peut pas être « confirmé par le client ».`,
          path: ['confirmation_level'],
        })
      }
    }

    // Ce qui est transporté doit dire la VÉRITÉ sur ce qui est rempli : une
    // liste « rien ne manque » à côté d'un besoin sans travail ni résultat
    // serait le genre d'affirmation qu'aucune garde ne rattrape ensuite.
    if (compiled.not_understood) {
      const gaps = needUnderstandingGaps(compiled.fields)
      if (compiled.not_understood.join(',') !== gaps.join(',')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Ce qui manque est annoncé « ${compiled.not_understood.join(', ') || 'rien'} » alors que ${gaps.join(', ') || 'rien'} manque.`,
          path: ['not_understood'],
        })
      }
    }

    // #2322.21 — UNE question, et seulement si elle change la suite. Poser une
    // question dont la réponse ne change rien est le plus court chemin pour
    // qu'on cesse de répondre aux questions.
    if (compiled.clarification) {
      const pick = pickNeedClarification(compiled)
      if (!pick || pick.field !== compiled.clarification.field) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: pick
            ? `La question porte sur « ${compiled.clarification.field} » alors que « ${pick.field} » est ce qui bloque.`
            : 'Rien ne bloque : il n’y a pas de question à poser.',
          path: ['clarification'],
        })
      }
    }
  })
export type CompiledNeed = z.infer<typeof compiledNeedSchema>

/* ------------------------------------------------------------------ */
/* Étape 2 — résoudre l'entreprise (#2322.16)                          */
/* ------------------------------------------------------------------ */

/** Les formes juridiques qui ne distinguent pas deux entreprises. On retire
 *  « SAS », jamais « France » : « Decathlon France » et « Decathlon » peuvent
 *  être deux comptes, et les confondre ferait écrire un besoin chez le voisin. */
const LEGAL_FORM_WORDS = [
  'sas',
  'sasu',
  'sa',
  'sarl',
  'eurl',
  'snc',
  'sci',
  'scop',
  'gie',
  'ltd',
  'llc',
  'inc',
  'gmbh',
  'plc',
  'bv',
  'nv',
]

function normaliseCompanyName(raw: string): string {
  const withoutAccents = raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const words = withoutAccents.split(/[^a-z0-9]+/).filter(word => word.length > 0 && !LEGAL_FORM_WORDS.includes(word))
  return words.join('')
}

/**
 * Étape 2 (#2322.16) — LE COMPTE, quand il est certain.
 *
 * Un nom d'entreprise lu dans un email n'est pas un compte : il le devient si,
 * et seulement si, UN seul compte du portefeuille porte le même nom une fois la
 * ponctuation et la forme juridique mises de côté.
 *
 * ⚠️ On ne prend JAMAIS le plus proche. Deux candidats → aucun, et l'écran
 * demande. Un besoin écrit chez le mauvais compte se découvre trois semaines
 * plus tard, dans une réunion, devant le client.
 */
export function resolveNeedAccount(input: {
  company_hint: string | null | undefined
  candidates: readonly { id: string; name: string }[]
}): { account_id: string | null; ambiguous: boolean; candidate_ids: string[] } {
  const hint = typeof input.company_hint === 'string' ? normaliseCompanyName(input.company_hint) : ''
  if (!hint) return { account_id: null, ambiguous: false, candidate_ids: [] }

  const matches = input.candidates.filter(candidate => normaliseCompanyName(candidate.name ?? '') === hint)
  if (matches.length === 1) {
    return { account_id: matches[0]!.id, ambiguous: false, candidate_ids: [matches[0]!.id] }
  }
  if (matches.length > 1) {
    return { account_id: null, ambiguous: true, candidate_ids: matches.map(match => match.id) }
  }
  return { account_id: null, ambiguous: false, candidate_ids: [] }
}

/* ------------------------------------------------------------------ */
/* Étape 5 — détecter contradictions et inconnues (#2322.19)           */
/* ------------------------------------------------------------------ */

/** Une valeur rendue lisible dans une phrase de contradiction. */
function describeValue(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) {
    return value
      .map(item =>
        typeof item === 'object' && item !== null && 'term' in item
          ? String((item as { term: unknown }).term)
          : String(item),
      )
      .join(', ')
  }
  return String(value)
}

/**
 * Étape 5 (#2322.19) — CE QUI SE CONTREDIT NE S'ÉCRASE PAS.
 *
 * Une lecture rend des phrases ; plusieurs peuvent porter sur le même champ.
 * Deux valeurs différentes pour un champ ne se départagent pas ici : le champ
 * sort de la liste des valeurs et entre dans les contradictions, avec les deux
 * citations. C'est ce que `need-vagueness.ts` annonçait comme `retenu`
 * (#2178.8) — et c'est la seule lecture honnête : la dernière phrase lue n'est
 * pas plus vraie que la première.
 *
 * ⚠️ Deux fois la MÊME valeur n'est pas une contradiction : une source se
 * répète, et une répétition n'est pas un désaccord.
 */
export function groupNeedStatements(
  statements: readonly { field: NeedCompilationField; value: unknown; provenance: NeedFieldProvenance }[],
): {
  fields: { field: NeedCompilationField; value: unknown; provenance: NeedFieldProvenance }[]
  contradictions: {
    field: NeedCompilationField
    statements: { value: string; provenance: NeedFieldProvenance }[]
  }[]
} {
  const order: NeedCompilationField[] = []
  const byField = new Map<NeedCompilationField, typeof statements>()
  for (const statement of statements) {
    if (!byField.has(statement.field)) {
      order.push(statement.field)
      byField.set(statement.field, [])
    }
    byField.set(statement.field, [...(byField.get(statement.field) ?? []), statement])
  }

  const fields: { field: NeedCompilationField; value: unknown; provenance: NeedFieldProvenance }[] = []
  const contradictions: {
    field: NeedCompilationField
    statements: { value: string; provenance: NeedFieldProvenance }[]
  }[] = []

  for (const field of order) {
    const group = byField.get(field) ?? []
    const distinct = new Set(group.map(statement => describeValue(statement.value)))
    if (distinct.size > 1) {
      contradictions.push({
        field,
        statements: group.map(statement => ({
          value: describeValue(statement.value),
          provenance: statement.provenance,
        })),
      })
      continue
    }
    const first = group[0]
    if (first) fields.push({ field: first.field, value: first.value, provenance: first.provenance })
  }

  return { fields, contradictions }
}

/* ------------------------------------------------------------------ */
/* Le NO-GO de l'issue — #2322.77                                      */
/* ------------------------------------------------------------------ */

/**
 * Les trois choses sans lesquelles un besoin n'est pas compris (#2322.77) :
 * le TRAVAIL à réaliser, le RÉSULTAT attendu, et les critères bloquants (les
 * compétences indispensables).
 *
 * « Ne jamais résumer un besoin par un intitulé de poste » est le no-go écrit
 * dans l'issue. Un intitulé se recopie ; ces trois-là demandent d'avoir lu.
 */
export const NEED_BLOCKING_FIELDS: readonly NeedCompilationField[] = ['work_to_do', 'expected_outcome', 'skills']

/** Ce qui manque pour qu'un besoin soit COMPRIS — nommé, jamais compté.
 *  Vide = le travail, le résultat et les critères bloquants sont là. */
export function needUnderstandingGaps(fields: readonly { field: NeedCompilationField }[]): NeedCompilationField[] {
  const filled = new Set(fields.map(entry => entry.field))
  return NEED_BLOCKING_FIELDS.filter(field => !filled.has(field))
}

/* ------------------------------------------------------------------ */
/* Étape 7 — UNE clarification, si elle change la suite (#2322.21)     */
/* ------------------------------------------------------------------ */

/**
 * Étape 7 (#2322.21) — LA question à poser, ou aucune.
 *
 * Une seule, et seulement si la réponse change ce qu'on écrirait :
 * 1. une CONTRADICTION d'abord — tant qu'elle tient, on ne sait pas quoi écrire ;
 * 2. sinon un champ BLOCKANT manquant ({@link NEED_BLOCKING_FIELDS}) ;
 * 3. sinon RIEN. Un TJM inconnu ne justifie pas d'interroger quelqu'un : il se
 *    demande au moment où on chiffre, pas au moment où on lit.
 *
 * ⚠️ Cette fonction ne rédige AUCUNE phrase : elle désigne un champ et dit
 * pourquoi. La question se rédige dans la langue de la personne, ailleurs.
 */
export function pickNeedClarification(compiled: {
  fields: readonly { field: NeedCompilationField }[]
  unknowns: readonly { field: NeedCompilationField }[]
  contradictions: readonly { field: NeedCompilationField }[]
}): { field: NeedCompilationField; reason: 'contradiction' | 'blocking_unknown' } | null {
  const contradiction = compiled.contradictions[0]
  if (contradiction) return { field: contradiction.field, reason: 'contradiction' }

  const missing = new Set<NeedCompilationField>([
    ...needUnderstandingGaps(compiled.fields),
    ...compiled.unknowns.map(unknown => unknown.field).filter(field => NEED_BLOCKING_FIELDS.includes(field)),
  ])
  const blocking = NEED_BLOCKING_FIELDS.find(field => missing.has(field))
  return blocking ? { field: blocking, reason: 'blocking_unknown' } : null
}

/** Les types de contrat qu'une OFFRE D'EMPLOI ne peut pas produire toute seule
 *  (#2322.71) : passer un CDI publié en mission de régie est une DÉCISION
 *  commerciale, prise par une personne, après avoir lu. Le jour où un
 *  compilateur le fait tout seul, on envoie un message de prestation à une
 *  entreprise qui recrute — et on ne s'en aperçoit qu'à la réponse. */
const NO_AUTO_CONVERSION_CONTRACT_KINDS: readonly string[] = ['regie', 'forfait']
