import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import fr from '../i18n/locales/fr/chat.json'
import en from '../i18n/locales/en/chat.json'

/**
 * #3764 / #3861 (Louis, 11/10 nuit) — LA LIGNE « COMPLÉTUDE » N'EST JAMAIS AFFICHÉE SOUS UNE RÉPONSE DE LAURA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ARBITRAGE, ET CE QUE LA GARDE TIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * #3861.3 voulait une ligne « Complétude : partielle — N sources non consultées : <noms> » ;
 * #3764 voulait qu'« Incomplet », « Complétude partielle » et « Qualification complémentaire
 * nécessaire » ne disent pas trois fois la même chose. #3764 gagne : le fait (des sources non
 * consultées) se dit UNE fois, par le badge nommé « Qualification complémentaire nécessaire »
 * (qui porte les noms) et par le panneau « Voir la source ». Aucune ligne, aucune pastille
 * « Complétude » / « Incomplet » / « Très partiel » ne la redit.
 *
 * Elle ne vise PAS la carte `account_map`, dont l'en-tête porte son propre niveau (« Cartographie
 * partielle », contenu de la carte écrit par le modèle) : ce niveau-là est un badge de #3764.
 *
 * GA-26 : `ReplySourceBasis` (la ligne de fondement) et `ReplySourcesFooter` (son double dans
 * reply-kit) sont absorbés par `ReplyContextChips` / `ReplyMetaRow` : aucun des deux noms
 * n'existe plus, rien n'apparaît deux fois sous la même forme.
 */

const WEB_SRC = join(__dirname, '..')
const CHAT_VIEW = join(WEB_SRC, 'features/chat/view')

type Json = { [key: string]: Json | string }

/** Les clés d'un objet JSON, à plat, sous la forme `a.b.c`. */
function flatKeys(node: Json | string, prefix = ''): string[] {
  if (typeof node === 'string') return [prefix]
  return Object.entries(node).flatMap(([key, value]) => flatKeys(value, prefix ? `${prefix}.${key}` : key))
}

/** Ce que la garde appelle « une étiquette de complétude » dans les libellés. */
const COMPLETENESS_KEY =
  /(^|\.)(provenance\.basis\.(completeness|complete|partial|partialMissing)|replyBadges\.completeness)/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

describe('la ligne « Complétude » sous une réponse de Laura', () => {
  it.each([
    ['fr', fr],
    ['en', en],
  ])('%s : aucun libellé de complétude n’existe dans le catalogue du chat', (_lang, catalogue) => {
    const keys = flatKeys(catalogue as unknown as Json)
    expect(keys.filter(key => COMPLETENESS_KEY.test(key))).toEqual([])
  })

  it('aucune source du chat ne lit un libellé de complétude ni ne pose une pastille « completeness »', () => {
    const files = sourceFiles(CHAT_VIEW)
    // La garde LIT quelque chose : le dossier du chat n'est pas vide.
    expect(files.length).toBeGreaterThan(40)
    const offenders = files.filter(file => {
      const text = readFileSync(file, 'utf8')
      return /provenance\.basis\.(completeness|complete|partial)|replyBadges\.completeness|completeness-\$\{/.test(text)
    })
    expect(offenders.map(file => relative(WEB_SRC, file))).toEqual([])
  })

  it('GA-26 : ReplySourceBasis et ReplySourcesFooter n’existent plus (absorbés par reply-kit)', () => {
    expect(existsSync(join(CHAT_VIEW, 'ReplySourceBasis.tsx'))).toBe(false)
    const notices = readFileSync(join(CHAT_VIEW, 'reply-kit/notices.tsx'), 'utf8')
    expect(notices).not.toMatch(/export function ReplySourcesFooter/)
  })

  it('sait dire NON : le motif attrape une clé de complétude et laisse passer le reste', () => {
    expect(COMPLETENESS_KEY.test('provenance.basis.completeness')).toBe(true)
    expect(COMPLETENESS_KEY.test('provenance.basis.partialMissing_other')).toBe(true)
    expect(COMPLETENESS_KEY.test('replyBadges.completeness.partial')).toBe(true)
    expect(COMPLETENESS_KEY.test('replyBadges.status.mapping_partial')).toBe(false)
    expect(COMPLETENESS_KEY.test('provenance.basis.certainty')).toBe(false)
    expect(COMPLETENESS_KEY.test('blocks.mapCompleteness')).toBe(false)
  })
})
