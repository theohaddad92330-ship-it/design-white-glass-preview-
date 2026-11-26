import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { getMetadataArgsStorage } from 'typeorm'
import { ENTITIES as ENTITY_CLASSES } from '../database/database.module'

/**
 * GA-46 — aucune lecture SQL ne traverse un espace sans le vouloir.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE SEUL TROU *TOTAL* QUE LES SOURCES NOMMAIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois documents la réclament, sous trois numéros différents : `GA-04` au
 * PDF 1 §14, `GA-06` au PDF 9 §11 (« empêche une requête sans `workspace_id` »),
 * et le tracker du PDF 9, qui la qualifie du « seul trou TOTAL du §11, et c'est
 * un sujet de sécurité ».
 *
 * Elle a été différée deux fois pour une raison honnête, écrite dans ce même
 * tracker : « la poser suppose de distinguer les requêtes légitimement non
 * scopées (admin interne, API publique, tables globales) des autres ».
 *
 * Cette distinction existe désormais : `shared-tables-declared.spec.ts` (GA-16)
 * déclare les seize tables sans `workspace_id`, chacune avec sa portée et sa
 * raison. Le corpus restant est donc net — ce qui rend cette garde-ci
 * écrivable, là où elle aurait produit du bruit auparavant.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE MESURE, ET CE QU'ELLE NE PEUT PAS MESURER
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle lit le SQL BRUT des modules — celui que personne ne relit, et où le
 * `WHERE` s'écrit à la main. Les lectures qui passent par le repository TypeORM
 * ne sont pas couvertes : leur `where` est un objet, et une garde textuelle y
 * verrait des faux positifs sans fin.
 *
 * ⚠️ Ce n'est donc PAS une preuve d'isolation. C'est un cliquet sur le chemin
 * où la faute est la plus facile à commettre et la plus difficile à voir. La
 * mesure du 25/08/2026 le confirme : sur **340 requêtes SQL brutes**, deux
 * seulement touchent une table scopée sans filtre — et les deux sont
 * légitimes. La règle est tenue ; ce qui manquait est ce qui l'empêche de se
 * dégrader.
 */

const API_SRC = join(__dirname, '..')

/**
 * Ce qui, dans une requête, prouve qu'elle est bornée.
 *
 * `workspace_id` est le cas nominal. `user_id` et `owner_id` bornent aussi —
 * un utilisateur appartient à un espace. Les clés d'OBJET (`account_id`,
 * `mission_id`…) comptent parce que le motif du dépôt est de vérifier
 * l'appartenance de l'objet AVANT, puis de s'y accrocher : c'est ce que fait
 * `findOneForWorkspace` sur chaque contrôleur de compte.
 *
 * `entity_id` est le même motif sous un autre nom, pour les tables polymorphes
 * (`record_field_audit`, `field_provenance`) : elles portent le couple
 * `entity_type` + `entity_id` et se lisent toujours depuis un objet déjà
 * résolu.
 */
const SCOPE_MARKERS =
  /workspace_id|user_id|owner_id|account_id|mission_id|contact_id|consultant_id|project_id|need_id|sequence_id|activity_id|opportunity_id|entity_id/i

/**
 * Les deux formes de borne que le texte de la requête ne montre PAS.
 *
 * ⚠️ Sans elles, la garde crie sur du code correct — et une garde qui crie sur
 * du code correct finit désactivée. Mesuré : sur les quinze premiers signaux,
 * QUINZE étaient de ce genre.
 *
 * 1. `WHERE id = $1` — une lecture par clé primaire. Le motif du dépôt est de
 *    vérifier l'appartenance de l'objet AVANT (`findOneForWorkspace`, qui rend
 *    un `not_found` hors espace), puis de s'accrocher à son identifiant. La
 *    garde ne peut pas voir cette vérification ; elle est dans l'appelant.
 * 2. `WHERE ${clause}` — une clause construite en TypeScript. `talent.service`
 *    l'initialise à `['c.workspace_id = $1']`, mais le littéral SQL ne porte
 *    que l'interpolation. On exige alors que le FICHIER parle d'espace : c'est
 *    faible, et c'est dit.
 */
