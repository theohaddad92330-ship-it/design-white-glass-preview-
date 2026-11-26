import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Écart figma-sync — `SettingsRow` n'avait AUCUNE règle responsive : le
 * libellé et le contrôle (`trailing`) partageaient la même ligne (`flex`,
 * `items-center justify-between`) à toutes les largeurs, y compris sous 768px
 * (la seule borne du design system, §8) — un libellé long ou un contrôle
 * large s'y écrasaient l'un l'autre.
 *
 * Le correctif : `flex-col` par défaut (le libellé passe AU-DESSUS), et
 * `md:flex-row md:items-center md:justify-between md:gap-4` qui restaure
 * EXACTEMENT le rendu d'avant à partir de 768px — rien ne bouge au-delà.
 */

const UI_SRC = join(__dirname, '..')

function readSource(): string {
  return readFileSync(join(UI_SRC, 'molecules/settings-row.tsx'), 'utf8')
}

function classNameBlock(source: string): string {
  const match = source.match(/className=\{cn\(([\s\S]*?)\)\}/)
  if (!match) throw new Error('className cn(...) introuvable dans SettingsRow')
  return match[1]
}

describe('SettingsRow : le libellé passe au-dessus du contrôle sous 768px', () => {
  it('empile par défaut (flex-col, items-start) — pas de règle responsive avant ce correctif', () => {
    const block = classNameBlock(readSource())
    expect(block, block).toMatch(/\bflex-col\b/)
    expect(block, block).toMatch(/\bitems-start\b/)
  })

  it('restaure EXACTEMENT le rendu d’avant à partir de 768px (md:)', () => {
    const block = classNameBlock(readSource())
    for (const token of ['md:flex-row', 'md:items-center', 'md:justify-between', 'md:gap-4']) {
      expect(block, `${token} manquant dans : ${block}`).toMatch(new RegExp(`\\b${token.replace(':', '\\:')}\\b`))
    }
  })

  it('une seule borne — jamais sm:/lg:/xl: introduite ici (§8 : une seule borne, 768px)', () => {
    const block = classNameBlock(readSource())
    expect(block).not.toMatch(/\b(sm|lg|xl|2xl):/)
  })
})
