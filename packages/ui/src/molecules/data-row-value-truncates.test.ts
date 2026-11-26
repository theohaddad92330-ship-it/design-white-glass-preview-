import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Écart figma-sync — `DataRow` : le libellé est `shrink-0` (il doit rester
 * lisible en entier), mais rien en face n'acceptait de rétrécir sous sa
 * largeur de contenu (`min-width: auto`, le défaut d'un enfant de flex,
 * cause racine documentée au §8 du design system). Sur 360px, une valeur
 * longue débordait au lieu de se tronquer.
 *
 * Le correctif : le conteneur de la valeur devient `min-w-0 flex-1` (il
 * absorbe l'espace restant ET accepte de rétrécir), et le texte de la
 * valeur porte `truncate` (que `Text` de `packages/ui` reconnaît déjà comme
 * une des 4 échappatoires à sa largeur de lecture — voir `atoms/text.tsx`,
 * `callerSetsWidth`).
 */

const UI_SRC = join(__dirname, '..')

function readSource(): string {
  return readFileSync(join(UI_SRC, 'molecules/data-row.tsx'), 'utf8')
}

describe('DataRow : la valeur se tronque sur 360px au lieu de déborder', () => {
  it('le libellé reste shrink-0 (jamais tronqué)', () => {
    expect(readSource()).toMatch(/text-\[var\(--bellum-text-secondary\)\] shrink-0/)
  })

  it('le conteneur de la valeur accepte de rétrécir (min-w-0) et absorbe l’espace restant (flex-1)', () => {
    const source = readSource()
    const box = source.match(/<Box display="flex" className="([^"]*)">\s*\{typeof value/)
    expect(box, 'le Box qui enveloppe value + action').not.toBeNull()
    const classes = box ? box[1] : ''
    expect(classes, `classes du conteneur valeur : "${classes}"`).toMatch(/\bmin-w-0\b/)
    expect(classes, `classes du conteneur valeur : "${classes}"`).toMatch(/\bflex-1\b/)
  })

  it('le texte de la valeur (cas string) porte truncate — reconnu par Text comme échappatoire à sa largeur de lecture', () => {
    const source = readSource()
    const valueTextBlock = source.match(/weight="medium"\s+element="span"[\s\S]{0,200}?>/)
    expect(valueTextBlock, 'le <Text> de la valeur string').not.toBeNull()
    expect(valueTextBlock?.[0] ?? '').toMatch(/\btruncate\b/)
  })
})