const PRIMARY_KEY_BOUND = /\bid\s*=\s*\$\d/i
const INTERPOLATED = /\$\{/

/**
 * Les requêtes qui traversent les espaces DÉLIBÉRÉMENT, avec leur raison.
 *
 * ⚠️ Cette liste ne peut que RÉTRÉCIR. Y ajouter une entrée demande de
 * répondre d'abord à « pourquoi cette lecture doit-elle voir tous les
 * espaces ? » — et la réponse doit tenir en une phrase qu'un auditeur accepte.
 */
const CROSS_WORKSPACE_BY_DESIGN: Record<string, string> = {
  'territory-watch.service.ts':
    'Le balayage territorial doit précisément traverser les espaces : il liste les départements abonnés par N’IMPORTE QUEL espace pour n’en photographier chacun qu’UNE fois. La photo est partagée (déclarée à GA-16), l’abonnement reste scopé.',
  'contacts.service.ts':
    'Un `NOT EXISTS` sur `email_suppressions` rapproché par ADRESSE, délibérément sans espace : un opt-out obtenu dans un espace fait taire les envois partout. C’est la règle #394, et la restreindre à l’espace ferait réécrire à quelqu’un qui a demandé à ne plus l’être.',
  'analysis-runs.service.ts':
    'Le rapport de santé des sources agrège les runs de TOUS les espaces, et son propre docblock le dit depuis toujours : « une panne de fournisseur n’est pas un fait de locataire ». Il ne rend aucune donnée de compte — seulement l’état des sources — et son appelant est derrière `InternalSecretGuard`.',
  'privacy-retention.service.ts':
    'Un balayage de rétention est par nature inter-espaces : la loi ne compte pas les jours par locataire. Sa portée n’est pas l’espace mais l’ARCHIVE — `superseded_at IS NOT NULL` plus une fenêtre — et une ligne VIVANTE, donc appartenant encore à quelqu’un, ne peut pas entrer dans l’ensemble effacé. Le borner par espace obligerait à énumérer les espaces pour appliquer à chacun la même règle, sans rien protéger de plus.',
  'account-access.service.ts':
    'L’agrégation communautaire lit les faits d’accès de plusieurs espaces — c’est sa raison d’être. Elle est bornée par ailleurs : seules les natures de GA-43 y entrent, seuls les espaces qui partagent y contribuent, et l’identité d’un espace n’en ressort jamais.',
  'discover-portfolio.service.ts':
    'UNE requête brute, le décompte « N besoins connus » (#3819.1) : elle ne lit que la LONGUEUR de tableaux de l’analyse (douleurs, chantiers IT, programmes), jamais une donnée de compte, et ses identifiants viennent exclusivement de `resolve()`, qui borne par l’espace actif AVANT. Ni `resolveKnownNeeds` ni ses deux appelants ne reçoivent l’utilisateur : lui faire porter un `workspace_id` ré-ouvrirait leur signature pour rien protéger de plus. Les autres lectures du fichier passent par le query builder, borné par `workspace_id`.',
  'storage.service.ts':
    'DEUX requêtes seulement — la SÉLECTION et l’EFFACEMENT de la purge de rétention (`retention_until < $1`). Même raison que `privacy-retention.service.ts` : une échéance légale ne se compte pas par locataire, et borner par espace obligerait à énumérer les espaces pour appliquer à chacun la même règle, sans rien protéger de plus. Ce balayage ne REND aucune donnée — il compte ce qu’il a effacé — et son seul appelant est une tâche planifiée, jamais une route. Toutes les autres requêtes de ce fichier (le quota, la lecture d’un objet, la jointure par identifiants) sont bornées par `workspace_id`, et c’est ce qui porte le cloisonnement.',
  'chat-messages.service.ts':
    'UNE requête brute seulement — `archiveExpiredImageVision` (#2876), l’UPDATE du balayage nocturne qui archive les zones vision expirées. Même raison que `storage.service.ts` : une échéance de rétention (`created_at` + durée du domaine `chat_image_attachment`) ne se compte pas par locataire. Elle n’écrit qu’un horodatage (`image_vision_archived_at`) sur la ligne, ne lit ni ne rend aucune donnée, et ne supprime rien. Les autres requêtes du fichier restent bornées par `workspace_id`.',
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) out.push(full)
  }
  return out
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * Les tables qui PORTENT un `workspace_id` — celles qu'une lecture doit borner.
 *
 * ⚠️ Lu dans les métadonnées TypeORM, et non dans les fichiers, depuis le
 * 29/08/2026. La version par fichier prenait le PREMIER `@Entity(...)` d'une
 * source : `match-run.entity.ts` en porte trois, `shortlist.entity.ts` deux.
 * `match_weight_versions` porte `workspace_id` et n'entrait donc JAMAIS dans cet
 * ensemble — une requête brute non bornée sur elle serait passée sans un mot.
 * Même angle mort pour les entités qui vivent à côté de leur module
 * (`favorites/`, `watchlist-rules/`), qu'un `readdirSync` sur `entities/` ne
 * visite pas. La liste enregistrée, elle, est celle que TypeORM reçoit vraiment.
 */
