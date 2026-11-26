import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-289 — #1867 : UN PANNEAU SURGISSANT PASSE DEVANT LA CHROME QUI L'OUVRE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE BUG DE LOUIS (#1867 — « y a un bug de chevauchement de menu, et c'est
 * pas la première fois que je le vois »)
 * ─────────────────────────────────────────────────────────────────────────
 * Mesuré sur la capture de `/accounts/partners` : le menu « Connaître » de la
 * barre d'onglets de section est ouvert, et ses 46 premiers pixels sont
 * RECOUVERTS par l'entête (fil d'Ariane) — reconnaissables au flou, puisque
 * `PageHeader` porte `backdrop-blur-xl` et AUCUN fond : ce qu'on voit est le
 * panneau vu À TRAVERS l'entête qui le peint par-dessus.
 *
 * La cause n'est pas « il manque un z-index ». Elle est que DEUX éléments
 * réclamaient le MÊME étage :
 *
 *   `apps/web/src/components/layout/PageHeader.tsx`  →  `z-nav`  (40)
 *   `packages/ui/src/molecules/grouped-tab-nav.tsx`  →  `z-nav`  (40)
 *
 * À z-index ÉGAL, CSS départage par l'ordre du DOM : l'entête est rendue
 * APRÈS la barre d'onglets par `CustomerPageContent`, donc l'entête gagne,
 * toujours, sur tous les écrans. Aucun ordre de rendu ne pouvait sauver le
 * menu — c'est le jeton qui était faux.
 *
 * `z-nav` est le jeton de la NAVIGATION ELLE-MÊME : le relevé du 11/09/2026
 * le trouve sur `sidebar.tsx` (le panneau et sa poignée) et sur `PageHeader`
 * — la coque, rien d'autre. Les onze autres panneaux surgissants du dépôt
 * (menu déroulant, menu contextuel, select, popover, infobulle) portent tous
 * `z-picker` (90) depuis #1788. `grouped-tab-nav` était le SEUL menu du
 * dépôt habillé en chrome : il ne pouvait pas passer devant elle.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ÉCRITE POSITIVEMENT
 * ─────────────────────────────────────────────────────────────────────────
 * Un panneau qui SURGIT (il porte un rôle de panneau — `menu`, `listbox`,
 * `dialog`, `tooltip`) et qui FLOTTE (`absolute` / `fixed`) s'ouvre par
 * définition PAR-DESSUS la chrome. Son étage est donc STRICTEMENT au-dessus
 * de celui de la chrome (`z-nav`). Égal ne suffit pas : égal, c'est l'ordre
 * du DOM qui tranche, et l'ordre du DOM n'est pas une décision de design.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE REGARDE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * · La chrome elle-même. `PageHeader` est un `<header>` et le panneau de
 *   `sidebar.tsx` est un `absolute … z-nav` : aucun des deux ne porte de rôle
 *   de panneau surgissant, et c'est exactement ce qui les distingue. Une
 *   garde qui aurait interdit « absolute + z-nav » aurait rougi sur la barre
 *   latérale, qui est juste.
 * · Un panneau surgissant SANS aucun jeton d'empilement. Il y en a (une
 *   liste de suggestions dans un conteneur déjà élevé, par exemple) et leur
 *   imposer un jeton reviendrait à inventer une règle que personne n'a
 *   tranchée. La garde juge un étage ÉCRIT, jamais un étage absent —
 *   GA-280 tient déjà l'autre moitié du sujet (aucune valeur BRUTE).
 * · Le texte des commentaires : ce docblock cite `z-nav` à côté du mot
 *   « menu » une dizaine de fois, et une garde rouge sur son propre récit
 *   finit désactivée dans la semaine (la leçon de GA-248 et de GA-280).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES TROIS SITES `z-40` HORS PÉRIMÈTRE, NOMMÉS PLUTÔT QU'EXEMPTÉS
 * ─────────────────────────────────────────────────────────────────────────
 * Le relevé du 11/09 trouve trois barres flottantes à `z-40` brut :
 * `ContactEngagementLauncher.tsx` (deux fois) et `SelectionBar.tsx`. Aucune
 * ne porte de rôle de panneau : ce ne sont pas des menus qui s'ouvrent, ce
 * sont des barres posées EN BAS de l'écran, là où l'entête n'est jamais — le
 * départage par ordre du DOM ne peut pas se jouer entre elles. Elles restent
 * néanmoins hors de l'échelle nommée (elles passent sous le toast à 70 et
 * sous le widget de signalement à 80) : c'est consigné dans le rapport de
 * #1867, pas caché derrière une exemption de cette garde-ci.
 */

