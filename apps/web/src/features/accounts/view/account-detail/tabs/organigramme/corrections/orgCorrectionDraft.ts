import {
  ORG_CORRECTION_CLAIM_BY_FIELD,
  ORG_CORRECTION_FIELDS_BY_OBJECT,
  orgCorrectionRequestSchema,
  orgDecisionRoleSchema,
  orgGraphConflictSchema,
  orgHierarchyLevelSchema,
  type OrgCorrectionMotive,
  type OrgCorrectionObjectType,
  type OrgCorrectionRequest,
  type OrgCorrectionScope,
  type OrgCorrectionValue,
  type OrgDecisionRole,
  type OrgGraph,
  type OrgGraphConflict,
  type OrgHierarchyLevel,
  type OrgSourceKind,
} from '@bellum/contracts'

/**
 * ─────────────────────────────────────────────────────────────────────────
 * LE BROUILLON DE CORRECTION — la partie PURE du tiroir d'organigramme
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Ce fichier existe pour une raison mesurée : l'API du ledger de corrections
 * (`PATCH accounts/:id/org-graph/corrections`) était écrite, testée, migrée et
 * montée depuis le 29/08 — et `grep -rn "org-graph" apps/web/src` rendait
 * **zéro**. Du code juste que personne n'appelle, le défaut n°1 de ce dépôt.
 * Ce qui manquait n'était pas le calcul : c'était le GESTE.
 *
 * Trois principes, et chacun ferme un défaut connu :
 *
 * 1. **La liste des champs vient du CONTRAT** (`ORG_CORRECTION_FIELDS_BY_OBJECT`),
 *    jamais d'une recopie. Un écran qui propose de corriger ce que l'API ne sait
 *    pas écrire est pire que pas d'écran : il use un geste et n'apprend rien.
 *    C'est exactement le défaut trouvé sur « vérifier ce lien », qui s'affichait
 *    sur des `member_of` que le serveur refuse en 412.
 * 2. **La preuve n'est pas choisie par l'écran.** Le champ corrigé DÉTERMINE le
 *    claim que la preuve doit porter (`ORG_CORRECTION_CLAIM_BY_FIELD`) : une
 *    page qui prouve un titre ne prouve pas un rattachement. L'utilisateur dit
 *    d'où vient sa preuve, pas ce qu'elle prouve.
 * 3. **La requête est validée contre le contrat AVANT de partir.** Le même zod
 *    tourne côté serveur ; l'exécuter ici ne remplace pas le refus serveur, il
 *    évite un aller-retour réseau pour se faire dire non, et il garantit qu'un
 *    ajout de champ au contrat casse ici, pas en production.
 *
 * ⚠️ **Le piège auquel ce geste échappe, et qu'il faut connaître.** Depuis le
 * correctif P0 de l'assembleur, le pipeline ne produit plus AUCUNE arête
 * `reports_to` : le bouton « vérifier une relation » ne se rend donc jamais
 * dans l'écran d'arrivée (`cartes: 2 | avec reporting: 0`, mesuré le 30/08).
 * Un geste de correction accroché à `person.reporting` serait né mort de la
 * même façon. Celui-ci s'accroche à la CARTE d'une personne, qui existe dès
 * qu'une personne existe — et corriger `reportsTo` **crée** l'arête
 * (`org-graph-correction.ts:225-250`, `verified: true`, confiance 100). C'est
 * la porte humaine que le P0 laisse ouverte, pas celle qu'il a fermée.
 */

/** Les champs qu'une correction peut viser sur une PERSONNE. Lus au contrat. */
export type PersonCorrectionField = (typeof ORG_CORRECTION_FIELDS_BY_OBJECT.person)[number]

export const PERSON_CORRECTION_FIELDS: readonly PersonCorrectionField[] = ORG_CORRECTION_FIELDS_BY_OBJECT.person

/**
 * #2310.54 — les champs qu'une correction peut viser sur une ENTITÉ. Le
 * contrat et la route API les acceptaient déjà (`ORG_CORRECTION_FIELDS_BY_OBJECT.entity`,
 * `org-graph-correction.ts:260`) ; seul ce tiroir ne les proposait jamais.
 */
type EntityCorrectionField = (typeof ORG_CORRECTION_FIELDS_BY_OBJECT.entity)[number]

export const ENTITY_CORRECTION_FIELDS: readonly EntityCorrectionField[] = ORG_CORRECTION_FIELDS_BY_OBJECT.entity

