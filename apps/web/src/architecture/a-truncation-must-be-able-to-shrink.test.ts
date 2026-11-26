import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-255 — UNE TRONCATURE DOIT POUVOIR RÉTRÉCIR.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA MESURE QUI A DÉCLENCHÉ CETTE GARDE (#1623)
 * ─────────────────────────────────────────────────────────────────────────────
 * `shrink-0 truncate` sur le même élément est une CONTRADICTION silencieuse :
 *
 *   - `truncate` borne un élément à la largeur qu'on lui DONNE ;
 *   - `shrink-0` lui interdit précisément d'en recevoir une plus petite que son
 *     contenu.
 *
 * Ensemble, ils disent « ne dépasse pas de la place que tu prends » — ce qui est
 * toujours vrai, et ne borne rien. L'élément prend sa largeur intrinsèque,
 * quelle qu'elle soit. Et comme un `<td>` de `table-fixed` ne clippe pas, ce qui
 * dépasse se PEINT par-dessus la colonne voisine.
 *
 * Mesuré en production le 06/09/2026 sur `/accounts`, première page :
 *
 *     20 lignes sur 25 débordaient de la colonne « Compte ».
 *     La pire (TOTAL, dont l'effectif est une PHRASE de 130 caractères)
 *     dépassait de 547 px — par-dessus le score, la classe d'accès, le
 *     statut commercial ET la date.
 *
 * C'est le « score, texte se superpose, illisible » du retour. Un défaut de
 * POPULATION : chaque ligne, prise seule, est juste — aucun rendu d'UNE ligne ne
 * pouvait le montrer, et 7 500 tests ne l'ont pas vu.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA GARDE INTERDIT, ET CE QU'ELLE LAISSE PASSER
 * ─────────────────────────────────────────────────────────────────────────────
 * `shrink-0 truncate` n'est PAS fautif en soi : avec une largeur explicite
 * (`w-32`, `w-48`, `max-w-[14rem]`, `basis-40`…), l'élément a une borne, la
 * troncature s'applique dessus, et `shrink-0` dit seulement « ne descends pas
 * en dessous ». Cinq occurrences de cette forme sont légitimes dans le dépôt et
 * doivent le rester — une garde qui les refuserait serait trop gourmande, et une
 * garde trop gourmande se fait désactiver dans la semaine.
 *
 * La garde ne refuse donc QUE le cas où il n'y a aucune borne : `shrink-0` +
 * `truncate` + aucune classe de largeur sur le même élément.
 */

const WEB_SRC = join(__dirname, '..')
const UI_SRC = join(__dirname, '../../../../packages/ui/src')

/** Les classes qui DONNENT une borne à la troncature. */
const WIDTH_BOUND = /\b(?:w-|max-w-|basis-|size-)/

/**
 * Les deux classes qui, ensemble et seules, forment la contradiction.
 * Cherchées sur le même « paquet de classes », pas sur le fichier entier.
 */
const SHRINK_NONE = /\bshrink-0\b/
const TRUNCATE = /\btruncate\b/

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

/**
 * Le fichier sans ses commentaires.
 *
 * ⚠️ Cette étape N'EST PAS de l'hygiène : sans elle, la garde s'attrape
 * elle-même. Écrite pour la première fois sans, elle a signalé
 * `AccountTableRow.tsx` — non pas pour du code, mais pour la ligne de
 * commentaire qui EXPLIQUE le défaut corrigé (« `shrink-0 truncate` ne tronque
 * rien »). Une garde qui lit du source lit aussi sa propre justification, et le
 * seul remède est de ne lire que ce qui s'exécute.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/**
 * Les littéraux de classes d'un fichier.
 *
 * On découpe sur les chaînes entre guillemets plutôt que sur les lignes : une
 * classe s'écrit souvent sur plusieurs lignes, et découper par ligne couperait
 * `shrink-0` de son `w-32` — la garde deviendrait fausse dans le sens le plus
 * coûteux, celui du faux positif.
 */
function classLiterals(source: string): string[] {
  return [...withoutComments(source).matchAll(/(['"`])((?:[^'"`\\\n]|\\.)*?)\1/g)]
    .map(match => match[2])
    .filter(literal => TRUNCATE.test(literal) || SHRINK_NONE.test(literal))
}

/** Un paquet de classes qui tronque sans jamais pouvoir rétrécir. */
function isUnboundedTruncation(literal: string): boolean {
  return SHRINK_NONE.test(literal) && TRUNCATE.test(literal) && !WIDTH_BOUND.test(literal)
}

const FILES = [...sourceFiles(WEB_SRC), ...sourceFiles(UI_SRC)]

describe('GA-255 — une troncature doit pouvoir rétrécir', () => {
  /**
   * LA PREUVE QUE LA GARDE LIT QUELQUE CHOSE.
   *
   * Une garde qui balaie un corpus vide est verte pour toujours et ne protège
   * rien — six gardes borgnes en deux jours sur ce dépôt. Ce test échoue si le
   * balayage ne trouve plus de fichiers, ou plus aucun paquet de classes
   * contenant l'une des deux classes surveillées (renommage Tailwind, changement
   * d'arborescence, motif cassé).
   */
  it('lit un corpus réel', () => {
    expect(FILES.length).toBeGreaterThan(500)
    const literals = FILES.flatMap(file => classLiterals(readFileSync(file, 'utf8')))
    expect(literals.length).toBeGreaterThan(100)
  })

  /**
   * LA PREUVE QUE LA GARDE NE SE LIT PAS ELLE-MÊME.
   *
   * Le commentaire qui explique le défaut cite forcément le paquet de classes
   * fautif. Sans retrait des commentaires, la garde signale le fichier qui
   * documente sa propre correction — et « réparer » ce faux positif revient à
   * effacer l'explication.
   */
  it('ne voit pas un paquet de classes cité dans un commentaire', () => {
    const documented = ['/* Avant : className="shrink-0 truncate" */', "// on n'écrit plus 'shrink-0 truncate'"]
    for (const source of documented) expect(classLiterals(source)).toEqual([])
  })

  /**
   * LA PREUVE QUE LA GARDE SAIT DIRE NON.
   *
   * Le paquet de classes exact qui a produit les 547 px de débordement, tel
   * qu'il était écrit dans `AccountTableRow.tsx` avant le correctif. S'il
   * revenait, la garde doit le refuser.
   */
  it('refuse le paquet de classes qui a causé le défaut', () => {
    expect(
      isUnboundedTruncation('shrink-0 truncate text-xs leading-4 text-[var(--bellum-text-muted)] tabular-nums'),
    ).toBe(true)
  })

  /**
   * LA PREUVE QUE LA GARDE N'ATTRAPE PAS CE QU'ELLE NE VISE PAS.
   *
   * Les cinq formes légitimes mesurées le 06/09/2026 — chacune borne sa
   * troncature autrement. Une garde qui les refuserait interdirait la moitié des
   * listes du produit au nom d'une règle sur un cas non borné.
   */
  it('laisse passer une troncature qui porte sa borne', () => {
    for (const legitimate of [
      'w-32 shrink-0 truncate text-xs text-[var(--bellum-text-secondary)]',
      'w-48 shrink-0 truncate',
      'max-w-full shrink-0 truncate px-1 py-0 text-xs',
      'mt-px hidden max-w-[14rem] shrink-0 truncate lg:inline-flex',
      'w-36 shrink-0 truncate sm:w-48',
    ]) {
      expect(isUnboundedTruncation(legitimate)).toBe(false)
    }
    // Et une troncature ordinaire, sans `shrink-0`, n'est jamais concernée.
    expect(isUnboundedTruncation('min-w-0 flex-auto truncate text-xs leading-4')).toBe(false)
  })

  it('aucun élément ne tronque sans jamais pouvoir rétrécir', () => {
    const offenders = FILES.flatMap(file =>
      classLiterals(readFileSync(file, 'utf8'))
        .filter(isUnboundedTruncation)
        .map(literal => `${file.replace(WEB_SRC, 'apps/web/src').replace(UI_SRC, 'packages/ui/src')} — « ${literal} »`),
    )
    expect(offenders, offenders.join('\n')).toEqual([])
  })
})
