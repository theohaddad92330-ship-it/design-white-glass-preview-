import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CONVERSATIONS_PANEL_STORAGE_KEY,
  readConversationsPanelOpen,
} from '../features/chat/view/conversations-panel-open'

/**
 * GA-111 — la colonne des conversations se replie : ouverte par défaut, masquée
 * en CSS, et son réglage vit à UN seul endroit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-110, sa voisine, garantit que la liste est DANS le chat et nulle part
 * ailleurs. Elle resterait verte si la colonne devenait un bloc fixe de 240 px
 * qu'on ne peut plus refermer, ou si elle s'ouvrait FERMÉE sur un poste neuf —
 * les deux moitiés de la demande de Louis du 30/08/2026 (« une petite sidebar
 * […] qui peut se refermer »), et les deux façons de la rater.
 *
 * Quatre règles, chacune née d'un défaut déjà vécu dans ce dépôt :
 *
 *   1. **Le défaut est OUVERT.** Une fonctionnalité derrière un repli fermé sur
 *      un écran neuf est une fonctionnalité qu'on ne trouve plus :
 *      `/actions/sequences` est resté orphelin des mois pour cette raison. La
 *      liste était TOUJOURS visible avant ce lot — la refermer par défaut aurait
 *      été un retrait déguisé en déplacement.
 *   2. **Le bouton porte un nom et dit son état.** Il ne montre qu'une icône
 *      (GA-32), et il annonce `aria-expanded` : sans lui, un lecteur d'écran
 *      entend « bouton » et ne sait pas ce qu'il vient de faire.
 *   3. **Le réglage vit à UN endroit** (GA-26). Deux fichiers qui écrivent la
 *      même clé de stockage divergent au premier renommage — c'est le défaut
 *      « clé de cache recopiée à la main », déjà vécu ici.
 *   4. **Ce qui est masqué l'est en CSS, dans le MÊME rendu.** Un
 *      `useIsMobile()` qui décide de RENDRE ou non la colonne perdrait la
 *      position de défilement et le filtre tapé à chaque bascule, et
 *      relancerait un appel réseau. C'est la règle mobile du dépôt (GA-28/29),
 *      appliquée ici parce que cette colonne est précisément une colonne qui
 *      disparaît sous 768 px.
 */

const WEB_SRC = join(__dirname, '..')
const PANEL = join(WEB_SRC, 'features', 'chat', 'view', 'ConversationsPanel.tsx')
const SETTING = join(WEB_SRC, 'features', 'chat', 'view', 'conversations-panel-open.ts')

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