/** Les deux objets que CE tiroir sait porter — jamais `edge`, qui a son propre geste (`OrgVerifyRelation`). */
export type CorrectableObjectType = Extract<OrgCorrectionObjectType, 'person' | 'entity'>

/** Un champ que ce tiroir peut corriger, personne OU entité. */
export type CorrectionField = PersonCorrectionField | EntityCorrectionField

/**
 * #2310.54 — quel objet un champ vise. Un champ appartient à UN SEUL type
 * d'objet (garanti par le contrat, `ORG_CORRECTION_FIELDS_BY_OBJECT`) : le
 * champ SEUL suffit donc à déterminer l'`objectType` d'une requête. C'est ce
 * qui remplace le `objectType: 'person' as const` qui était écrit en dur —
 * une entité se corrige comme une personne.
 */
export function correctionObjectType(field: CorrectionField): CorrectableObjectType {
  return (ORG_CORRECTION_FIELDS_BY_OBJECT.entity as readonly string[]).includes(field) ? 'entity' : 'person'
}

/** Les champs proposés pour CET objet — lus au contrat, jamais recopiés. */
export function fieldsFor(objectType: CorrectableObjectType): readonly CorrectionField[] {
  return objectType === 'entity' ? ENTITY_CORRECTION_FIELDS : PERSON_CORRECTION_FIELDS
}

/** Le champ ouvert par défaut — le même choix que l'existant faisait pour une personne (`title`). */
export function defaultFieldFor(objectType: CorrectableObjectType): CorrectionField {
  return objectType === 'entity' ? 'name' : 'title'
}

/**
 * Les provenances qu'un humain peut honnêtement invoquer dans un tiroir.
 *
 * Le contrat en connaît treize ; sept seulement sont des choses qu'une personne
 * SAIT avoir vues. `llm`, `linkedin`, `crm`, `bio`, `vendor_profile` et
 * `workspace_import` décrivent des sources que la MACHINE a collectées : les
 * proposer ici laisserait quelqu'un affirmer « c'est une inférence IA qui le
 * dit » sur une correction qu'il est en train d'écrire à la main.
 */
export const CORRECTION_EVIDENCE_KINDS: readonly OrgSourceKind[] = [
  'workspace_user',
  'official_site',
  'org_chart',
  'registry',
  'press',
  'conference',
  'other',
]

/** Ce que l'écran tient pendant que l'utilisateur écrit. */
export type OrgCorrectionDraft = {
  field: CorrectionField
  /**
   * La valeur SCALAIRE saisie ou choisie. `''` veut dire « cette information
   * n'est pas connue » — jamais la chaîne vide, jamais `0`. Effacer un titre
   * qu'on sait faux rend la personne SANS titre connu, ce qui est une
   * information vraie.
   */
  text: string
  /** Les rôles de décision, quand c'est eux qu'on corrige. */
  roles: OrgDecisionRole[]
  /** Écrite par la personne. Une correction sans raison n'est pas une correction. */
  reason: string
  evidenceKind: OrgSourceKind
  evidenceRef: string
  /** ISO — la date de la PREUVE, pas celle de la saisie. */
  evidenceDate: string
  /** #2126.25-.30 / .36 — ce que la personne DIT du fait : corriger, confirmer, obsolète… */
  motive: OrgCorrectionMotive
  /** #2126.37 / .40-.42 — pour qui : moi seul, l'espace, ce compte. */
  scope: OrgCorrectionScope
}

export function emptyDraft(field: CorrectionField): OrgCorrectionDraft {
  return {
    field,
    text: '',
    roles: [],
    reason: '',
    // Le défaut le plus honnête : « quelqu'un de l'équipe l'affirme ». Il ne
    // prétend rien d'autre que ce qui est vrai au moment du clic.
    evidenceKind: 'workspace_user',
    evidenceRef: '',
    evidenceDate: '',
    motive: 'corrected',
    scope: 'account',
  }
}

/**
 * #2126.25-.30 — seul « corriger » demande une valeur SAISIE. « Confirmer »,
 * « pas pertinent », « je ne sais pas » et « ajouter une source » portent la
 * valeur que le graphe a déjà ; « obsolète » la rend inconnue.
 */
export function motiveAssertsValue(motive: OrgCorrectionMotive): boolean {
  return motive === 'corrected'
}

/** La valeur qu'une requête porte selon son motif. */
function motiveValue(draft: OrgCorrectionDraft, current: OrgCorrectionValue): OrgCorrectionValue {
  if (motiveAssertsValue(draft.motive)) return draftValue(draft)
  // #2126.27 — obsolète : le fait REDEVIENT INCONNU. Les rôles s'effacent en
  // liste vide, la forme que le graphe sait lire ; jamais « 0 ».
  if (draft.motive === 'obsolete') return draft.field === 'decisionRoles' ? [] : null
  return current
}

