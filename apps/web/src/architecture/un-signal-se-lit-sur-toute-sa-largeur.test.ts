import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #2618.1 — UN SIGNAL SE LIT SUR TOUTE SA LARGEUR, PAS UN CARACTÈRE PAR LIGNE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA MESURE (21/09/2026, production, `/accounts/…?tab=veille`, AIRBUS)
 * ─────────────────────────────────────────────────────────────────────────────
 * Section « Pistes à qualifier », 57 signaux. Le texte du premier signal
 * rendait sur **23,76 px de large** dans un conteneur flex de **617 px** —
 * un caractère par ligne, pour une hauteur de bloc de **4 920 px**.
 *
 * Une régression du MÊME TYPE que #2618.1 (`break-words` posé le 20/09 sur le
 * titre) : la correction précédente empêchait le DÉBORDEMENT d'un mot sans
 * espace, mais ne bornait pas la colonne VOISINE. `WatchSignalTimeline.tsx`
 * pose le titre libre dans une colonne `minmax(0,1fr)` à côté d'une colonne
 * `auto` (badges de fraîcheur, date, score) : `auto` n'a AUCUN plafond. Que la
 * métadonnée ait besoin d'un peu plus de place — une date plus longue, un
 * badge de fraîcheur en plus — et l'algorithme de grille satisfait d'abord la
 * colonne `auto` puis écrase la colonne `1fr` vers son plancher explicite (0).
 * `break-words`, combiné à une largeur disponible proche de zéro, ne déborde
 * plus : il coupe à CHAQUE caractère. Le symptôme a changé, la cause — une
 * colonne de texte libre sans garantie de largeur face à une colonne non
 * bornée — n'avait pas été traitée.
 *
 * Le remède : ne JAMAIS laisser un `auto` nu à côté d'un `minmax(0,1fr)` qui
 * porte du texte libre (`break-words`). Le dépôt porte déjà l'idiome sûr
 * ailleurs pour la même forme à deux colonnes — `OrgEditView.tsx`,
 * `GroupOrgView.tsx`, `FocalOrgView.tsx` bornent leur second axe avec
 * `minmax(0, <longueur fixe>)` plutôt que `auto`. `WatchSignalTimeline.tsx`
 * rejoint cet idiome : `minmax(0,1fr)_minmax(0,22rem)`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ POURQUOI CETTE GARDE NE MESURE PAS DE PIXELS
 * ─────────────────────────────────────────────────────────────────────────────
 * jsdom ne met rien en page — `getBoundingClientRect` y rend 0 partout, et une
 * classe présente ne prouve aucune mise en page (même limite que GA-333,
 * `un-conteneur-rigide-ne-porte-pas-de-texte-libre.test.ts`). La garde
 * interdit donc la COMBINAISON de classes qui a produit la mesure — une
 * colonne `auto` nue à côté d'une colonne `minmax(0,1fr)` qui porte
 * `break-words` — plutôt que de tenter une mesure qu'elle ne peut pas faire
 * honnêtement.
 *
 * Elle ne s'attrape pas elle-même : `withoutComments` retire ce docblock avant
 * l'analyse, sinon la garde se signalerait elle-même comme fautive pour avoir
 * cité la forme exacte du défaut.
 */

const WEB_SRC = join(__dirname, '..')

/** La forme fautive : un `auto` nu directement après une colonne `1fr` bornée à 0. */
const UNSAFE_GRID = /grid-cols-\[minmax\(0,\s*1fr\)_auto\]/

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      sourceFiles(full, out)
      continue
    }
    if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry)) out.push(full)
  }
  return out
}

/** Retire les commentaires — sinon ce fichier s'accuserait lui-même. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function realCorpus(): Map<string, string> {
  const corpus = new Map<string, string>()
  for (const file of sourceFiles(WEB_SRC)) {
    corpus.set(file.replace(`${WEB_SRC}/`, ''), withoutComments(readFileSync(file, 'utf8')))
  }
  return corpus
}

function witness(files: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(files).map(([file, source]) => [file, withoutComments(source)]))
}

/** Tous les usages de la forme `auto` nue — sûre ou non — pour prouver que la
 *  garde lit vraiment le corpus (elle en trouve ailleurs, hors du fichier
 *  qui a payé cette mesure : `TabSites.tsx`, `TabCoverage.tsx`,
 *  `AddPlanActionForm.tsx` bornent une colonne à côté d'un contenu qui n'est
 *  jamais du texte libre — légitime, et ce n'est pas ce que cette garde vise). */