const WEB_SRC = join(__dirname, '..')
const UI_SRC = join(__dirname, '../../../../packages/ui/src')
const TAILWIND_CONFIG = join(__dirname, '../../tailwind.config.ts')

/** Les rôles ARIA qui disent « je surgis par-dessus le reste de l'écran ». */
const PANEL_ROLES = /role=\s*(?:"|'|\{\s*['"])(menu|listbox|dialog|tooltip)(?:"|')/

/** `absolute` / `fixed` posés comme CLASSE, jamais au milieu d'un autre mot. */
const FLOATING = /(?:^|[\s"'`(:])(absolute|fixed)(?![\w-])/

/** `z-picker`, `z-nav`… — un jeton NOMMÉ de l'échelle. */
const NAMED_TOKEN = /(?:^|[\s"'`(:])z-(nav|overlay|toast|widget|picker|devtools)(?![\w-])/

/** `z-50`, `z-[9999]`, `hover:z-40` — une valeur BRUTE (GA-280 les interdit). */
const RAW_TOKEN = /(?:^|[\s"'`(:])z-(\d+|\[\d+\])(?![\w-])/

/**
 * L'échelle est LUE dans `tailwind.config.ts`, jamais recopiée ici.
 *
 * Une garde qui redéclare la valeur qu'elle protège reste verte le jour où
 * la vraie valeur bouge — c'est la loi 1 du tome 7 appliquée à une garde.
 */
function readScale(): Record<string, number> {
  const source = readFileSync(TAILWIND_CONFIG, 'utf8')
  const block = source.match(/zIndex:\s*\{([^}]*)\}/)
  if (!block) throw new Error('échelle d’empilement introuvable dans tailwind.config.ts')
  const scale: Record<string, number> = {}
  for (const [, name, value] of block[1].matchAll(/(\w+):\s*'(\d+)'/g)) scale[name] = Number(value)
  return scale
}

function sourceFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist') continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!entry.endsWith('.tsx')) continue
      if (entry.includes('.test.')) continue
      out.push(full)
    }
  }
  walk(root)
  return out
}

/**
 * Blanchit les lignes de commentaire, avec ÉTAT entre les lignes.
 *
 * Même mécanique que `commentMask` de GA-280, et pour la même raison : une
 * ligne de PROSE au milieu d'un bloc de commentaire JSX de plusieurs lignes
 * ne commence pas par `*` et se lirait comme du code.
 */
function stripComments(source: string): string {
  let inBlock = false
  return source
    .split('\n')
    .map(line => {
      if (inBlock) {
        if (line.includes('*/')) inBlock = false
        return ''
      }
      const trimmed = line.trimStart()
      if (trimmed.startsWith('//')) return ''
      if (trimmed.startsWith('/*') || trimmed.startsWith('{/*') || trimmed.startsWith('*')) {
        if (!line.includes('*/')) inBlock = true
        return ''
      }
      return line
    })
    .join('\n')
}

/**
 * Les BALISES OUVRANTES du source, attributs compris.
 *
 * ⚠️ Un découpage naïf « de `<` au premier `>` » se coupe sur la flèche de
 * `onKeyDown={event => …}` — le piège nommé dans CLAUDE.md, et il est bien
 * présent dans `grouped-tab-nav.tsx`, DEUX lignes avant le `className` qui
 * nous intéresse. Ce scanner suit donc la profondeur des accolades et l'état
 * des guillemets : le `>` d'une flèche est à l'intérieur d'un `{…}`, il ne
 * ferme rien.
 */
function openingTags(source: string): string[] {
  const tags: string[] = []
  for (let i = 0; i < source.length; i++) {
    if (source[i] !== '<') continue
    if (!/[A-Za-z]/.test(source[i + 1] ?? '')) continue
    let depth = 0
    let quote: string | null = null
    let j = i + 1
    for (; j < source.length; j++) {
      const char = source[j]
      if (quote) {
        if (char === quote) quote = null
        continue
      }
      if (char === '"' || char === "'" || char === '`') {
        quote = char
        continue
      }
      if (char === '{') depth++
      else if (char === '}') depth--
      else if (char === '>' && depth <= 0) break
    }
    if (j < source.length) tags.push(source.slice(i, j + 1))
  }
  return tags
}

type Offence = { file: string; role: string; token: string }

/** L'étage ÉCRIT sur une balise, ou `null` si elle n'en écrit aucun. */
function stageOf(tag: string, scale: Record<string, number>): { token: string; rank: number } | null {
  const named = tag.match(NAMED_TOKEN)
  if (named && scale[named[1]] !== undefined) return { token: `z-${named[1]}`, rank: scale[named[1]]! }
  const raw = tag.match(RAW_TOKEN)
  if (raw) return { token: `z-${raw[1]}`, rank: Number(raw[1].replace(/[[\]]/g, '')) }
  return null
}

function scan(source: string, label: string, scale: Record<string, number>): Offence[] {
  const found: Offence[] = []
  for (const tag of openingTags(stripComments(source))) {
    const role = tag.match(PANEL_ROLES)
    if (!role) continue
    if (!FLOATING.test(tag)) continue
    const stage = stageOf(tag, scale)
    if (!stage) continue
    if (stage.rank > scale.nav!) continue
    found.push({ file: label, role: role[1]!, token: stage.token })
  }
  return found
}

const SCALE = readScale()
const CORPUS = [...sourceFiles(UI_SRC), ...sourceFiles(WEB_SRC)]

/** Les panneaux surgissants FLOTTANTS qui écrivent un étage — le corpus utile. */
function floatingPanels(): Array<{ file: string; token: string; rank: number }> {
  const out: Array<{ file: string; token: string; rank: number }> = []
  for (const file of CORPUS) {
    for (const tag of openingTags(stripComments(readFileSync(file, 'utf8')))) {
      if (!PANEL_ROLES.test(tag)) continue
      if (!FLOATING.test(tag)) continue
      const stage = stageOf(tag, SCALE)
      if (!stage) continue
      out.push({ file: relative(join(WEB_SRC, '../../..'), file), token: stage.token, rank: stage.rank })
    }
  }
  return out
}

describe('GA-289 — #1867 : un panneau surgissant passe devant la chrome qui l’ouvre', () => {
  it('LIT vraiment l’échelle, deux corpus non vides, et au moins un panneau flottant', () => {
    // Preuve n°1 : sans elle, un chemin faux rendrait ce fichier vert en ne
    // lisant rien — « six gardes borgnes en deux jours », dont trois par un
    // glob qui ne matchait aucun fichier.
    // #2212.2 — `guide` (65) rejoint l'échelle. Cette liste est VOLONTAIREMENT
    // exhaustive : ajouter un étage est une décision, pas un détail, et cette
    // assertion est ce qui force à l'écrire. Le spotlight du guide se place
    // au-dessus d'une modale (60) — un pas de guide peut désigner une cible DANS
    // un tiroir (#2212.25), et à 60 ou moins le halo passerait derrière ce qu'il
    // désigne — et sous le toast (70), parce qu'un guide ne passe jamais devant
    // ce qui prévient.
    expect(Object.keys(SCALE).sort()).toEqual(['devtools', 'guide', 'nav', 'overlay', 'picker', 'toast', 'widget'])
    expect(SCALE.nav).toBe(40)
    expect(SCALE.picker).toBeGreaterThan(SCALE.nav!)
    expect(SCALE.guide).toBeGreaterThan(SCALE.overlay!)
    expect(SCALE.guide).toBeLessThan(SCALE.toast!)
    expect(CORPUS.length).toBeGreaterThan(1000)
    expect(CORPUS.some(f => f.endsWith('molecules/grouped-tab-nav.tsx'))).toBe(true)
    expect(CORPUS.some(f => f.endsWith('layout/PageHeader.tsx'))).toBe(true)

    // Et le corpus UTILE — celui que la règle juge — n'est pas vide non plus :
    // une garde qui ne trouve aucun panneau flottant ne garde rien.
    const panels = floatingPanels()
    expect(panels.length).toBeGreaterThan(0)
    expect(panels.some(p => p.file.endsWith('grouped-tab-nav.tsx'))).toBe(true)
  })

  it('sait dire NON — le menu de #1867, tel qu’il était, est refusé', () => {
    // Preuve n°2 : le code protégé, cassé volontairement. Copie conforme de
    // `grouped-tab-nav.tsx` AVANT le correctif, `onKeyDown` compris — c'est
    // lui qui piégeait un extracteur de balise naïf.
    const cassé = [
      '<div',
      '  id={`${menuId}-${group.key}`}',
      '  role="menu"',
      '  aria-label={group.label}',
      '  tabIndex={-1}',
      '  onKeyDown={event => {',
      "    if (event.key === 'Escape') setOpenGroup(null)",
      '  }}',
      '  className="absolute left-0 top-full z-nav mt-1 flex min-w-56 flex-col gap-0.5 rounded-lg border p-1.5 shadow-lg"',
      '>',
    ].join('\n')
    expect(scan(cassé, 'synthétique', SCALE)).toHaveLength(1)

    // La même faute écrite en valeur brute, et une plus basse encore.
    expect(scan('<div role="menu" className="absolute z-40" >', 'synthétique', SCALE)).toHaveLength(1)
    expect(scan('<ul role="listbox" className="fixed z-10" >', 'synthétique', SCALE)).toHaveLength(1)
  })

  it('n’attrape pas ce qu’elle ne vise pas', () => {
    const innocent = [
      // LA CHROME ELLE-MÊME : elle a le droit d'être `z-nav`, c'est son étage.
      '<header className={`relative flex h-12 shrink-0 top-0 z-nav backdrop-blur-xl border-b`} >',
      "<div className={cn('absolute inset-y-0 z-nav hidden h-full w-[var(--sidebar-width)] md:flex')} >",
      // Le même menu, CORRIGÉ : `z-picker` passe devant la chrome.
      '<div role="menu" className="absolute left-0 top-full z-picker mt-1 flex" >',
      '<div role="dialog" className="fixed inset-0 z-overlay" >',
      // Un `role` de panneau qui ne FLOTTE pas : une liste dans le flux, à sa
      // place dans la page — elle ne recouvre rien (`NeedWizard.tsx`).
      '<div role="listbox" aria-label={t(\'openNeeds.createNeed.projectLabel\')} className="max-h-40 overflow-y-auto rounded-md border" >',
      // Un empilement LOCAL, sans rôle de panneau : une colonne collante.
      '<Box className="sticky left-0 z-10 w-56 shrink-0 border-r bg-card px-3 py-2" />',
      // Une COMPARAISON numérique, qui ouvre un faux `<` pour un extracteur
      // trop gourmand — et le texte avalé derrière ne porte aucun rôle.
      '{index < currentStageIndex && <Check className="size-3.5" />}',
      // Un commentaire qui CITE la faute : il ne peint rien.
      '// le menu portait `role="menu"` et `absolute … z-nav` avant #1867',
      [
        '{/* Le menu de section :',
        '',
        '    il portait `absolute left-0 top-full z-nav` et un role="menu",',
        '    ce qui le faisait passer sous l’entête. */}',
      ].join('\n'),
    ]
    for (const ligne of innocent) {
      expect(scan(ligne, 'synthétique', SCALE), ligne).toHaveLength(0)
    }
  })

  it('aucun panneau surgissant du dépôt ne reste à l’étage de la chrome', () => {
    const offences = CORPUS.flatMap(file =>
      scan(readFileSync(file, 'utf8'), relative(join(WEB_SRC, '../../..'), file), SCALE),
    )
    expect(
      offences,
      offences.length === 0
        ? ''
        : `Panneaux surgissants restés à l'étage de la chrome (z-nav = ${SCALE.nav}) — à ` +
            `z-index ÉGAL c'est l'ordre du DOM qui tranche, et l'entête est rendue après :\n` +
            offences.map(o => `  ${o.file} — role="${o.role}" avec ${o.token}`).join('\n') +
            `\n\nUn menu prend z-picker (${SCALE.picker}), une superposition modale z-overlay (${SCALE.overlay}).`,
    ).toEqual([])
  })
})
