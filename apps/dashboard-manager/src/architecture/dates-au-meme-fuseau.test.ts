import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GARDE — une date de la console se formate dans SON fuseau, jamais dans celui
 * de la machine qui la rend (#1668 §4.2).
 *
 * LE DÉFAUT QU'ELLE EMPÊCHE DE REVENIR
 * Vercel rend en UTC, l'opérateur lit à Paris. Un `toLocaleString('fr-FR')` sans
 * `timeZone` produit donc deux chaînes différentes pour le même instant. Dans un
 * composant client, cette chaîne est produite deux fois — au serveur puis à
 * l'hydratation — et React voit un texte qui ne correspond pas : ce sont les
 * erreurs **#418 / #423 / #425** mesurées en production le 07/09/2026 sur `/`,
 * `/feedback` et `/banners`. Sur les pages purement serveur, le même oubli ne
 * casse rien de visible et fait pire : il affiche des heures UTC sans le dire.
 *
 * ⚠️ POURQUOI UNE GARDE DE SOURCE ET UNE MESURE, PAS L'UNE SANS L'AUTRE.
 * `src/lib/dates.test.ts` mesure le comportement en basculant `TZ` — c'est elle
 * qui prouve que le mécanisme marche. Celle-ci empêche le prochain écran de
 * REFAIRE la dérivation à côté. Une garde de source seule serait borgne : les
 * trois sites fautifs ne s'écrivaient pas pareil (`new Date(x).toLocaleString()`
 * inline chez `feedback-card`, `const d = new Date(iso)` puis `d.toLocale…` chez
 * `banner-card` et `monitoring-table`) — une expression ancrée sur `new Date(…)`
 * n'en aurait attrapé qu'un sur trois.
 *
 * CE QU'ELLE NE COUVRE PAS, et qui doit être dit plutôt que supposé : toute
 * autre source de non-déterminisme au rendu (`Math.random`, `Date.now`, lecture
 * de `window` au premier rendu). Elle ne regarde que les dates.
 */

const RACINE = join(__dirname, '..')

/**
 * ⚠️ EXCEPTIONS NOMMÉES, avec leur raison. Une garde qui s'accorde des
 * exceptions sans les écrire redevient une opinion.
 */
const EXCEPTIONS = new Map<string, string>([
  [
    'lib/dates.ts',
    'C’est le module qui POSE le fuseau. Il est le seul endroit où `toLocaleString` a le droit d’être appelé nu — il lui passe `timeZone` lui-même.',
  ],
  [
    'lib/capture/app-context.ts',
    '`Intl.DateTimeFormat().resolvedOptions().timeZone` LIT le fuseau du navigateur pour l’attacher à un rapport de bug. C’est l’inverse d’un formatage : rien n’est rendu à l’écran.',
  ],
])

function fichiersSource(dossier: string, acc: string[] = []): string[] {
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree)
    if (statSync(chemin).isDirectory()) {
      fichiersSource(chemin, acc)
      continue
    }
    if (!/\.tsx?$/.test(entree) || /\.test\.tsx?$/.test(entree)) continue
    acc.push(chemin)
  }
  return acc
}

