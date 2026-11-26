/**
 * GA-44 — un raccourci qu'il faut deviner n'existe pas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE A TROUVÉ EN NAISSANT
 * ─────────────────────────────────────────────────────────────────────────
 * Tome 7 §30 : « **tout raccourci est affiché dans le tooltip du bouton
 * correspondant. Un raccourci qu'il faut découvrir n'existe pas.** »
 *
 * Mesuré le 29/08/2026 : le dépôt web entier contenait **un seul `<kbd>`**,
 * celui de la liste `⌘/` — c'est-à-dire que le seul endroit qui affichait les
 * raccourcis n'était atteignable que par un raccourci que rien n'annonçait.
 * `⌘K` (Laura), `G`+lettre (navigation) et `⌘B` (repli de la barre)
 * fonctionnaient tous, et aucun écran ne les disait.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE GARDAIT DE TRAVERS, ET LA CORRECTION DU 30/08
 * ─────────────────────────────────────────────────────────────────────────
 * Sa première version demandait à chaque raccourci de NOMMER LE FICHIER du
 * bouton qui l'affiche (`shownIn`), et vérifiait que ce fichier lit le registre.
 * C'est une garde d'EMPLACEMENT — or la règle porte sur la VISIBILITÉ.
 *
 * Le défaut s'est vu tout de suite : quand les capuchons permanents ont quitté
 * la barre latérale (Louis, 30/08 : sept capuchons en continu sur huit lignes,
 * « ça pollue l'interface »), `AppSidebar.tsx` a continué d'importer le registre
 * pour son infobulle — et cette garde serait restée VERTE alors même que plus
 * rien ne s'affichait dans la ligne. Une garde borgne de plus : la septième en
 * trois jours.
 *
 * Elle vérifie désormais le fait lui-même, au seul niveau où il existe : elle
 * MONTE la page dédiée et regarde ce qui s'y affiche. Du code juste que
 * personne ne rend ne passe plus.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE, ET POURQUOI CHAQUE POINT
 * ─────────────────────────────────────────────────────────────────────────
 * 1. **Le corpus n'est pas vide** — une garde qui ne lit rien est verte pour
 *    toujours. Sept gardes borgnes en trois jours dans ce dépôt.
 * 2. **Chaque raccourci du registre est RENDU sur la page dédiée**, avec ses
 *    touches, son libellé et sa portée. Assertion sur le DOM, pas sur du texte.
 * 3. **La page LIT le registre** au lieu de le recopier — une liste recopiée
 *    reste juste jusqu'au premier changement de touche, puis ment en silence.
 * 4. **`<kbd>` n'est rendu qu'à un seul endroit** — un capuchon écrit à la main
 *    n'affiche plus la bonne touche le jour où elle change, et affiche `⌘` à
 *    quelqu'un sous Windows. Les deux défauts sont muets.
 * 5. **Chaque `tooltipIn` existe et LIT le registre** — la surface à la demande
 *    qui survit aux capuchons ; un chemin déclaré vers un fichier qui n'importe
 *    pas le registre est une promesse que personne ne tient.
 * 6. **`⌘B` du registre = la constante de `packages/ui`** — le seul fait écrit à
 *    deux endroits (le gestionnaire vit dans le composant `Sidebar`, qui ne peut
 *    pas importer l'app web), donc le seul qui puisse diverger.
 * 7. **Chaque libellé, chaque description et chaque portée existent en FR ET en
 *    EN** — un raccourci affiché avec sa clé i18n brute (`goto.accounts`) est
 *    pire que pas affiché du tout.
 */
import { DEFAULT_BRAND_NAME, DEFAULT_COPILOT_NAME } from '@bellum/contracts'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ShortcutsSettingsView } from '@/features/shortcuts/view/ShortcutsSettingsView'
import { SHORTCUTS, SHORTCUT_SCOPES } from '@/features/shortcuts/shortcuts'
import fr from '@/i18n/locales/fr/shortcuts.json'
import en from '@/i18n/locales/en/shortcuts.json'

const SRC = join(__dirname, '..')
const SHORTCUTS_DIR = join(SRC, 'features/shortcuts')
const UI_SIDEBAR = join(SRC, '../../../packages/ui/src/components/sidebar.tsx')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry) || entry.includes('.test.')) continue
    out.push(full)
  }
  return out
}

