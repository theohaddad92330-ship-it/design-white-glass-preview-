import { z } from 'zod'
import { fieldSourceRank, fieldSourceSchema, provenanceEntityTypeSchema, type FieldSource } from './provenance.js'

/**
 * LE DÉTECTEUR DE CONTRADICTION — deux sources disent l'inverse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QU'IL CORRIGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Aujourd'hui, **la dernière écrase la précédente, en silence**. Le registre
 * relève 4 200 salariés le 14/08, le crawl du site officiel en lit 5 000 le
 * 18/08 : les deux sont du `pipeline`, donc d'autorité ÉGALE, donc
 * `decideFieldWrite` accepte l'écriture (`higher_or_equal_authority`) et la
 * première valeur disparaît sans que personne ait su qu'un désaccord existait.
 *
 * Un produit qui tranche silencieusement se trompe une fois sur deux et personne
 * ne le sait. Un produit qui montre les deux fait travailler l'utilisateur cinq
 * secondes et gagne une donnée fiable.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE MODULE NE DÉCIDE RIEN — IL OBSERVE
 * ─────────────────────────────────────────────────────────────────────────────
 * L'arbitre reste `decideFieldWrite`, seul et inchangé : deux règles d'écriture
 * concurrentes divergeraient au premier writer ajouté. Ce détecteur se branche
 * À CÔTÉ de la décision, sur les mêmes entrées, et répond à une autre question :
 * « est-ce que quelqu'un devrait le savoir ? »
 *
 * ⚠️ **« Résolution par récence » ne veut PAS dire que le plus récent gagne.**
 * C'est le contresens que le nom invite à faire, et c'est exactement l'erreur que
 * la hiérarchie de sources existe pour empêcher : le pipeline tourne toutes les
 * nuits, l'humain une fois par mois — « le plus récent » désigne donc TOUJOURS la
 * machine. Une correction humaine gagne sur une valeur automatique plus récente,
 * quelle que soit sa date. C'est la doctrine, et elle prime.
 *
 * Les trois issues, et ce qu'elles ne disent pas pareil :
 *
 *  - `resolved`           — la valeur ENTRANTE est humaine. Le second EST la
 *                           décision, qu'elle conteste un humain ou une machine.
 *  - `workspace_override` — la valeur EN PLACE est humaine, contestée par une
 *                           entrée automatique plus récente. Elle reste EN
 *                           PLACE (une correction humaine gagne toujours, quelle
 *                           que soit sa date) — nommée à part de `resolved` pour
 *                           qu'on sache qu'une correction existante tient bon,
 *                           plutôt que d'y lire un désaccord neuf.
 *  - `authority_wins`     — les autorités DIFFÈRENT entre deux sources
 *                           automatiques : la plus forte l'emporte, et
 *                           `decideFieldWrite` l'a déjà appliqué. Tranché, mais
 *                           tracé. (#190.2 : anciennement `recency`, un nom que
 *                           le contresens qu'il invite — « le plus récent
 *                           gagne » — rendait trompeur pour ce qu'il désigne
 *                           réellement.)
 *  - `unresolved`         — deux sources AUTOMATIQUES de MÊME autorité. Le
 *                           produit ne tranche pas. C'est le seul cas qui se
 *                           MONTRE.
 *
 * #190.2 (lot E1 30/09) : six des sept statuts de l'issue #190.
 *
 *  - `freshness_wins`  — deux sources automatiques de MÊME autorité, dont
 *                        l'ancien relevé a {@link FRESHNESS_WINS_GAP_DAYS} jours
 *                        ou plus : le relevé frais l'emporte. Ce n'est PAS « le
 *                        plus récent gagne » : une correction humaine passe
 *                        avant (elle ne s'examine jamais ici).
 *  - `obsolete_source` — (avant `authority_wins`, plus précis : il dit POURQUOI
 *                        la source en place perd) la source EN PLACE a cessé d'écrire sur la fiche
 *                        (l'appelant le lit dans le journal : dernière écriture
 *                        de cette source {@link OBSOLETE_SOURCE_DAYS} jours ou
 *                        plus avant la plus récente de la fiche) : elle perd
 *                        contre une autre source encore vivante.
 *
 * #190.2 (lot X51 02/10) — le septième :
 *
 *  - `scope_difference` — les deux relevés DÉCLARENT une portée et elle diffère
 *                        (« 12 dans l'équipe Data » contre « 500 au total ») :
 *                        ce n'est pas une contradiction, les deux sont vrais,
 *                        chacun dans sa portée. Jamais ouverte, aucune valeur
 *                        « choisie ». La portée est DÉCLARÉE par l'écrivain
 *                        (`FieldChange.scope`), jamais devinée : sans portée
 *                        d'un côté ou de l'autre, le cas reste ce qu'il était.
 *                        Une correction humaine passe avant (elle ne s'examine
 *                        jamais ici).
 */

