import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-412 — l'agrégat des contestations de Laura se compte PAR FONCTION, jamais
 * par personne, ni par espace nommé, ni sur du contenu.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * `chat_reply_feedback` porte, en base, un AUTEUR (`user_id`), un espace, un
 * compte, une note libre et une valeur corrigée : c'est la mémoire de la
 * personne, relue dans SON prompt. Le 11/10/2026, Louis a autorisé UN agrégat
 * de back-office sur cette table (troisième exception nommée à
 * `c64_analytique_produit`, #2442.10) — à une condition : l'unité d'analyse est
 * la FONCTION. « Cette fonction est contestée dans 25 % des cas » se lit ;
 * « Sarah conteste Laura » ne se lit pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE
 * ─────────────────────────────────────────────────────────────────────────────
 * Dans la requête du service : la liste SÉLECTIONNÉE et les regroupements ne
 * nomment aucune colonne de personne, d'espace, de compte, de message ni de
 * contenu, et la requête regroupe sur `action_kind` seulement. `workspace_id`
 * peut apparaître dans un FILTRE (exclure les salles de démonstration), jamais
 * dans la liste sélectionnée ni dans un regroupement.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE SAIT PAS VOIR
 * ─────────────────────────────────────────────────────────────────────────────
 * Une lecture qui passerait par un autre fichier que le service. Le corpus est
 * volontairement le seul service qui lit cet agrégat.
 */
const SERVICE = join(__dirname, '..', 'modules', 'analytics', 'reply-contestations.service.ts')

const FORBIDDEN_COLUMNS =
  /\b(user_id|workspace_id|account_id|contact_id|message_id|note|correction_value|correction_field|reply_digest_text)\b/i

type Verdict = { ok: true } | { ok: false; reason: string }

/** Examine UNE requête SQL ; exportée au test pour qu'on puisse la prendre en défaut. */
function judgeContestationSql(sql: string): Verdict {
  const flat = sql.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ')
  const select = /select (.*?) from /i.exec(flat)?.[1] ?? ''
  const groupBy = /group by (.*?)(?: having | order by | limit |$)/i.exec(flat)?.[1] ?? ''
  if (!select) return { ok: false, reason: 'aucune liste SELECT lisible' }
  if (!groupBy) return { ok: false, reason: 'aucun GROUP BY lisible' }
  // Les agrégats `COUNT(DISTINCT reply_digest)` et leur `FILTER (WHERE …)` sont des comptes (une présence de
  // correction se teste, ne se lit pas) ; une colonne de personne ne l'est jamais.
  const selectedOutsideCounts = select.replace(/count\([^)]*\)(\s*filter\s*\([^)]*\))?/gi, '')
  if (FORBIDDEN_COLUMNS.test(selectedOutsideCounts))
    return { ok: false, reason: 'une colonne interdite est sélectionnée' }
  if (FORBIDDEN_COLUMNS.test(groupBy)) return { ok: false, reason: 'un regroupement porte sur une colonne interdite' }
  if (!/^\s*(f\.)?action_kind\s*$/i.test(groupBy)) return { ok: false, reason: 'le regroupement n’est pas la fonction' }
  return { ok: true }
}

describe('GA-412 — les contestations de Laura se comptent par fonction, jamais par personne', () => {
  const source = readFileSync(SERVICE, 'utf8')
  const sqlBlocks = [...source.matchAll(/`([^`]*chat_reply_feedback[^`]*)`/g)].map(match => match[1])

  it('LIT quelque chose : le service porte au moins une requête sur la table', () => {
    expect(sqlBlocks.length).toBeGreaterThan(0)
  })

  it('chaque requête du service respecte la règle', () => {
    for (const sql of sqlBlocks) expect(judgeContestationSql(sql)).toEqual({ ok: true })
  })

  it('sait dire NON : un regroupement par auteur, par espace ou une note sélectionnée sont refusés', () => {
    const base = (select: string, group: string) =>
      `SELECT ${select} FROM chat_reply_feedback f GROUP BY ${group} HAVING COUNT(*) > 1`
    expect(judgeContestationSql(base('f.action_kind, f.user_id', 'f.action_kind, f.user_id')).ok).toBe(false)
    expect(judgeContestationSql(base('f.workspace_id, COUNT(*)', 'f.workspace_id')).ok).toBe(false)
    expect(judgeContestationSql(base('f.action_kind, f.note', 'f.action_kind')).ok).toBe(false)
    expect(judgeContestationSql(base('f.verdict, COUNT(*)', 'f.verdict')).ok).toBe(false)
  })

  it('n’attrape pas ce qu’elle ne vise pas : un filtre sur l’espace et des COUNT sont permis', () => {
    const ok = `SELECT f.action_kind AS tool, COUNT(DISTINCT f.reply_digest) AS replies
      FROM chat_reply_feedback f
      WHERE NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = f.workspace_id AND w.is_demo)
      GROUP BY f.action_kind
      HAVING COUNT(DISTINCT f.reply_digest) >= $2`
    expect(judgeContestationSql(ok)).toEqual({ ok: true })
  })
})
