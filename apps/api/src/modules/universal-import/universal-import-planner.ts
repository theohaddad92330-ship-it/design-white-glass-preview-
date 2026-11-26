import { randomUUID } from 'node:crypto'
import {
  UNIVERSAL_IMPORT_REGISTRY,
  computeContactLifecycleState,
  dedupKeysOf,
  isPlausiblePhoneNumber,
  toE164,
  normaliseCompanyName,
  normaliseAmountCents,
  normaliseDate,
  normaliseDomain,
  normalizeTags,
  parseTierLabel,
  splitUniversalRow,
  universalImportSourceRefKey,
  validateUniversalRow,
  withDedupInputs,
  type UniversalImportIssue,
  type UniversalImportSource,
  type UniversalImportMapping,
  type UniversalImportType,
} from '@bellum/contracts'
import { classifyContact } from '../contacts/contact-classifier'
import { contactIdentityKeys } from '../contacts/contact-identity'

/**
 * LE PLAN D'UN PAQUET — ce qui sera créé, ce qui est un doublon PROPOSÉ, ce qui
 * est rejeté et pourquoi. Pur : aucune base, aucun réseau. Le worker l'applique
 * dans UNE transaction avec le point de reprise.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES QUATRE RÈGLES QUI NE SE NÉGOCIENT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **On PROPOSE un doublon, on ne fusionne JAMAIS.** Une ligne qui rencontre
 *    une fiche existante (ou une ligne plus haut dans le fichier) n'écrit RIEN :
 *    elle part au rapport avec l'identifiant de la fiche proposée. Rien n'est
 *    mis à jour — c'est aussi ce qui fait qu'une CORRECTION HUMAINE GAGNE
 *    toujours : l'import n'écrase aucune fiche existante.
 * 2. **`source: 'import'` sur chaque ligne créée** (contacts) et
 *    `status: 'imported'` (comptes) — la provenance, jamais `manual`.
 * 3. **Aucun critère protégé ne pèse** : ce plan ne classe ni ne note personne ;
 *    les clés de dédoublonnage sont des identifiants (e-mail, téléphone,
 *    LinkedIn, SIREN, domaine, nom), rien d'autre.
 * 4. **Une cellule vide n'écrit rien** — ni `0`, ni chaîne vide : `null`.
 */

export type UniversalValidatedRow = { line: number; record: Record<string, string> }

/** Une ligne à créer : l'identifiant est tiré ICI, pour qu'un doublon DANS le fichier puisse le citer. */
type UniversalPlannedCreate = { line: number; id: string; values: Record<string, unknown>; label: string }

/**
 * #4052.3 — une fiche EXISTANTE reconnue par sa référence source : ses champs VIDES se complètent, aucun champ
 * renseigné n'est réécrit (une correction humaine gagne toujours — le service écrit `COALESCE(colonne, valeur)`).
 */
type UniversalPlannedFill = { line: number; id: string; target: 'account' | 'contact'; values: Record<string, unknown> }

/** #4052.2 — un lien référence source → fiche, écrit dans `sync_links` (LA notion de référence de l'espace). */
type UniversalPlannedLink = { entityType: 'account' | 'contact'; externalId: string; internalId: string }

export type UniversalChunkPlan = {
  creates: UniversalPlannedCreate[]
  issues: UniversalImportIssue[]
  /** #4053.1 — les comptes CRÉÉS depuis un fichier contacts : écrits AVANT les contacts qui les citent. */
  accountCreates: UniversalPlannedCreate[]
  fills: UniversalPlannedFill[]
  links: UniversalPlannedLink[]
  /** #4051.1 — fiches existantes reconnues par leur référence (complétées ou reliées), par famille. */
  matched: Partial<Record<UniversalImportType, number>>
  /** #4051.8 — lignes dont la coordonnée (e-mail / téléphone) est DÉJÀ dans l'espace (fiche existante, pas le fichier). */
  alreadyKnown: Partial<Record<UniversalImportType, number>>
  /**
   * #4051.5 (18/10) — les personnes DISTINCTES et les comptes résolus que CE paquet ajoute au lot : un id déjà vu
   * (dans ce paquet ou un précédent du même passage) ne se recompte pas ; une ligne écartée n'en résout aucun.
   */
  resolved: { people: number; accounts: number }
}

