import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { EffectProposal } from '@bellum/contracts'
import { describe, expect, it, vi } from 'vitest'
import { EffectPanel } from './EffectPanel'

/**
 * Les deux règles que la primitive apporte, et qu'aucun panneau n'avait.
 *
 * Les règles 1 et 3 du Tome 7 §47 (pré-coche réservée au niveau N1, aucun envoi
 * externe pré-coché) sont vérifiées côté contrat, où elles sont pures. Ici on
 * vérifie ce qui ne se voit qu'à l'écran :
 *
 *  - **règle 2** — « faire seulement le geste » est à UN clic. Sans elle,
 *    refuser les propositions demande de décocher les cases une par une, et
 *    personne ne le fait : on confirme ce qui est pré-coché ;
 *  - **le refus d'`Entrée`** — un panneau dont les cases engagent une écriture
 *    ne se valide pas par la touche qu'on presse par réflexe après avoir lu.
 */

const proposal = (over: Partial<EffectProposal> = {}): EffectProposal => ({
  key: 'k',
  checked: false,
  external: false,
  performedBy: 'server',
  ...over,
})

function setup(proposals: EffectProposal[]) {
  const onConfirm = vi.fn()
  render(
    <EffectPanel
      title="Déplacer"
      proposals={proposals}
      renderProposal={p => <span>{p.key}</span>}
      moveOnlyLabel="Déplacer seulement"
      confirmLabel="Déplacer"
      onCancel={vi.fn()}
      onConfirm={onConfirm}
    />,
  )
  return { onConfirm, user: userEvent.setup() }
}

describe('EffectPanel — règle 2 : le geste nu est à un clic', () => {
  it('« Déplacer seulement » confirme AVEC une sélection vide, même quand des cases sont pré-cochées', async () => {
    const { onConfirm, user } = setup([proposal({ key: 'note', checked: true })])

    await user.click(screen.getByRole('button', { name: 'Déplacer seulement' }))

    expect(onConfirm).toHaveBeenCalledWith([])
  })

  it('la confirmation normale, elle, garde ce qui est coché', async () => {
    const { onConfirm, user } = setup([proposal({ key: 'note', checked: true })])

    await user.click(screen.getByRole('button', { name: 'Déplacer' }))

    expect(onConfirm).toHaveBeenCalledWith(['note'])
  })

  it('reste disponible quand rien n’est pré-coché — c’est le point : un clic, pas une inspection', async () => {
    const { onConfirm, user } = setup([proposal({ key: 'note' })])

    await user.click(screen.getByRole('button', { name: 'Déplacer seulement' }))

    expect(onConfirm).toHaveBeenCalledWith([])
  })
})

describe('EffectPanel — ce qui est pré-coché', () => {
  it('ne pré-coche PAS un envoi externe, même déclaré coché par l’appelant', async () => {
    // Le second verrou, vu depuis l'écran : le contrat le refuse, et la
    // primitive n'a aucun chemin pour le contourner.
    const { onConfirm, user } = setup([proposal({ key: 'message', checked: true, external: true })])

    await user.click(screen.getByRole('button', { name: 'Déplacer' }))

    expect(onConfirm).toHaveBeenCalledWith([])
  })

  it('la case reste cochable à la main — on refuse la pré-coche, pas le geste', async () => {
    const { onConfirm, user } = setup([proposal({ key: 'message', checked: true, external: true })])

    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Déplacer' }))

    expect(onConfirm).toHaveBeenCalledWith(['message'])
  })
})

describe('EffectPanel — le clavier', () => {
  it('`Entrée` ne confirme pas', async () => {
    const { onConfirm, user } = setup([proposal({ key: 'note', checked: true })])

    await user.click(screen.getByRole('checkbox'))
    await user.keyboard('{Enter}')

    expect(onConfirm).not.toHaveBeenCalled()
  })
})