/** Leçon GA-08 : la prose d'un fichier ne doit jamais l'accuser. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Règle 2 — le bouton de repli est-il nommé et annoncé ? */
function toggleIsNamedAndAnnounced(source: string): boolean {
  const code = stripComments(source)
  return /aria-expanded=\{open\}/.test(code) && /aria-label=\{t\(open \?/.test(code)
}

/** Règle 4 — la colonne se masque-t-elle en CSS, sans décider en JS ? */
function hidesInCss(source: string): boolean {
  const code = stripComments(source)
  return code.includes('max-md:hidden') && !/useIsMobile|matchMedia|window\.innerWidth/.test(code)
}

/**
 * Règle 3 — qui écrit la clé de stockage EN LITTÉRAL, dans un corpus donné ?
 *
 * Le lecteur est un paramètre pour que la preuve du rouge emprunte le chemin du
 * vert. Et on cherche la VALEUR de la clé, pas le nom de la constante : c'est la
 * valeur qui fait deux réglages quand elle est recopiée.
 */
function filesSpellingTheKey(files: readonly string[], read: (file: string) => string): string[] {
  return files.filter(file => stripComments(read(file)).includes(`'${CONVERSATIONS_PANEL_STORAGE_KEY}'`)).sort()
}

const FILES = sourceFiles(WEB_SRC)

describe('GA-111 — la garde LIT quelque chose', () => {
  it('balaie tout `apps/web/src`, et y trouve les deux fichiers du repli', () => {
    expect(FILES.length).toBeGreaterThan(200)
    for (const file of [PANEL, SETTING]) {
      expect(FILES).toContain(file)
      expect(readFileSync(file, 'utf8').length).toBeGreaterThan(200)
    }
  })

  it('la clé de stockage existe et n’est pas vide — elle est LUE, pas recopiée', () => {
    expect(CONVERSATIONS_PANEL_STORAGE_KEY).toMatch(/^bellum-/)
    expect(CONVERSATIONS_PANEL_STORAGE_KEY.length).toBeGreaterThan(10)
  })
})

describe('GA-111 — règle 1 : la colonne s’ouvre DÉPLIÉE', () => {
  it('sans rien de stocké, la porte rend `true`', () => {
    localStorage.removeItem(CONVERSATIONS_PANEL_STORAGE_KEY)
    expect(readConversationsPanelOpen()).toBe(true)
  })

  it('la porte LIT vraiment le stockage — sinon elle rendrait `true` quoi qu’il arrive', () => {
    // Sans cette assertion, un `return true` nu passerait le test ci-dessus.
    localStorage.setItem(CONVERSATIONS_PANEL_STORAGE_KEY, 'false')
    try {
      expect(readConversationsPanelOpen()).toBe(false)
    } finally {
      localStorage.removeItem(CONVERSATIONS_PANEL_STORAGE_KEY)
    }
  })
})

describe('GA-111 — règle 2 : le bouton de repli est nommé et annonce son état', () => {
  it('le panneau porte `aria-label` ET `aria-expanded` sur sa bascule', () => {
    expect(toggleIsNamedAndAnnounced(readFileSync(PANEL, 'utf8'))).toBe(true)
  })

  it('la garde sait dire NON — une bascule muette est refusée', () => {
    const broken = '<button type="button" onClick={toggleOpen}><PanelLeftClose /></button>'
    expect(toggleIsNamedAndAnnounced(broken)).toBe(false)
  })

  it('elle sait aussi dire NON à la MOITIÉ de la règle — nommée mais sans état', () => {
    const half = '<button type="button" aria-label={t(open ? "a" : "b")} onClick={toggleOpen} />'
    expect(toggleIsNamedAndAnnounced(half)).toBe(false)
  })
})

describe('GA-111 — règle 3 : le réglage vit à un seul endroit', () => {
  it('un seul fichier écrit la clé en littéral', () => {
    expect(filesSpellingTheKey(FILES, file => readFileSync(file, 'utf8'))).toEqual([SETTING])
  })

  it('la garde sait dire NON — une clé recopiée ailleurs est refusée', () => {
    const elsewhere = join(WEB_SRC, 'features', 'chat', 'view', 'Ailleurs.tsx')
    const fake = (file: string) =>
      file === SETTING || file === elsewhere ? `const k = '${CONVERSATIONS_PANEL_STORAGE_KEY}'` : ''
    expect(filesSpellingTheKey([SETTING, elsewhere], fake)).toEqual([SETTING, elsewhere].sort())
  })
})

describe('GA-111 — règle 4 : masquée en CSS, jamais par un rendu conditionnel', () => {
  it('le panneau porte `max-md:hidden` et ne consulte aucune largeur en JS', () => {
    expect(hidesInCss(readFileSync(PANEL, 'utf8'))).toBe(true)
  })

  it('la garde sait dire NON — un `useIsMobile()` dans le panneau est refusé', () => {
    const broken = 'const isMobile = useIsMobile()\nreturn isMobile ? null : <aside className="max-md:hidden" />'
    expect(hidesInCss(broken)).toBe(false)
  })

  it('elle sait aussi dire NON à l’absence de repli mobile', () => {
    const noBreakpoint = 'return <aside className="w-60" />'
    expect(hidesInCss(noBreakpoint)).toBe(false)
  })
})
