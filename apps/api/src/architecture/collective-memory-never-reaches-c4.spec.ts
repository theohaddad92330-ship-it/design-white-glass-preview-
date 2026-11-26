import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MEMORY_CROSSING_KINDS } from '@bellum/contracts'

/**
 * GA-C4-API — « aucun croisement ne traverse C4 », prouvé sur les REQUÊTES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE AJOUTE À SA JUMELLE
 * ─────────────────────────────────────────────────────────────────────────────
 * `packages/contracts/src/schemas/memory-crossing.c4.test.ts` prouve qu'un corps
 * de message n'a **nulle part où aller** dans le TYPE d'un croisement. Elle dit
 * elle-même ce qu'elle ne peut pas prouver : qu'un développeur écrive
 * `objectLabel('company_name', activity.body)`. Cette ligne-là compile.
 *
 * Cette garde-ci ferme l'écart par l'autre bout : elle vérifie que la donnée C4
 * n'est **jamais dans le rayon de la requête**. On ne filtre pas `body` — on ne
 * lit pas la table qui le porte. C'est la différence entre « on a décidé de ne
 * pas exposer » et « il n'y a rien à exposer », et c'est la doctrine du dépôt :
 * **retirer le MOYEN, pas seulement la permission**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CINQ RÈGLES
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. Le service ne nomme AUCUNE table C4 (`activities`, `notes`,
 *     `team_comments`, `conversation_summaries`, `mailbox_*`).
 *  2. Il ne nomme AUCUNE colonne d'économie du deal (marge, TJM, coût, montant).
 *  3. Toute requête est bornée par `workspace_id = $1` — un croisement naît dans
 *     un espace et y reste (GA-43 : les espaces sont des ESN concurrentes).
 *  4. Il n'ÉCRIT que le journal de contribution : aucun `UPDATE`, aucun
 *     `DELETE`, aucune colonne de porteur touchée. « Aucune réattribution
 *     automatique » est l'absence du code, pas un réglage sur OFF.
 *  5. Aucun classement entre pairs : pas de `COUNT` par membre, pas de
 *     `GROUP BY` sur une colonne d'utilisateur en dehors du seul regroupement
 *     qui sert à prendre le dernier geste (§24 « Red Team » de la doctrine).
 */

const SERVICE = join(__dirname, '../modules/workspace/workspace-memory-crossings.service.ts')
const SOURCE = readFileSync(SERVICE, 'utf8')

/** Le SQL du fichier, commentaires exclus — un commentaire n'interroge rien. */
function sqlLiterals(source: string): string[] {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  return [...withoutComments.matchAll(/`([^`]*(?:SELECT|INSERT|UPDATE|DELETE)[^`]*)`/gis)].map(match => match[1] ?? '')
}

const QUERIES = sqlLiterals(SOURCE)

/**
 * Une ÉCRITURE est bornée quand elle nomme `workspace_id` en PREMIÈRE colonne
 * insérée et le lie au premier paramètre. C'est la convention du dépôt, et elle
 * a l'avantage d'être lisible : l'espace se voit à la première ligne.
 */
function isStampedWithWorkspace(query: string): boolean {
  const columns = /INSERT\s+INTO\s+\w+\s*\(([^)]*)\)/i.exec(query)?.[1]
  const values = /VALUES\s*\(([^)]*)\)/i.exec(query)?.[1]
  if (!columns || !values) return false
  return columns.split(',')[0]?.trim() === 'workspace_id' && values.split(',')[0]?.trim() === '$1'
}

/** Les tables qui portent du C4 — du contenu écrit par ou pour un humain. */
const C4_TABLES = [
  'activities',
  'notes',
  'team_comments',
  'conversation_summaries',
  'chat_messages',
  'mailbox_messages',
  'meeting_transcripts',
]