/**
 * Le code sans ses commentaires.
 *
 * ⚠️ Écrit APRÈS avoir vu la garde rougir sur elle-même : les fichiers du lot
 * CITENT `<kbd>` en commentaire pour expliquer la règle, et la première version
 * les comptait comme des rendus. C'est le défaut « listes découpées sans retirer
 * les commentaires », déjà vécu ici — une garde qui accuse du code irréprochable
 * se fait désactiver dans la semaine.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

/** Résout `global.launcher` dans un catalogue i18n, ou rend `undefined`. */
function lookup(catalog: unknown, path: string): unknown {
  const found = path.split('.').reduce<unknown>((node, key) => {
    if (node === null || typeof node !== 'object') return undefined
    return (node as Record<string, unknown>)[key]
  }, catalog)
  return typeof found === 'string' ? interpolate(found) : found
}

/**
 * Résout `{{brand}}` et `{{copilot}}` comme l'écran le fait.
 *
 * ⚠️ Depuis le marque blanche (01/09/2026), 707 clés de traduction citent la
 * marque par un marqueur plutôt qu'en toutes lettres. Ce test lit le catalogue
 * BRUT et compare à ce que l'écran AFFICHE : sans cette résolution, il
 * chercherait « Conversation avec {{copilot}} » dans un DOM qui montre
 * « Conversation avec Laura », et conclurait que la portée n'est pas affichée.
 *
 * Les valeurs sont celles du repli — celles qu'un espace sans marque propre
 * voit, et donc celles que ce test rend.
 */
function interpolate(value: string): string {
  return value.replaceAll('{{brand}}', DEFAULT_BRAND_NAME).replaceAll('{{copilot}}', DEFAULT_COPILOT_NAME)
}