/** #190.2 — l'écart minimal entre deux relevés de même autorité pour que le frais l'emporte. */
export const FRESHNESS_WINS_GAP_DAYS = 180
/** #190.2 — le silence d'une source (sur la fiche) au-delà duquel elle est dite obsolète. */
export const OBSOLETE_SOURCE_DAYS = 365
/** #190.1 — le délai avant de revérifier une contradiction ouverte. */
export const CONFLICT_RECHECK_DAYS = 14
const DAY_MS = 86_400_000

/** Une valeur en présence : ce qu'elle vaut, d'où elle vient, et QUAND. */
const conflictSideSchema = z.object({
  value: z.unknown(),
  source: fieldSourceSchema,
  /** La date de la valeur. Sans elle, « je ne tranche pas » n'aide personne. */
  at: z.string().datetime(),
  /** #190.1 — l'autorité numérique de cette source (`fieldSourceRank`), portée
   *  sur le côté plutôt que recalculée en aval à partir de `source`. */
  authority: z.number().int().min(1).max(4),
  /** #190.2 — la portée que l'écrivain a DÉCLARÉE (« équipe Data », « groupe »).
   *  Absente = non déclarée, jamais « inconnue » devinée. */
  scope: z.string().min(1).optional(),
})
type ConflictSide = z.infer<typeof conflictSideSchema>

/**
 * La forme du PDF 6 §5.3, avec les resserrements assumés du dépôt : `source`
 * est le `FieldSource` du dépôt plutôt qu'une chaîne libre, `at` est une date
 * ISO plutôt qu'une chaîne, et (#190.1) `authority`/`claims`/`entity`
 * complètent la forme vers l'objet `Conflict` à 13 champs de l'issue #3219 —
 * sans poser de seconde table : ces trois champs sont DÉRIVÉS de `valueA`/
 * `valueB`, jamais persistés à part (voir `field-conflict.service.ts`).
 */
export const conflictedFieldSchema = z.object({
  /** Nom du champ côté API (camelCase), comme dans `field_provenance`. */
  field: z.string().min(1),
  /** La valeur EN PLACE — la plus ancienne des deux. */
  valueA: conflictSideSchema,
  /** La valeur ENTRANTE — celle qui a révélé le désaccord. */
  valueB: conflictSideSchema,
  /** #190.1 — les prétentions, au pluriel, dans l'ordre chronologique
   *  (`[valueA, valueB]` : `valueA` est toujours la plus ancienne des deux —
   *  garanti par la fenêtre `LAG` de `FieldConflictService`). Un alias dérivé,
   *  pas une troisième vérité : rien ne peut diverger de `valueA`/`valueB`. */
  claims: z.tuple([conflictSideSchema, conflictSideSchema]),
  /** #190.1 — les CATÉGORIES de source en présence, dédupliquées (`['pipeline']`
   *  ou `['pipeline', 'connector']`) : la question « qui se contredit, à quel
   *  NIVEAU ? » sans relire les deux prétentions. Dérivé de `claims`, jamais une
   *  seconde vérité. `dates`/`sources` de l'issue #3219 n'ont pas d'équivalent à
   *  part : `claims[].at`/`claims[].source` les portent déjà sans les dupliquer. */
  sourceTypes: z.array(fieldSourceSchema).min(1).max(2),
  /** Depuis quand le produit ne sait pas. L'instant du désaccord, pas de la valeur. */
  conflictSince: z.string().datetime(),
  resolvedBy: z.enum([
    'resolved',
    'workspace_override',
    'authority_wins',
    'freshness_wins',
    'obsolete_source',
    'scope_difference',
    'unresolved',
  ]),
  /** #190.1/#190.2 (lot E1 30/09) — l'écart, en jours, entre les deux relevés
   *  (la FRAÎCHEUR de la contradiction). */
  freshnessGapDays: z.number().int().min(0),
  /** #190.1 — quand revérifier : `conflictSince` + 14 jours pour une
   *  contradiction OUVERTE, `null` pour une tranchée (rien à revérifier). */
  nextCheck: z.string().datetime().nullable(),
  /** #190.1 — la valeur EFFECTIVEMENT en base, quand `resolvedBy` le permet de
   *  dire sans deviner : `valueB` pour `resolved`/`authority_wins` côté
   *  entrant plus fort, `valueA` pour `workspace_override` (la correction
   *  humaine n'est jamais écrasée). `null` pour `unresolved` — PAS parce que
   *  la base est vide (l'entrante y est déjà, l'arbitre accepte à autorité
   *  ÉGALE), mais parce qu'afficher une valeur « choisie » sur le seul cas où
   *  le produit dit explicitement « je ne tranche pas » romprait cette
   *  promesse-là. */
  chosenValue: z.unknown().optional(),
  /** #190.1 — l'entité concernée. Absente ici : `detectFieldConflict` est pure
   *  et ne la connaît pas ; c'est l'appelant (`FieldConflictService`) qui
   *  l'attache, une fois `entityType`/`entityId` en main. */
  entity: z.object({ type: provenanceEntityTypeSchema, id: z.string().min(1) }).optional(),
})
export type ConflictedField = z.infer<typeof conflictedFieldSchema>

