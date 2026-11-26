import { describe, expect, it } from 'vitest'
import {
  SEQUENCE_LEAD,
  SHORTCUTS,
  gotoTarget,
  isPlainSequenceKey,
  sequencesAllowedOn,
  isTypingTarget,
  matchesChord,
  shortcutById,
  shortcutForRoute,
  shortcutsInScope,
} from './shortcuts'

describe('le registre ne liste que ce qui existe', () => {
  it('annonce ⌘K, qui EXISTE, et toujours pas ⌘J', () => {
    // Le tome disait les deux « posés » ; aucun ne l'était. `⌘K` mène à Laura
    // depuis le 26/08 — il est listé pour CETTE raison, pas parce qu'un
    // document l'annonçait. `⌘J` n'a toujours aucun gestionnaire, et un
    // raccourci listé qui ne fait rien apprend à l'utilisateur que la liste ment.
    const all = SHORTCUTS.map(shortcut => shortcut.keys.join('')).join(' ')
    expect(all).toContain('MODK')
    expect(all).toContain('MODJ')
  })

  it('fait porter à ⌘J le libellé de Laura, et pas celui de l’aide', () => {
    // Garde contre le copier-coller : les deux raccourcis globaux se
    // ressemblent, et un libellé recopié ferait annoncer « cette liste » sur la
    // touche qui mène à Laura.
    const launcher = shortcutById('laura')
    expect(launcher.keys).toEqual(['MOD', 'J'])
    expect(launcher.labelKey).toBe('global.launcher')
    // `to` EST lu depuis le 30/08 : `ShortcutsProvider` navigue vers l'adresse
    // du REGISTRE au lieu de la recopier, et la page dédiée annonce « où ça
    // mène » à partir du même champ. La version précédente de ce test exigeait
    // l'inverse (`toBeUndefined`) pour une raison qui a cessé d'être vraie —
    // « un champ qui a l'air branché sans que rien ne le lise ». Il est lu.
    expect(launcher.to).toBe('/chat')
  })

  it('chaque raccourci de navigation porte une route, et une seule lettre', () => {
    const goto = shortcutsInScope('goto')
    expect(goto.length).toBeGreaterThan(0)
    expect(goto.every(shortcut => typeof shortcut.to === 'string' && shortcut.to.startsWith('/'))).toBe(true)
    expect(goto.every(shortcut => shortcut.keys[0] === SEQUENCE_LEAD && shortcut.keys.length === 2)).toBe(true)
  })

  it('n’attribue jamais deux fois la même combinaison, ni le même identifiant', () => {
    const keys = SHORTCUTS.map(shortcut => shortcut.keys.join('+'))
    expect(new Set(keys).size).toBe(keys.length)
    const ids = SHORTCUTS.map(shortcut => shortcut.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('n’autorise `firesWhileTyping` que sur ⌘J (Laura)', () => {
    // La règle générale est « on ne détourne jamais une touche pendant qu'on
    // écrit ». UNE exception est assumée et documentée ; une deuxième posée
    // sans réflexion rendrait n'importe quel champ du produit inutilisable.
    const exceptions = SHORTCUTS.filter(shortcut => shortcut.firesWhileTyping === true).map(shortcut => shortcut.id)
    expect(exceptions).toEqual(['laura'])
  })

  it('Théo D settings-prefs — la recherche globale est ⌘K, distincte de Laura (⌘J), et ne répond jamais pendant la saisie', () => {
    const globalSearch = shortcutById('global-search')
    expect(globalSearch.keys).toEqual(['MOD', 'K'])
    expect(globalSearch.scope).toBe('global')
    // Contrairement à Laura : voler la touche pendant qu'on écrit ailleurs
    // (un formulaire, une note) ouvrirait la recherche par-dessus une saisie en
    // cours — un geste bien moins primaire que « parler à Laura ».
    expect(globalSearch.firesWhileTyping).not.toBe(true)
  })

  it('lève sur un identifiant inconnu, au lieu de rendre `undefined`', () => {
    // Un bouton qui n'affiche silencieusement rien parce que l'identifiant a
    // été renommé est exactement le défaut que le registre existe pour empêcher.
    expect(() => shortcutById('nexistepas')).toThrow(/nexistepas/)
  })
})

describe('shortcutForRoute — ce que la barre latérale lit', () => {
  it('rend le raccourci de la route', () => {
    expect(shortcutForRoute('/accounts')?.keys).toEqual(['G', 'C'])
  })

  it('rend `undefined` sur une route sans raccourci', () => {
    expect(shortcutForRoute('/settings')).toBeUndefined()
  })
})

describe('matchesChord', () => {
  const laura = shortcutById('laura')
  const globalSearch = shortcutById('global-search')

  it('accepte ⌘ ET Ctrl — un clavier externe sur un Mac n’est pas puni', () => {
    expect(matchesChord(laura, { key: 'j', metaKey: true, ctrlKey: false })).toBe(true)
    expect(matchesChord(laura, { key: 'J', metaKey: false, ctrlKey: true })).toBe(true)
  })

  it('refuse la touche nue', () => {
    expect(matchesChord(laura, { key: 'j', metaKey: false, ctrlKey: false })).toBe(false)
  })

  it('refuse un raccourci qui n’est pas une combinaison', () => {
    // `G C` est une SÉQUENCE : la faire passer par `matchesChord` enverrait sur
    // une page dès qu'on tape ⌘C, c'est-à-dire à chaque copie.
    expect(matchesChord(shortcutById('goto-accounts'), { key: 'c', metaKey: true, ctrlKey: false })).toBe(false)
    expect(matchesChord(shortcutById('escape'), { key: 'Escape', metaKey: true, ctrlKey: false })).toBe(false)
  })

  it('Laura (⌘J) et la recherche (⌘K) ne se répondent jamais l’une à l’autre', () => {
    // Théo D settings-prefs — chaque touche ouvre UNE surface, dans les deux sens.
    expect(matchesChord(globalSearch, { key: 'k', metaKey: true, ctrlKey: false })).toBe(true)
    expect(matchesChord(globalSearch, { key: 'j', metaKey: true, ctrlKey: false })).toBe(false)
    expect(matchesChord(laura, { key: 'k', metaKey: true, ctrlKey: false })).toBe(false)
    expect(matchesChord(laura, { key: 'j', metaKey: true, ctrlKey: false, shiftKey: true })).toBe(false)
  })
})

describe('gotoTarget', () => {
  it('résout la lettre, quelle que soit la casse', () => {
    expect(gotoTarget('c')).toBe('/accounts')
    expect(gotoTarget('C')).toBe('/accounts')
  })

  it('rend null sur une lettre non attribuée', () => {
    expect(gotoTarget('z')).toBeNull()
  })
})

describe('isTypingTarget — on ne vole jamais une touche à quelqu’un qui écrit', () => {
  it('reconnaît un champ de saisie', () => {
    // Sans ce garde, taper « Groupe TF1 » dans une recherche enverrait sur une
    // autre page à la lettre suivante.
    const input = document.createElement('input')
    expect(isTypingTarget(input)).toBe(true)
  })

  it('reconnaît une zone de texte et un select', () => {
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true)
    expect(isTypingTarget(document.createElement('select'))).toBe(true)
  })

  it('reconnaît un bloc éditable', () => {
    const div = document.createElement('div')
    div.contentEditable = 'true'
    Object.defineProperty(div, 'isContentEditable', { value: true })
    expect(isTypingTarget(div)).toBe(true)
  })

  it('reconnaît une combobox ARIA, et un descendant d’une zone de saisie ARIA', () => {
    // Une combobox de recherche porte `role="combobox"` sur un conteneur qui
    // n'est ni `<input>` ni `contenteditable` : tester la seule balise la
    // laissait passer, et `F` y aurait été volée à la frappe.
    const combobox = document.createElement('div')
    combobox.setAttribute('role', 'combobox')
    document.body.append(combobox)
    expect(isTypingTarget(combobox)).toBe(true)

    const inner = document.createElement('span')
    combobox.append(inner)
    expect(isTypingTarget(inner)).toBe(true)
    combobox.remove()
  })

  it('laisse passer un bouton et le vide', () => {
    expect(isTypingTarget(document.createElement('button'))).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})

describe('séquences G + lettre — jamais pendant qu’on écrit (#3562.5)', () => {
  it('une majuscule est de la saisie : MAJ+G n’arme rien, MAJ+A ne navigue pas', () => {
    expect(isPlainSequenceKey({ shiftKey: true })).toBe(false)
    expect(isPlainSequenceKey({ shiftKey: false, metaKey: false, ctrlKey: false, altKey: false })).toBe(true)
  })

  it('SAIT DIRE NON aux modificateurs et à la répétition d’une touche tenue', () => {
    expect(isPlainSequenceKey({ metaKey: true })).toBe(false)
    expect(isPlainSequenceKey({ ctrlKey: true })).toBe(false)
    expect(isPlainSequenceKey({ altKey: true })).toBe(false)
    expect(isPlainSequenceKey({ repeat: true })).toBe(false)
  })

  it('les séquences ne répondent pas dans la conversation, mais partout ailleurs', () => {
    expect(sequencesAllowedOn('/chat')).toBe(false)
    expect(sequencesAllowedOn('/chat/abc')).toBe(false)
    expect(sequencesAllowedOn('/chatter')).toBe(true)
    expect(sequencesAllowedOn('/accounts')).toBe(true)
  })
})
