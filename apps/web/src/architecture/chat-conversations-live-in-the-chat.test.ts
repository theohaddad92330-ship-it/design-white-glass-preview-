import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-110 — la liste des conversations est rendue à UN seul endroit, et cet
 * endroit est l'écran du copilote.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE, ET LE CHIFFRE QUI L'A DÉCLENCHÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * Louis, 30/08/2026 : « ce qui se passe sous le bouton laura prend trop de
 * place, décale ça dans une petite sidebar dans le chat à gauche qui peut se
 * refermer mais sinon on voit plus bien le sidebar principal si on laisse comme
 * ça. »
 *
 * Ce qui se passait sous le bouton, c'était cette liste — rendue par la barre
 * latérale du produit. Mesuré en production le jour même, écran de 861 px :
 *
 *   · le bloc des conversations occupait **510 px** ;
 *   · le conteneur défilant de la navigation n'en gardait que **135 px** pour
 *     **278 px** de contenu ;
 *   · **3 entrées de navigation sur 8** tenaient entièrement dedans.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI DEUX ASSERTIONS ET PAS UNE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une garde qui vérifierait seulement « la colonne existe dans le chat »
 * resterait VERTE le jour où quelqu'un remet la liste dans la barre latérale :
 * les deux seraient vraies en même temps, et l'écran retomberait exactement
 * dans le défaut qu'on vient de corriger. Ce dépôt a produit sept gardes
 * borgnes en trois jours pour cette raison précise.
 *
 * Elle vérifie donc les DEUX moitiés du déplacement, et une troisième qui les
 * relie :
 *
 *   1. `Chat.tsx` monte `<ConversationsPanel` — la colonne existe ;
 *   2. `SidebarConversations` ne rend RIEN — la barre latérale ne peut plus la
 *      rendre ;
 *   3. `ConversationsPanel` n'est importé QUE par `Chat.tsx` — un second
 *      montage referait deux listes, et la seconde diverge toujours de la
 *      première (c'est déjà arrivé deux fois sur cet écran).
 *
 * ⚠️ Le montage résiduel `<SidebarConversations />` vit encore dans
 * `components/sidebar/CustomerNavbarBody.tsx`, un fichier qu'un lot concurrent
 * modifiait au moment de celui-ci. Sa suppression est parquée (**D314**). La
 * règle 2 est écrite pour rester juste avant ET après : un composant qui ne rend
 * rien, puis un fichier qui n'existe plus, échouent tous les deux au test « il
 * rend la liste ».
 */

const WEB_SRC = join(__dirname, '..')
const CHAT = join(WEB_SRC, 'features', 'chat', 'view', 'Chat.tsx')
const PANEL = join(WEB_SRC, 'features', 'chat', 'view', 'ConversationsPanel.tsx')
const SIDEBAR_SHELL = join(WEB_SRC, 'features', 'chat', 'view', 'SidebarConversations.tsx')

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

/**
 * Retire les commentaires AVANT toute lecture.
 *
 * Sans cela ce fichier-ci, qui cite `<ConversationsPanel` et
 * `SidebarConversations` dans sa propre prose, se dénoncerait — et surtout le
 * docblock de la coquille vide, qui explique ce qu'il ne fait PAS, la ferait
 * échouer en décrivant le JSX qu'elle ne rend plus. Leçon GA-08.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Règle 1 — ce fichier monte-t-il la colonne ? */
function mountsPanel(source: string): boolean {
  return /<ConversationsPanel\b/.test(stripComments(source))
}

/** Règle 2 — ce fichier rend-il quoi que ce soit ? Une balise JSX ouvrante suffit. */
function rendersAnything(source: string): boolean {
  return /<[A-Za-z][A-Za-z0-9]*[\s/>]/.test(stripComments(source))
}

/** Règle 3 — ce fichier importe-t-il la colonne ? */
function importsPanel(source: string): boolean {
  return /import\s*\{[^}]*\bConversationsPanel\b[^}]*\}\s*from/.test(stripComments(source))
}

/**
 * Les importateurs de la colonne, dans un corpus donné.
 *
 * Le LECTEUR est un paramètre pour que le test « sait dire NON » exécute LA
 * MÊME fonction sur un corpus fabriqué. Une garde dont la preuve du rouge
 * n'emprunte pas le chemin du vert ne prouve rien.
 */
function importersOf(files: readonly string[], read: (file: string) => string): string[] {
  return files.filter(file => importsPanel(read(file))).sort()
}

const FILES = sourceFiles(WEB_SRC)

describe('GA-110 — la garde LIT quelque chose', () => {
  it('balaie tout `apps/web/src`, et y trouve les trois fichiers du lot', () => {
    expect(FILES.length).toBeGreaterThan(200)
    for (const file of [CHAT, PANEL, SIDEBAR_SHELL]) {
      expect(FILES).toContain(file)
      expect(readFileSync(file, 'utf8').length).toBeGreaterThan(200)
    }
  })

  it('le détecteur de montage voit un vrai montage — sinon il serait vert pour toujours', () => {
    // Il DOIT être vrai sur le fichier réel : un détecteur qui ne trouve jamais
    // rien passe tous les tests sans rien garder.
    expect(mountsPanel(readFileSync(CHAT, 'utf8'))).toBe(true)
    expect(rendersAnything(readFileSync(PANEL, 'utf8'))).toBe(true)
  })
})

describe('GA-110 — la colonne existe DANS le chat', () => {
  it('`Chat.tsx` monte `<ConversationsPanel`', () => {
    expect(mountsPanel(readFileSync(CHAT, 'utf8'))).toBe(true)
  })

  it('la garde sait dire NON — un `Chat.tsx` sans la colonne est refusé', () => {
    const broken = 'export function Chat() {\n  return <ChatMain />\n}\n'
    expect(mountsPanel(broken)).toBe(false)
  })
})

describe('GA-110 — la barre latérale ne rend plus la liste', () => {
  it('`SidebarConversations` ne rend RIEN', () => {
    expect(rendersAnything(readFileSync(SIDEBAR_SHELL, 'utf8'))).toBe(false)
  })

  it('la garde sait dire NON — la moindre balise JSX y est refusée', () => {
    const broken = 'export function SidebarConversations() {\n  return <ConversationList />\n}\n'
    expect(rendersAnything(broken)).toBe(true)
  })

  it('un commentaire qui PARLE de JSX ne compte pas — la garde n’accuse pas la prose', () => {
    // C'est exactement ce qui rendrait la garde insupportable : la coquille vide
    // documente ce qu'elle ne rend plus, et un extracteur naïf l'accuserait.
    const documented = '/** Ne remets pas <ConversationList /> ici. */\nexport function X() {\n  return null\n}\n'
    expect(rendersAnything(documented)).toBe(false)
  })
})

describe('GA-110 — un seul montage, donc une seule liste', () => {
  it('`ConversationsPanel` n’est importé que par `Chat.tsx`', () => {
    expect(importersOf(FILES, file => readFileSync(file, 'utf8'))).toEqual([CHAT])
  })

  it('la garde sait dire NON — un second importateur est refusé, par LA MÊME fonction', () => {
    const IMPORT = "import { ConversationsPanel } from '@/features/chat/view/ConversationsPanel'\n"
    const elsewhere = join(WEB_SRC, 'components', 'sidebar', 'Ailleurs.tsx')
    const fake = (file: string) => (file === CHAT || file === elsewhere ? IMPORT : '')
    expect(importersOf([CHAT, elsewhere], fake)).toEqual([CHAT, elsewhere].sort())
  })
})