/** Ce que le job sait de l'espace AVANT le paquet — chargé une fois par passage du worker. */
export type UniversalPlanContext = {
  type: UniversalImportType
  workspaceId: string
  userId: string
  mapping: UniversalImportMapping
  /** La fiche compte d'où part l'import de contacts. `null` = résolution par la colonne société. */
  accountId: string | null
  /** Nom de société NORMALISÉ → compte, dans l'espace. */
  accountByName: Map<string, string>
  /** Clé de dédoublonnage → fiche existante (ou créée plus haut dans le fichier). */
  known: Map<string, string>
  /**
   * #4051.7 — le titre ACTUEL des contacts connus (fiche → titre), pour proposer la correction d'un titre
   * changé. Absent = rien à comparer, aucune proposition.
   */
  titleById?: Map<string, string | null>
  /** #4052.2 — le CRM d'origine : il borne chaque référence (`universalImportSourceRefKey`). */
  source: UniversalImportSource
  /**
   * #4052.2 — les références s'ÉCRIVENT (liens, complétion) : import d'équipe seulement. Un import personnel
   * les LIT pour rattacher, n'écrit rien dans la base d'équipe.
   */
  writesRefs: boolean
  /**
   * #4597.3 — l'identifiant de l'import en cours : posé sur chaque contact et chaque compte CRÉÉ, pour retrouver
   * « les fiches de CET import » (jamais par sa date). Absent = rien de posé ; une fiche déjà en base n'est pas réécrite.
   */
  importJobId?: string
  /** #4053.1 — un fichier contacts peut créer les comptes absents : import d'équipe hors fiche compte. */
  canCreateAccounts: boolean
  /** #4052 — référence société (clé bornée) → compte ; et l'inverse, pour reconnaître un homonyme. */
  accountByRef: Map<string, string>
  refByAccount: Map<string, string>
  /** #4052 — référence contact (clé bornée) → contact. */
  contactByRef: Map<string, string>
  /** Les fiches créées PAR CE PASSAGE : une référence revue plus bas est un doublon du fichier, pas une complétion. */
  createdIds: Set<string>
  /** #4051.5 — les ids déjà résolus par ce passage, pour ne compter chaque personne et chaque compte qu'une fois. */
  resolvedIds?: { people: Set<string>; accounts: Set<string> }
}

/** #4051.5 — note qu'une ligne a résolu cette personne / ce compte ; ne compte que la première fois. */
function noteResolved(
  context: UniversalPlanContext,
  plan: UniversalChunkPlan,
  kind: 'people' | 'accounts',
  id: string,
) {
  const seen = (context.resolvedIds ??= { people: new Set(), accounts: new Set() })[kind]
  if (seen.has(id)) return
  seen.add(id)
  plan.resolved[kind] += 1
}

const orNull = (value: string | undefined): string | null => (value && value.trim() ? value.trim() : null)

/**
 * MEYER-IMPORT M.1 — un effectif à 0 dans un export CRM veut dire « non renseigné », jamais « 0 salarié » :
 * la cellule devient `null` (non mesuré), comme une cellule vide.
 */
const orMeasuredHeadcount = (value: string | undefined): string | null => {
  const trimmed = orNull(value)
  return trimmed !== null && /^0+([.,]0+)?$/.test(trimmed) ? null : trimmed
}

/**
 * #3850.1 (lot V04, 08/10) — LE POINT D'ÉCRITURE du téléphone, pour ce
 * fichier GÉNÉRIQUE qui importe contacts, talents ET comptes depuis une
 * colonne mappée « phone » sans jamais vérifier sa forme. Mesuré en prod le
 * 08/10 : un code postal brésilien « 90480-000 » a été ENREGISTRÉ comme
 * téléphone sur une fiche réelle — exactement le genre de mapping de colonne
 * qu'un import généraliste ne peut pas garantir. `isPlausiblePhoneNumber`
 * (E.164 plausible ou format local français — `@bellum/contracts`, GA-26)
 * rejette un motif qui n'a ni indicatif ni la forme locale FR ; la ligne
 * n'est jamais écartée pour autant, seule la cellule devient `null`. Une
 * valeur acceptée est normalisée en E.164 COMPACT (`toE164`, #3850.4) —
 * stockage sans espace, l'affichage international lisible se recalcule à
 * la lecture (`formatPhoneForDisplay`).
 */
