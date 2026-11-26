import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-235 — UN `keyPrefix` NEUTRALISE LE PRÉFIXE DE NAMESPACE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT, MESURÉ À L'ÉCRAN EN PRODUCTION LE 31/08/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * Le tiroir du planificateur d'enrichissement affichait un bouton libellé
 * **`actions.cancel`** — la clé BRUTE, en production, à côté d'un bouton
 * « Lancer » qui débite des crédits.
 *
 * La cause n'est pas une clé manquante : `common:actions.cancel` existe en FR
 * (« Annuler ») et en EN (« Cancel »). C'est que le composant déclarait
 *
 *     useTranslation('accountOrg', { keyPrefix: 'enrichmentPlanner' })
 *
 * puis appelait `t('common:actions.cancel')`. **Avec un `keyPrefix`, i18next
 * n'interprète plus le `namespace:` du début** : il cherche
 * `accountOrg:enrichmentPlanner.common:actions.cancel`, ne trouve rien, et rend
 * la clé telle quelle.
 *
 * Le motif correct est un SECOND `t`, comme
 * `DeleteAccountDialog.tsx:31-32` le fait déjà :
 *
 *     const { t } = useTranslation('settings', { keyPrefix: 'security' })
 *     const { t: tCommon } = useTranslation('common')
 *
 * ⚠️ Pourquoi une garde plutôt qu'un test de rendu : le défaut est INVISIBLE en
 * test tant que personne ne rend CE bouton-là, et il se recrée à chaque nouveau
 * composant qui adopte `keyPrefix` — c'est une classe, pas un incident. Le
 * dépôt a déjà payé « sept gestes de facturation en clé i18n BRUTE en
 * production ».
 */

const SRC = join(__dirname, '..')

/** Les fichiers de composants — pas les tests, pas les gardes. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'architecture' || entry === 'node_modules') continue
      sourceFiles(full, out)
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

/** ⚠️ Un commentaire cite ; il ne rend rien. Ce fichier-ci en est la preuve. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * Le fichier déclare-t-il un `keyPrefix` ET appelle-t-il un `t('ns:…')` sur le
 * `t` qui en vient ?
 *
 * On ne cherche PAS tous les `t('ns:…')` : sans `keyPrefix` ils sont corrects
 * et massivement utilisés dans le dépôt. C'est la COMBINAISON qui casse.
 *
 * Le `t` renommé (`const { t: tCommon } = useTranslation('common')`) est le
 * remède : on ne compte donc que les appels au `t` NU.
 */
function hasNamespacedCallUnderKeyPrefix(source: string): boolean {
  const clean = stripComments(source)
  if (!/useTranslation\([^)]*keyPrefix\s*:/.test(clean)) return false
  return /\bt\(\s*['"][a-zA-Z][a-zA-Z0-9]*:/.test(clean)
}

describe('GA-235 — la garde lit bien quelque chose', () => {
  it('le balayage voit un corpus non vide', () => {
    expect(sourceFiles(SRC).length).toBeGreaterThan(500)
  })

  it('le dépôt contient bien des composants à `keyPrefix` — sinon il n’y a rien à garder', () => {
    const withPrefix = sourceFiles(SRC).filter(file =>
      /useTranslation\([^)]*keyPrefix\s*:/.test(stripComments(readFileSync(file, 'utf8'))),
    )
    expect(withPrefix.length).toBeGreaterThan(0)
  })
})

describe('GA-235 — la garde sait dire NON', () => {
  it('repère la forme EXACTE du défaut du 31/08/2026', () => {
    const faulty = `
      const { t } = useTranslation('accountOrg', { keyPrefix: 'enrichmentPlanner' })
      return <Button>{t('common:actions.cancel')}</Button>
    `
    expect(hasNamespacedCallUnderKeyPrefix(faulty)).toBe(true)
  })

  it('laisse passer le remède — un SECOND `t` sur le namespace commun', () => {
    const fixed = `
      const { t } = useTranslation('accountOrg', { keyPrefix: 'enrichmentPlanner' })
      const { t: tCommon } = useTranslation('common')
      return <Button>{tCommon('actions.cancel')}</Button>
    `
    expect(hasNamespacedCallUnderKeyPrefix(fixed)).toBe(false)
  })

  it("laisse passer un `t('ns:…')` SANS `keyPrefix` — là il est correct", () => {
    const fine = `
      const { t } = useTranslation('accountOrg')
      return <Button>{t('common:actions.cancel')}</Button>
    `
    expect(hasNamespacedCallUnderKeyPrefix(fine)).toBe(false)
  })

  it('lit les commentaires comme des commentaires', () => {
    const commented = `
      const { t } = useTranslation('accountOrg', { keyPrefix: 'enrichmentPlanner' })
      // Avant : t('common:actions.cancel')
      const { t: tCommon } = useTranslation('common')
      return <Button>{tCommon('actions.cancel')}</Button>
    `
    expect(hasNamespacedCallUnderKeyPrefix(commented)).toBe(false)
  })
})

describe('GA-235 — aucun écran ne rend une clé brute par ce chemin', () => {
  it("aucun composant à `keyPrefix` n’appelle `t('namespace:…')`", () => {
    const offenders = sourceFiles(SRC)
      .filter(file => hasNamespacedCallUnderKeyPrefix(readFileSync(file, 'utf8')))
      .map(file => file.replace(`${SRC}/`, ''))
    expect(offenders).toEqual([])
  })
})
