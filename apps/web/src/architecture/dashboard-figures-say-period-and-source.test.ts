/**
 * #4298.2 — CHAQUE CHIFFRE DU TABLEAU DE BORD DIT SA PÉRIODE ET SA SOURCE.
 *
 * Retour du call refonte UX (19/10/2026) : « chaque chiffre dit sa période et
 * sa source interne ». Un chiffre sans fenêtre se lit au hasard du lecteur
 * (« depuis toujours » ? « aujourd'hui » ?) ; un chiffre sans source laisse
 * croire qu'il vient du CRM quand il vient des actions journalisées.
 *
 * CE QUE LA GARDE REFUSE
 * Un fichier du Tableau de bord (`features/dashboard/components/**`) ou de
 * son accroche Pilotage / « ce qui a bougé » qui rend un CHIFFRE CLÉ — un
 * nombre en `tabular-nums`, ou en taille `lg` et au-dessus — sans poser la
 * ligne de portée : `<FigureScope>` (le composant unique, GA-26) ou
 * `<CockpitSources>` (la provenance d'un BLOC du recul, qui dit déjà fenêtre
 * et sources).
 *
 * CE QU'ELLE NE VISE PAS
 * Un texte de taille courante, un libellé, un fichier qui n'affiche aucun
 * nombre (squelette, lien, carte de disposition). Elle ne juge pas non plus
 * l'EXACTITUDE de la source : c'est le test de chaque composant qui la fixe.
 *
 * Une garde protège une règle, elle ne l'invente pas : elle LIT les fichiers
 * réels, elle sait dire NON (voir le dernier `it`), et elle n'attrape pas ce
 * qu'elle ne vise pas.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const WEB_SRC = fileURLToPath(new URL('../', import.meta.url))
const DASHBOARD = join(WEB_SRC, 'features/dashboard/components')
/** Les chiffres du Pilotage qui montent sur le Tableau de bord, ou en ouvrent le Cockpit. */
const EXTRA = ['features/pilotage/view/PilotageAccroche.tsx', 'features/pilotage/view/WeekDeltaStrip.tsx']

const CHIFFRE_CLE = [
  /tabular-nums/,
  /<Text\b[^>]*\bsize="(?:lg|xl|2xl|3xl)"/,
  /\btext-(?:lg|xl|2xl|3xl)\b/,
  /TYPE_SCALE\.keyFigure/,
]
const LIGNE_DE_PORTEE = /<(?:FigureScope|CockpitSources)\b/

function sansCommentaires(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
}

function chiffreSansPortee(source: string): boolean {
  const code = sansCommentaires(source)
  return CHIFFRE_CLE.some(motif => motif.test(code)) && !LIGNE_DE_PORTEE.test(code)
}

function fichiers(dir: string, out: string[] = []): string[] {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree)
    if (statSync(chemin).isDirectory()) fichiers(chemin, out)
    else if (entree.endsWith('.tsx') && !/\.(test|spec)\.tsx$/.test(entree)) out.push(chemin)
  }
  return out
}

describe('#4298.2 — un chiffre du Tableau de bord dit sa période et sa source', () => {
  const corpus = [...fichiers(DASHBOARD), ...EXTRA.map(chemin => join(WEB_SRC, chemin))]

  it('lit un corpus réel, et des chiffres dedans', () => {
    expect(corpus.length).toBeGreaterThan(10)
    const avecChiffre = corpus.filter(chemin =>
      CHIFFRE_CLE.some(motif => motif.test(sansCommentaires(readFileSync(chemin, 'utf8')))),
    )
    expect(avecChiffre.length).toBeGreaterThanOrEqual(6)
  })

  it('aucun chiffre clé sans sa ligne de portée', () => {
    const fautifs = corpus
      .filter(chemin => chiffreSansPortee(readFileSync(chemin, 'utf8')))
      .map(chemin => relative(WEB_SRC, chemin))
    expect(fautifs).toEqual([])
  })

  it('dit NON à un chiffre nu, et laisse passer ce qu’elle ne vise pas', () => {
    expect(chiffreSansPortee('<p className="text-2xl font-bold tabular-nums">{kpis.my_accounts}</p>')).toBe(true)
    expect(chiffreSansPortee('<Text size="xl" weight="semibold">{value}</Text>')).toBe(true)
    expect(
      chiffreSansPortee(
        '<p className="tabular-nums">{n}</p><FigureScope scope={{ period: { kind: "now" }, sources: [] }} />',
      ),
    ).toBe(false)
    expect(chiffreSansPortee('<p className="text-sm">{label}</p>')).toBe(false)
    // Un commentaire qui PARLE d'une taille n'est pas un chiffre rendu.
    expect(chiffreSansPortee('// ancien : text-2xl\n<p className="text-sm">{label}</p>')).toBe(false)
  })
})