/** Les colonnes d'économie du deal — role-gated, et hors sujet sur un pont. */
const DEAL_ECONOMY_COLUMNS = [
  'daily_rate',
  'daily_cost',
  'cost_rate_cents',
  'purchase_tjm_cents',
  'target_tjm_cents',
  'min_tjm_cents',
  'amount_cents',
  'budget_cents',
  'estimated_amount',
  'margin',
]

describe('GA-C4-API — la garde LIT quelque chose', () => {
  it('trouve le service et ses requêtes', () => {
    // Une garde dont le corpus est vide reste verte pour toujours : c'est le
    // défaut le plus fréquent du dépôt, et ces bornes tombent si le fichier est
    // renommé, vidé, ou si les requêtes cessent d'être des littéraux.
    expect(SOURCE.length).toBeGreaterThan(4000)
    expect(QUERIES.length).toBeGreaterThanOrEqual(8)
    expect(QUERIES.join('\n')).toContain('FROM missions m')
    expect(QUERIES.join('\n')).toContain('FROM user_actions ua')
    expect(QUERIES.join('\n')).toContain('FROM project_needs n')
    expect(QUERIES.join('\n')).toContain('FROM access_facts af')
  })

  it('couvre les quatre croisements du contrat', () => {
    for (const kind of MEMORY_CROSSING_KINDS) {
      expect(SOURCE).toContain(`'${kind}'`)
    }
  })

  it('sait dire NON — son extracteur voit une table interdite quand il y en a une', () => {
    // Le contrôle négatif. Sans lui, les quatre tests suivants pourraient être
    // verts parce que l'extracteur ne lit rien du tout.
    const mutant = 'const q = `SELECT a.body FROM activities a WHERE a.workspace_id = $1`'
    const extracted = sqlLiterals(mutant).join('\n')
    expect(extracted).toContain('FROM activities')
    expect(C4_TABLES.some(table => new RegExp(`\\bFROM\\s+${table}\\b`, 'i').test(extracted))).toBe(true)

    // Et il IGNORE un commentaire : citer `activities` dans une explication ne
    // doit pas faire échouer la garde. C'est le défaut inverse — GA-33 accusait
    // un commentaire qui citait la classe qu'il interdisait.
    const commented = '// on ne lit pas `SELECT body FROM activities`\nconst q = `SELECT 1 FROM missions`'
    expect(sqlLiterals(commented).join('\n')).not.toContain('activities')
  })
})

describe('GA-C4-API — la donnée C4 n’est pas dans le rayon de la requête', () => {
  it('ne lit AUCUNE table qui porte du contenu humain', () => {
    const offenders = C4_TABLES.filter(table =>
      QUERIES.some(query => new RegExp(`\\b(?:FROM|JOIN)\\s+${table}\\b`, 'i').test(query)),
    )
    expect(offenders.join(', ')).toBe('')
  })

  it('ne sélectionne aucune colonne d’économie du deal', () => {
    const offenders = DEAL_ECONOMY_COLUMNS.filter(column => QUERIES.some(query => query.includes(column)))
    expect(offenders.join(', ')).toBe('')
  })

  it('ne lit pas le champ LIBRE d’un fait d’accès — `detail` peut contenir n’importe quoi', () => {
    // `access_facts.value` est borné par une liste d'énumération ; `detail` est
    // une phrase écrite à la main. Le rang se DÉDUIT du mode, il ne se lit pas
    // dans du texte.
    expect(QUERIES.some(query => /af\.detail/.test(query))).toBe(false)
  })
})

