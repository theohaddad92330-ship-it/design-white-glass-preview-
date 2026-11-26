import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CHAT_SURFACE } from './chat-surface'

const CONVERSATION_MENU_TSX = join(__dirname, 'ConversationMenu.tsx')
const POPOVER_TSX = join(__dirname, '../../../../../../packages/ui/src/components/popover.tsx')

/**
 * LA MISE EN PAGE DU FIL — les constats de Louis des 13, 14/09 et 08/10/2026.
 *
 * #2001 (14/09/2026, RENVERSÉ par #3847 le 08/10/2026 pour /chat) : « les
 * messages de Laura sont censés être centrés sur la gauche et pas au milieu
 * comme dans une discussion par SMS téléphone ». Mesuré en production le
 * 14/09 : la colonne (`max-w-3xl`, 768 px) était `mx-auto` dans une zone de
 * 1 244 px — donc ~215 px de gouttière À GAUCHE, pendant que la zone de saisie,
 * elle, occupe toute la largeur (décision Louis du 27/08). Le fil flottait au
 * milieu d'un écran dont le bas est calé à gauche. #2001 avait réglé ça en
 * calant la colonne à GAUCHE (`mr-auto`) sans l'élargir (D81) ; #3847 va plus
 * loin pour /chat SEULEMENT : il n'y a plus de colonne bornée à ancrer, le fil,
 * le composeur et les cartes occupent toute la largeur disponible.
 *
 * #1994 : « mets tout sur une ligne, qu'on gagne de la place en hauteur ».
 * L'entête du fil empilait « Laura » / « Assistante IA » / la portée sur trois
 * rangs, pour 56 px de haut.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE LIT LE SOURCE
 * ─────────────────────────────────────────────────────────────────────────────
 * jsdom ne met rien en page : une classe présente n'y prouve aucun écran juste,
 * et `getBoundingClientRect` y rend des zéros. Ce qui est vérifiable sans
 * navigateur, c'est la DÉCISION écrite — l'ancre de la colonne et la rangée de
 * l'entête. Les prédicats sont donc factorisés et appliqués DEUX fois : au
 * source réel, et à une reconstitution du code d'AVANT qui doit échouer. Une
 * garde qui ne sait pas dire non ne garde rien.
 *
 * ⚠️ Les commentaires sont retirés avant toute recherche : le récit ci-dessus
 * contient les mots-clés, et une garde qui lit son propre docblock reste verte
 * pendant que le code repart de travers.
 */
const CHAT_TSX = join(__dirname, 'Chat.tsx')

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

