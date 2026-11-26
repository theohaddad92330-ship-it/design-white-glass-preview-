/**
 * GA-4753 — L'AMORCE PHARE DE LA DÉMONSTRATION RESTE DANS LES SIX VISIBLES.
 *
 * Le composeur de `/chat` en démonstration montre six amorces, le reste est sous
 * « voir plus » (#1321.2). Le lot #4610.5 a inséré une carte AVANT « Par où je
 * commence dans mon portefeuille ? » : l'amorce est passée septième, et seul un
 * test qui la cherchait par son nom l'a vu (#1914).
 *
 * CE QUE LA GARDE REFUSE
 * Qu'une amorce de `DEMO_PINNED_STARTERS` tombe au-delà du plafond, ou disparaisse du script.
 *
 * CE QU'ELLE NE VISE PAS
 * Le plafond (une décision, pas touché) ni l'ordre des autres amorces.
 */
import { describe, expect, it } from 'vitest'
import {
  DEMO_CHAT_PROMPTS,
  DEMO_MAX_VISIBLE_SUGGESTIONS,
  DEMO_PINNED_STARTERS,
  pinnedStartersBeyondCap,
} from '@/features/demo/demo-chat-script'

const PHARE = 'Par où je commence dans mon portefeuille ?'

describe('GA-4753 — les amorces épinglées restent dans les six visibles', () => {
  it('le script réel garde chaque amorce épinglée dans les six premières', () => {
    const questions = DEMO_CHAT_PROMPTS.map(entry => entry.question)
    expect(DEMO_PINNED_STARTERS).toContain(PHARE)
    expect(pinnedStartersBeyondCap(questions)).toEqual([])
  })

  it('lit un vrai plafond : six, comme #1321.2', () => {
    expect(DEMO_MAX_VISIBLE_SUGGESTIONS).toBe(6)
  })

  it('sait dire NON : l’amorce phare en 7e position fait rougir', () => {
    const questions = ['a', 'b', 'c', 'd', 'e', 'f', PHARE]
    expect(pinnedStartersBeyondCap(questions, [PHARE])).toEqual([PHARE])
  })

  it('sait dire OUI : l’amorce phare en 6e position passe', () => {
    const questions = ['a', 'b', 'c', 'd', 'e', PHARE, 'g']
    expect(pinnedStartersBeyondCap(questions, [PHARE])).toEqual([])
  })

  it('une amorce épinglée absente du script est refusée aussi', () => {
    expect(pinnedStartersBeyondCap(['a', 'b'], [PHARE])).toEqual([PHARE])
  })
})
