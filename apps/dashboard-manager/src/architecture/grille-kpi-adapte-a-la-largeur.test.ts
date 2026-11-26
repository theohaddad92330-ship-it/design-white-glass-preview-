import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Les grilles de KPI (changelog, clients, couts, facturation, impersonations,
 * analysis/[id], teams/[id], revenus, monitoring, produit/laura-non-compris…)
 * écrivaient `style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}` en INLINE sur
 * un `<section className="cards">` — ou, pour `.kpis`
 * (produit/laura-non-compris), sur une classe qui n'avait AUCUNE règle CSS du
 * tout. Un style inline est TOUJOURS plus spécifique qu'une règle en media
 * query : la reprise mobile de `.cards` (une colonne sous 768px, posée par
 * #1674.9) ne s'appliquait donc JAMAIS sur ces pages, qui restaient à 4
 * colonnes égales quelle que soit la largeur.
 *
 * Le correctif : une classe partagée, `.kpi-grid`, posée une seule fois dans
 * `globals.css` — 4 colonnes par défaut, 3 sous 1280px, 1 sous 768px — et
 * plus aucun `gridTemplateColumns` de grille de KPI écrit en JSX.
 *
 * POURQUOI UNE LISTE NOMMÉE ET PAS UN COMPTE (cf. couleurs-passent-par-un-token.test.ts)
 * `banner-form.tsx` écrit aussi `repeat(4, 1fr)`, deux fois — mais pour une
 * grille de CHAMPS de formulaire (Type / Style / …), pas une grille de KPI :
 * hors périmètre de ce lot. La lister nommément, avec sa raison, évite qu'un
 * compte plafonné laisse passer l'échange d'une vraie régression contre elle.
 */

const SRC = fileURLToPath(new URL('../', import.meta.url))
const GLOBALS = fileURLToPath(new URL('../app/globals.css', import.meta.url))

const REPEAT_4 = /repeat\(4,\s*(?:minmax\(0,\s*1fr\)|1fr)\)/g

/** Fichiers où `repeat(4, ...)` inline est LÉGITIME : pas une grille de KPI. */
const EXCEPTIONS: Record<string, number> = {
  // Grille de champs de formulaire (Type, Style, Icône, CTA…), pas des
  // chiffres de tête — hors périmètre de la garde ci-dessous.
  'app/banners/_components/banner-form.tsx': 2,
}

function blocDe(css: string, marqueur: string): string {
  const debut = css.indexOf(marqueur)
  if (debut === -1) return ''
  const debutAccolade = css.indexOf('{', debut)
  let profondeur = 0
  for (let i = debutAccolade; i < css.length; i++) {
    if (css[i] === '{') profondeur++
    else if (css[i] === '}') {
      profondeur--
      if (profondeur === 0) return css.slice(debutAccolade, i + 1)
    }
  }
  return css.slice(debutAccolade)
}

function fichiersTsx(dir: string, out: string[] = []): string[] {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree)
    if (statSync(chemin).isDirectory()) fichiersTsx(chemin, out)
    else if (entree.endsWith('.tsx') && !entree.endsWith('.test.tsx')) out.push(chemin)
  }
  return out
}

function releve(): Record<string, number> {
  const trouve: Record<string, number> = {}
  for (const chemin of fichiersTsx(SRC)) {
    const contenu = readFileSync(chemin, 'utf8')
    const trouvailles = contenu.match(REPEAT_4)
    if (!trouvailles) continue
    trouve[relative(SRC, chemin)] = trouvailles.length
  }
  return trouve
}

describe('une grille de KPI s’adapte à la largeur — jamais en `repeat(4, …)` inline', () => {
  it('LIT quelque chose — le corpus de .tsx n’est pas vide', () => {
    expect(fichiersTsx(SRC).length).toBeGreaterThan(50)
  })

  it('LIT vraiment — `.kpi-grid` existe dans globals.css avec ses trois paliers', () => {
    const css = readFileSync(GLOBALS, 'utf8')
    expect(css).toContain('.kpi-grid {')
    expect(blocDe(css, '.kpi-grid {')).toMatch(/grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/)

    const bloc1280 = blocDe(css, '@media (max-width: 1280px)')
    expect(bloc1280).toContain('.kpi-grid {')
    expect(blocDe(bloc1280, '.kpi-grid {')).toMatch(/grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)

    const bloc768 = blocDe(css, '@media (max-width: 768px)')
    expect(bloc768).toContain('.kpi-grid {')
    expect(blocDe(bloc768, '.kpi-grid {')).toMatch(/grid-template-columns:\s*1fr/)
  })

  it('sait dire NON — une feuille sans `.kpi-grid` est vue comme telle', () => {
    const fabrique = '.cards { grid-template-columns: repeat(3, 1fr); }'
    expect(fabrique).not.toContain('.kpi-grid {')
  })

  it('dit NON à tout nouveau `repeat(4, 1fr)` inline hors des exceptions nommées', () => {
    const trouve = releve()
    const inattendus: string[] = []
    for (const [fichier, compte] of Object.entries(trouve)) {
      const permis = EXCEPTIONS[fichier] ?? 0
      if (compte > permis) {
        inattendus.push(`${fichier} — repeat(4, …) × ${compte} (autorisé : ${permis})`)
      }
    }
    expect(inattendus).toEqual([])
  })

  it('n’attrape pas ce qu’elle ne vise pas — l’exception nommée reste tolérée telle quelle', () => {
    const trouve = releve()
    expect(trouve['app/banners/_components/banner-form.tsx']).toBe(
      EXCEPTIONS['app/banners/_components/banner-form.tsx'],
    )
  })
})
