import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #2454.3 (LAU-FINAL-167) — la chip « Contexte » ne s'ajoute PAS
 * artificiellement là où le profil ne joue pas : facture, paiement, écran
 * administratif, lecture d'une mission enregistrée.
 *
 * La garde tient la liste EXACTE des écrans qui posent `<SurfaceContextChip` :
 * chacun a un résultat qui dépend réellement du profil vendeur (Découvrir le
 * lit pour classer ; Analyser pour personnaliser le dossier). Ajouter un écran
 * se fait ICI, en l'écrivant — pas en silence.
 */
const WEB_SRC = join(__dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry)) out.push(path)
  }
  return out
}

/** Les écrans qui POSENT la chip — le composant lui-même n'en fait pas partie. */
const ALLOWED = [
  'features/analysis-batches/view/NewAnalysisBatch.tsx',
  // #4530.6 (Louis 24/10) — Découvrir n'a plus la chip : « Ma cible » (bouton bascule) la remplace.
  // Refonte Théo R1 : le choix « Mon activité / Neutre » vit dans la fenêtre « Personnalisation » du cadrage.
  'features/search/components/CadrageColumn.tsx',
]

/** Les familles d'écrans où le résultat ne dépend pas du profil (texte de l'issue). */
const FORBIDDEN = [/billing/i, /payment/i, /invoice/i, /factur/i, /backoffice/i, /admin/i, /missions\//i]

function chipHosts(files: { path: string; source: string }[]): string[] {
  return files
    .filter(file => file.source.includes('<SurfaceContextChip'))
    .map(file => file.path)
    .filter(path => !path.endsWith('SurfaceContextChip.tsx'))
    .sort()
}

describe('#2454.3 — la chip « Contexte » est posée seulement où le profil joue', () => {
  const files = walk(WEB_SRC).map(path => ({ path: relative(WEB_SRC, path), source: readFileSync(path, 'utf8') }))
  const hosts = chipHosts(files)

  it('la garde LIT le dépôt : le composant existe et au moins un écran le pose', () => {
    expect(files.some(file => file.path.endsWith('context-contract/view/SurfaceContextChip.tsx'))).toBe(true)
    expect(hosts.length).toBeGreaterThan(0)
  })

  it('la liste des écrans hôtes est EXACTE', () => {
    expect(hosts).toEqual(ALLOWED)
  })

  it('aucun écran de facture, paiement, administration ou mission ne la pose', () => {
    expect(hosts.filter(path => FORBIDDEN.some(pattern => pattern.test(path)))).toEqual([])
  })

  it('la garde sait dire NON : un écran de facturation qui la poserait est attrapé', () => {
    const planted = chipHosts([
      { path: 'features/billing/view/Invoices.tsx', source: '<SurfaceContextChip surface="discover" />' },
    ])
    expect(planted.filter(path => FORBIDDEN.some(pattern => pattern.test(path)))).toEqual([
      'features/billing/view/Invoices.tsx',
    ])
  })
})