function allBareAutoUsages(corpus: Map<string, string>): string[] {
  return [...corpus.entries()].filter(([, clean]) => UNSAFE_GRID.test(clean)).map(([file]) => file)
}

/** Le seul chemin de décision : `auto` nu + texte libre (`break-words`) dans le même fichier. */
function offenders(corpus: Map<string, string>): string[] {
  return [...corpus.entries()]
    .filter(([, clean]) => UNSAFE_GRID.test(clean) && clean.includes('break-words'))
    .map(([file]) => file)
}

const CORPUS = realCorpus()

describe('#2618.1 — un signal se lit sur toute sa largeur', () => {
  /** LA PREUVE QUE LA GARDE LIT QUELQUE CHOSE. */
  it('lit un corpus réel', () => {
    expect(CORPUS.size).toBeGreaterThan(500)
    // La forme `auto` nue existe ailleurs, légitimement (widgets bornés, pas
    // du texte libre) — la garde ne doit pas être verte faute de matière.
    expect(allBareAutoUsages(CORPUS).length).toBeGreaterThan(0)
  })

  /** LA PREUVE QUE LA GARDE SAIT DIRE NON — la forme exacte qui a cassé la production. */
  it('refuse un texte libre `break-words` à côté d’une colonne `auto` non bornée', () => {
    const fautif = witness({
      'WatchSignalTimeline.tsx': `
        function SignalRow() {
          return (
            <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
              <Text element="h3" className="break-words">{signal.signal}</Text>
              <SignalMetadata signal={signal} />
            </div>
          )
        }`,
    })
    expect(offenders(fautif)).toEqual(['WatchSignalTimeline.tsx'])
  })

  /** LA PREUVE QUE LA GARDE N'ATTRAPE PAS CE QU'ELLE NE VISE PAS — un `auto`
   *  nu légitime, à côté d'un titre CONSTANT (pas de `break-words` posé, donc
   *  pas de texte libre déclaré à cet endroit). */
  it('laisse passer un `auto` non borné sans texte libre déclaré', () => {
    const legitime = witness({
      'TabSites.tsx': `
        function Header() {
          return (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <Text element="h2">{t('header.title')}</Text>
              <Button>{t('header.cta')}</Button>
            </div>
          )
        }`,
    })
    expect(offenders(legitime)).toEqual([])
  })

  /** LA PREUVE QUE LE REMÈDE PASSE LA GARDE — la colonne bornée n'est plus la forme fautive. */
  it('laisse passer la colonne de métadonnées une fois bornée', () => {
    const corrige = witness({
      'WatchSignalTimeline.tsx': `
        function SignalRow() {
          return (
            <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
              <Text element="h3" className="break-words">{signal.signal}</Text>
              <SignalMetadata signal={signal} />
            </div>
          )
        }`,
    })
    expect(offenders(corrige)).toEqual([])
  })

  /** LA PREUVE QUE LA GARDE NE SE LIT PAS ELLE-MÊME. */
  it('ne voit pas une structure citée dans un commentaire', () => {
    const documente = witness({
      'WatchSignalTimeline.tsx': `
        // Avant : grid-cols-[minmax(0,1fr)_auto] avec break-words sur le titre
        function SignalRow() {
          return <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]" />
        }`,
    })
    expect(offenders(documente)).toEqual([])
  })

  /** LA GARDE, SUR LE DÉPÔT RÉEL — rouge avant le correctif, verte après. */
  it('aucun texte libre ne vit dans une colonne `1fr` face à un `auto` non borné', () => {
    const found = offenders(CORPUS)
    expect(found, found.join('\n')).toEqual([])
  })
})
