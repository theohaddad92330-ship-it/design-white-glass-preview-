import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #1938.3 — LA PERMISSION NE SE DEMANDE PAS SANS GESTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * Un navigateur qui reçoit `Notification.requestPermission()` sans clic
 * bloque le site de façon PERMANENTE chez cet utilisateur — l'invite native
 * ne se rouvre jamais toute seule après un refus. `useEffect(() => {
 * Notification.requestPermission() }, [])` au montage d'un écran est
 * exactement ce défaut, et il ne casserait aucun test existant : c'est du
 * code qui « marche » jusqu'à ce qu'un utilisateur le paie une seule fois.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE
 * ─────────────────────────────────────────────────────────────────────────────
 * Pour chaque appel textuel à `Notification.requestPermission(` dans
 * `apps/web/src` (hors tests, hors cette garde elle-même), elle calcule les
 * PLAGES de caractères couvertes par le corps d'un `useEffect`/`useLayoutEffect`/
 * `useInsertionEffect` du même fichier — par comptage de parenthèses, pas par
 * une borne de lignes arbitraire — et refuse tout appel qui tombe dans une de
 * ces plages.
 *
 * ⚠️ **Ce qu'elle NE PROUVE PAS** : un appel niché plus profond dans le corps
 * d'un effet (ex. `useEffect(() => { el.addEventListener('click', () =>
 * Notification.requestPermission()) }, [])`) reste dans la plage de l'effet
 * ET est un geste légitime — elle le refuserait aussi. C'est un faux positif
 * accepté : ce dépôt n'écrit pas la permission de cette façon (voir
 * `browser-notification-channel.ts`, seul appelant réel), et une garde qui
 * distinguerait les deux demanderait un vrai graphe d'appel. Elle ferme le
 * chemin dangereux DIRECT, qui est celui que la doctrine nomme.
 *
 * ⚠️ **Aucun `RegExp` avec le drapeau `g` n'est réutilisé** entre deux appels
 * de détection — chaque fonction en crée un nouveau localement. C'est le
 * défaut déjà payé ailleurs dans ce dépôt (`.test()` stateful, un résultat sur
 * deux) ; ici l'idiome `exec()` en boucle sur un littéral frais est correct.
 */

const WEB_SRC = join(__dirname, '..')

/** Retire les commentaires — un docblock qui EXPLIQUE le geste le cite. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'architecture') continue // cette garde elle-même : ses fixtures citent l'appel textuellement.
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** L'INDEX où se termine la parenthèse ouverte à `openParenIndex`, par simple
 *  comptage de profondeur — pas de RegExp récursive, juste des caractères. */
function matchingParenEnd(source: string, openParenIndex: number): number {
  let depth = 0
  for (let i = openParenIndex; i < source.length; i++) {
    if (source[i] === '(') depth++
    else if (source[i] === ')') {
      depth--
      if (depth === 0) return i
    }
  }
  return source.length
}

/** Les plages `[début, fin]` du corps de chaque `useEffect(...)` /
 *  `useLayoutEffect(...)` / `useInsertionEffect(...)` du fichier. */
function effectRanges(source: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  const finder = /\b(?:useEffect|useLayoutEffect|useInsertionEffect)\s*\(/g
  let match: RegExpExecArray | null
  while ((match = finder.exec(source))) {
    const openParen = match.index + match[0].length - 1
    ranges.push([openParen, matchingParenEnd(source, openParen)])
  }
  return ranges
}

/** Les index de chaque appel textuel à `Notification.requestPermission(`. */
function requestPermissionCallIndexes(source: string): number[] {
  const indexes: number[] = []
  const finder = /Notification\.requestPermission\s*\(/g
  let match: RegExpExecArray | null
  while ((match = finder.exec(source))) indexes.push(match.index)
  return indexes
}

/**
 * Ce que cette garde REFUSE : un appel à `requestPermission` qui tombe dans
 * la plage d'un effet de montage, fichier par fichier, EN NOMMANT LE FICHIER.
 */
function mountGestureViolations(sourcesByFile: Readonly<Record<string, string>>): Array<{ file: string }> {
  const violations: Array<{ file: string }> = []
  for (const [file, raw] of Object.entries(sourcesByFile)) {
    const source = stripComments(raw)
    const ranges = effectRanges(source)
    for (const index of requestPermissionCallIndexes(source)) {
      if (ranges.some(([start, end]) => index > start && index < end)) violations.push({ file })
    }
  }
  return violations
}

function realCorpus(): Record<string, string> {
  const entries: Record<string, string> = {}
  for (const file of sourceFiles(WEB_SRC)) entries[file.slice(file.indexOf('/src'))] = readFileSync(file, 'utf8')
  return entries
}

describe('#1938.3 — la permission ne se demande pas sans geste', () => {
  it('LIT quelque chose — le corpus n’est pas vide, et elle trouve bien l’appel RÉEL', () => {
    const corpus = realCorpus()
    expect(Object.keys(corpus).length).toBeGreaterThan(200)
    const filesWithTheCall = Object.entries(corpus).filter(
      ([, src]) => requestPermissionCallIndexes(stripComments(src)).length > 0,
    )
    // Preuve qu'elle sait VOIR : sans ce test, un chemin renommé (ou une garde
    // qui lirait le mauvais dossier) rendrait le test suivant vert sur du rien.
    expect(filesWithTheCall.length).toBeGreaterThan(0)
    expect(filesWithTheCall.some(([file]) => file.endsWith('browser-notification-channel.ts'))).toBe(true)
  })

  it('aucun appel réel de `apps/web/src` ne tombe dans un effet de montage', () => {
    const offenders = mountGestureViolations(realCorpus())
    if (offenders.length > 0) {
      throw new Error(
        `Notification.requestPermission() appelée depuis un useEffect (donc SANS geste) :\n` +
          offenders.map(o => `  ${o.file}`).join('\n') +
          `\nLa permission ne se demande que depuis un clic (onCheckedChange, onClick…).`,
      )
    }
  })

  it('sait dire NON — un appel au MONTAGE est vu, ET le fichier fautif est nommé', () => {
    const fautif = {
      'features/x/BadWidget.tsx': `
        export function BadWidget() {
          useEffect(() => {
            void Notification.requestPermission()
          }, [])
          return null
        }
      `,
    }
    const violations = mountGestureViolations(fautif)
    expect(violations).toEqual([{ file: 'features/x/BadWidget.tsx' }])
  })

  it('ne s’attrape pas ELLE-MÊME — les commentaires qui CITENT l’appel sont retirés avant de chercher', () => {
    const sain = {
      'features/x/Doc.tsx': `
        // Ne JAMAIS écrire : useEffect(() => { Notification.requestPermission() }, [])
        /** Documentation : useEffect(() => { Notification.requestPermission() }, []) est interdit. */
        export function Doc() { return null }
      `,
    }
    expect(mountGestureViolations(sain)).toEqual([])
  })

  it('laisse passer le geste légitime — un appel depuis un gestionnaire de clic, hors de tout effet', () => {
    const sain = {
      'features/x/GoodSwitch.tsx': `
        export function GoodSwitch() {
          function onCheckedChange(next: boolean) {
            if (next) void requestBrowserNotificationPermission()
          }
          return <Switch onCheckedChange={onCheckedChange} />
        }
      `,
    }
    expect(mountGestureViolations(sain)).toEqual([])
  })

  it('laisse passer un effet voisin qui ne fait que LIRE `Notification.permission` (pas la demander)', () => {
    const sain = {
      'features/x/ReadOnlyEffect.tsx': `
        export function ReadOnlyEffect() {
          useEffect(() => {
            console.log(Notification.permission)
          }, [])
          return null
        }
      `,
    }
    expect(mountGestureViolations(sain)).toEqual([])
  })

  it('laisse passer un appel réel hors de TOUT effet du même fichier', () => {
    const sain = {
      'features/notifications/browser-channel/browser-notification-channel.ts': `
        export async function requestBrowserNotificationPermission() {
          return window.Notification.requestPermission()
        }
      `,
    }
    expect(mountGestureViolations(sain)).toEqual([])
  })

  it('le détecteur n’est pas STATEFUL — deux passages sur la même source rendent le même résultat', () => {
    const source = { f: 'useEffect(() => { Notification.requestPermission() }, [])' }
    expect(mountGestureViolations(source)).toEqual(mountGestureViolations(source))
  })
})
