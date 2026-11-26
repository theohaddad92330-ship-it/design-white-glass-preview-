import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Avertissement 1 (ORION V12) — un chunk `GARDE_FOU_QUALITE`, ou tout chunk
 * `account_id IS NULL`, N'EST JAMAIS exclu d'une recherche scopée à un compte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Les 20 chunks `GARDE_FOU_QUALITE` du pack (les alertes qualité — corrections
 * jamais propagées, agrégat gonflé, score invalidé par manque de donnée…) ont
 * `account_id = ''` PAR CONSTRUCTION : mesuré 20/20. Une recherche RAG scopée
 * à un compte (« que sait-on d'Enedis ? ») qui filtrerait strictement sur
 * `account_id = filter_account_id` les ferait TOUTES disparaître — l'alerte
 * n'atteindrait jamais la réponse, exactement le défaut que le pack lui-même
 * documente (AN-001 : des affirmations invalidées toujours servies comme des
 * faits).
 *
 * La fonction `match_dataforge_rag_chunks` (migration
 * `1791510100000-OrionRagChunksVectorSearch.ts`) porte donc une clause `OR`
 * qui les réintègre TOUJOURS, avant même de calculer une distance cosinus —
 * une garantie STRUCTURELLE, pas un espoir de similarité sémantique.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE GARDE PLUTÔT QU'UN TEST DE COMPORTEMENT SEUL
 * ─────────────────────────────────────────────────────────────────────────────
 * Le pack réel (172 Mo) n'est jamais commité — aucun test ne peut charger de
 * vraies lignes en CI. Cette garde lit le SQL de la migration et prouve que la
 * clause de sauvegarde existe TEXTUELLEMENT, avec une preuve qu'elle sait dire
 * NON (une version mutée, sans la clause, est détectée par la même fonction).
 */

const MIGRATION_PATH = join(__dirname, '..', 'migrations', '1791510100000-OrionRagChunksVectorSearch.ts')

/** Le WHERE de la fonction contient-il les DEUX clauses de sauvegarde ? */
function hasGuardFouSafeguard(sql: string): boolean {
  const hasNullAccountClause = /account_id\s+IS\s+NULL/i.test(sql)
  const hasGuardFouTypeClause = /type_chunk\s*=\s*'GARDE_FOU_QUALITE'/i.test(sql)
  return hasNullAccountClause && hasGuardFouTypeClause
}

describe('ORION V12 — les chunks garde-fou restent joignables quel que soit le compte demandé', () => {
  const source = readFileSync(MIGRATION_PATH, 'utf8')

  it('lit un corpus non vide — la migration existe et déclare bien la fonction', () => {
    expect(source.length).toBeGreaterThan(200)
    expect(source).toContain('match_dataforge_rag_chunks')
  })

  it('la fonction pgvector porte les deux clauses de sauvegarde (compte NULL, type garde-fou)', () => {
    expect(hasGuardFouSafeguard(source)).toBe(true)
  })

  it('le filtre compte reste un OR — jamais un AND qui les exclurait quand même', () => {
    // `filter_account_id IS NULL OR c.account_id = filter_account_id OR c.account_id IS NULL OR c.type_chunk = ...`
    // — toute la clause de compte doit être un OR unique, pas une conjonction
    // qui neutraliserait la sauvegarde dès qu'un filtre est posé.
    const whereMatch = source.match(/WHERE([\s\S]*?)AND\s+1\s*-\s*\(c\.embedding/i)
    expect(whereMatch).not.toBeNull()
    const wherePredicate = whereMatch?.[1] ?? ''
    expect(wherePredicate).toContain('OR')
    expect(wherePredicate).not.toMatch(/account_id\s+IS\s+NULL\s*\)\s*AND/i)
  })

  it('la garde sait dire NON — une fonction MUTÉE sans la clause de sauvegarde est détectée', () => {
    const mutated = source
      .replace(/c\.account_id\s+IS\s+NULL/gi, '')
      .replace(/type_chunk\s*=\s*'GARDE_FOU_QUALITE'/gi, '')
    expect(hasGuardFouSafeguard(mutated)).toBe(false)
    // Preuve que la mutation a RÉELLEMENT retiré du texte, pas juste échoué à matcher.
    expect(mutated.length).toBeLessThan(source.length)
  })

  it('le reranking place la priorité 0 (preuve/garde-fou) avant la distance cosinus', () => {
    expect(source).toMatch(/priorite_indexation\s*=\s*0\)\s*DESC/i)
  })
})