const orPlausiblePhone = (value: string | undefined): string | null => {
  const trimmed = orNull(value)
  return trimmed && isPlausiblePhoneNumber(trimmed) ? toE164(trimmed) : null
}

/** Les clés d'un contact, BORNÉES à son compte — deux « Jean Martin » de deux sociétés ne sont pas un doublon. */
export function contactKeysFor(
  accountId: string,
  c: { fullName: string | null; email: string | null; phone: string | null; linkedinUrl: string | null },
): string[] {
  return contactIdentityKeys(c).map(key => `${accountId}|${key}`)
}

/** Les clés d'un compte : SIREN → domaine → nom normalisé — l'ordre et la dérivation du moteur. */
export function accountKeysFor(a: { company: string; siren: string | null; website: string | null }): string[] {
  return dedupKeysOf(
    'account',
    withDedupInputs('account', {
      company: a.company,
      siren: a.siren ?? undefined,
      domain: a.website ? (normaliseDomain(a.website) ?? undefined) : undefined,
    }),
  )
}

function classificationOf(c: {
  fullName: string
  title: string | null
  email: string | null
  phone: string | null
  linkedinUrl: string | null
}): { family: string | null; priority: number | null } {
  const classified = classifyContact({
    full_name: c.fullName,
    title: c.title,
    email: c.email,
    phone: c.phone,
    linkedin_url: c.linkedinUrl,
    entity: null,
  })
  return { family: classified.family ?? null, priority: classified.relevance_score ?? null }
}

/** La clé d'un besoin : même compte, même intitulé normalisé — un ré-import ne double pas la ligne. */
export function needKeyFor(accountId: string, title: string): string {
  return `${accountId}|need:${normaliseCompanyName(title)}`
}

/** Les clés d'un consultant : e-mail puis téléphone — les deux seules colonnes réelles (même règle que `/import`). */
export function talentKeysFor(t: { email: string | null; phone: string | null }): string[] {
  return contactIdentityKeys({ email: t.email, phone: t.phone }).map(key => `talent|${key}`)
}

function headerOf(mapping: UniversalImportMapping, field: string): string | undefined {
  return Object.keys(mapping).find(key => mapping[key] === field)
}

/** Une liste saisie dans UNE cellule (« Java, Kotlin / AWS ») — découpée, sans doublon ni vide. */
function splitList(raw: string | undefined): string[] {
  return [
    ...new Set(
      (raw ?? '')
        .split(/[,;/|]/)
        .map(part => part.trim())
        .filter(Boolean),
    ),
  ]
}

function normalisedOrExtra<T>(
  raw: string | undefined,
  normalise: (value: string) => T | null,
  field: string,
  mapping: UniversalImportMapping,
  extra: Record<string, string>,
): T | null {
  if (!raw) return null
  const value = normalise(raw)
  if (value !== null) return value
  extra[headerOf(mapping, field) ?? field] = raw
  return null
}

function firstKnown(known: Map<string, string>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const found = known.get(key)
    if (found) return found
  }
  return undefined
}

const titleKey = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/**
 * #4051.7 — le titre d'une personne connue a changé : la correction est PROPOSÉE (ancien → nouveau, source),
 * jamais appliquée. Une fiche ou un fichier SANS titre ne propose rien (rien à comparer).
 */
function titleChangeIssue(
  context: UniversalPlanContext,
  line: number,
  existingId: string,
  fullName: string,
  title: string | null,
): UniversalImportIssue | null {
  const current = context.titleById?.get(existingId)
  if (!title || !current || titleKey(title) === titleKey(current)) return null
  const source = context.source.namespace ?? context.source.provider
  return {
    row: line,
    kind: 'to_reconcile',
    reason: 'title_changed',
    existingId,
    label: `${fullName} : ${current} → ${title} (source : ${source})`,
  }
}

function bump(counts: Partial<Record<UniversalImportType, number>>, family: UniversalImportType): void {
  counts[family] = (counts[family] ?? 0) + 1
}

