import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { memoryBridgeViewSchema, memoryCrossingSchema } from './memory-crossing.js'

/**
 * GA-C4 — « aucun croisement ne traverse C4 », prouvé sur le TYPE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le corps des e-mails EST stocké dans le journal d'activité — revirement
 * assumé du 16/08, raison écrite dans `activity.ts:34-40`. **STOCKER et EXPOSER
 * sont deux décisions distinctes** : la donnée est là, à une jointure de
 * distance du service qui dérive les croisements, et elle est tentante — « juste
 * un extrait, pour que le collègue comprenne de quoi il s'agit ».
 *
 * Une convention ne tient pas ça. La doctrine du dépôt dit de **retirer le
 * MOYEN, pas seulement la permission** : ce test vérifie qu'un corps de message,
 * une note, un transcript, une marge ou un montant n'ont **nulle part où aller**
 * dans le type d'un croisement.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE, ET CE QU'ELLE NE PEUT PAS VÉRIFIER
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle vérifie quatre choses, toutes sur l'arbre RÉEL du schéma :
 *
 *  1. **L'inventaire des feuilles est FIGÉ.** Ajouter un champ fait tomber ce
 *     test : c'est une décision, pas un ajout de passage.
 *  2. **Aucune feuille n'est du texte libre.** Chaque feuille est un enum, un
 *     littéral, un uuid, une date, un entier, un booléen — ou une étiquette
 *     d'objet BORNÉE (`ObjectLabel`, 80 caractères, marquée). Rien d'autre.
 *  3. **Aucun nom de champ n'appartient au lexique C4**, à aucune profondeur.
 *  4. **Tout objet est `.strict()`** : une clé de plus est une ERREUR d'analyse,
 *     pas un champ ignoré en silence. Vérifié en faisant réellement analyser une
 *     charge polluée.
 *
 * Ce qu'elle ne peut PAS vérifier : qu'un développeur écrive
 * `objectLabel('name', activity.body)`. Cette ligne-là compile. Ce qui la rend
 * improbable plutôt qu'impossible : la porte s'appelle `objectLabel`, elle exige
 * en premier argument le NOM d'une colonne pris dans une liste fermée (`body`
 * n'y est pas, et ne compile pas), et elle refuse tout ce qui dépasse 80
 * caractères. La garde d'isolation côté API (`collective-memory-*.test.ts`)
 * prend le relais sur les colonnes réellement lues.
 */

/** Le lexique C4 — ce qui ne doit apparaître dans AUCUN nom de champ. */
const C4_LEXICON = [
  'body',
  'content',
  'text',
  'message',
  'mail',
  'note',
  'transcript',
  'comment',
  'snippet',
  'excerpt',
  'quote',
  'amount',
  'margin',
  'revenue',
  'cost',
  'price',
  'rate',
  'tjm',
  'salary',
  'budget',
]

type Leaf = { path: string; kind: string }

// Les internes de zod 4 : `schema._zod.def`, dont `type` nomme le genre de nœud.
type ZodCheckDef = { check?: string; format?: string; maximum?: number }
type ZodDef = {
  type: string
  format?: string
  innerType?: unknown
  element?: unknown
  options?: z.ZodTypeAny[]
  in?: z.ZodTypeAny
  out?: z.ZodTypeAny
  checks?: { _zod: { def: ZodCheckDef } }[]
  catchall?: z.ZodTypeAny
}
const defOf = (schema: z.ZodTypeAny): ZodDef => (schema as unknown as { _zod: { def: ZodDef } })._zod.def
const checksOf = (schema: z.ZodTypeAny): ZodCheckDef[] => (defOf(schema).checks ?? []).map(check => check._zod.def)
/** `.transform()` range le schéma en `in` ; `z.preprocess()` le range en `out`. */
const pipeTarget = (def: ZodDef): z.ZodTypeAny =>
  defOf(def.in as z.ZodTypeAny).type === 'transform' ? (def.out as z.ZodTypeAny) : (def.in as z.ZodTypeAny)
/** `.strict()` pose un `catchall` de type `never`. */
const isStrict = (schema: z.ZodTypeAny): boolean => {
  const catchall = defOf(schema).catchall
  return catchall !== undefined && defOf(catchall).type === 'never'
}

/**
 * Descend l'arbre d'un schéma zod et rend ses FEUILLES. Elle traverse les
 * enveloppes (optionnel, nullable, tableau, marque, union) et s'arrête sur ce
 * qui porte réellement une valeur.
 */
function leaves(schema: z.ZodTypeAny, path = ''): Leaf[] {
  const def = defOf(schema)

  switch (def.type) {
    case 'object': {
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape
      return Object.entries(shape).flatMap(([key, value]) =>
        leaves(value as z.ZodTypeAny, path ? `${path}.${key}` : key),
      )
    }
    case 'union': {
      const list = def.options ?? []
      return list.flatMap((option, index) => leaves(option, `${path}<${index}>`))
    }
    case 'optional':
    case 'nullable':
    case 'default':
      return leaves(def.innerType as z.ZodTypeAny, path)
    case 'array':
      return leaves(def.element as z.ZodTypeAny, `${path}[]`)
    case 'pipe':
      return leaves(pipeTarget(def), path)
    default:
      return [{ path, kind: def.type }]
  }
}

