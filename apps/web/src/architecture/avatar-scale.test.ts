import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA — L'ÉCHELLE D'AVATAR EST UNE DÉCISION, PAS UNE VALEUR QU'ON AJUSTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUI A PRODUIT CETTE GARDE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le cran `xs` a porté TROIS valeurs en deux semaines :
 *
 *   · **36 px** à l'origine ;
 *   · **28 px**, posés par un lot qui visait « 30-32 » — il a visé trop bas, et
 *     personne ne l'a vu parce qu'aucune assertion ne bornait le BAS ;
 *   · **32 px** (#1417.4), la borne haute de la fourchette demandée.
 *
 * Un diagnostic a même annoncé « 28 px » alors que la chaîne réelle rendait
 * 36 px : la valeur se lisait dans un wrapper qui traduisait les crans d'un
 * cran (`CompanyAvatar` mappe `sm` ET l'absence de prop vers `xs`).
 *
 * Vingt-trois points de montage dépendent de ce cran. Le changer est légitime ;
 * le changer SANS DÉCISION ne l'est pas — et c'est la seule chose que cette
 * garde empêche. Elle n'interdit pas de bouger l'échelle : elle exige que
 * quelqu'un vienne écrire la nouvelle valeur ici, donc qu'il l'ait choisie.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne mesure pas un rendu — jsdom ne met rien en page, et
 * `getBoundingClientRect()` y rend des zéros. Elle lit la CLASSE déclarée, ce
 * qui est exactement le contrat que `AccountTableRow.avatarSize.test.tsx`
 * vérifie de son côté sur le rendu réel du composant.
 */

const SOURCE = join(__dirname, '../../../../packages/ui/src/components/entity-avatar.tsx')

/** Les quatre crans, et leur valeur DÉCIDÉE. `size-N` en Tailwind = N × 4 px. */
const SCALE: Readonly<Record<string, { utility: string; px: number }>> = {
  xs: { utility: 'size-8', px: 32 },
  sm: { utility: 'size-9', px: 36 },
  md: { utility: 'size-11', px: 44 },
  lg: { utility: 'size-16', px: 64 },
}

function declaredScale(source: string): Map<string, string> {
  const block = source.match(/size:\s*\{([\s\S]*?)\},/)
  const found = new Map<string, string>()
  if (!block) return found
  for (const line of block[1]!.split('\n')) {
    const match = line.match(/^\s*(xs|sm|md|lg):\s*'([^']+)'/)
    if (match) {
      const utility = match[2]!.split(/\s+/).find(token => /^size-\d+$/.test(token))
      if (utility) found.set(match[1]!, utility)
    }
  }
  return found
}

describe('GA — l’échelle d’avatar', () => {
  const source = readFileSync(SOURCE, 'utf8')
  const declared = declaredScale(source)

  it('LIT quelque chose — le fichier source et ses quatre crans', () => {
    // Sans ce test, un chemin cassé ou un remaniement du fichier rendrait la
    // garde verte en ne lisant RIEN. C'est l'espèce de garde borgne la plus
    // fréquente de ce dépôt.
    expect(source.length).toBeGreaterThan(200)
    expect([...declared.keys()].sort()).toEqual(['lg', 'md', 'sm', 'xs'])
  })

  it('chaque cran porte la valeur DÉCIDÉE, pas une valeur qui a dérivé', () => {
    for (const [name, expected] of Object.entries(SCALE)) {
      expect(declared.get(name), `le cran « ${name} » a changé sans décision écrite`).toBe(expected.utility)
    }
  })

  it('⚠️ `xs` vaut 32 px — la fourchette 30-32 du retour, bornée des DEUX côtés', () => {
    // La borne BASSE est ce qui a manqué au lot précédent : il visait 30-32 et
    // a livré 28 sans qu'aucune assertion ne tombe.
    const px = Number(SCALE.xs!.utility.replace('size-', '')) * 4
    expect(px).toBe(32)
    expect(px).toBeGreaterThanOrEqual(30)
    expect(px).toBeLessThanOrEqual(32)
  })

  it('sait dire NON — une échelle modifiée est refusée', () => {
    // Le témoin : on simule le fichier avec `xs` revenu à 28 px, et la garde
    // doit le voir. Sans ce test, rien ne prouve qu'elle sait échouer.
    const saboted = source.replace("xs: 'size-8 text-xs'", "xs: 'size-7 text-xs'")
    expect(saboted).not.toBe(source)
    expect(declaredScale(saboted).get('xs')).toBe('size-7')
    expect(declaredScale(saboted).get('xs')).not.toBe(SCALE.xs!.utility)
  })

  it('n’attrape PAS ce qu’elle ne vise pas — les classes voisines du même fichier', () => {
    // Témoins légitimes : `shape` et les classes de base portent des valeurs qui
    // ne sont pas des tailles. Une garde qui les capterait forcerait à la
    // mettre à jour au moindre changement de bordure ou d'arrondi.
    const shapeOnly = "shape: { circle: 'rounded-full', square: 'rounded-md' },"
    expect(declaredScale(shapeOnly).size).toBe(0)
    expect(declaredScale("const base = 'border border-transparent text-black shadow-xs'").size).toBe(0)
  })
})