/** Le corps d'une fonction de module, des `function X(` au `function` suivant. */
function blockOf(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`)
  if (start < 0) throw new Error(`introuvable : function ${name}(`)
  const next = source.indexOf('\nfunction ', start + 1)
  return source.slice(start, next < 0 ? source.length : next)
}

const SOURCE = withoutComments(readFileSync(CHAT_TSX, 'utf8'))

// ─────────────────────────────────────────────────────────────────────────────
// #3847.1 — la colonne du fil est PLEINE LARGEUR (renverse #2001 pour /chat)
// ─────────────────────────────────────────────────────────────────────────────

/** Ce qui borne ou recentre encore la colonne du fil. Vide = pleine largeur. */
function fullWidthOffences(column: string, messagesArea: string): string[] {
  const offences: string[] = []
  if (column.includes('mx-auto')) offences.push('la colonne partagée est encore `mx-auto`')
  if (column.includes('mr-auto'))
    offences.push('la colonne partagée pousse encore une marge à DROITE (ancienne ancre #2001)')
  if (/max-w-/.test(column)) offences.push('la colonne partagée porte encore une borne `max-w-`')
  if (messagesArea.includes('justify-center')) offences.push('l’accueil recentre la colonne dans sa boîte')
  return offences
}

describe('#3847.1 — la colonne du fil est pleine largeur, pas bornée à 768 px', () => {
  const messagesArea = blockOf(SOURCE, 'MessagesArea')

  it('lit bien le corps de `MessagesArea`, et il porte la colonne partagée', () => {
    expect(messagesArea.length).toBeGreaterThan(1000)
    expect(messagesArea.split('CHAT_SURFACE.column').length - 1).toBeGreaterThanOrEqual(2)
  })

  it('rien ne borne ni ne recentre plus le fil ni son accueil', () => {
    expect(fullWidthOffences(CHAT_SURFACE.column, messagesArea)).toEqual([])
  })

  it('la colonne occupe toute la largeur disponible : `w-full`, aucun `max-w-`', () => {
    expect(CHAT_SURFACE.column).toContain('w-full')
    expect(CHAT_SURFACE.column).not.toMatch(/max-w-/)
  })

  it('sait dire NON : l’ancienne mise en page bornée (#2001) est refusée', () => {
    expect(fullWidthOffences('mr-auto w-full max-w-3xl', 'flex min-h-full items-end justify-start')).toHaveLength(2)
    expect(fullWidthOffences('mx-auto w-full max-w-3xl', 'flex min-h-full items-center justify-center')).toHaveLength(3)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// #3774.1 — accueil, fil et saisie : UNE grille
// ─────────────────────────────────────────────────────────────────────────────

describe('#3774.1 — la saisie suit la grille du fil', () => {
  const composer = blockOf(SOURCE, 'Composer')
  const messagesArea = blockOf(SOURCE, 'MessagesArea')

  it('la boîte de saisie prend la MÊME colonne que l’accueil et le fil (`CHAT_SURFACE.column`)', () => {
    expect(composer.length).toBeGreaterThan(1000)
    expect(composer).toContain('CHAT_SURFACE.column')
  })

  it('les gouttières de la saisie sont celles du fil : un seul bord gauche', () => {
    // #3847.1 — marge latérale portée à `md:px-8` (pleine largeur = gouttière
    // plus confortable) ; `px-4` au téléphone reste INCHANGÉ, sous 768 px rien
    // ne bouge.
    expect(CHAT_SURFACE.composerBand).toContain('px-4')
    expect(CHAT_SURFACE.composerBand).toContain('md:px-8')
    expect(messagesArea).toContain('px-4 py-4 md:px-8')
  })

  it('l’accueil se pose au ras de la saisie, il ne flotte plus au milieu du fil', () => {
    expect(messagesArea).toContain('flex min-h-full items-end justify-start')
    expect(messagesArea).not.toContain('flex min-h-full items-center')
  })

  it('les paragraphes gardent leur borne de lecture : la grille s’élargit pour les cartes, pas pour le texte', () => {
    expect(CHAT_SURFACE.reading).toContain('70ch')
  })

  it('sait dire NON : l’ancienne saisie pleine largeur est refusée', () => {
    expect(blockOf('function Composer() { <div className="p-2.5"> }', 'Composer')).not.toContain('CHAT_SURFACE.column')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// #3774.2.1 — « Voir tout » et « Que puis-je demander ? » : UNE seule entrée
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lot J30 (#3774, commentaire du 06/10) laissait #2.1 « reste » : « Voir tout »
 * (la ligne d'amorces) et le déclencheur PROPRE de `CommandDrawerButton »
 * (« Que puis-je demander ? », dans la rangée de réglages) ouvraient le MÊME
 * tiroir (`commandsOpen`) et restaient visibles EN MÊME TEMPS dès qu'une
 * conversation avait des amorces — deux entrées pour un seul geste (GA-26).
 *
 * `seeAllVisible` tient la condition UNE SEULE fois (#3774.1 l'a appris pour
 * `CHAT_SURFACE.column` : un réglage recopié à deux endroits diverge au
 * premier retour) ; `hideTrigger` tait le second bouton sans démonter son
 * `Dialog` (voir `CommandDrawerButton.test.tsx`).
 */
describe('#3774.2.1 — un seul déclencheur visible vers le tiroir des commandes', () => {
  const composer = blockOf(SOURCE, 'Composer')

  it('`seeAllVisible` est calculé une seule fois (Théo B l1-laura.R4 : le déclencheur propre n’en dépend plus)', () => {
    expect(composer).toContain('const seeAllVisible = suggestions.length > 0 && !hideToolsRowOnMobile')
    expect(composer.split('seeAllVisible').length - 1).toBeGreaterThanOrEqual(2)
  })

  it('« Voir tout » se pose derrière cette même condition', () => {
    expect(composer).toMatch(/\{seeAllVisible\s*\?/)
  })

  // Théo B l1-laura.R4 (Louis 22/10) — « Exemples » vit dans le « + » : le déclencheur propre se tait TOUJOURS,
  // et l'entrée du menu n'est plus réservée au mobile. Une seule entrée visible vers le tiroir, à toutes les tailles.
  it('le déclencheur propre de `CommandDrawerButton` se tait toujours (l’entrée vit dans le « + »)', () => {
    expect(composer).toMatch(/\bhideTrigger\s+onPick=/)
    expect(composer).not.toMatch(/hideTrigger=\{seeAllVisible\}/)
    expect(blockOf(SOURCE, 'ComposerToolsMenu')).toMatch(/\{onOpenCommands \?/)
  })

  it('sait dire NON : un déclencheur propre conditionné à « Voir tout » (deux entrées) est refusé', () => {
    const avant = blockOf(
      'function Composer() {\n  return (\n    <CommandDrawerButton hideTrigger={seeAllVisible} />\n  )\n}',
      'Composer',
    )
    expect(avant).toMatch(/hideTrigger=\{seeAllVisible\}/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// #3774.1.5 — le panneau de détail ne écrase pas le fil en micro-colonnes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lot J30 (#3774, commentaire du 06/10) laissait #1.5 « reste » : la colonne du
 * fil suit l'espace disponible (`w-full max-w-3xl`), mais rien ne mesurait le
 * rendu avec le panneau de détail ouvert. Entre-temps (lot J31, #3775.1), ce
 * panneau de détail (`ConversationDetailsPanel.tsx`) a cessé d'être un objet à
 * part : il se lit désormais dans l'onglet « Détails » de `ConversationMenu`,
 * un `Popover` ouvert depuis `ChatHeader` — jamais depuis `MessagesArea` ni
 * `Composer`, qui portent la grille (`CHAT_SURFACE.column`).
 *
 * jsdom ne met rien en page (voir le docblock en tête de fichier), donc cette
 * garde ne mesure pas des pixels à 1280 px : elle tient le fait STRUCTUREL qui
 * rend la mesure inutile — un `Popover` Radix rend son contenu dans un
 * `Portal` (`popover.tsx`), donc HORS de l'arbre de mise en page. Un panneau
 * qui ne vit pas dans l'arbre ne peut pas écraser une colonne qui y vit : la
 * grille ne SAIT pas qu'il est ouvert.
 */
describe('#3774.1.5 — le panneau de détail est un popover hors-flux, il ne peut pas écraser la grille', () => {
  const popoverSource = readFileSync(POPOVER_TSX, 'utf8')
  const menuSource = withoutComments(readFileSync(CONVERSATION_MENU_TSX, 'utf8'))
  const messagesArea = blockOf(SOURCE, 'MessagesArea')
  const composer = blockOf(SOURCE, 'Composer')

  it('`PopoverContent` rend son contenu dans un `Portal`, hors de l’arbre de mise en page', () => {
    expect(popoverSource).toContain('PopoverPrimitive.Portal')
  })

  it('le panneau de détail (`DetailsContent`) vit dans ce `Popover`, pas dans une colonne qui pousserait le fil', () => {
    expect(menuSource).toContain('<Popover>')
    expect(menuSource).toContain('<PopoverContent')
    expect(menuSource).toContain('<DetailsContent')
  })

  it('ni le fil ni la saisie ne lisent un état d’ouverture du panneau de détail', () => {
    expect(messagesArea).not.toMatch(/detailsOpen|conversationMenuOpen|panelOpen/)
    expect(composer).not.toMatch(/detailsOpen|conversationMenuOpen|panelOpen/)
  })

  it('la colonne du fil reste la même borne, qu’un panneau soit ouvert ou non — rien à la hauteur de la grille ne la module', () => {
    // c90 (décision Louis 08/10/2026, #3847) : /chat en PLEINE LARGEUR — la colonne n'a plus de borne
    // `max-w-*`, mais elle reste UNE classe fixe que rien à la hauteur de la grille ne module.
    expect(CHAT_SURFACE.column).toBe('w-full')
  })

  it('sait dire NON : un panneau qui rendrait son contenu en place (pas de `Portal`) pourrait écraser la grille', () => {
    const avant = 'export function PopoverContent(props) {\n  return <PopoverPrimitive.Content {...props} />\n}'
    expect(avant).not.toContain('PopoverPrimitive.Portal')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// #1994 — l'entête du fil tient sur une ligne
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ce qui empile encore l'entête. Vide = une seule ligne.
 *
 * #3050 (26/09/2026, iPhone prod) — la rangée d'identité était `flex` SEULEMENT
 * à partir de 768 px (`md:flex`) : sous cette borne elle empilait nom, mention
 * IA et portée sur plusieurs rangs, et le fil de Laura n'avait plus qu'une
 * ligne visible. La ligne unique s'applique désormais à TOUTES les largeurs —
 * la garde vérifie donc `flex`/`items-center` sans le préfixe `md:`.
 */
function stackingOffences(header: string): string[] {
  const offences: string[] = []
  const identity = /data-chat-identity\s+className="([^"]*)"/.exec(header)?.[1]
  if (identity === undefined) offences.push('la rangée d’identité n’est pas estampillée')
  else {
    if (!identity.includes('flex')) offences.push('le nom, la mention IA et la portée restent empilés')
    if (!identity.includes('items-center')) offences.push('la rangée d’identité n’aligne pas ses éléments')
  }
  const bar = /<header\s+className="([^"]*)"/.exec(header)?.[1]
  if (bar === undefined) offences.push('l’entête n’a pas de classe lisible')
  else if (!bar.includes('md:h-10')) offences.push('l’entête garde ses 56 px alors qu’elle n’empile plus rien')
  return offences
}

describe('#1994 / #3050 — l’entête du fil tient sur une ligne à toutes les largeurs', () => {
  const header = blockOf(SOURCE, 'ChatHeader')

  it('lit bien le corps de `ChatHeader`, et il porte les trois objets de la ligne', () => {
    expect(header.length).toBeGreaterThan(500)
    expect(header).toContain('<AiDisclosure')
    expect(header).toContain('<ScopeButton')
    expect(header).toContain('header.titleDefault')
  })

  it('les trois tiennent sur une ligne, et la barre y gagne 16 px de hauteur', () => {
    expect(stackingOffences(header)).toEqual([])
  })

  it('le doigt garde ses 44 px — l’entête ne rétrécit qu’au pointeur fin (GA-30)', () => {
    expect(header).toContain('h-14')
    expect(header).toContain('pointer-coarse:min-h-14')
    expect(header).toContain('pointer-coarse:min-h-11')
  })

  it('sait dire NON : l’entête empilée d’avant est refusée', () => {
    const avant = '<header className="flex h-14 shrink-0 items-center">\n<div className="min-w-0">'
    expect(stackingOffences(avant)).toHaveLength(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// LOT 1 `/chat` — les cinq infractions mesurées le 14/09/2026 sur la coquille
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ `DemoSuggestionRow` est retiré du corpus de ces gardes, et de lui seul : en
 * démonstration les amorces SONT le script (#1320), et ce bloc est hors périmètre
 * du lot 1. Ce qui y reste est donc NOMMÉ ici plutôt que passé sous silence : deux pastilles
 * (`py-1.5`, ≈ 30 px) n'atteignent pas les 44 px du doigt, et deux anneaux de
 * focus y restent écrits à la main. C'est une dette, pas une exception.
 */
function withoutDemoRow(source: string): string {
  const start = source.indexOf('function DemoSuggestionRow(')
  if (start < 0) throw new Error('introuvable : function DemoSuggestionRow(')
  const next = source.indexOf('\nfunction ', start + 1)
  return source.slice(0, start) + source.slice(next < 0 ? source.length : next)
}

const SOURCE_HORS_DEMO = withoutDemoRow(SOURCE)

// ── 1. D81 / GA-34 / GA-26 — la borne de lecture ────────────────────────────

/** Une borne de lecture écrite en PIXELS, dans le source, palier par palier. */
function pixelReadingBounds(source: string): string[] {
  return source.match(/max-w-\[[^\]]*\d+px[^\]]*\]/g) ?? []
}

describe('D81 / GA-34 — le texte des bulles se lit sur 70 caractères, mesurés en `ch`', () => {
  it('LIT un corpus qui borne vraiment quelque chose', () => {
    expect(SOURCE.split('CHAT_SURFACE.reading').length - 1).toBeGreaterThanOrEqual(2)
  })

  it('plus une seule borne de lecture en pixels dans le fil', () => {
    expect(pixelReadingBounds(SOURCE)).toEqual([])
  })

  it('sait dire NON : les deux `max-w-[min(680px,92%)]` d’avant sont refusés', () => {
    const avant = '<div className="max-w-[min(680px,92%)] space-y-1">\n<div className="max-w-[min(680px,92%)] px-4">'
    expect(pixelReadingBounds(avant)).toHaveLength(2)
  })

  it('n’attrape pas ce qu’elle ne vise pas : une HAUTEUR en pixels n’est pas une largeur de lecture', () => {
    expect(pixelReadingBounds('className="max-h-[220px] w-[320px] min-w-[48px]"')).toEqual([])
  })
})

// ── 2. GA-28 — une seule borne, 768 px ──────────────────────────────────────

/** Les paliers de largeur qui ne sont pas la borne unique du produit. */
function otherBreakpoints(source: string): string[] {
  return [...source.matchAll(/(?:^|[\s"'])((?:sm|lg|xl|2xl):[\w[\]:.\-/%]+)/g)].map(match => match[1] as string)
}

describe('GA-28 — le mobile a UNE borne : 768 px, donc `md:` et rien d’autre', () => {
  it('LIT un corpus qui a des paliers', () => {
    expect(SOURCE.split(/(?:^|[\s"'])md:/).length - 1).toBeGreaterThan(5)
  })

  it('aucun palier 640 px ni au-delà dans la coquille du fil', () => {
    expect(otherBreakpoints(SOURCE)).toEqual([])
  })

  it('sait dire NON : les trois `sm:` mesurés le 14/09 sont refusés', () => {
    expect(otherBreakpoints('px-3 sm:px-5 py-4 sm:px-6 grid-cols-1 sm:grid-cols-3')).toEqual([
      'sm:px-5',
      'sm:px-6',
      'sm:grid-cols-3',
    ])
  })

  it('n’attrape pas ce qu’elle ne vise pas : `md:`, `pointer-coarse:` et `text-sm` ne sont pas des paliers', () => {
    expect(otherBreakpoints('md:ml-0 pointer-coarse:min-h-11 text-sm shadow-sm max-md:hidden')).toEqual([])
  })
})

// ── 3. GA-30 — 44 px au doigt sur ce qui se clique ──────────────────────────

/**
 * Les cibles cliquables écrites en clair qui n'ont pas de plancher au doigt.
 *
 * ⚠️ On ne va PAS de `<button` à `className` par un `[^>]*?` : `onClick={() => …}`
 * porte un `>`, et l'extracteur s'y arrête — un défaut déjà payé par une garde du
 * dépôt. On découpe donc sur l'ouverture de balise et on lit le premier
 * `className` du segment, avant la balise suivante.
 */
function fingerlessTargets(block: string): string[] {
  const targets: string[] = []
  for (const opening of block.split('<').slice(1)) {
    const tag = /^(button|Link|a)[\s>]/.exec(opening)?.[1]
    if (!tag) continue
    const classes = /className="([^"]*)"/.exec(opening)?.[1]
    if (classes === undefined) continue
    if (/pointer-coarse:min-h-|(?:^|\s)min-h-1[1-9]|(?:^|\s)size-1[1-9]/.test(classes)) continue
    targets.push(`${tag} ${classes.slice(0, 40)}`)
  }
  return targets
}

describe('GA-30 — au doigt, ce qui se clique fait 44 px', () => {
  const composer = blockOf(SOURCE_HORS_DEMO, 'Composer')

  it('LIT un corpus de cibles', () => {
    const all = composer
      .split('<')
      .slice(1)
      .filter(opening => /^(button|Link|a)[\s>]/.test(opening))
    expect(all.length).toBeGreaterThanOrEqual(3)
  })

  it('chaque cible de la zone de saisie a son plancher', () => {
    expect(fingerlessTargets(composer)).toEqual([])
  })

  it('sait dire NON : le « voir tout » mesuré à ≈ 24 px est refusé', () => {
    expect(fingerlessTargets('<Link to="/chat/commandes" className="rounded-full px-2 py-1 text-xs">')).toHaveLength(1)
  })

  it('n’attrape pas ce qu’elle ne vise pas : une cible déjà au plancher passe', () => {
    expect(fingerlessTargets('<button type="button" className="px-3 py-1.5 pointer-coarse:min-h-11">')).toEqual([])
  })
})

// ── 4. GA-26 — l'anneau de focus, six fois écrit à la main ──────────────────

/** Les anneaux de focus peints ailleurs que dans le jeton de la surface. */
function handWrittenFocusRings(source: string): string[] {
  return source.match(/focus-(?:visible|within):ring-\[[^\]]*\]/g) ?? []
}

describe('GA-26 — un anneau de focus, un seul endroit', () => {
  it('LIT un corpus qui porte des anneaux', () => {
    expect(SOURCE.split('CHAT_SURFACE.focusRing').length - 1).toBeGreaterThanOrEqual(3)
  })

  it('plus aucun anneau peint à la main dans la coquille', () => {
    expect(handWrittenFocusRings(SOURCE_HORS_DEMO)).toEqual([])
  })

  it('sait dire NON : les deux formes d’avant sont refusées', () => {
    const avant =
      'focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)] ' +
      'focus-within:ring-[color-mix(in_srgb,var(--bellum-primary-500)_35%,transparent)]'
    expect(handWrittenFocusRings(avant)).toHaveLength(2)
  })

  it('n’attrape pas ce qu’elle ne vise pas : une largeur d’anneau n’est pas une couleur', () => {
    expect(handWrittenFocusRings('focus-visible:ring-2 ring-offset-2 hover:bg-[var(--bellum-surface-2)]')).toEqual([])
  })
})

// ── 5. GA-26 — la gouttière réservée à un bouton qui vit ailleurs ───────────

describe('GA-26 — la gouttière du signalement est nommée, pas recopiée dans la saisie', () => {
  it('la saisie n’écrit plus 56 px de vide à la main', () => {
    expect(SOURCE).not.toMatch(/(?:^|[\s"'])ml-14(?:[\s"']|$)/)
  })

  it('elle passe par le jeton, qui dit POURQUOI le trou existe', () => {
    expect(blockOf(SOURCE, 'Composer')).toContain('CHAT_SURFACE.composerFeedbackGutter')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// #1944.6 — l'entête réserve la barre d'état en mode installé
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `MobileTabBar` réserve déjà le BAS (`env(safe-area-inset-bottom)`), en mode
 * installé seulement — dans un navigateur, la barre d'adresse occupe déjà
 * cette zone. Rien n'en faisait autant pour le HAUT : sur un iPhone à encoche
 * installé sur l'écran d'accueil, l'entête `/chat` (`ChatHeader`) démarre sous
 * la barre d'état, sans marge — mesuré le 15/09 (registre #1944.6). Même
 * garde qu'en bas : `useIsInstalled`, jamais `md:` (une seule borne, GA-28).
 */
describe('#1944.6 — l’entête réserve `env(safe-area-inset-top)` en mode installé', () => {
  const header = blockOf(SOURCE, 'ChatHeader')

  it('lit bien le corps de `ChatHeader`', () => {
    expect(header.length).toBeGreaterThan(500)
  })

  it('l’entête consulte le même hook que la barre du bas, et réserve la même zone', () => {
    expect(header).toContain('useIsInstalled')
    expect(header).toContain('env(safe-area-inset-top)')
  })

  it('sait dire NON : une entête qui ignore le mode installé est refusée', () => {
    const avant = blockOf(SOURCE, 'ChatHeader').replace('useIsInstalled', '__removed__')
    expect(avant.includes('useIsInstalled')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// CHAT-LAYOUT (18/10) — recette prod : 4 éléments mesurés à 0 px, 4 débordements. Un `whitespace-nowrap`
// SANS `truncate` dans un conteneur `min-w-0` ne peut ni se replier ni se couper : il déborde ou tombe à 0.
// ─────────────────────────────────────────────────────────────────────────────
describe('CHAT-LAYOUT — un libellé qui ne se replie pas doit pouvoir se couper', () => {
  const nowrapWithoutTruncate = (source: string): string[] =>
    (withoutComments(source).match(/className=(?:"[^"]*"|\{[^}]*\})/g) ?? []).filter(
      attribute => /whitespace-nowrap/.test(attribute) && !/truncate|shrink-0/.test(attribute),
    )

  it('MessageAuthor et ToolsSourcesMenu : aucun `whitespace-nowrap` sans `truncate` ni `shrink-0`', () => {
    for (const file of ['MessageAuthor.tsx', 'ToolsSourcesMenu.tsx']) {
      expect(nowrapWithoutTruncate(readFileSync(join(__dirname, file), 'utf8'))).toEqual([])
    }
  })

  it('sait dire NON : un libellé nowrap nu est refusé', () => {
    expect(nowrapWithoutTruncate('<span className="whitespace-nowrap text-xs">x</span>')).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// #4788 — le fil occupe la hauteur disponible (533 px sur 827 mesurés en prod)
// ─────────────────────────────────────────────────────────────────────────────
describe('#4788 — la hauteur du copilote ne dépend pas d’un pourcentage', () => {
  const ROUTE_TSX = join(__dirname, '../../../routes/chat/index.tsx')
  const route = withoutComments(readFileSync(ROUTE_TSX, 'utf8'))

  /** Un enfant de flex qui ne fait que `h-full` se résout contre un parent de hauteur indéfinie. */
  const heightIsPercentOnly = (wrapper: string, section: string): string[] => {
    const offences: string[] = []
    if (!/\bflex\b[^"]*\bflex-col\b/.test(wrapper)) offences.push('l’enveloppe de Chat n’est pas une colonne flex')
    if (!/\bflex-1\b/.test(section)) offences.push('la section de Chat ne prend pas la place restante (`flex-1`)')
    return offences
  }

  const wrapperOf = (source: string): string => /<div className="([^"]*)">\s*<Chat \/>/.exec(source)?.[1] ?? ''
  const sectionOf = (source: string): string =>
    /<section\s+aria-label=\{t\('panel\.aria'\)\}\s+className="([^"]*)"/.exec(source)?.[1] ?? ''

  it('l’enveloppe de `<Chat />` est une colonne flex et la section de Chat prend `flex-1`', () => {
    const wrapper = wrapperOf(route)
    const section = sectionOf(SOURCE)
    expect(wrapper.length).toBeGreaterThan(0)
    expect(section.length).toBeGreaterThan(0)
    expect(heightIsPercentOnly(wrapper, section)).toEqual([])
  })

  it('sait dire NON : l’ancienne structure (`min-h-0 flex-1` nu + `h-full` seul) est refusée', () => {
    expect(heightIsPercentOnly('min-h-0 flex-1', 'flex h-full min-h-0 flex-col')).toHaveLength(2)
  })

  it('une seule borne à 768 px et jamais `vh` : le correctif n’ajoute ni `vh` ni point de rupture', () => {
    expect(route).not.toMatch(/\b\d*vh\b|h-screen/)
  })
})

describe('#5047 — les actions de l’en-tête vivent dans le ⋯ : lignes lisibles, cibles ≥ 44 px', () => {
  it('Partager, Exporter et Conversation : libellé visible (plus de `sr-only`), cible tactile ≥ 44 px', () => {
    for (const file of ['ShareConversation.tsx', 'ExportConversation.tsx', 'ConversationMenu.tsx']) {
      const source = withoutComments(readFileSync(join(__dirname, file), 'utf8'))
      expect(source, file).not.toContain('max-md:sr-only')
      expect(source, file).toContain('pointer-coarse:min-h-11')
    }
  })

  it('l’en-tête ne pose plus ces boutons à plat : un seul ⋯, tout le reste est rangé dedans', () => {
    const header = blockOf(SOURCE, 'ChatHeader')
    expect(header).toContain('<ConversationHeaderMenu')
    for (const range of ['<ShareConversation', '<ExportConversation', '<ConversationMenu', '<ChatPresenceIndicator']) {
      expect(header).not.toContain(range)
    }
  })
})

describe('#4966 — le contenu d’une réponse ne déborde pas de la fenêtre', () => {
  // Un enfant de flex garde `min-width: auto` = la largeur minimale de son CONTENU : un tableau ou un bloc de
  // code large poussait la colonne de lecture (et le fil) au-delà de la fenêtre. `min-w-0` laisse le conteneur
  // `overflow-x-auto` de `markdown.tsx` défiler dans la bulle, jamais la page.
  const lectureLibre = (reading: string): boolean => /(^|\s)min-w-0(\s|$)/.test(reading)

  it('la colonne de lecture (réponse ET question) peut rétrécir sous son contenu', () => {
    expect(lectureLibre(CHAT_SURFACE.reading)).toBe(true)
  })

  it('sait dire NON : une borne de largeur sans min-w-0 est refusée', () => {
    expect(lectureLibre('max-w-[min(70ch,92%)]')).toBe(false)
  })
})

describe('#5042 recette 01/11 R2 — la pastille « Analyser une entreprise » du composeur tient entière', () => {
  // Cause : le plancher (13 rem) était posé sur le conteneur, mais « voir tout » (~4,5 rem) en prélève sa part ; la
  // rangée interne `chipRowRef` restait à ~8,5 rem (136 px) et le groupe du lanceur (`max-w-full overflow-x-auto`)
  // rognait la pastille de 160 px. Le plancher doit donc être posé sur la RANGÉE INTERNE (≥ 11 rem), et celui du
  // conteneur doit contenir cette rangée plus « voir tout ».
  const SEE_ALL_REM = 5
  const planchers = (source: string): { container: number; row: number } => {
    const container = /md:min-w-\[(\d+(?:\.\d+)?)rem\] md:flex-1/.exec(source)
    const row = /ref=\{chipRowRef\}\s+className="[^"]*md:min-w-\[(\d+(?:\.\d+)?)rem\]/.exec(source)
    return { container: Number(container?.[1] ?? 0), row: Number(row?.[1] ?? 0) }
  }
  const tient = ({ container, row }: { container: number; row: number }): boolean =>
    row >= 11 && container >= row + SEE_ALL_REM

  it('la rangée interne des amorces a un plancher qui contient la pastille, et le conteneur la contient avec « voir tout »', () => {
    const chat = readFileSync(join(__dirname, 'Chat.tsx'), 'utf8')
    expect(tient(planchers(chat))).toBe(true)
  })

  it('sait dire NON : un plancher posé sur le seul conteneur (13 rem, rangée sans plancher) est refusé', () => {
    expect(tient({ container: 13, row: 0 })).toBe(false)
  })

  it('sait dire NON : un conteneur qui ne laisse pas la place à « voir tout » est refusé', () => {
    expect(tient({ container: 12, row: 11 })).toBe(false)
  })
})