/** Un champ mappé que ce passage n'écrit pas reste lisible sous son en-tête — jamais jeté. */
function keepInExtra(
  mapping: UniversalImportMapping,
  extra: Record<string, string>,
  field: string,
  value: string,
): void {
  extra[headerOf(mapping, field) ?? field] = value
}

/** #4055.5 — les alias d'une cellule : séparés par `|` ou `;`, vides et répétitions écartés. */
function companyAliases(cell: string | undefined): string[] {
  const seen = new Set<string>()
  const aliases: string[] = []
  for (const part of (cell ?? '').split(/[|;]/)) {
    const alias = part.trim()
    const key = normaliseCompanyName(alias)
    if (alias === '' || key === '' || seen.has(key)) continue
    seen.add(key)
    aliases.push(alias)
  }
  return aliases
}

/** Les colonnes SOCIÉTÉ d'une ligne contact (#4053.3). */
const COMPANY_COLUMNS = [
  'company_ref',
  'company_sector',
  'company_employees',
  'company_city',
  'company_status',
] as const

/**
 * #4053.1 / #4052.1 — LE COMPTE d'une ligne contact. Rend son identifiant, ou `null` quand la ligne part au
 * rapport (issue posée ici).
 *
 * ⚠️ RENVERSEMENT DATÉ de §7.3 « les comptes AVANT les contacts » — tranché par Louis le 12/10/2026 (#4053) :
 * un compte est CRÉÉ par RÉFÉRENCE société source ; sans référence, la société est PROPOSÉE à valider,
 * jamais créée. L'ordre de rapprochement : la référence (bornée à l'espace ET à la source), puis le nom
 * normalisé d'une fiche qui n'a pas encore de référence de cette source. Un nom déjà porté par une AUTRE
 * référence est un homonyme (autre site, autre entité) : compte créé, rapprochement PROPOSÉ, jamais fusionné.
 *
 * ⚠️ RENVERSEMENT DATÉ de #4053.1 (règle d'origine ci-dessus, conservée pour être lue) — tranché par Louis le
 * 03/11/2026 (#5222) : mesuré en production sur un fichier client, 2 451 lignes sur 2 619 restaient dehors pour
 * la seule raison « société à valider ». Désormais, quand l'espace peut créer des comptes, une société NOMMÉE sans
 * référence ET inconnue par nom est CRÉÉE (même machinerie que par référence : colonnes société, `imported`).
 * Sans référence il n'y a ni lien ni identifiant externe : la clé de rapprochement est le NOM normalisé, donc
 * deux lignes qui nomment la même société font UN compte. Inchangé : aucune société nommée → `unknown_company` ;
 * `canCreateAccounts` faux → `company_to_validate` ; import ancré sur une fiche compte ; `unknown_company_ref`.
 */