describe('GA-C4-API — un croisement naît dans un espace et y reste', () => {
  it('borne CHAQUE requête sur l’espace — une lecture le FILTRE, une écriture le STAMPE', () => {
    // Le même invariant a deux formes, et les confondre est ce qui a fait
    // tomber la première version de cette garde sur son propre `INSERT` :
    //  · une LECTURE porte `WHERE … workspace_id = $1` ;
    //  · une ÉCRITURE nomme `workspace_id` en PREMIÈRE colonne insérée et le lie
    //    à `$1` — il n'y a rien à filtrer, il y a un espace à estampiller.
    // Une garde qui n'aurait exigé que la première aurait poussé à ajouter un
    // `WHERE` décoratif à un `INSERT`, ou à exempter les écritures — c'est-à-dire
    // à ne plus garder la seule chose que ce fichier écrit.
    const unbounded = QUERIES.filter(query =>
      /^\s*INSERT/i.test(query) ? !isStampedWithWorkspace(query) : !/workspace_id\s*=\s*\$1/.test(query),
    )
    expect(unbounded.join('\n---\n')).toBe('')
  })

  it('sait dire NON sur les DEUX formes', () => {
    // Sans ce contrôle négatif, la branche « écriture » pourrait être une
    // tautologie : c'est exactement le genre de garde borgne que le dépôt a
    // déjà payé six fois en deux jours.
    expect(isStampedWithWorkspace('INSERT INTO t (workspace_id, a) VALUES ($1, $2)')).toBe(true)
    expect(isStampedWithWorkspace('INSERT INTO t (account_id, a) VALUES ($1, $2)')).toBe(false)
    expect(isStampedWithWorkspace('INSERT INTO t (a, workspace_id) VALUES ($1, $2)')).toBe(false)
    expect(/workspace_id\s*=\s*\$1/.test('SELECT 1 FROM t')).toBe(false)
    expect(/workspace_id\s*=\s*\$1/.test('SELECT 1 FROM t WHERE workspace_id = $1')).toBe(true)
  })

  it('n’accepte jamais un identifiant d’espace en paramètre d’API', () => {
    // Le premier invariant de la spec sécurité. Une route qui accepterait qu'on
    // lui dise quel espace lire ne pourrait pas le tenir.
    const controller = readFileSync(join(__dirname, '../modules/workspace/workspace-memory.controller.ts'), 'utf8')
    expect(controller).toContain('resolveActiveWorkspace')
    expect(controller).not.toMatch(/@Param\(\s*'workspaceId'/)
    expect(controller).not.toMatch(/@Query\(\s*'workspaceId'/)
    expect(controller).not.toMatch(/@Body\(\s*'workspaceId'/)
  })
})

describe('GA-C4-API — rien ne se réattribue, personne n’est classé', () => {
  it('n’écrit QUE le journal de contribution', () => {
    const writes = QUERIES.filter(query => /\b(INSERT|UPDATE|DELETE)\b/i.test(query))
    expect(writes).toHaveLength(1)
    expect(writes[0]).toContain('INSERT INTO workspace_bridge_contacts')
  })

  it('ne touche aucune colonne de porteur — « aucune réattribution automatique » est l’absence du code', () => {
    const all = QUERIES.join('\n')
    expect(all).not.toMatch(/\bSET\b/i)
    for (const ownerColumn of ['assigned_to =', 'owner_id =']) {
      expect(all).not.toContain(ownerColumn)
    }
  })

  it('ne dresse aucun palmarès de collègues', () => {
    // `COUNT(*) FILTER` sur le journal est un compte d'ESPACE, pas de personne :
    // il est autorisé. Ce qui est refusé est un `GROUP BY` de comptage sur un
    // identifiant d'utilisateur — le seul regroupement par `user_id` du service
    // sert à prendre le DERNIER geste (`MAX(created_at)`), pas à en compter.
    for (const query of QUERIES) {
      if (!/GROUP BY[^\n]*user_id/i.test(query)) continue
      expect(query).toMatch(/MAX\(/i)
      expect(query).not.toMatch(/COUNT\s*\(/i)
      expect(query).toMatch(/LIMIT 1/)
    }
    // Preuve que cette boucle a bien vu quelque chose.
    expect(QUERIES.filter(query => /GROUP BY[^\n]*user_id/i.test(query))).toHaveLength(1)
  })
})
