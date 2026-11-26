import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { startsWithFieldKey } from '@bellum/contracts'

/**
 * #4655 — un libellé de l'interface ne commence jamais par une CLÉ technique (`lowerCamelCase:`).
 *
 * Mesuré en prod le 27/10/2026 : « Ton angle » arrivait prérempli avec `prioritizationReason: Commencer par…`.
 * L'utilisateur lit la phrase, jamais le nom du champ qui la transporte. Le gabarit qui fuit sert ailleurs : la
 * garde lit TOUS les textes des locales (fr + en) et refuse le motif. Elle sait dire NON : le contrôle négatif
 * ci-dessous prouve qu'elle attrape la clé, et qu'elle ne s'en prend ni à une phrase ni à une heure.
 */
const LOCALES = join(__dirname, '..', 'i18n', 'locales')

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

describe('a label never starts with a field key (#4655)', () => {
  it('lit réellement les locales', () => {
    expect(allLabels().length).toBeGreaterThan(1000)
  })

  it('sait dire NON : attrape la clé, épargne la phrase', () => {
    expect(startsWithFieldKey('prioritizationReason: Commencer par vérifier')).toBe(true)
    expect(startsWithFieldKey('Rendez-vous à 10:30')).toBe(false)
    expect(startsWithFieldKey('Priorité: forte')).toBe(false)
  })

  it('aucun libellé ne commence par `identifiantCamelCase:`', () => {
    const offenders = allLabels().filter(([, text]) => startsWithFieldKey(text))
    expect(offenders.map(([path, text]) => `${path} → ${text.slice(0, 50)}`)).toEqual([])
  })
})
