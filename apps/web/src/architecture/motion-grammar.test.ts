/**
 * GA-25 — le mouvement a une grammaire, et une seule source.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ LE 23/08/2026
 * ─────────────────────────────────────────────────────────────────────────
 * 121 fichiers utilisent `framer-motion`. `EASE_OUT_EXPO = [0.32, 0.72, 0, 1]`
 * était redéfini dans **six** fichiers — le tome en annonçait deux. Vingt-six
 * courbes et quatre-vingt-quatorze durées étaient écrites à la main, dont dix
 * valeurs distinctes pour la même intention.
 *
 * Le mouvement existait, il était plutôt de bon goût, et il n'avait pas de
 * grammaire : le produit paraissait légèrement différent d'un écran à l'autre
 * sans qu'on sache dire pourquoi.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI DES CLIQUETS, ET PAS UN INTERDIT
 * ─────────────────────────────────────────────────────────────────────────
 * Interdire `framer-motion` hors de `motion.ts` ferait tomber 121 fichiers au
 * premier jour, et la garde serait désactivée dans la semaine. Elle fige donc
 * ce qui reste écrit à la main, APRÈS la centralisation des six duplications.
 * Le chiffre descend quand quelqu'un remplace une valeur par `MOTION.*` ou
 * `EASE.*` ; il ne monte pas.
 *
 * La règle à appliquer en écrivant : ta transition répond-elle à une des cinq
 * questions du §16 (d'où ça vient, où c'est allé, est-ce que ça travaille,
 * est-ce que ça a marché, qu'est-ce qui a changé) ? Si non, elle n'existe pas —
 * `MOTION.reveal` suffit.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')

/** Courbes écrites à la main au 23/08/2026, après centralisation. */
const HAND_WRITTEN_EASES_AT_FREEZE = 26
/**
 * Durées écrites à la main. 94 au 23/08/2026, **88 au 01/09/2026** : le cliquet
 * descend de six avec la suppression de deux cartes du tableau de bord —
 * l'ancienne « Activité cette semaine » et « Tes 5 actions du jour » — dont les
 * transitions étaient toutes réglées à la main (dont un `duration: 0.8` sur une
 * barre de progression). Un cliquet descend, il ne remonte jamais.
 *
 * **75 le 27/09/2026** (intégration O, lot b1) — une REMONTÉE justifiée.
 * `AnalysisProgressCard.tsx` porte une TROISIÈME occurrence de
 * `duration: 0.24, ease: [0.23, 1, 0.32, 1]`, même patron EXACT que les deux
 * déjà dans ce fichier (repli non `MOTION.*` déjà toléré au gel ci-dessus,
 * inchangé par ce lot) — pas une valeur neuve inventée. 74 + 1 = 75.
 */
const HAND_WRITTEN_DURATIONS_AT_FREEZE = 75
/**
 * #2484 (16/09/2026) — **GA-25 était BORGNE sur deux points**, mesurés en
 * auditant `/contacts` contre ses règles de design :
 *
 * 1. Le cliquet ci-dessus était figé à 88 quand le dépôt n'en portait plus que
 *    **75** : treize durées pouvaient revenir sans qu'il rougisse. Un cliquet
 *    qui a du jeu n'est plus un cliquet. Il colle désormais au compte (74, la
 *    barre d'outils de `/contacts` passant à `MOTION.reveal`).
 * 2. Il ne lisait QUE la forme framer-motion (`duration: 0.x`). Les durées
 *    écrites en classe Tailwind (`duration-150`, `duration-200`) lui étaient
 *    invisibles : **45** dans le dépôt, dont une dans `CollapsedSection.tsx`
 *    — le composant dont le commentaire affirme « aucune durée n'est réglée à
 *    la main ». Cinq retirées sur `/contacts` (la durée par défaut de
 *    `transition-*`, 150 ms, tombe déjà dans le palier `immediate`).
 *
 * **41 le 27/09/2026** (intégration O, lot h6) — une REMONTÉE justifiée.
 * `ContactWhyKey.tsx` (fichier neuf, carte « contact clé ») porte
 * `transition-transform duration-150` sur le chevron qui déplie le détail —
 * le MÊME idiome déjà écrit trois fois ailleurs dans le dépôt
 * (`EntityGroups.tsx`, `ActionHistoryRow.tsx`, `AppSidebar.tsx`), jamais une
 * valeur neuve inventée. 40 + 1 = 41.
 */