/**
 * Vrai pour `null`, `undefined`, une chaîne vide ou uniquement des espaces, et un
 * tableau vide — la MÊME définition que `decideFieldWrite`, volontairement.
 *
 * Un fournisseur qui ne trouve rien n'est pas un fournisseur qui CONTREDIT :
 * signaler « le site officiel dit 5 000, le registre ne dit rien » comme une
 * contradiction noierait les vrais désaccords sous les trous de collecte.
 */
function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

/** Égalité de surface, alignée sur celle de l'arbitre. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a === 'string' && typeof b === 'string') return a.trim() === b.trim()
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => sameValue(item, b[index]))
  }
  return false
}

function readableInstant(value: string): string | null {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return null
  return new Date(parsed).toISOString()
}

/**
 * Y a-t-il contradiction, et qui tranche ? `null` quand il n'y a rien à dire.
 *
 * Pure et testée à part, pour la même raison que `decideFieldWrite` : c'est la
 * règle qui décide de DÉRANGER quelqu'un, et une règle qui dérange à tort est
 * abandonnée en trois jours.
 */
export function detectFieldConflict(input: {
  field: string
  incomingValue: unknown
  incomingSource: FieldSource
  incomingAt: string
  currentValue: unknown
  /** `null` = provenance inconnue. Traitée comme `pipeline`, comme l'arbitre. */
  currentSource: FieldSource | null
  currentObservedAt: string
  /** #190.2 — les sources qui ont cessé d'écrire sur cette fiche (lues dans le journal par l'appelant). */
  obsoleteSources?: readonly FieldSource[]
  /** #190.2 — les portées DÉCLARÉES par les écrivains (`record_field_audit.scope`). */
  incomingScope?: string | null
  currentScope?: string | null
}): ConflictedField | null {
  // Un blanc n'est pas un désaccord — d'un côté comme de l'autre.
  if (isBlank(input.incomingValue) || isBlank(input.currentValue)) return null
  if (sameValue(input.incomingValue, input.currentValue)) return null

  // Une date illisible ne devient pas « maintenant » : sans les deux dates,
  // « le registre dit 4 200, le site dit 5 000 » ne mène à aucune décision.
  const at = readableInstant(input.incomingAt)
  const observedAt = readableInstant(input.currentObservedAt)
  if (at === null || observedAt === null) return null

  const currentSource = input.currentSource ?? 'pipeline'
  const incomingSource = input.incomingSource

  // #190.2 — la valeur ENTRANTE humaine tranche toujours (`resolved`), qu'elle
  // conteste un humain ou une machine : « le second EST la décision ». Sinon,
  // une valeur EN PLACE humaine tient bon face à une entrée automatique plus
  // récente (`workspace_override` — jamais écrasée, mais nommée à part d'un
  // conflit neuf). Le reste ne voit que des sources automatiques.
  const gapDays = Math.max(0, Math.floor((Date.parse(at) - Date.parse(observedAt)) / DAY_MS))
  const sameAuthority = fieldSourceRank(incomingSource) === fieldSourceRank(currentSource)
  const currentIsObsolete = incomingSource !== currentSource && (input.obsoleteSources ?? []).includes(currentSource)

  const incomingScope = input.incomingScope?.trim() || undefined
  const currentScope = input.currentScope?.trim() || undefined
  const scopesDiffer = incomingScope !== undefined && currentScope !== undefined && incomingScope !== currentScope

  const resolvedBy: ConflictedField['resolvedBy'] =
    incomingSource === 'human'
      ? 'resolved'
      : currentSource === 'human'
        ? 'workspace_override'
        : scopesDiffer
          ? 'scope_difference'
          : currentIsObsolete
            ? 'obsolete_source'
            : !sameAuthority
              ? 'authority_wins'
              : gapDays >= FRESHNESS_WINS_GAP_DAYS
                ? 'freshness_wins'
                : 'unresolved'

  const valueA: ConflictSide = {
    value: input.currentValue,
    source: currentSource,
    at: observedAt,
    authority: fieldSourceRank(currentSource),
    ...(currentScope ? { scope: currentScope } : {}),
  }
  const valueB: ConflictSide = {
    value: input.incomingValue,
    source: incomingSource,
    at,
    authority: fieldSourceRank(incomingSource),
    ...(incomingScope ? { scope: incomingScope } : {}),
  }

  // #190.1 — la même règle que l'arbitre (`decideFieldWrite`, @bellum/contracts) :
  // autorité ÉGALE ou SUPÉRIEURE accepte l'écriture. `resolved`/`workspace_override`
  // sont déjà tranchés par construction ci-dessus (humain toujours prioritaire) ;
  // `authority_wins` ne l'est que d'un côté, calculé ici. `unresolved` reste
  // `null` : l'entrante EST en base (autorité égale, l'arbitre accepte aussi),
  // mais l'afficher comme « choisie » romprait la promesse du seul statut où
  // le produit dit explicitement qu'il ne tranche pas.
  const chosenValue: unknown =
    resolvedBy === 'resolved'
      ? valueB.value
      : resolvedBy === 'workspace_override'
        ? valueA.value
        : resolvedBy === 'unresolved' || resolvedBy === 'scope_difference'
          ? null
          : resolvedBy === 'freshness_wins' || resolvedBy === 'obsolete_source'
            ? valueB.value
            : valueA.authority > valueB.authority
              ? valueA.value
              : valueB.value

  return {
    field: input.field,
    valueA,
    valueB,
    claims: [valueA, valueB],
    sourceTypes: currentSource === incomingSource ? [currentSource] : [currentSource, incomingSource],
    conflictSince: at,
    resolvedBy,
    chosenValue,
    freshnessGapDays: gapDays,
    nextCheck:
      resolvedBy === 'unresolved' ? new Date(Date.parse(at) + CONFLICT_RECHECK_DAYS * DAY_MS).toISOString() : null,
  }
}