/**
 * Comment se saisit la valeur d'un champ.
 *
 * `choice` porte des identifiants du graphe COURANT : `applyOrgCorrections`
 * refuse (`return null`) une entité ou une personne qui n'existe pas, et la
 * règle 2 est « on ne fabrique pas la cible ». Un champ de saisie libre pour un
 * `entityId` produirait donc des 422 à la chaîne.
 */
type CorrectionEditor =
  | { kind: 'text' }
  | { kind: 'choice'; options: readonly { value: string; label: string }[] }
  | { kind: 'level'; options: readonly OrgHierarchyLevel[] }
  | { kind: 'roles'; options: readonly OrgDecisionRole[] }

export function correctionEditor(graph: OrgGraph, field: CorrectionField, objectId: string): CorrectionEditor {
  if (field === 'entityId') {
    return { kind: 'choice', options: graph.entities.map(entity => ({ value: entity.id, label: entity.name })) }
  }
  if (field === 'reportsTo') {
    return {
      kind: 'choice',
      // Personne ne se rapporte à soi-même — `org-graph-correction.ts:227` le
      // refuse, l'écran ne le propose donc pas.
      options: graph.people
        .filter(person => person.id !== objectId)
        .map(person => ({ value: person.id, label: person.fullName })),
    }
  }
  if (field === 'hierarchyLevel') return { kind: 'level', options: orgHierarchyLevelSchema.options }
  if (field === 'decisionRoles') return { kind: 'roles', options: orgDecisionRoleSchema.options }
  if (field === 'parentId') {
    return {
      kind: 'choice',
      // #2310.54 — une entité ne se rattache pas à elle-même. Le cycle plus
      // long (petite-fille → grand-mère) reste vérifié côté serveur
      // (`entityCycle`, `org-graph-correction.ts:384`) : c'est le même partage
      // qu'entre `reportsTo` (exclusion locale) et `reportingCycle` (refus API).
      options: graph.entities
        .filter(entity => entity.id !== objectId)
        .map(entity => ({ value: entity.id, label: entity.name })),
    }
  }
  return { kind: 'text' }
}

/**
 * Ce que le graphe dit AUJOURD'HUI de ce champ — pour ne pas corriger à
 * l'aveugle. `null` = le graphe ne sait pas ; l'écran l'écrit, il n'invente
 * jamais une valeur de remplissage.
 */
export function currentPersonValue(graph: OrgGraph, objectId: string, field: CorrectionField): OrgCorrectionValue {
  // #2310.54 — une entité se corrige comme une personne : le nom garde son
  // historique (les deux appelants existants ne visent QUE des personnes),
  // mais la fonction lit désormais l'un OU l'autre selon ce que le champ vise.
  if (correctionObjectType(field) === 'entity') {
    const entity = graph.entities.find(candidate => candidate.id === objectId)
    if (!entity) return null
    if (field === 'name') return entity.name ?? null
    return entity.parentId ?? null // field === 'parentId'
  }
  const person = graph.people.find(candidate => candidate.id === objectId)
  if (!person) return null
  if (field === 'title') return person.title ?? null
  if (field === 'entityId') return person.entityId ?? null
  if (field === 'hierarchyLevel') return person.hierarchyLevel ?? null
  if (field === 'decisionRoles') return [...person.decisionRoles]
  const edge = graph.hierarchyEdges.find(candidate => candidate.fromId === objectId && candidate.type === 'reports_to')
  return edge?.toId ?? null
}

