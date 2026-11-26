import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * #2117 — LA GRAMMAIRE VISUELLE DU DOSSIER DE COMPTE, CE QUE LE SOURCE PEUT PROUVER.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE SONDE VOIT, ET CE QU'ELLE NE VOIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * jsdom ne calcule aucune géométrie : il ne dit ni qu'un bloc en recouvre un
 * autre (R15-4 l'a montré à 1 512 px en production), ni qu'une carte est
 * « trop haute », ni qu'un drawer fait la pleine largeur d'un téléphone. Ce
 * fichier ne prétend donc RIEN de tout cela. Il tient ce que le SOURCE du
 * dossier (`features/accounts/view/account-detail` + `AccountDetail.tsx`)
 * rend vérifiable sans navigateur :
 *
 *  · #2117.60, .65 — aucune hauteur en `vh` : sur mobile, `vh` compte la barre
 *    d'adresse ; une modale bornée à `82vh` déborde sous elle et le panneau se
 *    retrouve coupé (.59). `dvh` suit la hauteur réellement visible.
 *  · #2117.70-.73 — aucune taille de texte arbitraire (`text-[22px]`) : l'échelle
 *    Tailwind 12·14·16·18·20·24·30·36, GA-31 est un INTERDIT.
 *  · #2117.58 — aucun paragraphe en gras : le gras est réservé aux pastilles
 *    courtes (`<span>` de badge) et aux titres.
 *  · #2117.74-.78 — aucun mouvement ad hoc : pas de rebond, pas de durée ou de
 *    courbe arbitraire ; le mouvement passe par `packages/ui/src/motion.ts`
 *    (GA-25 le tient pour tout le dépôt).
 *  · R15-4, #2117.64 — le hero et sa fraîcheur ne portent aucun ancrage
 *    `absolute` de mise en page : chaque rangée garde sa place dans le flux.
 *
 * Restent prouvables en PRODUCTION seulement : le recouvrement réel, la hauteur
 * des cartes (.56), le drawer plein écran à 390 px (.69), le hero compact
 * mobile mesuré (.65), l'action principale sticky au défilement (.66).
 */

const racineWeb = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const racineDossier = join(racineWeb, 'src/features/accounts/view/account-detail')
const ecranDossier = join(racineWeb, 'src/features/accounts/view/AccountDetail.tsx')

function fichiersSous(dir: string): string[] {
  const sortie: string[] = []
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree)
    if (statSync(chemin).isDirectory()) sortie.push(...fichiersSous(chemin))
    else if (/\.tsx$/.test(entree) && !entree.includes('.test.')) sortie.push(chemin)
  }
  return sortie
}

/** Le code sans ses commentaires : une règle CITÉE dans un commentaire n'est pas une violation. */
function sansCommentaires(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

const corpus = [...fichiersSous(racineDossier), ecranDossier].map(chemin => ({
  chemin: relative(racineWeb, chemin),
  code: sansCommentaires(readFileSync(chemin, 'utf8')),
}))

const REGLES = {
  hauteurEnVh: /\b[\w:!-]*\[[\d.]+vh\]/g,
  tailleArbitraire: /\btext-\[[\d.]+(?:px|rem|em)\]/g,
  paragrapheEnGras: /<(?:p|Text\b[^>]*element="p")\b[^>]*(?:font-bold|weight="bold")/g,
  // ⚠ `transition-[background-color,transform]` n'est PAS visé : c'est la LISTE
  // des propriétés animées, pas une durée ni une courbe — GA-25 l'admet. La
  // première version de cette règle l'attrapait (13 faux positifs).
  mouvementAdHoc: /\b(?:animate-bounce|duration-\[[^\]]+\]|ease-\[[^\]]+\])/g,
} as const

function violations(regle: RegExp): string[] {
  return corpus.flatMap(({ chemin, code }) => [...code.matchAll(regle)].map(m => `${chemin} : ${m[0]}`))
}

describe('#2117 — la grammaire visuelle du dossier de compte', () => {
  it('LIT quelque chose : le corpus du dossier n’est pas vide', () => {
    expect(corpus.length).toBeGreaterThan(50)
    expect(corpus.some(f => f.chemin.endsWith('AccountDetailHero.tsx'))).toBe(true)
  })

  it('sait dire NON — et n’attrape pas les cas légitimes voisins', () => {
    const mauvais = [
      'max-h-[82vh]',
      '!max-h-[10vh]',
      'text-[22px]',
      '<p className="font-bold">',
      '<Text element="p" weight="bold">',
      'animate-bounce',
      'duration-[450ms]',
    ].join(' ')
    const bons = [
      'max-h-[82dvh]',
      'text-2xl',
      '<span className="text-xs font-bold">',
      '<Text element="h2" weight="bold">',
      'animate-spin',
      'transition-colors',
      'transition-[width]',
      'transition-[background-color,transform]',
    ].join(' ')
    for (const regle of Object.values(REGLES)) {
      expect([...mauvais.matchAll(regle)].length).toBeGreaterThan(0)
      expect([...bons.matchAll(regle)]).toEqual([])
    }
  })

  it('#2117.60, .65 — aucune hauteur en `vh` : `dvh`, qui suit la hauteur VISIBLE sur mobile', () => {
    expect(violations(REGLES.hauteurEnVh)).toEqual([])
  })

  it('#2117.70-.73 — aucune taille de texte hors de l’échelle Tailwind', () => {
    expect(violations(REGLES.tailleArbitraire)).toEqual([])
  })

  it('#2117.58 — aucun paragraphe en gras', () => {
    expect(violations(REGLES.paragrapheEnGras)).toEqual([])
  })

  it('#2117.74-.78 — aucun mouvement ad hoc : ni rebond, ni durée ou courbe arbitraire', () => {
    expect(violations(REGLES.mouvementAdHoc)).toEqual([])
  })

  it('R15-4, #2117.64 — le hero et sa fraîcheur ne s’ancrent jamais en `absolute` dans la carte', () => {
    const hero = corpus.filter(f => /components\/(AccountDetailHero[\w]*|AccountFreshness)\.tsx$/.test(f.chemin))
    expect(hero.length).toBeGreaterThanOrEqual(4)
    const ancrages = hero.flatMap(({ chemin, code }) =>
      [...code.matchAll(/\b(?:lg:|md:|sm:)?absolute\b/g)].map(m => `${chemin} : ${m[0]}`),
    )
    expect(ancrages).toEqual([])
  })
})