/** La feuille est-elle du texte que quelqu'un a saisi librement ? */
function isFreeText(schema: z.ZodTypeAny): boolean {
  const def = defOf(schema)
  if (def.typeName !== z.ZodFirstPartyTypeKind.ZodString) return false
  const checks = checksOf(schema)
  // Un uuid, une date, un datetime : bornés par leur format.
  if (['uuid', 'guid', 'datetime', 'date'].includes(String(def.format))) return false
  if (checks.some(check => ['uuid', 'guid', 'datetime', 'date', 'regex'].includes(String(check.format)))) return false
  // Une longueur maximale raisonnable : borné aussi.
  return !checks.some(check => check.check === 'max_length' && (check.maximum ?? Infinity) <= 80)
}

/** Toutes les feuilles STRING de l'arbre, schéma compris (pour les inspecter). */
function stringLeaves(schema: z.ZodTypeAny, path = ''): { path: string; schema: z.ZodTypeAny }[] {
  const def = defOf(schema)
  switch (def.type) {
    case 'object': {
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape
      return Object.entries(shape).flatMap(([key, value]) =>
        stringLeaves(value as z.ZodTypeAny, path ? `${path}.${key}` : key),
      )
    }
    case 'union': {
      const list = def.options ?? []
      return list.flatMap((option, index) => stringLeaves(option, `${path}<${index}>`))
    }
    case 'optional':
    case 'nullable':
    case 'default':
      return stringLeaves(def.innerType as z.ZodTypeAny, path)
    case 'array':
      return stringLeaves(def.element as z.ZodTypeAny, `${path}[]`)
    case 'pipe':
      return stringLeaves(pipeTarget(def), path)
    case 'string':
      return [{ path, schema }]
    default:
      return []
  }
}

/** Tous les OBJETS de l'arbre — pour vérifier qu'ils sont tous stricts. */
function objects(schema: z.ZodTypeAny, path = ''): { path: string; schema: z.ZodObject<z.ZodRawShape> }[] {
  const def = defOf(schema)
  switch (def.type) {
    case 'object': {
      const object = schema as z.ZodObject<z.ZodRawShape>
      return [
        { path, schema: object },
        ...Object.entries(object.shape).flatMap(([key, value]) =>
          objects(value as z.ZodTypeAny, path ? `${path}.${key}` : key),
        ),
      ]
    }
    case 'union': {
      const list = def.options ?? []
      return list.flatMap((option, index) => objects(option, `${path}<${index}>`))
    }
    case 'optional':
    case 'nullable':
    case 'default':
      return objects(def.innerType as z.ZodTypeAny, path)
    case 'array':
      return objects(def.element as z.ZodTypeAny, `${path}[]`)
    case 'pipe':
      return objects(pipeTarget(def), path)
    default:
      return []
  }
}

const viewLeaves = leaves(memoryBridgeViewSchema)
const viewObjects = objects(memoryBridgeViewSchema)
const viewStrings = stringLeaves(memoryBridgeViewSchema)

describe('GA-C4 — la garde LIT quelque chose', () => {
  it('trouve un arbre non vide', () => {
    // Une garde dont le corpus est vide est verte pour rien. Ces trois bornes
    // tombent si le schéma est renommé, vidé, ou remplacé par un `z.any()`.
    expect(viewLeaves.length).toBeGreaterThanOrEqual(25)
    expect(viewObjects.length).toBeGreaterThanOrEqual(8)
    expect(viewStrings.length).toBeGreaterThanOrEqual(5)
  })

  it('descend jusque dans les quatre variantes de détail', () => {
    const detailPaths = viewLeaves.filter(leaf => leaf.path.includes('detail'))
    expect(detailPaths.length).toBeGreaterThanOrEqual(10)
    // Les quatre discriminants doivent être là, chacun dans sa branche.
    const branches = new Set(detailPaths.map(leaf => leaf.path.replace(/\.[^.]*$/, '')))
    expect(branches.size).toBeGreaterThanOrEqual(4)
  })
})

