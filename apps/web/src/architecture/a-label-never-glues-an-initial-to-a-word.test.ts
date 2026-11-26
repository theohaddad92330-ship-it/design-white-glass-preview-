import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #4659 — un libellé ne colle jamais une majuscule isolée à un mot capitalisé (« AOuvert », « EDupont »).
 *
 * Mesuré en prod le 27/10/2026 : la pastille Relation écrivait « AOuvert » sur 12 lignes sur 12 — une initiale et un
 * statut concaténés sans séparateur. Le correctif de la pastille (`AccountTableRow`) tient l'écart par un `gap-1` ;
 * cette garde attrape la FAMILLE côté texte : elle lit TOUS les textes des locales (fr + en) et refuse le motif
 * « une majuscule, puis une majuscule, puis des minuscules » en début de mot. Les sigles (« CRM », « HubSpot »,
 * « TJM ») ne le portent pas : ils n'ont pas de minuscules après la deuxième majuscule, ou commencent par une
 * minuscule. Elle sait dire NON : le contrôle négatif prouve qu'elle attrape la pastille et épargne la phrase.
 */
const LOCALES = join(__dirname, '..', 'i18n', 'locales')

const GLUED_INITIAL = /(?<![\p{L}\p{N}])\p{Lu}(?=\p{Lu}\p{Ll}{2,})/u

/** Les noms propres CamelCase qui commencent par deux majuscules : un nom, pas une initiale collée. */
const PROPER_NAMES = /\bOAuth/g

function gluesInitialToWord(text: string): boolean {
  // `{{interpolation}}` et balises `<0>…</0>` ne sont pas du texte rendu tel quel.
  const rendered = text
    .replace(/\{\{[^}]*\}\}/g, ' ')
    .replace(/<\/?\w+>/g, ' ')
    .replace(PROPER_NAMES, ' ')
  return GLUED_INITIAL.test(rendered)
}

function leaves(node: unknown, path: string, out: Array<[string, string]>): void {
  if (typeof node === 'string') out.push([path, node])
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) leaves(value, `${path}.${key}`, out)
  }
}

function allLabels(): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const lang of readdirSync(LOCALES)) {
    for (const file of readdirSync(join(LOCALES, lang)).filter(name => name.endsWith('.json'))) {
      leaves(JSON.parse(readFileSync(join(LOCALES, lang, file), 'utf8')), `${lang}/${file}`, out)
    }
  }
  return out
}

describe('a label never glues an initial to a word (#4659)', () => {
  it('lit réellement les locales', () => {
    expect(allLabels().length).toBeGreaterThan(1000)
  })

  it('sait dire NON : attrape « AOuvert », épargne la phrase et le sigle', () => {
    expect(gluesInitialToWord('AOuvert')).toBe(true)
    expect(gluesInitialToWord('Relation : EDupont')).toBe(true)
    expect(gluesInitialToWord('A Ouvert')).toBe(false)
    expect(gluesInitialToWord('Ouvert')).toBe(false)
    expect(gluesInitialToWord('CRM HubSpot')).toBe(false)
    expect(gluesInitialToWord('{{count}} Comptes')).toBe(false)
    expect(gluesInitialToWord('Connexion OAuth2')).toBe(false)
  })

  it('aucun libellé ne colle une majuscule isolée à un mot capitalisé', () => {
    const offenders = allLabels().filter(([, text]) => gluesInitialToWord(text))
    expect(offenders.map(([path, text]) => `${path} → ${text.slice(0, 60)}`)).toEqual([])
  })
})
