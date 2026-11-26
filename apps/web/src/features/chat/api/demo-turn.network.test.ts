import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #2840 (#2441.13) — LE TÉMOIN QUE `demo-turn.ts` NE FAIT AUCUN APPEL RÉSEAU.
 *
 * Tranché par Louis le 03/09/2026 (« coque RÉELLE, conversation VIDE ») : un
 * lien de démonstration part à des inconnus, et un message libre ne doit
 * jamais facturer Claude sur un espace que personne ne surveille. Le fichier
 * le dit déjà dans son propre docblock — cette garde le PROUVE en source,
 * plutôt que de laisser l'affirmation reposer sur une relecture.
 *
 * C'est aussi ce qui classe `context.partial` (le mode dégradé annoncé,
 * `apps/api/src/modules/demo/demo-coverage.ts`,
 * `DEMO_CHAT_PARTIAL_REPLY_COVERAGE`) « vide à dessein » plutôt que « seedé » :
 * ce repère n'existe que sur un VRAI tour qui dépasse un plafond de temps ou
 * essuie une panne réseau (`apps/ia/app/routers/chat.py`) — un moteur qui ne
 * parle jamais au réseau ne peut, par construction, jamais le poser.
 */
const SOURCE = readFileSync(join(__dirname, 'demo-turn.ts'), 'utf8')

/**
 * Le CODE, sans les commentaires. Le fichier EXPLIQUE en prose qu'il ne
 * touche PAS `askLaura` (`POST /ia/chat`) : chercher dans le texte brut ferait
 * échouer la garde sur sa propre justification — même piège documenté par
 * `Chat.scroll.test.ts`.
 */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('demo-turn.ts n’appelle jamais le réseau (#2840)', () => {
  it('n’importe ni le client IA ni `askLaura`, seule porte vers `POST /ia/chat`', () => {
    expect(CODE).not.toMatch(/askLaura/)
    expect(CODE).not.toMatch(/ia\.client/)
    expect(CODE).not.toMatch(/laura-turn/)
  })

  it('n’appelle ni `fetch` ni `axios`', () => {
    expect(CODE).not.toMatch(/\bfetch\(/)
    expect(CODE).not.toMatch(/\baxios\b/)
  })
})