const HAND_WRITTEN_TAILWIND_DURATIONS_AT_FREEZE = 41
const TAILWIND_DURATION = /(?<![\w-])duration-\d+(?![\w-])/g
const codeOnly = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const countTailwindDurations = (source: string) => codeOnly(source).match(TAILWIND_DURATION)?.length ?? 0

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry)) continue
    if (entry.includes('.test.')) continue
    out.push(full)
  }
  return out
}

const files = sourceFiles(SRC)
const bodies = files.map(file => readFileSync(file, 'utf8'))
/**
 * Le CODE seul — `codeOnly` existe déjà plus haut, la grammaire du mouvement ne
 * l'appliquait qu'au comptage des durées.
 *
 * ⚠️ Mesuré le 18/09/2026 : « aucun mouvement de site vitrine » a accusé
 * `useOnboardingNavigation.ts` pour un COMMENTAIRE disant « sans rebond ni
 * PARALLAXE » — le mot français contient `parallax`. La garde a donc désigné du
 * code qui fait exactement ce qu'elle demande, et l'intégrateur a reformulé la
 * phrase pour la faire taire. C'est la deuxième fois qu'elle accuse le bien :
 * `bounce: 0` DÉSACTIVE le rebond, et sa première version l'avait aussi pris
 * pour une violation.
 *
 * Une garde doit savoir dire NON, et ne pas attraper ce qu'elle ne vise pas :
 * une prose qui NOMME l'interdit n'est pas l'interdit.
 */
const bodiesCode = bodies.map(codeOnly)

describe('GA-25 — la grammaire du mouvement', () => {
  it('aucun fichier ne redéfinit une courbe que le paquet UI porte déjà', () => {
    // C'est la violation la plus coûteuse : six copies de la même constante,
    // qu'un changement de goût obligerait à retrouver une par une.
    const offenders = files.filter((_file, index) => /const EASE_OUT_EXPO\s*=/.test(bodies[index] as string))
    expect(offenders).toEqual([])
  })

  it('le nombre de courbes écrites à la main ne remonte pas', () => {
    const count = bodies.reduce((acc, body) => acc + (body.match(/ease: \[[0-9., ]+\]/g)?.length ?? 0), 0)
    expect(count).toBeLessThanOrEqual(HAND_WRITTEN_EASES_AT_FREEZE)
  })

  it('le nombre de durées écrites à la main ne remonte pas', () => {
    const count = bodies.reduce((acc, body) => acc + (body.match(/duration: 0\.[0-9]+/g)?.length ?? 0), 0)
    expect(count).toBeLessThanOrEqual(HAND_WRITTEN_DURATIONS_AT_FREEZE)
  })

  it('#2484 — le nombre de durées Tailwind écrites à la main ne remonte pas', () => {
    const count = bodies.reduce((acc, body) => acc + countTailwindDurations(body), 0)
    expect(count).toBeLessThanOrEqual(HAND_WRITTEN_TAILWIND_DURATIONS_AT_FREEZE)
  })

  it('#2484 — le compteur Tailwind LIT des classes, sait dire NON, et ignore ce qu’il ne vise pas', () => {
    // Corpus non vide : sinon le cliquet serait vert pour toujours.
    expect(bodies.reduce((acc, body) => acc + countTailwindDurations(body), 0)).toBeGreaterThan(0)
    expect(countTailwindDurations(`className="transition-colors duration-150 ease-out"`)).toBe(1)
    expect(countTailwindDurations(`className="transition-transform duration-[250ms]"`)).toBe(0)
    // Ni la forme framer (comptée par le cliquet d'à côté), ni un commentaire,
    // ni une classe voisine qui CONTIENT le mot.
    expect(countTailwindDurations(`transition={{ duration: 0.2 }}`)).toBe(0)
    expect(countTailwindDurations(`// on n'écrit plus duration-200 ici`)).toBe(0)
    expect(countTailwindDurations(`className="motion-duration-200x"`)).toBe(0)
  })

  it('aucun mouvement de site vitrine', () => {
    // Rebond, élastique, parallaxe : sur un outil qu'on ouvre huit heures par
    // jour, ils fatiguent en trois jours.
    // ⚠️ `bounce: 0` DÉSACTIVE le rebond — la première version de cette garde
    // l'a pris pour une violation et a remonté quatre fichiers exemplaires.
    // Une garde qui accuse le code qui fait bien la chose se désactive.
    const banned = /bounce:\s*0*\.?[1-9]|ease:\s*'backOut'|ease:\s*'anticipate'|parallax/i
    // Sur le CODE, pas sur la prose : voir `bodiesCode` plus haut.
    const offenders = files.filter((_file, index) => banned.test(bodiesCode[index] as string))
    expect(offenders).toEqual([])

    // Et la garde sait toujours dire NON — sinon retirer les commentaires
    // l'aurait rendue aveugle au lieu de la rendre juste.
    expect(banned.test(codeOnly(`// on n'écrit ni rebond ni parallaxe ici`))).toBe(false)
    expect(banned.test(codeOnly(`/** Pas de parallaxe, jamais. */`))).toBe(false)
    expect(banned.test(codeOnly(`const style = { parallax: true }`))).toBe(true)
    expect(banned.test(codeOnly(`transition={{ bounce: 0.4 }}`))).toBe(true)
    expect(banned.test(codeOnly(`transition={{ bounce: 0 }}`))).toBe(false)
  })

  it('la garde lit bien des fichiers animés — sinon elle serait verte pour toujours', () => {
    const animated = bodies.filter(body => body.includes('framer-motion')).length
    expect(animated).toBeGreaterThan(50)
  })
})

