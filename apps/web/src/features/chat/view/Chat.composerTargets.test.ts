import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #3356.3b (recette prod 03/10, d08363cdeb) — « 23 boutons du composeur de /chat,
 * 18 font moins de 44 px » (mesuré `getBoundingClientRect`, POINTEUR FIN).
 *
 * Cause : les cibles portaient `pointer-coarse:min-h-11`, donc 44 px au DOIGT
 * seulement. La recette — et tout bureau — mesure au pointeur fin : la règle
 * « cible ≥ 44 px » (GA-35) n'y était tenue nulle part. Désormais `min-h-11`
 * SANS préfixe `pointer-coarse:` : un bouton de la barre fait 44 px partout.
 *
 * La garde dit NON à une classe de cible conditionnelle (`pointer-coarse:`) ou à
 * une plancher plus bas (`min-h-8`) : seule `min-h-11` nue compte.
 */
const web = process.cwd()
const read = (rel: string) => readFileSync(resolve(web, 'src/features', rel), 'utf8')

/** Chaque ouverture `<button …>` / `<Button …>` jusqu'au `>` hors accolades. */
function openingTags(raw: string): { line: number; tag: string }[] {
  // Les commentaires (qui citent `<button>`) ne sont pas du JSX : on les vide en gardant les lignes.
  const text = raw.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  const out: { line: number; tag: string }[] = []
  for (const match of text.matchAll(/<(?:button|Button)\b/g)) {
    let depth = 0
    const from = match.index ?? 0
    let i = from
    for (; i < text.length; i += 1) {
      const c = text[i]
      if (c === '{') depth += 1
      else if (c === '}') depth -= 1
      else if (c === '>' && depth === 0 && text[i - 1] !== '=') break
    }
    out.push({ line: text.slice(0, from).split('\n').length, tag: text.slice(from, i) })
  }
  return out
}

/** `min-h-11` NU (pas `pointer-coarse:min-h-11`) : la cible tient au pointeur fin. */
const hasBareTarget = (tag: string) => /(?:^|[\s"'`])min-h-11(?=[\s"'`])/.test(tag)

function slice(text: string, from: string, to: string) {
  const a = text.indexOf(from)
  const b = text.indexOf(to, a)
  return text.slice(a, b === -1 ? undefined : b)
}

const chat = read('chat/view/Chat.tsx')
const plusAt = chat.indexOf('composer.moreTools')
const plusMenuTrigger = chat.slice(chat.lastIndexOf('<Button', plusAt), chat.indexOf('</DropdownMenuTrigger>', plusAt))
const surfaces: { name: string; text: string }[] = [
  { name: 'Chat.tsx (formulaire chat-composer)', text: slice(chat, 'data-testid="chat-composer"', '</form>') },
  { name: 'Chat.tsx (menu « + »)', text: plusMenuTrigger },
  { name: 'ToolsSourcesMenu.tsx', text: read('chat/view/ToolsSourcesMenu.tsx') },
  { name: 'VoiceInput.tsx (barre)', text: slice(read('chat/voice/VoiceInput.tsx'), 'return', '<Dialog') },
  { name: 'VoiceConversation.tsx', text: read('chat/voice/VoiceConversation.tsx') },
  { name: 'LauncherExamples.tsx', text: read('launcher/LauncherExamples.tsx') },
  { name: 'ComposerLauncher.tsx', text: read('launcher/ComposerLauncher.tsx') },
  // #3356 — « Contexte de travail » mesurait 127×32 : le déclencheur vit dans ce composant
  // partagé, hors des surfaces listées jusque-là — la garde ne l'a donc jamais lu.
  {
    name: 'ContextModePicker.tsx (déclencheur « Contexte de travail »)',
    text: slice(read('work-contexts/view/ContextModePicker.tsx'), '<Button', '</Button>'),
  },
  {
    name: 'CommandDrawerButton.tsx (déclencheur)',
    text: slice(read('chat-commands/view/CommandDrawerButton.tsx'), '<Button', '<Dialog'),
  },
]

describe('barre de saisie — cibles ≥ 44 px au pointeur fin (#3356.3b)', () => {
  it('la garde lit quelque chose', () => {
    for (const { name, text } of surfaces) {
      expect(text.length, name).toBeGreaterThan(50)
    }
    expect(openingTags(surfaces[0].text).length).toBeGreaterThanOrEqual(8)
  })

  for (const { name, text } of surfaces) {
    it(`${name} : tout ce qui se clique porte min-h-11 sans condition`, () => {
      const small = openingTags(text)
        .filter(({ tag }) => !hasBareTarget(tag))
        .map(({ line, tag }) => `l.${line} ${tag.replace(/\s+/g, ' ').slice(0, 90)}`)
      expect(small).toEqual([])
    })
  }

  // #3708 — le déclencheur « Outils et sources » est une seule pastille : 44×44 aussi en LARGE
  // (sur petit écran son libellé se replie en icône seule).
  it('ToolsSourcesMenu.tsx : le déclencheur porte min-h-11 ET min-w-11 (cible 44×44)', () => {
    const trigger = openingTags(read('chat/view/ToolsSourcesMenu.tsx')).find(({ tag }) => tag.includes('<Button'))
    expect(trigger, 'déclencheur introuvable').toBeDefined()
    expect(/(?:^|[\s"'`])min-w-11(?=[\s"'`])/.test(trigger?.tag ?? '')).toBe(true)
  })
})
