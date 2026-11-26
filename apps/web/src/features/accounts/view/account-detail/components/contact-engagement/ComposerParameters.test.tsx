import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ComposerParameters } from './ComposerParameters'

/**
 * #2123.61-.68 — le formulaire du composer porte les sept paramètres du message.
 *
 * Replié par défaut : l'angle libre reste le geste principal. Choisir un
 * paramètre ne génère RIEN — il cadre le prochain « Générer ».
 */
describe('ComposerParameters', () => {
  it('déplié, il porte objectif, relation, persona, signal, offre, preuve, périmètre, contraintes et appel à l’action', () => {
    render(<ComposerParameters parameters={{}} onParametersChange={vi.fn()} />)
    expect(screen.queryByLabelText('Objectif')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Paramètres du message/ }))
    for (const label of [
      'Objectif',
      'Stade de la relation',
      'Persona',
      'Signal',
      'Offre',
      'Preuve',
      'Périmètre visé',
      'Contraintes',
      'Appel à l’action',
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
  })

  it('choisir un objectif le transmet, sans rien générer', async () => {
    const onParametersChange = vi.fn()
    render(<ComposerParameters parameters={{ signal: 'Pôle data' }} onParametersChange={onParametersChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Paramètres du message/ }))
    await userEvent.click(screen.getByLabelText('Objectif'))
    await userEvent.click(await screen.findByRole('option', { name: 'Relancer' }))
    expect(onParametersChange).toHaveBeenCalledWith({ signal: 'Pôle data', objective: 'relance' })
  })

  it('« Déduit du dossier » retire le choix : le moteur reprend la main', async () => {
    const onParametersChange = vi.fn()
    render(<ComposerParameters parameters={{ cta: 'echange_court' }} onParametersChange={onParametersChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Paramètres du message/ }))
    await userEvent.click(screen.getByLabelText('Appel à l’action'))
    await userEvent.click(await screen.findByRole('option', { name: 'Déduit du dossier' }))
    expect(onParametersChange).toHaveBeenCalledWith({ cta: undefined })
  })

  it('le bouton replié dit combien de paramètres sont choisis', () => {
    render(
      <ComposerParameters parameters={{ objective: 'relance', proof: 'REX assureur' }} onParametersChange={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: /Paramètres du message/ })).toHaveTextContent('2')
  })

  it('#2204.7/.15 — le périmètre et les contraintes se saisissent, bornés comme le moteur les borne', async () => {
    const onParametersChange = vi.fn()
    render(<ComposerParameters parameters={{}} onParametersChange={onParametersChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Paramètres du message/ }))
    const scope = screen.getByLabelText('Périmètre visé')
    const constraints = screen.getByLabelText('Contraintes')
    expect(scope).toHaveAttribute('maxlength', '160')
    expect(constraints).toHaveAttribute('maxlength', '300')
    await userEvent.type(constraints, '8')
    expect(onParametersChange).toHaveBeenCalledWith({ constraints: '8' })
  })

  it('#3418.5/.8 : le stade de la relation et le problème sont posés avant la génération', async () => {
    const onParametersChange = vi.fn()
    render(<ComposerParameters parameters={{}} onParametersChange={onParametersChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Paramètres du message/ }))
    expect(screen.getByLabelText('Stade de la relation')).toBeInTheDocument()
    const problem = screen.getByLabelText('Problème à adresser')
    expect(problem).toHaveAttribute('maxlength', '300')
    await userEvent.type(problem, 'x')
    expect(onParametersChange).toHaveBeenCalledWith({ problem: 'x' })
  })

  // #3418 (Y1 01/10) — « Problème à adresser » : son placeholder était tronqué à 178 px dans la
  // demi-colonne du panneau (420 px). Un champ de texte libre prend la ligne ENTIÈRE.
  it('#3418 : les champs de texte libre occupent toute la ligne, leur placeholder n’est pas tronqué', () => {
    render(<ComposerParameters parameters={{}} onParametersChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Paramètres du message/ }))
    for (const label of ['Signal', 'Offre', 'Preuve', 'Périmètre visé', 'Contraintes', 'Problème à adresser']) {
      expect(screen.getByLabelText(label).closest('label')?.className, label).toContain('sm:col-span-2')
    }
  })
})

describe('#3694 — le panneau se pose EN SUPERPOSITION, il ne pousse jamais la mise en page', () => {
  it('déplié, le panneau n’est pas un descendant du conteneur qui l’entoure (recette prod 09/10 : le fil tombait à 83 px)', () => {
    render(
      <div data-testid="host">
        <ComposerParameters parameters={{}} onParametersChange={vi.fn()} />
      </div>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Paramètres du message/ }))
    const objective = screen.getByLabelText('Objectif')
    expect(screen.getByTestId('host')).not.toContainElement(objective)
  })
})

describe('#3694.4 — ouverture pilotée de l’extérieur', () => {
  it('« Corriger le brief » peut déplier le panneau sans que l’utilisateur clique le bouton', () => {
    render(<ComposerParameters parameters={{}} onParametersChange={vi.fn()} open onOpenChange={vi.fn()} />)
    expect(screen.getByLabelText('Objectif')).toBeInTheDocument()
  })

  it('replier signale la nouvelle valeur au parent', () => {
    const onOpenChange = vi.fn()
    render(<ComposerParameters parameters={{}} onParametersChange={vi.fn()} open onOpenChange={onOpenChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Paramètres du message/ }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

// #3892.6 (Louis 15/10) — champs facultatifs repliés : remplis = transmis, vides = ignorés.
describe('ComposerParameters — précisions facultatives (#3892.6)', () => {
  it('les quatre champs vivent dans un repli fermé par défaut', () => {
    render(<ComposerParameters parameters={{}} onParametersChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Paramètres du message/ }))
    const fold = screen.getByTestId('composer-optional-fields')
    expect(fold.tagName).toBe('DETAILS')
    expect(fold).not.toHaveAttribute('open')
    for (const label of ['Périmètre visé', 'Type de prestation', 'Période', 'Expérience passée']) {
      expect(fold).toContainElement(screen.getByLabelText(label))
    }
  })

  it('saisir une période la transmet ; la vider la retire', () => {
    const onParametersChange = vi.fn()
    render(<ComposerParameters parameters={{ period: 'T1' }} onParametersChange={onParametersChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Paramètres du message/ }))
    fireEvent.change(screen.getByLabelText('Période'), { target: { value: 'T1 2027' } })
    expect(onParametersChange).toHaveBeenLastCalledWith({ period: 'T1 2027' })
  })
})