describe('GA-44 — tout raccourci est LISTÉ sur la page dédiée', () => {
  it('lit un corpus non vide', () => {
    // Le test qui rend les autres crédibles. Sans lui, vider `SHORTCUTS`
    // rendrait cette garde verte — elle n'aurait plus rien à contredire.
    expect(SHORTCUTS.length).toBeGreaterThanOrEqual(8)
    expect(SHORTCUTS.filter(shortcut => shortcut.tooltipIn !== undefined).length).toBeGreaterThanOrEqual(3)
    expect(sourceFiles(SRC).length).toBeGreaterThan(100)
  })

  it('la page dédiée REND chaque raccourci — ses touches, son libellé, sa portée', async () => {
    renderWithRouter(<ShortcutsSettingsView />)
    // Le titre d'abord : sans lui, un composant qui aurait échoué en silence
    // ferait passer les recherches suivantes pour des absences légitimes.
    expect(await screen.findByRole('heading', { name: fr.title })).toBeTruthy()

    const missing: string[] = []
    for (const shortcut of SHORTCUTS) {
      const label = lookup(fr, shortcut.labelKey)
      const row = typeof label === 'string' ? screen.queryAllByText(label) : []
      if (row.length === 0) {
        missing.push(`${shortcut.id} (libellé « ${String(label)} » absent de l'écran)`)
        continue
      }
      // Les TOUCHES, et pas seulement le nom : une page qui listerait
      // « Comptes » sans dire `G C` n'apprend rien.
      const caps = [...document.querySelectorAll('kbd')].map(node => node.textContent)
      for (const segment of shortcut.keys) {
        // `MOD`, `ESC` et `SHIFT` se rendent traduits/selon le clavier (`⌘`/`⇧`
        // sur Apple, sinon le libellé i18n — #2207.67) ; on vérifie les segments
        // littéraux, les seuls dont l'écriture est certaine ici.
        if (segment === 'MOD' || segment === 'ESC' || segment === 'SHIFT') continue
        if (!caps.includes(segment)) missing.push(`${shortcut.id} (touche « ${segment} » non affichée)`)
      }
      // La PORTÉE — la moitié de l'information, et elle n'était visible nulle
      // part avant ce lot : `G C` sur une ligne ne dit pas s'il répond partout
      // ou seulement dans une liste.
      const scope = lookup(fr, `scopes.${shortcut.scope}.name`)
      if (typeof scope !== 'string' || screen.queryAllByText(scope).length === 0) {
        missing.push(`${shortcut.id} (portée « ${shortcut.scope} » non affichée)`)
      }
    }
    expect(missing).toEqual([])
  })

  it('la page LIT le registre au lieu de le recopier', () => {
    const view = readFileSync(join(SHORTCUTS_DIR, 'view/ShortcutsSettingsView.tsx'), 'utf8')
    expect(view).toContain('shortcutsInScope')
  })

  it('les gestionnaires NAVIGUENT vers l’adresse du registre, sans la recopier', () => {
    // La page annonce « où ça mène » d'après le registre. Si le gestionnaire
    // navigue ailleurs, la page ment — et c'est le pire des deux mondes : une
    // aide qui décrit un produit qui n'existe pas. Le champ `to` est donc la
    // SEULE adresse, et `shortcutTarget` LÈVE plutôt que de retomber sur un
    // repli écrit à côté.
    const provider = stripComments(readFileSync(join(SHORTCUTS_DIR, 'ShortcutsProvider.tsx'), 'utf8'))
    expect(provider).toContain('shortcutTarget')
    expect(provider).toMatch(/navigate\(/)
    // Aucune adresse en dur : le jour où `/chat` change, une seule ligne bouge.
    expect(provider).not.toMatch(/to:\s*['"]\//)
  })

  it('ne rend `<kbd>` qu’à un seul endroit', () => {
    // Un capuchon écrit à la main dans un bouton est un DOUBLON du registre :
    // il ne suit pas un changement de touche, et il affiche ⌘ sous Windows.
    const files = sourceFiles(SRC)
    const withKbd = files
      .filter(file => stripComments(readFileSync(file, 'utf8')).includes('<kbd'))
      .map(file => file.replace(/.*\/src\//, 'src/'))
    expect(withKbd).toEqual(['src/features/shortcuts/ShortcutKeys.tsx'])
    // Preuve que le retrait des commentaires n'a pas tout emporté : le corpus
    // dépouillé contient toujours du JSX.
    expect(files.filter(file => stripComments(readFileSync(file, 'utf8')).includes('<span')).length).toBeGreaterThan(50)
  })

  it('chaque `tooltipIn` désigne un fichier qui existe ET qui lit le registre', () => {
    // La surface à la demande — la seule que ce lot conserve dans la barre.
    // Un chemin qui pointe vers un fichier n'important pas le registre est une
    // promesse d'infobulle que personne ne tient.
    const offenders: string[] = []
    for (const shortcut of SHORTCUTS) {
      if (shortcut.tooltipIn === undefined) continue
      const file = join(SRC, shortcut.tooltipIn)
      if (!existsSync(file)) {
        offenders.push(`${shortcut.id} → ${shortcut.tooltipIn} (fichier absent)`)
        continue
      }
      const source = readFileSync(file, 'utf8')
      if (!source.includes('@/features/shortcuts/')) {
        offenders.push(`${shortcut.id} → ${shortcut.tooltipIn} (n'importe pas le registre)`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('déclare pour ⌘B la touche que `packages/ui` écoute vraiment', () => {
    // Le seul fait écrit à deux endroits, donc le seul qui puisse diverger en
    // silence : le jour où la constante passe à 'e', la page continuerait
    // d'annoncer ⌘B.
    const source = readFileSync(UI_SIDEBAR, 'utf8')
    const match = /const SIDEBAR_KEYBOARD_SHORTCUT = '([^']+)'/.exec(source)
    // La regex fait partie de ce qui peut casser : si elle ne matche plus, la
    // garde ne doit pas devenir verte en silence.
    expect(match, 'SIDEBAR_KEYBOARD_SHORTCUT introuvable dans packages/ui').not.toBeNull()
    const declared = SHORTCUTS.find(shortcut => shortcut.id === 'sidebar')
    expect(declared?.keys).toEqual(['MOD', match![1].toUpperCase()])
  })

  it('chaque libellé, description et portée existe en FR et en EN', () => {
    const missing: string[] = []
    for (const shortcut of SHORTCUTS) {
      for (const key of [shortcut.labelKey, shortcut.descriptionKey]) {
        if (typeof lookup(fr, key) !== 'string') missing.push(`fr:${key}`)
        if (typeof lookup(en, key) !== 'string') missing.push(`en:${key}`)
      }
    }
    for (const scope of SHORTCUT_SCOPES) {
      for (const key of [`scopes.${scope}.name`, `scopes.${scope}.explainer`]) {
        if (typeof lookup(fr, key) !== 'string') missing.push(`fr:${key}`)
        if (typeof lookup(en, key) !== 'string') missing.push(`en:${key}`)
      }
    }
    expect(missing).toEqual([])
  })
})
