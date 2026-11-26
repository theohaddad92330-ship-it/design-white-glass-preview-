import { afterEach, describe, expect, it } from 'vitest'
import { isLauraSilenced, setLauraSilenced } from './laura-silence-signal'

/**
 * #2427.10 — LE SIGNAL « LAURA A DIT STOP », PARTAGÉ ENTRE SURFACES.
 *
 * `useLaura` est la seule porte vers `/laura/*` (GA-39/GA-237) : ni
 * `lauraOpener` (Chat.tsx) ni aucune autre surface n'a le droit d'appeler
 * `/laura/plan` pour son propre compte. Mais `LauraCard` demande déjà son plan
 * sur CHAQUE écran, `/chat` compris — et sait donc déjà si le budget de
 * proactivité dit « désactivée » ou « en retrait » (`isInterruptionSilenced`,
 * `interruption-budget.ts`). Ce module est le point de lecture PARTAGÉ de ce
 * verdict, écrit par `useLaura` et lu par `lauraOpener` : aucun second appel
 * réseau, aucune seconde logique de budget.
 */
describe('laura-silence-signal', () => {
  afterEach(() => {
    setLauraSilenced(false)
  })

  it('commence NON silencieuse — aucun plan reçu ne doit jamais se lire comme un refus', () => {
    expect(isLauraSilenced()).toBe(false)
  })

  it('porte ce que le dernier appelant a écrit', () => {
    setLauraSilenced(true)
    expect(isLauraSilenced()).toBe(true)
    setLauraSilenced(false)
    expect(isLauraSilenced()).toBe(false)
  })
})