/**
 * Ce qui se MONTRE. Un conflit tranché reste au journal — il ne dérange personne.
 *
 * Séparer « détecter » de « montrer » est délibéré : tout est tracé, seul
 * l'indécidable est affiché. Tracer sans montrer produirait le silence d'origine ;
 * montrer tout ce qui est tracé ferait clignoter chaque nuit de pipeline.
 */
export function isConflictOpen(conflict: Pick<ConflictedField, 'resolvedBy'>): boolean {
  return conflict.resolvedBy === 'unresolved'
}

/**
 * #3219 (#190.2, lot P02 07/10) — la claim de portée d'UN connecteur, pour
 * `ProvenanceService.commit` (`FieldChange.scope`). Jusqu'ici aucun écrivain
 * ne déclarait de portée : `scope_difference` restait un no-op strict, faute
 * d'un deuxième relevé scopé à comparer au premier.
 *
 * Pure, et volontairement GÉNÉRIQUE (pas seulement `employees`) : tout
 * connecteur qui connaît la PORTÉE DÉCLARÉE de ce qu'il vient d'écrire (jamais
 * déduite d'un texte) peut l'appeler avant son propre `commit`. `scopeLabels`
 * est le vocabulaire FERMÉ de l'appelant (ex. `ANALYSIS_SCOPE_MODE_LABELS`) —
 * un `scopeMode` hors de ce vocabulaire ne produit jamais un libellé inventé.
 *
 * `null` dans trois cas, tous « rien à journaliser » plutôt qu'une erreur :
 *  - aucune portée déclarée (`scopeMode` absent ou hors vocabulaire) ;
 *  - la valeur n'a pas changé — le journal n'a rien de neuf à raconter ;
 *  - la valeur NEUVE est vide — jamais une claim sur une absence.
 */
export function pipelineFieldScopeClaim(input: {
  previousValue: string | null
  newValue: string
  scopeMode: string | null | undefined
  scopeLabels: Readonly<Record<string, string>>
}): { oldValue: string | null; newValue: string; scope: string } | null {
  const trimmedNew = input.newValue.trim()
  if (!trimmedNew) return null
  if (!input.scopeMode) return null
  const label = input.scopeLabels[input.scopeMode]
  if (!label) return null
  if (input.previousValue === trimmedNew) return null
  return { oldValue: input.previousValue, newValue: trimmedNew, scope: label }
}
