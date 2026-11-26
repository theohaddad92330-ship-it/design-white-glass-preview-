import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * GA-387 — LA CONFIRMATION D'UNE PROPOSITION DE LAURA EST UN GESTE, JAMAIS UN
 * EFFET DE BORD.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * #2434.52 / #2434.53 / #2434.54 / #2434.55 / #2434.56 / #2434.57 (« validation
 * vocale seule insuffisante pour… ») tiennent parce qu'AUCUN chemin, vocal ou
 * texte, n'exécute une action sensible sans le clic sur « Confirmer » —
 * `chat_tools.py::WRITE_TOOL_NAMES` ne fait que PROPOSER (`test_chat_write_tools.py`
 * côté IA), et ici, côté web, `confirm()`/`confirmReminderFollowUp()` sont les
 * SEULES fonctions qui appellent l'API réelle. Le jour où l'une des deux serait
 * invoquée depuis un `useEffect` — par exemple pour « confirmer automatiquement
 * quand la dictée contient le mot oui » — la garantie tomberait EN SILENCE :
 * aucun test existant ne monte un scénario vocal jusqu'à la carte.
 *
 * ⚠️ 11/10/2026 — #4016 L5 (décision Louis) : Laura PEUT désormais envoyer, mais
 * SOUS MANDAT SIGNÉ seulement, et par le dispatcher du serveur (portée
 * `laura_send`, `OutreachDelegationService.gateAwaitingMandate`) — jamais en
 * confirmant une carte à la place du commercial. Un mandat actif n'est donc PAS
 * un clic : « confirmer tout seul quand un mandat couvre » reste refusé ici.
 *
 * Cette garde ne rejoue pas le clic (voir `PendingActions.test.tsx` pour ça) :
 * elle vérifie STATIQUEMENT que tout appel à une fonction `confirm*` du fichier,
 * en dehors de sa propre déclaration, vit sur une ligne qui porte `onClick` —
 * la marque d'un geste, jamais d'un minuteur ou d'un effet.
 */

const SRC = join(__dirname, '..', 'features', 'chat', 'view', 'PendingActions.tsx')
/**
 * #4129.1 — la carte à valider est le bloc d'action du kit de réponses : `onValidate` y est
 * branché TEL QUEL sur le `onClick` d'un bouton. Une référence passée à `onValidate` est donc
 * un geste au même titre qu'`onClick` — à condition que ce branchement tienne : c'est vérifié
 * plus bas en LISANT le kit, pas supposé.
 */
const REPLY_KIT = join(__dirname, '..', 'features', 'chat', 'view', 'reply-kit', 'notices.tsx')
const GESTURE_PROPS = ['onClick', 'onValidate=']
const onGestureLine = (line: string): boolean => GESTURE_PROPS.some(prop => line.includes(prop))

/** Les gestes de confirmation déclarés dans le fichier (fonctions internes au composant). */
function confirmFunctionNames(source: string): string[] {
  return [...source.matchAll(/^\s*async function (confirm\w*)\(/gm)].map(m => m[1] ?? '').filter(Boolean)
}

/**
 * Les lignes qui RÉFÈRENT à ce geste, sa propre déclaration exclue — invoqué
 * (`confirmReminderFollowUp()`) ou passé par référence (`onClick={confirm}`,
 * la forme la plus fréquente ici : React appelle la fonction lui-même).
 *
 * ⚠️ `\b` de JS ne connaît que `[A-Za-z0-9_]` : sur ce fichier plein de prose
 * française, « confirmée » se lirait comme contenant le mot ENTIER « confirm »
 * (« é » compte comme une frontière). D'où la frontière écrite à la main, qui
 * couvre aussi les lettres accentuées.
 */
function callSites(source: string, name: string): string[] {
  const definition = new RegExp(`^\\s*async function ${name}\\(`)
  const reference = new RegExp(`(?<![A-Za-zÀ-ÿ0-9_])${name}(?![A-Za-zÀ-ÿ0-9_])`)
  // Un commentaire qui NOMME le geste (« `confirm()`, seul chemin qui exécute ») n'est pas un appel.
  const prose = /^\s*(\/\/|\*|\/\*)/
  return source.split('\n').filter(line => !prose.test(line) && !definition.test(line) && reference.test(line))
}

describe('GA-387 — un geste de confirmation ne se déclenche jamais tout seul', () => {
  const source = readFileSync(SRC, 'utf8')
  const names = confirmFunctionNames(source)

  it('LIT quelque chose — au moins deux gestes de confirmation, et des appels à chacun', () => {
    expect(source.length).toBeGreaterThan(10_000)
    expect(names.length).toBeGreaterThanOrEqual(2)
    for (const name of names) expect(callSites(source, name).length).toBeGreaterThan(0)
  })

  it('chaque appel réel, dans PendingActions.tsx, vit sur une ligne `onClick`', () => {
    for (const name of names) {
      const offenders = callSites(source, name).filter(line => !onGestureLine(line))
      expect(`${name} — appels hors onClick : ${offenders.join(' | ')}`).toBe(`${name} — appels hors onClick : `)
    }
  })

  it('#4129.1 — `onValidate` du kit est bien branché sur un clic (sinon il ne vaut pas geste)', () => {
    expect(readFileSync(REPLY_KIT, 'utf8')).toMatch(/onClick=\{onValidate\}/)
  })

  it('sait dire NON — un commentaire est ignoré, pas un appel sur une ligne qui en porte un', () => {
    const mixed = ['  // `confirm()` documenté', '  useEffect(() => { confirm() }) // confirm()'].join('\n')
    expect(callSites(mixed, 'confirm').filter(line => !onGestureLine(line))).toEqual([
      '  useEffect(() => { confirm() }) // confirm()',
    ])
  })

  it('sait dire NON — un appel depuis un `useEffect` est reproché', () => {
    const leaky = [
      'export function Leaky() {',
      '  async function confirm() {',
      '    await api.write()',
      '  }',
      '  useEffect(() => {',
      '    if (voiceTranscript.includes("oui")) confirm()',
      '  }, [voiceTranscript])',
      '  return null',
      '}',
    ].join('\n')
    const offenders = callSites(leaky, 'confirm').filter(line => !line.includes('onClick'))
    expect(offenders).toEqual(['    if (voiceTranscript.includes("oui")) confirm()'])
  })

  it('#4016 L5 — sait dire NON : un mandat actif ne confirme pas une carte à la place du commercial', () => {
    const leaky = [
      'export function Leaky({ mandate }) {',
      '  async function confirm() {',
      '    await api.write()',
      '  }',
      '  useEffect(() => {',
      "    if (mandate?.scope === 'laura_send' && mandate.lifecycle === 'active') confirm()",
      '  }, [mandate])',
      '  return null',
      '}',
    ].join('\n')
    const offenders = callSites(leaky, 'confirm').filter(line => !line.includes('onClick'))
    expect(offenders).toEqual(["    if (mandate?.scope === 'laura_send' && mandate.lifecycle === 'active') confirm()"])
  })

  it('n’attrape pas ce qu’elle ne vise pas — une référence PASSÉE (`onClick={confirm}`, sans parenthèses) passe', () => {
    const fine = ['function Fine() {', '  return <button onClick={confirm} />', '}'].join('\n')
    const offenders = callSites(fine, 'confirm').filter(line => !line.includes('onClick'))
    expect(offenders).toEqual([])
  })
})
