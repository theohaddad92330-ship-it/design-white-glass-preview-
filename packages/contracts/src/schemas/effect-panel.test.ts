import { describe, expect, it } from 'vitest'
import { SERVER_PERFORMED_STAGE_ACTIONS, effectsForMove } from './stage-move.js'
import { PROJECT_STAGES } from './project.js'
import {
  effectPanelProblems,
  effectProposalSchema,
  initialSelection,
  moveOnlySelection,
  type EffectProposal,
} from './effect-panel.js'

/**
 * Les quatre règles du panneau d'effet (Tome 7 §47).
 *
 * La troisième — « aucune case déclenchant un envoi externe n'est pré-cochée » —
 * est une règle de sécurité produit : une case pré-cochée qu'on ne regarde pas
 * fait partir un message chez un client. Elle est vérifiée ici DEUX fois : sur
 * le catalogue réel des déplacements d'étape, et sur une proposition fabriquée
 * qui la viole — pour prouver que le verrou tient même quand le catalogue ment.
 */

const proposal = (over: Partial<EffectProposal> = {}): EffectProposal => ({
  key: 'k',
  checked: false,
  external: false,
  performedBy: 'server',
  ...over,
})

describe('panneau d’effet — la sélection initiale', () => {
  it('pré-coche ce que le catalogue demande, quand ce n’est pas externe', () => {
    expect(initialSelection([proposal({ key: 'a', checked: true }), proposal({ key: 'b' })])).toEqual(['a'])
  })

  it('REFUSE de pré-cocher un envoi externe, même si le catalogue le demande', () => {
    // Le second verrou. Sans lui, ajouter `checked: true` sur une proposition
    // externe suffirait à faire partir un message au premier « Confirmer ».
    const selection = initialSelection([proposal({ key: 'envoi', checked: true, external: true })])
    expect(selection).toEqual([])
  })

  it('« Déplacer seulement » ne garde rien', () => {
    expect(moveOnlySelection()).toEqual([])
  })
})

describe('panneau d’effet — ce qu’un catalogue n’a pas le droit de déclarer', () => {
  it('nomme la proposition externe pré-cochée', () => {
    const problems = effectPanelProblems([proposal({ key: 'message', checked: true, external: true })])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('message')
  })

  it('nomme une proposition en double — deux cases pour le même effet', () => {
    const problems = effectPanelProblems([proposal({ key: 'a' }), proposal({ key: 'a' })])
    expect(problems.some(p => p.includes('double'))).toBe(true)
  })

  it('ne dit rien quand tout est en ordre', () => {
    expect(
      effectPanelProblems([proposal({ key: 'a', checked: true }), proposal({ key: 'b', external: true })]),
    ).toEqual([])
  })
})

describe('le catalogue RÉEL des déplacements d’étape respecte les règles', () => {
  it('lit un corpus non vide — un catalogue vide passerait au vert', () => {
    const all = PROJECT_STAGES.flatMap(from =>
      PROJECT_STAGES.filter(to => to !== from).flatMap(to => effectsForMove(from, to).proposals),
    )
    expect(all.length).toBeGreaterThan(0)
    expect(SERVER_PERFORMED_STAGE_ACTIONS.length).toBeGreaterThan(0)
  })

  it('aucun déplacement ne pré-coche un envoi externe', () => {
    const offenders: string[] = []
    for (const from of PROJECT_STAGES) {
      for (const to of PROJECT_STAGES) {
        if (from === to) continue
        for (const p of effectsForMove(from, to).proposals) {
          expect(effectProposalSchema.safeParse(p).success).toBe(true)
          if (p.external && p.checked) offenders.push(`${from}→${to}:${p.key}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('chaque déplacement laisse « déplacer seulement » atteignable', () => {
    // Vérité par construction : la sélection vide est toujours un état valide,
    // et aucune proposition n'est obligatoire. Le test le fige pour que
    // personne n'introduise une case non décochable.
    for (const from of PROJECT_STAGES) {
      for (const to of PROJECT_STAGES) {
        if (from === to) continue
        const forced = effectsForMove(from, to).proposals.filter(p => (p as { required?: boolean }).required)
        expect(forced).toEqual([])
      }
    }
  })
})
