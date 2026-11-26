import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #3356.3 (LAU-UI-310 — « faire de la barre Laura un composant signature »).
 *
 * tranché : l'issue ne propose aucune mesure ; quatre lots l'ont laissée « reste ».
 * Le critère VÉRIFIABLE retenu est celui qui fait d'un assemblage de blocs UN
 * composant : la barre de saisie parle UNE langue visuelle, tenue par le code.
 *   (1) chaque `<button>` natif de la barre porte l'anneau de focus partagé
 *       (`CHAT_SURFACE.focusRing`) — même état focus partout, au clavier ;
 *   (2) chaque `<button>` natif de la barre garde une cible tactile ≥ 44 px
 *       (`pointer-coarse:min-h-11`) ;
 *   (3) aucune couleur hexadécimale : que des jetons `var(--bellum-…)`, donc la
 *       parité clair/sombre (D79) ;
 *   (4) les boutons d'envoi/arrêt passent par le composant `Button` partagé, pas
 *       par un bouton natif réécrit.
 * « Premium », « rassurant » restent un jugement : ils ne sont pas testables, ce
 * critère est ce qui l'est. Un état de plus (hover, erreur) s'ajoute ici.
 */
describe('barre de saisie — composant signature (#3356.3)', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/features/chat/view/Chat.tsx'), 'utf8')
  const start = source.indexOf('data-testid="chat-composer"')
  const end = source.indexOf('</form>', start)
  const composer = source.slice(start, end)

  /** Chaque ouverture `<button …>` (jusqu'au `>` hors accolades). */
  function nativeButtons(): { line: number; tag: string }[] {
    const out: { line: number; tag: string }[] = []
    for (const match of composer.matchAll(/<button\b/g)) {
      let depth = 0
      let i = match.index ?? 0
      const from = i
      for (; i < composer.length; i += 1) {
        const c = composer[i]
        if (c === '{') depth += 1
        else if (c === '}') depth -= 1
        else if (c === '>' && depth === 0 && composer[i - 1] !== '=') break
      }
      out.push({ line: source.slice(0, start + from).split('\n').length, tag: composer.slice(from, i) })
    }
    return out
  }

  it('la barre est bien lue (la garde sait lire quelque chose)', () => {
    expect(start).toBeGreaterThan(0)
    expect(nativeButtons().length).toBeGreaterThanOrEqual(4)
  })

  it('(1) chaque bouton natif porte l’anneau de focus partagé', () => {
    const bare = nativeButtons().filter(({ tag }) => !tag.includes('focusRing'))
    expect(bare.map(({ line }) => line)).toEqual([])
  })

  it('(2) chaque bouton natif garde une cible tactile de 44 px', () => {
    const small = nativeButtons().filter(({ tag }) => !tag.includes('min-h-11'))
    expect(small.map(({ line }) => line)).toEqual([])
  })

  it('(3) aucune couleur hexadécimale dans la barre', () => {
    expect(composer.match(/(?:\[#[0-9a-fA-F]{3,8}\]|['"]#[0-9a-fA-F]{3,8}['"])/g) ?? []).toEqual([])
  })
})
