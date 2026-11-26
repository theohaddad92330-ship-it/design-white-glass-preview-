import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #4595.3 — GA-18 / GA-19 appliqués au back-office : une mesure absente (arrêtée, non branchée, sans donnée) ne se rend
 * JAMAIS « 0 ». La garde lit TOUTES les pages (`app/**\/*.tsx`) et refuse tout repli `?? 0` / `|| 0` : sous
 * `{x ?? 0}`, `value={x['k'] ?? 0}`, `(x ?? 0).toFixed(2)` ou `str(x ?? 0)`, il confond « non mesuré » et « mesuré à
 * zéro ». Le remède est `countOrUnmeasured` / `pctOrUnmeasured` / `usdOrDash` (`lib/mesure.ts`), `null` passé à
 * `KpiTile`, ou ne pas rendre la ligne (une absence ne fait pas une ligne dans une liste).
 *
 * Première version : un motif sur `{ … ?? 0 }` seulement — il ne voyait ni une clé entre guillemets (`x['connexion'] ??
 * 0`, Sécurité) ni un repli sous `.toFixed(`/`str(` (Analyses, Monitoring). Le motif est maintenant la ligne entière.
 *
 * Exceptions nommées, avec leur RAISON : un repli de CALCUL (somme, tri, pagination, saisie de formulaire,
 * comparaison `> 0`) ne rend aucune valeur. Ajouter ici en écrivant pourquoi zéro est VRAI ou pourquoi rien ne
 * s'affiche, jamais pour « faire passer ».
 */
const SRC = join(__dirname, '..')
const EXCEPTIONS: readonly { file: string; fragment: string; reason: string }[] = [
  { file: 'app/produit/laura-tours/page.tsx', fragment: 'parseInt', reason: 'décalage de pagination lu dans l’URL' },
  { file: 'app/queues/page.tsx', fragment: 'parseInt', reason: 'décalage de pagination lu dans l’URL' },
  {
    file: 'app/queues/page.tsx',
    fragment: 'next.offset ?? 0',
    reason: 'paramètre d’URL de pagination, jamais affiché',
  },
  {
    file: 'app/users/[userId]/_components/grant-credits.tsx',
    fragment: '|| 0)',
    reason: 'saisie d’un formulaire, pas une mesure',
  },
  {
    file: 'app/banners/_components/banner-form.tsx',
    fragment: 'priority',
    reason: 'champ de saisie : la priorité par défaut est 0',
  },
  {
    file: 'app/monitoring/_components/cockpit-panel.tsx',
    fragment: '(acc[a.status] ?? 0) + 1',
    reason: 'cumul interne',
  },
  {
    file: 'app/monitoring/_components/cockpit-panel.tsx',
    fragment: 'costUsd ?? 0) -',
    reason: 'clé de tri, jamais affichée',
  },
  {
    file: 'app/monitoring/_components/cockpit-panel.tsx',
    fragment: 'getTime() || 0',
    reason: 'clé de tri, jamais affichée',
  },
  {
    file: 'app/monitoring/_components/cockpit-panel.tsx',
    fragment: '?? 0) > 0',
    reason: 'comparaison : la ligne n’existe que si > 0',
  },
  {
    file: 'app/_components/charts.tsx',
    fragment: 'points.length ?? 0',
    reason: 'taille d’un tableau, calcul de géométrie',
  },
  {
    file: 'app/_components/charts.tsx',
    fragment: 'c.total ?? 0',
    reason: 'borne d’échelle d’un graphique, jamais lue comme un chiffre',
  },
  {
    file: 'app/health/page.tsx',
    fragment: '?? 0) > 0',
    reason: 'comparaison : seule la couleur change, la cellule rend sa propre valeur',
  },
  { file: 'AnalysisContacts.tsx', fragment: 'length ?? 0) > 0', reason: 'comparaison : la ligne n’existe que si > 0' },
  {
    file: 'analysis-shared.tsx',
    fragment: "'filtered') ?? 0",
    reason: 'ne sert qu’à `> 0` : sans filtre nommé, la mention n’est pas rendue',
  },
]

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return name === 'node_modules' ? [] : walk(p)
    return /\.tsx$/.test(p) && !/\.test\./.test(p) ? [p] : []
  })
}

// Tout repli à zéro sur une ligne de page, quelle que soit l'expression qui l'entoure.
const REPLI_A_ZERO = /(\?\?|\|\|)\s*0\b/

describe('une valeur absente ne se rend jamais « 0 » (back-office)', () => {
  const fichiers = walk(join(SRC, 'app'))

  it('LIT quelque chose', () => {
    expect(fichiers.length).toBeGreaterThan(20)
  })

  it('aucune page ne replie une valeur absente sur 0', () => {
    const fautifs = fichiers.flatMap(f => {
      const fichier = f.slice(SRC.length + 1)
      return readFileSync(f, 'utf8')
        .split('\n')
        .map((ligne, i) => ({ n: i + 1, ligne }))
        .filter(
          ({ ligne }) => !ligne.trim().startsWith('//') && !ligne.trim().startsWith('*') && REPLI_A_ZERO.test(ligne),
        )
        .filter(({ ligne }) => !EXCEPTIONS.some(e => fichier.endsWith(e.file) && ligne.includes(e.fragment)))
        .map(({ n, ligne }) => `${fichier}:${n}  ${ligne.trim()}`)
    })
    expect(fautifs).toEqual([])
  })

  it('chaque exception cite sa raison et vise une ligne qui existe encore', () => {
    for (const e of EXCEPTIONS) {
      expect(e.reason.length).toBeGreaterThan(10)
      const trouvee = fichiers.some(
        f => f.slice(SRC.length + 1).endsWith(e.file) && readFileSync(f, 'utf8').includes(e.fragment),
      )
      expect(trouvee, `${e.file} : « ${e.fragment} » n’existe plus, retirer l’exception`).toBe(true)
    }
  })

  it('le motif attrape bien ce qu’il vise', () => {
    expect(REPLI_A_ZERO.test('<td>{w.memberCount ?? 0}</td>')).toBe(true)
    expect(REPLI_A_ZERO.test('value={etat.parEvenement[k] ?? 0}')).toBe(true)
    expect(REPLI_A_ZERO.test("value={etat.parEvenement['connexion'] ?? 0}")).toBe(true)
    expect(REPLI_A_ZERO.test('<td>${(p.costUsd ?? 0).toFixed(4)}</td>')).toBe(true)
    expect(REPLI_A_ZERO.test('P1 {str(tierCounts.P1 ?? 0)}')).toBe(true)
    expect(REPLI_A_ZERO.test('value={countOrUnmeasured(w.memberCount)}')).toBe(false)
    expect(REPLI_A_ZERO.test('value={etat.parEvenement[k] ?? null}')).toBe(false)
  })
})