/** La valeur que le brouillon enverra. `''` ⇒ `null` : retiré ⇒ inconnu. */
export function draftValue(draft: OrgCorrectionDraft): OrgCorrectionValue {
  if (draft.field === 'decisionRoles') return [...draft.roles]
  const trimmed = draft.text.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * La requête, ou `null` quand le brouillon n'est pas envoyable.
 *
 * `null` n'est pas un message d'erreur : c'est ce qui garde le bouton
 * désactivé. Les refus que le contrat porte (preuve du mauvais claim, champ
 * d'un autre objet, deux claims sur le même champ) ne peuvent pas naître ici —
 * l'écran ne compose qu'UNE affirmation à la fois, avec SA preuve.
 */
export function buildPersonCorrection(args: {
  expectedGraphVersion: number
  /**
   * #2310.54 — le nom `personId` reste historique : il porte tout `objectId`
   * (personne OU entité) depuis que ce tiroir sait corriger les deux. Le
   * renommer casserait tous les appels existants pour un gain cosmétique — ce
   * que ce champ VISE se lit sur `draft.field`, jamais sur son nom.
   */
  personId: string
  draft: OrgCorrectionDraft
  /** Ce que le graphe porte AUJOURD'HUI — la valeur d'un motif qui ne corrige pas. */
  current?: OrgCorrectionValue
}): OrgCorrectionRequest | null {
  const { expectedGraphVersion, personId, draft } = args
  const reason = draft.reason.trim()
  if (!reason) return null
  const ref = draft.evidenceRef.trim()
  const date = draft.evidenceDate.trim()
  // #2126.30 — « ajouter une source » sans la source n'est pas un geste.
  if (draft.motive === 'source_added' && !ref) return null

  const candidate = {
    expectedGraphVersion,
    // #2310.54 — l'objectType vient du CHAMP corrigé, plus jamais écrit en
    // dur : un champ appartient à un seul type d'objet (contrat), donc
    // `draft.field` suffit à savoir si on corrige une personne ou une entité.
    objectType: correctionObjectType(draft.field),
    objectId: personId,
    motive: draft.motive,
    scope: draft.scope,
    claims: [
      {
        field: draft.field,
        value: motiveValue(draft, args.current ?? null),
        reason,
        evidence: {
          kind: draft.evidenceKind,
          // Le champ décide de ce que la preuve doit prouver. L'écran n'a pas
          // son mot à dire — c'est ce qui empêche une preuve d'identité de
          // servir de preuve de relation (le défaut P0, en contrat).
          claim: ORG_CORRECTION_CLAIM_BY_FIELD[draft.field],
          ...(ref ? { ref } : {}),
          ...(date ? { date } : {}),
        },
      },
    ],
  }

  const parsed = orgCorrectionRequestSchema.safeParse(candidate)
  return parsed.success ? parsed.data : null
}

/**
 * Les NOMS des nœuds du graphe, par identifiant.
 *
 * Le ledger porte des identifiants (`e-it`, `p-marie-martin`) parce qu'un
 * homonyme ne se corrige pas par son nom (règle S5). Un écran, lui, ne montre
 * jamais un identifiant technique à la place d'un humain : cette table est ce
 * qui traduit l'un dans l'autre. Un id absent du graphe courant reste affiché
 * tel quel — la personne a pu être écartée depuis, et effacer la ligne
 * d'historique serait pire que d'y lire un identifiant.
 */
export function graphNodeLabels(graph: OrgGraph | null | undefined): ReadonlyMap<string, string> {
  const labels = new Map<string, string>()
  if (!graph) return labels
  for (const entity of graph.entities) labels.set(entity.id, entity.name)
  for (const person of graph.people) labels.set(person.id, person.fullName)
  return labels
}

/**
 * Une valeur du ledger, en phrase lisible.
 *
 * ⚠️ `null` et le tableau vide rendent le libellé « non renseigné » fourni par
 * l'appelant — jamais « 0 », jamais « — », jamais la chaîne vide. C'est la même
 * règle que partout : si cette valeur est absente, « 0 » est-il VRAI ?
 */
export function describeCorrectionValue(
  value: unknown,
  labels: ReadonlyMap<string, string>,
  unknownLabel: string,
  roleLabel: (role: string) => string,
): string {
  if (value === null || value === undefined) return unknownLabel
  if (Array.isArray(value)) {
    if (value.length === 0) return unknownLabel
    return value.map(item => roleLabel(String(item))).join(', ')
  }
  if (typeof value === 'boolean') return String(value)
  const raw = String(value)
  return labels.get(raw) ?? raw
}

/**
 * Le corps du 409, relu.
 *
 * ⚠️ Sans ceci, un verrou optimiste devient une PERTE DE SAISIE : le serveur
 * répond « quelqu'un est passé avant toi, voici quoi », le client jette le
 * corps, et l'utilisateur voit « conflit » sans savoir sur quoi. Le corps est
 * porté par `ApiError.details` (`apps/web/src/lib/api-error.ts`), et revalidé
 * ici contre le contrat : un 409 dont la base ne serait PAS en avance n'est pas
 * un conflit, c'est une réponse incohérente qu'on refuse d'afficher.
 */
export function readGraphConflict(error: unknown): OrgGraphConflict | null {
  if (typeof error !== 'object' || error === null) return null
  const details = (error as { details?: unknown }).details
  if (details === undefined) return null
  const parsed = orgGraphConflictSchema.safeParse(details)
  return parsed.success ? parsed.data : null
}