function resolveContactAccount(
  context: UniversalPlanContext,
  plan: UniversalChunkPlan,
  line: number,
  fields: Record<string, string>,
  extra: Record<string, string>,
): string | null {
  const company = orNull(fields['company'])
  // La fiche compte d'où part l'import gagne : les colonnes société restent lisibles, rien n'est créé.
  if (context.accountId) {
    for (const column of COMPANY_COLUMNS) {
      const value = orNull(fields[column])
      if (value) keepInExtra(context.mapping, extra, column, value)
    }
    return context.accountId
  }
  const byName = company ? context.accountByName.get(normaliseCompanyName(company)) : undefined
  const companyRef = orNull(fields['company_ref'])
  const refKey = companyRef ? universalImportSourceRefKey(context.source, companyRef) : null
  const keepCompanyColumns = (): void => {
    for (const column of COMPANY_COLUMNS) {
      const value = orNull(fields[column])
      if (value) keepInExtra(context.mapping, extra, column, value)
    }
  }

  if (!refKey) {
    if (byName) {
      keepCompanyColumns()
      return byName
    }
    if (company && context.canCreateAccounts) {
      // #5222 — renversement de #4053.1 (Louis 03/11) : société nommée, inconnue par nom → créée, clé = le nom.
      const id = createAccount(context, plan, line, fields, company)
      context.accountByName.set(normaliseCompanyName(company), id)
      return id
    }
    if (company) {
      // #4053.1 — espace qui ne crée pas de compte : PROPOSÉE à valider, jamais créée (Louis 12/10).
      plan.issues.push({
        row: line,
        kind: 'to_reconcile',
        reason: 'company_to_validate',
        existingId: null,
        label: company,
      })
      return null
    }
    // Les comptes AVANT les contacts (§7.3) pour une ligne qui ne nomme aucune société.
    plan.issues.push({ row: line, kind: 'rejected', reason: 'unknown_company', existingId: null, label: null })
    return null
  }

  const known = context.accountByRef.get(refKey)
  if (known) {
    keepCompanyColumns()
    return known
  }
  if (byName && !context.refByAccount.has(byName)) {
    // #4052.1 — rapprochement par nom normalisé d'une fiche SANS référence de cette source : la référence
    // s'y relie (import d'équipe), pour qu'un réimport ou un homonyme plus bas ne la réattribue pas.
    if (context.writesRefs) {
      context.accountByRef.set(refKey, byName)
      context.refByAccount.set(byName, refKey)
      plan.links.push({ entityType: 'account', externalId: refKey, internalId: byName })
      bump(plan.matched, 'account')
    }
    keepCompanyColumns()
    return byName
  }
  if (!company) {
    // #4052.4 — une référence inconnue, sans nom : « à rapprocher », jamais une société fictive.
    plan.issues.push({
      row: line,
      kind: 'to_reconcile',
      reason: 'unknown_company_ref',
      existingId: null,
      label: companyRef,
    })
    return null
  }
  if (!context.canCreateAccounts) {
    plan.issues.push({
      row: line,
      kind: 'to_reconcile',
      reason: 'company_to_validate',
      existingId: byName ?? null,
      label: company,
    })
    return null
  }
  // #4053.1 — un compte par référence société source, nourri des colonnes société (#4053.3).
  const id = createAccount(context, plan, line, fields, company)
  context.accountByRef.set(refKey, id)
  context.refByAccount.set(id, refKey)
  plan.links.push({ entityType: 'account', externalId: refKey, internalId: id })
  if (byName) {
    // Homonyme à référence distincte : le CRM dit deux entités — le rapprochement est PROPOSÉ, pas fait.
    plan.issues.push({
      row: line,
      kind: 'to_reconcile',
      reason: 'probable_duplicate_account',
      existingId: byName,
      label: company,
    })
  } else {
    context.accountByName.set(normaliseCompanyName(company), id)
  }
  return id
}

/** #4053.3 — le compte créé depuis une ligne contact, nourri des colonnes société ; sa clé de rapprochement est posée par l'appelant. */
function createAccount(
  context: UniversalPlanContext,
  plan: UniversalChunkPlan,
  line: number,
  fields: Record<string, string>,
  company: string,
): string {
  const id = randomUUID()
  const accountExtra: Record<string, string> = {}
  const status = orNull(fields['company_status'])
  // #4053.2 — client / prospect : un FAIT de la source, conservé tel quel — jamais une relation chaude.
  if (status) keepInExtra(context.mapping, accountExtra, 'company_status', status)
  plan.accountCreates.push({
    line,
    id,
    label: company,
    values: {
      id,
      workspace_id: context.workspaceId,
      user_id: context.userId,
      company_name: company,
      siren: null,
      website: null,
      sector: orNull(fields['company_sector']),
      employees: orMeasuredHeadcount(fields['company_employees']),
      headquarters: orNull(fields['company_city']),
      phone: null,
      address: null,
      tags: [],
      status: 'imported',
      assigned_to: context.userId,
      ...importStamp(context),
      extra: accountExtra,
    },
  })
  context.createdIds.add(id)
  return id
}

/** #4597.3 — la colonne posée sur une fiche créée ; rien quand l'import n'a pas d'identifiant. */
function importStamp(context: UniversalPlanContext): { import_job_id?: string } {
  return context.importJobId ? { import_job_id: context.importJobId } : {}
}