/**
 * GA-28 — l'écran étroit ne se dégrade plus.
 *
 * Décision de Louis du 23/08 : le produit doit être **le produit ultime sur
 * mobile**, pas un web responsive qui abandonne. Une grille à trois colonnes ou
 * plus SANS variante responsive écrase son contenu sur un téléphone de 375 px —
 * trois colonnes de 110 px, dont deux de marge.
 *
 * Un cliquet et non un interdit : trois occurrences restent, et elles sont
 * LÉGITIMES — le panneau de marque de connexion (masqué sous `lg`), la grille
 * interne d'un graphique, et la bande des jours de semaine, qui doit rester à
 * sept colonnes précisément parce qu'une semaine en a sept.
 */
const NON_RESPONSIVE_GRIDS_AT_FREEZE = 3

describe('GA-28 — le mobile ne se dégrade pas', () => {
  const files = sourceFiles(SRC).filter(file => file.endsWith('.tsx'))

  it('le nombre de grilles à 3+ colonnes sans variante responsive ne remonte pas', () => {
    let count = 0
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/class[nN]ame=(?:"([^"]*)"|\{`([^`]*)`\}|\{cn\(([^)]*)\))/g)) {
        const chunk = match[1] ?? match[2] ?? match[3] ?? ''
        if (!/(?<![a-z:])grid-cols-[3-9]/.test(chunk)) continue
        if (/(sm|md|lg|xl):grid-cols-/.test(chunk)) continue
        count += 1
      }
    }
    // Si ce test tombe : ajoute `grid-cols-1 sm:grid-cols-2 md:grid-cols-N`.
    // Une grille dont le nombre de colonnes a un SENS (sept jours de semaine)
    // se justifie ici, avec sa raison.
    expect(count).toBeLessThanOrEqual(NON_RESPONSIVE_GRIDS_AT_FREEZE)
  })

  it('aucun écran ne fixe sa hauteur en `vh` — la barre d’adresse mobile ment', () => {
    // `100vh` compte la barre d'adresse comme si elle n'existait pas : le bas
    // de l'écran passe sous le pli. C'est le défaut le plus courant d'une
    // application web sur téléphone, et `dvh` le corrige exactement.
    // `100vh` sous toutes ses formes — la classe utilitaire, la valeur
    // arbitraire, le `calc()` qui en retranche une barre, et le repli d'une
    // variable CSS.
    //
    // ⚠️ Les commentaires sont retirés AVANT lecture : ce fichier-ci EXPLIQUE
    // le défaut, et une garde qui s'accuse elle-même se désactive. C'est la
    // troisième fois de la journée — GA-25 avec « bounce », GA-20 avec les
    // virgules dans les listes commentées.
    const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    const offenders = files.filter(file => /(?<![\w-])h-screen(?![\w-])|100vh/.test(strip(readFileSync(file, 'utf8'))))
    expect(offenders).toEqual([])
  })
})