describe('GA-C4 — aucun croisement ne traverse C4', () => {
  it('aucun nom de champ n’appartient au lexique C4, à aucune profondeur', () => {
    const offenders = viewLeaves.filter(leaf =>
      leaf.path.split(/[.[\]<>]/).some(segment => C4_LEXICON.some(word => segment.toLowerCase() === word)),
    )
    expect(offenders).toEqual([])
  })

  it('aucune feuille n’est du texte libre — les seules chaînes sont bornées ou marquées', () => {
    const free = viewStrings.filter(entry => isFreeText(entry.schema)).map(entry => entry.path)
    expect(free).toEqual([])
  })

  it('tout objet de l’arbre est strict — une clé de plus est une erreur, pas un passager', () => {
    const permissive = viewObjects.filter(entry => !isStrict(entry.schema)).map(entry => entry.path)
    expect(permissive).toEqual([])
  })

  it('refuse RÉELLEMENT une charge polluée par du C4', () => {
    const polluted = {
      kind: 'openDoor',
      circle: 'c2',
      subject: { kind: 'account', id: '11111111-1111-4111-8111-111111111111', label: 'BNP Paribas' },
      colleague: {
        kind: 'member',
        userId: '22222222-2222-4222-8222-222222222222',
        displayName: 'David',
        role: 'sales',
      },
      action: 'talkToOwnerFirst',
      observedAt: '2026-03-04T09:00:00.000Z',
      expiresAt: null,
      provenance: 'missions',
      detail: {
        kind: 'openDoor',
        mission: { kind: 'mission', id: '33333333-3333-4333-8333-333333333333', label: 'Consultant Java' },
        startedOn: '2026-03-04',
        stillActive: true,
      },
      lastMessageBody: 'Bonjour David, je te confirme le TJM de 620 €…',
      dealMargin: 18400,
    }
    const parsed = memoryCrossingSchema.safeParse(polluted)
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      const keys = parsed.error.issues.flatMap(issue => (issue as { keys?: string[] }).keys ?? [])
      expect(keys).toContain('lastMessageBody')
      expect(keys).toContain('dealMargin')
    }
  })

  it('l’inventaire des feuilles est FIGÉ — ajouter un champ est une décision', () => {
    // Si ce test tombe, ce n'est pas un test à mettre à jour distraitement :
    // c'est la question « ce nouveau champ peut-il porter du C4 ? » qui se pose.
    expect([...new Set(viewLeaves.map(leaf => leaf.path))].sort()).toMatchInlineSnapshot(`
      [
        "account.id",
        "account.kind",
        "account.label",
        "connections.connectionsThisMonth",
        "connections.measuredSince",
        "crossings[].action",
        "crossings[].circle",
        "crossings[].colleague<0>.displayName",
        "crossings[].colleague<0>.kind",
        "crossings[].colleague<0>.role",
        "crossings[].colleague<0>.userId",
        "crossings[].colleague<1>.kind",
        "crossings[].colleague<1>.role",
        "crossings[].detail<0>.kind",
        "crossings[].detail<0>.mission.id",
        "crossings[].detail<0>.mission.kind",
        "crossings[].detail<0>.mission.label",
        "crossings[].detail<0>.startedOn",
        "crossings[].detail<0>.stillActive",
        "crossings[].detail<1>.kind",
        "crossings[].detail<1>.lastTouchOn",
        "crossings[].detail<1>.withinDays",
        "crossings[].detail<2>.consultant.id",
        "crossings[].detail<2>.consultant.kind",
        "crossings[].detail<2>.consultant.label",
        "crossings[].detail<2>.kind",
        "crossings[].detail<2>.need.id",
        "crossings[].detail<2>.need.kind",
        "crossings[].detail<2>.need.label",
        "crossings[].detail<3>.kind",
        "crossings[].detail<3>.rank",
        "crossings[].detail<3>.sinceYear",
        "crossings[].expiresAt",
        "crossings[].kind",
        "crossings[].observedAt",
        "crossings[].provenance",
        "crossings[].subject.id",
        "crossings[].subject.kind",
        "crossings[].subject.label",
        "policy.kAnonymityThreshold",
        "policy.morningBudget",
        "policy.ownerPriorityDays",
        "policy.restrictedAccounts",
        "policy.sharingMode",
        "unreadableSources[]",
      ]
    `)
  })
})

describe('GA-C4 — la garde sait dire NON', () => {
  // Les trois mutants ci-dessous sont des schémas VOLONTAIREMENT fautifs. Si un
  // seul passait, la garde serait borgne : elle vérifierait une propriété que
  // rien ne peut violer.

  it('démasque un champ au nom C4', () => {
    const mutant = z.object({ body: z.string().max(10) }).strict()
    const offenders = leaves(mutant).filter(leaf => C4_LEXICON.includes(leaf.path.toLowerCase()))
    expect(offenders).not.toEqual([])
  })

  it('démasque une chaîne libre, même sous un nom innocent', () => {
    const mutant = z.object({ label: z.string() }).strict()
    const free = stringLeaves(mutant).filter(entry => isFreeText(entry.schema))
    expect(free).not.toEqual([])
  })

  it('démasque un objet non strict', () => {
    const mutant = z.object({ inner: z.object({ ok: z.boolean() }) }).strict()
    const permissive = objects(mutant).filter(entry => !isStrict(entry.schema))
    expect(permissive).not.toEqual([])
  })

  it('démasque une chaîne libre cachée sous un nullable dans un tableau', () => {
    const mutant = z.object({ rows: z.array(z.object({ note: z.string().nullable() }).strict()) }).strict()
    const free = stringLeaves(mutant).filter(entry => isFreeText(entry.schema))
    expect(free.map(entry => entry.path)).toEqual(['rows[].note'])
  })
})
