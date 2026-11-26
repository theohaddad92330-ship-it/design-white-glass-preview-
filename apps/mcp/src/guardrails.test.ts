import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GUARDRAIL_ARCHIVE_EXCEPTION, GUARDRAIL_INSTRUCTIONS, GUARDRAIL_ITEMS } from './guardrails.js'

/**
 * Retour bêta #3424 (ENG-1797) — la liste EXACTE des dix-neuf pratiques que
 * Bellum ne doit jamais produire ni encourager, côté MCP (l'assistant IA
 * EXTERNE d'un commercial, hors du prompt de Laura). Une garde qui vérifie
 * une sous-chaîne dans un fichier ne prouve rien si elle ne lit pas le VRAI
 * mot-clé du retour — chaque item ci-dessous est le mot-clé exact du corps de
 * l'issue, pas une paraphrase qui passerait même si la liste régressait.
 */
const KEYWORDS_FROM_ISSUE = [
  'CV',
  'compétence',
  'témoignage',
  'client',
  'relation',
  'référencement',
  'projet',
  'recommandation',
  'urgence',
  'spam',
  'illégal',
  'rang 2',
  'refus de contact',
  'données privées',
  'action externe',
  'exécution',
  'juridique',
  'conformité',
  'chiffre de résultat',
]

describe('garde-fous non négociables — surface MCP (#3424)', () => {
  it('couvre les dix-neuf pratiques refusées, une par mot-clé du retour', () => {
    expect(GUARDRAIL_ITEMS.length).toBe(19)
    for (const keyword of KEYWORDS_FROM_ISSUE) {
      const hit = GUARDRAIL_ITEMS.some(item => item.includes(keyword))
      expect(hit, `aucun item de GUARDRAIL_ITEMS ne couvre « ${keyword} »`).toBe(true)
    }
  })

  it('nomme l’exception d’archive, jamais une levée générale de l’interdit', () => {
    expect(GUARDRAIL_INSTRUCTIONS).toContain(GUARDRAIL_ARCHIVE_EXCEPTION)
    expect(GUARDRAIL_ARCHIVE_EXCEPTION).toContain('archivé')
    expect(GUARDRAIL_ARCHIVE_EXCEPTION).toContain('instruction active')
  })

  it('main.ts branche réellement ces instructions sur le McpServer — pas seulement importées', () => {
    const source = readFileSync(join(__dirname, 'main.ts'), 'utf8')
    expect(source).toContain("from './guardrails.js'")
    expect(source).toMatch(/new McpServer\([\s\S]*?instructions:\s*GUARDRAIL_INSTRUCTIONS/)
  })
})