export function planUniversalChunk(
  context: UniversalPlanContext,
  rows: readonly UniversalValidatedRow[],
): UniversalChunkPlan {
  const plan: UniversalChunkPlan = {
    creates: [],
    issues: [],
    accountCreates: [],
    fills: [],
    links: [],
    matched: {},
    alreadyKnown: {},
    resolved: { people: 0, accounts: 0 },
  }
  const writable = UNIVERSAL_IMPORT_REGISTRY[context.type].writable

  for (const { line, record } of rows) {
    const verdict = validateUniversalRow(context.type, splitUniversalRow(record, context.mapping), context.mapping)
    if (!verdict.ok) {
      plan.issues.push({
        row: line,
        kind: 'rejected',
        reason: verdict.reason,
        existingId: null,
        label: verdict.detail || null,
      })
      continue
    }
    if (!writable) {
      plan.issues.push({ row: line, kind: 'rejected', reason: 'type_not_writable', existingId: null, label: null })
      continue
    }
    const { fields, extra } = verdict

    if (context.type === 'contact') {
      const company = orNull(fields['company'])
      const resolved = resolveContactAccount(context, plan, line, fields, extra)
      if (!resolved) continue
      const accountId = resolved
      noteResolved(context, plan, 'accounts', accountId)
      const fullName = fields['full_name'] as string
      const email = orNull(fields['email'])
      const phone = orPlausiblePhone(fields['phone'])
      const linkedinUrl = orNull(fields['linkedin_url'])
      const title = orNull(fields['title'])
      // #4052.3 — la référence du CONTACT d'abord : un réimport du CRM à jour complète la fiche reconnue
      // (champs vides seulement), il n'en crée pas de copie et n'écrase aucune correction humaine.
      const contactRef = orNull(fields['source_ref'])
      const contactRefKey =
        contactRef && context.writesRefs ? universalImportSourceRefKey(context.source, contactRef) : null
      if (contactRef && !contactRefKey) keepInExtra(context.mapping, extra, 'source_ref', contactRef)
      const byRef = contactRefKey ? context.contactByRef.get(contactRefKey) : undefined
      if (byRef) {
        if (context.createdIds.has(byRef)) {
          noteResolved(context, plan, 'people', byRef)
          plan.issues.push({ row: line, kind: 'duplicate', reason: 'duplicate', existingId: byRef, label: fullName })
        } else {
          plan.fills.push({
            line,
            id: byRef,
            target: 'contact',
            values: { title, email, phone, linkedin_url: linkedinUrl },
          })
          bump(plan.matched, 'contact')
          noteResolved(context, plan, 'people', byRef)
          const retitled = titleChangeIssue(context, line, byRef, fullName, title)
          if (retitled) plan.issues.push(retitled)
        }
        continue
      }
      const keys = contactKeysFor(accountId, { fullName, email, phone, linkedinUrl })
      const existing = firstKnown(context.known, keys)
      if (existing) {
        noteResolved(context, plan, 'people', existing)
        const retitled = context.createdIds.has(existing)
          ? null
          : titleChangeIssue(context, line, existing, fullName, title)
        plan.issues.push(
          retitled ?? { row: line, kind: 'duplicate', reason: 'duplicate', existingId: existing, label: fullName },
        )
        // #4051.8 — la coordonnée est déjà dans l'espace (et non posée plus haut dans ce fichier).
        if ((email || phone) && !context.createdIds.has(existing)) bump(plan.alreadyKnown, 'contact')
        continue
      }
      const id = randomUUID()
      for (const key of keys) context.known.set(key, id)
      context.createdIds.add(id)
      noteResolved(context, plan, 'people', id)
      if (contactRefKey) {
        context.contactByRef.set(contactRefKey, id)
        plan.links.push({ entityType: 'contact', externalId: contactRefKey, internalId: id })
      }
      // Une société SAISIE sur la fiche compte n'est pas une colonne perdue :
      // quand le compte vient du contexte, la cellule reste lisible dans `extra`.
      const header = headerOf(context.mapping, 'company')
      if (context.accountId && company && header) extra[header] = company
      plan.creates.push({
        line,
        id,
        label: fullName,
        values: {
          id,
          account_id: accountId,
          workspace_id: context.workspaceId,
          user_id: context.userId,
          full_name: fullName,
          title,
          email,
          phone,
          linkedin_url: linkedinUrl,
          tags: normalizeTags(fields['tags']),
          // La MÊME classification que l'ancien import de la fiche compte
          // (« liste perso » : famille + pertinence 1-5), déterministe et
          // gratuite — le remplacer ne doit rien perdre. Une ligne signalée
          // reste importée (c'était le défaut coché), jamais écartée en silence.
          ...classificationOf({ fullName, title, email, phone, linkedinUrl }),
          source: 'import',
          ...importStamp(context),
          lifecycle_state: computeContactLifecycleState({
            fullName,
            title,
            email,
            phone,
            linkedinUrl,
            source: 'import',
          }),
          extra,
        },
      })
      continue
    }

    if (context.type === 'need') {
      const title = fields['title'] as string
      const company = orNull(fields['company'])
      const accountId =
        context.accountId ?? (company ? context.accountByName.get(normaliseCompanyName(company)) : undefined)
      if (!accountId) {
        plan.issues.push({ row: line, kind: 'rejected', reason: 'unknown_company', existingId: null, label: company })
        continue
      }
      const keys = [needKeyFor(accountId, title)]
      const existing = firstKnown(context.known, keys)
      if (existing) {
        plan.issues.push({ row: line, kind: 'duplicate', reason: 'duplicate', existingId: existing, label: title })
        continue
      }
      const id = randomUUID()
      for (const key of keys) context.known.set(key, id)
      // Une valeur que la normalisation ne sait pas lire n'est pas devinée :
      // elle reste lisible dans `extra`, sous son en-tête, et le champ reste vide.
      const startOn = normalisedOrExtra(fields['start_date'], normaliseDate, 'start_date', context.mapping, extra)
      const tjmCents = normalisedOrExtra(
        fields['daily_rate'],
        normaliseAmountCents,
        'daily_rate',
        context.mapping,
        extra,
      )
      plan.creates.push({
        line,
        id,
        label: title,
        values: {
          id,
          workspace_id: context.workspaceId,
          account_id: accountId,
          title,
          start_on: startOn,
          target_tjm_cents: tjmCents === null ? null : String(tjmCents),
          location: orNull(fields['location']),
          stack: splitList(fields['skills']),
          // `owner_id` reste vide : rien dans une ligne de fichier ne dit QUI
          // porte ce besoin (même règle que l'assistant `/import`).
          source: 'csv_import',
          provenance: 'human',
          extra,
        },
      })
      continue
    }

    if (context.type === 'talent') {
      const fullName = fields['full_name'] as string
      const email = orNull(fields['email'])
      const phone = orPlausiblePhone(fields['phone'])
      const keys = talentKeysFor({ email, phone })
      const existing = firstKnown(context.known, keys)
      if (existing) {
        plan.issues.push({ row: line, kind: 'duplicate', reason: 'duplicate', existingId: existing, label: fullName })
        continue
      }
      const id = randomUUID()
      for (const key of keys) context.known.set(key, id)
      const tjmCents = normalisedOrExtra(
        fields['daily_rate'],
        normaliseAmountCents,
        'daily_rate',
        context.mapping,
        extra,
      )
      // Les compétences vivent dans une table à part (`consultant_skills`,
      // avec leur preuve) : une cellule de fichier ne la remplit pas — elle
      // reste lisible dans `extra`, jamais jetée.
      const skillsHeader = headerOf(context.mapping, 'skills')
      if (fields['skills'] && skillsHeader) extra[skillsHeader] = fields['skills']
      plan.creates.push({
        line,
        id,
        label: fullName,
        values: {
          id,
          workspace_id: context.workspaceId,
          user_id: context.userId,
          full_name: fullName,
          email,
          phone,
          title: orNull(fields['title']),
          tjm: tjmCents === null ? null : Math.round(tjmCents / 100),
          available_from: normalisedOrExtra(
            fields['available_from'],
            normaliseDate,
            'available_from',
            context.mapping,
            extra,
          ),
          source: 'csv_import',
          // Née d'une extraction en masse : jamais rangée sous `qualified`.
          review_status: 'needs_review',
          extra,
        },
      })
      continue
    }

    // context.type === 'account'
    const company = fields['company_name'] as string
    const siren = orNull(fields['siren'])
    const website = orNull(fields['website'])
    // #4426.1 — le tier importé se pose sur le champ d'étiquettes du compte (filtre « Étiquette » de /accounts) ;
    // une valeur qui n'est pas A/B/C n'est ni devinée ni perdue (elle reste dans `extra`). La raison reste lisible.
    const tierRaw = orNull(fields['tier'])
    const tier = parseTierLabel(tierRaw)
    if (tierRaw && !tier) keepInExtra(context.mapping, extra, 'tier', tierRaw)
    const tierReason = orNull(fields['tier_reason'])
    if (tierReason) keepInExtra(context.mapping, extra, 'tier_reason', tierReason)
    // #4052.3 — un compte RECONNU par sa référence source se complète (champs vides), sans copie.
    const accountRef = orNull(fields['source_ref'])
    const accountRefKey =
      accountRef && context.writesRefs ? universalImportSourceRefKey(context.source, accountRef) : null
    if (accountRef && !accountRefKey) keepInExtra(context.mapping, extra, 'source_ref', accountRef)
    const byRef = accountRefKey ? context.accountByRef.get(accountRefKey) : undefined
    if (byRef) {
      noteResolved(context, plan, 'accounts', byRef)
      if (context.createdIds.has(byRef)) {
        plan.issues.push({ row: line, kind: 'duplicate', reason: 'duplicate', existingId: byRef, label: company })
      } else {
        plan.fills.push({
          line,
          id: byRef,
          target: 'account',
          values: {
            ...(tier ? { tags_add: [`Tier ${tier}`] } : {}),
            siren,
            website,
            sector: orNull(fields['sector']),
            employees: orMeasuredHeadcount(fields['employees']),
            headquarters: orNull(fields['headquarters']),
            phone: orPlausiblePhone(fields['phone']),
            address: orNull(fields['address']),
          },
        })
        bump(plan.matched, 'account')
      }
      continue
    }
    const keys = accountKeysFor({ company, siren, website })
    // #4055.5 — les autres noms de la société (colonne « alias ») rapprochent aussi une fiche connue : même clé de nom
    // normalisé que le nom principal, jamais une fusion (le doublon est PROPOSÉ). L'alias reste lisible dans `extra`.
    const aliases = companyAliases(fields['company_alias'])
    const aliasKeys = aliases.flatMap(alias => accountKeysFor({ company: alias, siren: null, website: null }))
    if (aliases.length > 0) keepInExtra(context.mapping, extra, 'company_alias', aliases.join(' | '))
    const existing = firstKnown(context.known, keys) ?? firstKnown(context.known, aliasKeys)
    if (existing) {
      noteResolved(context, plan, 'accounts', existing)
      // #4426.4 — le tier d'un compte déjà là s'AJOUTE à ses étiquettes (rattrapage d'un import antérieur) ; une
      // fiche créée plus haut dans ce même fichier a déjà reçu le sien.
      if (tier && !context.createdIds.has(existing)) {
        plan.fills.push({ line, id: existing, target: 'account', values: { tags_add: [`Tier ${tier}`] } })
      }
      // Une référence NEUVE sur une fiche reconnue par SIREN/domaine/nom reste un doublon PROPOSÉ : la relier
      // serait fusionner sans geste humain.
      plan.issues.push({ row: line, kind: 'duplicate', reason: 'duplicate', existingId: existing, label: company })
      continue
    }
    const id = randomUUID()
    for (const key of [...keys, ...aliasKeys]) context.known.set(key, id)
    context.accountByName.set(normaliseCompanyName(company), id)
    context.createdIds.add(id)
    noteResolved(context, plan, 'accounts', id)
    if (accountRefKey) {
      context.accountByRef.set(accountRefKey, id)
      context.refByAccount.set(id, accountRefKey)
      plan.links.push({ entityType: 'account', externalId: accountRefKey, internalId: id })
    }
    plan.creates.push({
      line,
      id,
      label: company,
      values: {
        id,
        workspace_id: context.workspaceId,
        user_id: context.userId,
        company_name: company,
        siren,
        website,
        sector: orNull(fields['sector']),
        employees: orMeasuredHeadcount(fields['employees']),
        headquarters: orNull(fields['headquarters']),
        phone: orPlausiblePhone(fields['phone']),
        address: orNull(fields['address']),
        tags: normalizeTags([fields['tags'], ...(tier ? [`Tier ${tier}`] : [])]),
        // `imported`, jamais `completed` : aucun dossier de conquête n'existe.
        status: 'imported',
        assigned_to: context.userId,
        ...importStamp(context),
        extra,
      },
    })
  }
  return plan
}