/** Les commentaires d'abord : une garde attrapée par sa propre justification est borgne. */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const FORMATEURS = /\.toLocale(?:String|DateString|TimeString)\s*\(|new\s+Intl\.DateTimeFormat\s*\(/

/**
 * Un appel fautif = un formateur de date SANS `timeZone` dans ses arguments.
 *
 * ⚠️ N'ATTRAPE PAS CE QU'ELLE NE VISE PAS : `(1234).toLocaleString('fr-FR')` sur
 * un NOMBRE est parfaitement légitime et il y en a sept dans cette application.
 * Le tri se fait sur le RÉCEPTEUR : seul un `new Date(…)` ou un identifiant qui
 * ressent la date (`d`, `date`, `…At`, `…Date`) compte comme une date.
 */
function appelsFautifs(source: string): string[] {
  const propre = sansCommentaires(source)
  const fautifs: string[] = []

  for (const ligne of propre.split('\n')) {
    // `RegExp.test` avec le drapeau `g` est STATEFUL : on reconstruit à chaque tour.
    if (!new RegExp(FORMATEURS.source).test(ligne)) continue
    if (/timeZone\s*:/.test(ligne)) continue

    const estIntl = /new\s+Intl\.DateTimeFormat\s*\(/.test(ligne)
    // Un appel dont les arguments sont ouverts sur la ligne suivante : on ne peut
    // pas conclure ici, la ligne du `timeZone` viendra plus bas.
    const argumentsOuverts = /\.toLocale\w*\s*\(\s*[^)]*$/.test(ligne) && !/\)/.test(ligne.split('.toLocale')[1] ?? '')
    if (argumentsOuverts) continue

    const recepteurDate =
      estIntl ||
      /new\s+Date\s*\([^)]*\)\s*\.toLocale/.test(ligne) ||
      /\b(?:d|dt|date|[A-Za-z_$]*(?:Date|At|Time))\s*\.toLocale/.test(ligne)
    if (recepteurDate) fautifs.push(ligne.trim())
  }
  return fautifs
}

const FICHIERS = fichiersSource(RACINE)

describe('GA — les dates se formatent dans le fuseau de la console', () => {
  it('LIT quelque chose — le corpus est réel et contient les fichiers qui portaient le défaut', () => {
    expect(FICHIERS.length).toBeGreaterThan(60)
    const relatifs = FICHIERS.map(f => f.slice(RACINE.length + 1))
    expect(relatifs).toContain('app/feedback/_components/feedback-card.tsx')
    expect(relatifs).toContain('app/_components/monitoring-table.tsx')
    expect(relatifs).toContain('app/banners/_components/banner-card.tsx')
    expect(relatifs).toContain('lib/dates.ts')
  })

  it('SAIT DIRE NON — les trois formes réellement rencontrées sont refusées', () => {
    // La forme inline de `feedback-card`.
    expect(appelsFautifs(`<span>{new Date(item.created_at).toLocaleString('fr-FR')}</span>`)).toHaveLength(1)
    // La forme en deux temps de `monitoring-table` et `banner-card`.
    expect(appelsFautifs(`  return d.toLocaleString('fr-FR')`)).toHaveLength(1)
    // Un `Intl.DateTimeFormat` nu.
    expect(appelsFautifs(`const f = new Intl.DateTimeFormat('fr-FR', { day: '2-digit' })`)).toHaveLength(1)
    // Et la version corrigée passe.
    expect(appelsFautifs(`  return d.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })`)).toHaveLength(0)
  })

  it('N’ATTRAPE PAS CE QU’ELLE NE VISE PAS', () => {
    // Un NOMBRE formaté : sept occurrences réelles dans cette application.
    expect(appelsFautifs(`{Math.round(totalCacheRead).toLocaleString('fr-FR')} tokens lus`)).toHaveLength(0)
    expect(appelsFautifs(`{(p.inputTokens ?? 0).toLocaleString('fr-FR')}`)).toHaveLength(0)
    // Sa propre justification, écrite en commentaire, ne la fait pas rougir.
    expect(appelsFautifs(`// sans lui, d.toLocaleString('fr-FR') dépend de la machine`)).toHaveLength(0)
    expect(appelsFautifs(`/* un d.toLocaleString('fr-FR') nu rendrait deux textes */`)).toHaveLength(0)
  })

  it('aucun fichier de l’application ne formate une date sans fuseau', () => {
    const coupables: string[] = []
    for (const fichier of FICHIERS) {
      const relatif = fichier.slice(RACINE.length + 1)
      if (EXCEPTIONS.has(relatif)) continue
      const fautifs = appelsFautifs(readFileSync(fichier, 'utf8'))
      if (fautifs.length > 0) coupables.push(`${relatif} → ${fautifs.join(' | ')}`)
    }

    expect(coupables).toEqual([])
  })

  it('les exceptions sont NOMMÉES et existent encore — une exception périmée est un trou', () => {
    const relatifs = new Set(FICHIERS.map(f => f.slice(RACINE.length + 1)))
    for (const [chemin, raison] of EXCEPTIONS) {
      expect(relatifs.has(chemin), `${chemin} n’existe plus : retirer son exception`).toBe(true)
      expect(raison.length).toBeGreaterThan(40)
    }
  })
})