function scopedTables(): Set<string> {
  const storage = getMetadataArgsStorage()
  const out = new Set<string>()
  for (const target of ENTITY_CLASSES) {
    const table = storage.tables.find(entry => entry.target === target)
    if (!table?.name) continue
    const carriesWorkspace = storage.columns.some(column => {
      if ((column.options.name ?? column.propertyName) !== 'workspace_id') return false
      let current: unknown = target
      while (typeof current === 'function') {
        if (column.target === current) return true
        current = Object.getPrototypeOf(current)
      }
      return false
    })
    if (carriesWorkspace) out.add(table.name)
  }
  return out
}

type Query = { file: string; sql: string; tables: string[] }

/** Toute requête SQL brute des modules qui LIT une table scopée. */
function queriesTouchingScopedTables(): Query[] {
  const scoped = scopedTables()
  const found: Query[] = []
  for (const file of sourceFiles(join(API_SRC, 'modules'))) {
    const source = stripComments(readFileSync(file, 'utf8'))
    for (const match of source.matchAll(/`([^`]*\bFROM\s+[a-z_]+[^`]*)`/gis)) {
      const sql = match[1] ?? ''
      const tables = [...sql.matchAll(/\b(?:FROM|JOIN)\s+([a-z_]+)/gi)]
        .map(m => (m[1] ?? '').toLowerCase())
        .filter(table => scoped.has(table))
      if (tables.length) found.push({ file, sql, tables })
    }
  }
  return found
}

describe('GA-46 — une lecture ne traverse un espace que si on l’a voulu', () => {
  it('LIT quelque chose — des tables scopées et des requêtes existent', () => {
    // Deux lectures vides passeraient au vert pour toujours. C'est la leçon de
    // GA-16, qui a balayé 12 % de son corpus pendant deux jours sans le dire.
    expect(scopedTables().size).toBeGreaterThan(50)
    expect(queriesTouchingScopedTables().length).toBeGreaterThan(50)
    // Le témoin du corpus réparé : cette table PORTE `workspace_id` et vivait
    // dans un fichier avec deux sœurs, donc l'ancien balayage ne la voyait pas.
    expect(scopedTables().has('match_weight_versions')).toBe(true)
    expect(scopedTables().has('watchlist_rules')).toBe(true)
  })

  it('chaque requête sur une table scopée est bornée, ou déclarée', () => {
    const offenders: string[] = []
    for (const { file, sql, tables } of queriesTouchingScopedTables()) {
      if (SCOPE_MARKERS.test(sql)) continue
      if (PRIMARY_KEY_BOUND.test(sql)) continue
      // Clause interpolée : on ne peut pas la lire, on exige que le fichier
      // porte le mot. Faible, assumé, écrit.
      if (INTERPOLATED.test(sql) && /workspace_id/.test(stripComments(readFileSync(file, 'utf8')))) continue
      const name = file.slice(file.lastIndexOf('/') + 1)
      if (name in CROSS_WORKSPACE_BY_DESIGN) continue
      // Le back-office est cross-espace par définition : il est protégé par
      // `InternalSecretGuard`, pas par un filtre de requête.
      if (/\/modules\/(admin|analytics)\//.test(file)) continue
      offenders.push(`${file.slice(file.indexOf('/modules'))} → ${tables.join(', ')} : ${sql.trim().slice(0, 70)}`)
    }
    expect(offenders).toEqual([])
  })

  it('sait dire NON — une lecture non bornée est refusée', () => {
    // La règle rejouée sur une requête fabriquée : casser une vraie requête
    // pour le prouver ferait courir le risque qu'on oublie de la remettre.
    const nue = `SELECT company_name FROM accounts ORDER BY created_at DESC`
    const bornee = `SELECT company_name FROM accounts WHERE workspace_id = $1`
    const parObjet = `SELECT value FROM access_facts WHERE account_id = $1`
    expect(SCOPE_MARKERS.test(nue)).toBe(false)
    expect(SCOPE_MARKERS.test(bornee)).toBe(true)
    expect(SCOPE_MARKERS.test(parObjet)).toBe(true)
  })

  it('les exemptions déclarées existent encore, et portent leur raison', () => {
    const files = new Set(sourceFiles(API_SRC).map(f => f.slice(f.lastIndexOf('/') + 1)))
    expect(Object.keys(CROSS_WORKSPACE_BY_DESIGN).filter(name => !files.has(name))).toEqual([])
    const tooShort = Object.entries(CROSS_WORKSPACE_BY_DESIGN)
      .filter(([, reason]) => reason.trim().length <= 60)
      .map(([name]) => name)
    expect(tooShort).toEqual([])
  })
})
