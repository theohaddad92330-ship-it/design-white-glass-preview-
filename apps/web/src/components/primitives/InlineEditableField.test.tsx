import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { i18n } from '@/i18n'
import { InlineEditableField, type InlineEditableFieldProps } from './InlineEditableField'

// #4402.1 — l'édition en ligne : clic ou Entrée → champ ; Entrée ou blur = enregistre ; Échap = annule.
const user = () => userEvent.setup({ pointerEventsCheck: 0 })

function Harness({
  initial,
  onSave,
  ...rest
}: { initial: string; onSave: (next: string) => Promise<unknown> } & Partial<InlineEditableFieldProps>) {
  const [value, setValue] = useState(initial)
  return (
    <InlineEditableField
      label="Titre"
      {...rest}
      value={value}
      onSave={async next => {
        await onSave(next)
        setValue(next)
      }}
    />
  )
}

describe('InlineEditableField — #4402.1', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('lit la valeur dans un bouton nommé « Modifier <champ> », cible ≥ 44 px, tabulable', () => {
    render(<Harness initial="Architecte" onSave={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Modifier Titre' })
    expect(trigger).toHaveTextContent('Architecte')
    expect(trigger.className).toContain('min-h-11')
    expect(trigger).not.toHaveAttribute('tabindex', '-1')
  })

  it('un clic ouvre le champ ; Entrée enregistre et revient à la lecture', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<Harness initial="Architecte" onSave={onSave} />)
    await user().click(screen.getByRole('button', { name: 'Modifier Titre' }))
    const input = screen.getByRole('textbox', { name: 'Titre' })
    await user().clear(input)
    await user().type(input, 'Directeur{Enter}')
    expect(onSave).toHaveBeenCalledWith('Directeur')
    expect(await screen.findByRole('button', { name: 'Modifier Titre' })).toHaveTextContent('Directeur')
  })

  // #4577.7 — « le champ en édition annonce son état » : le lecteur d'écran entend, en plus du nom, que le champ est
  // en cours de modification et comment en sortir (la description est lue à la prise de focus).
  it('#4577.7 — le champ ouvert annonce « modification en cours » et comment en sortir', async () => {
    render(<Harness initial="Architecte" onSave={vi.fn()} />)
    await user().click(screen.getByRole('button', { name: 'Modifier Titre' }))
    const input = screen.getByRole('textbox', { name: 'Titre' })
    expect(input).toHaveAccessibleDescription(/modification en cours.*entrée.*échap/i)
  })

  it('#4577.7 — la lecture n’annonce rien de tel (le bouton n’est pas un champ ouvert)', () => {
    render(<Harness initial="Architecte" onSave={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Modifier Titre' })).not.toHaveAccessibleDescription(/en cours/i)
  })

  it('Entrée au clavier sur la valeur ouvre le champ', async () => {
    render(<Harness initial="Architecte" onSave={vi.fn()} />)
    screen.getByRole('button', { name: 'Modifier Titre' }).focus()
    await user().keyboard('{Enter}')
    expect(screen.getByRole('textbox', { name: 'Titre' })).toHaveFocus()
  })

  it('la perte de focus enregistre', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <>
        <Harness initial="Architecte" onSave={onSave} />
        <button type="button">ailleurs</button>
      </>,
    )
    await user().click(screen.getByRole('button', { name: 'Modifier Titre' }))
    await user().type(screen.getByRole('textbox', { name: 'Titre' }), ' IT')
    await user().click(screen.getByRole('button', { name: 'ailleurs' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Architecte IT'))
  })

  it('Échap annule : rien n’est enregistré, la valeur reste', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<Harness initial="Architecte" onSave={onSave} />)
    await user().click(screen.getByRole('button', { name: 'Modifier Titre' }))
    await user().type(screen.getByRole('textbox', { name: 'Titre' }), 'XYZ{Escape}')
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Modifier Titre' })).toHaveTextContent('Architecte')
  })

  it('une valeur inchangée n’appelle pas l’API', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<Harness initial="Architecte" onSave={onSave} />)
    await user().click(screen.getByRole('button', { name: 'Modifier Titre' }))
    await user().keyboard('{Enter}')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('erreur API : la valeur précédente revient et l’erreur se dit', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Quota dépassé'))
    render(<Harness initial="Architecte" onSave={onSave} />)
    await user().click(screen.getByRole('button', { name: 'Modifier Titre' }))
    const input = screen.getByRole('textbox', { name: 'Titre' })
    await user().clear(input)
    await user().type(input, 'Directeur{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('Quota dépassé')
    expect(screen.getByRole('button', { name: 'Modifier Titre' })).toHaveTextContent('Architecte')
  })

  it('une valeur absente est un geste « Ajouter » — jamais 0, jamais un mur de « Non renseigné »', () => {
    render(<Harness initial="" kind="number" label="Années" onSave={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Modifier Années' })
    expect(trigger).toHaveTextContent('Ajouter')
    expect(trigger).not.toHaveTextContent('0')
    expect(trigger).not.toHaveTextContent('Non renseigné')
  })

  it('nombre : champ numérique ; date : champ date', async () => {
    const { unmount } = render(<Harness initial="620" kind="number" label="TJM" onSave={vi.fn()} />)
    await user().click(screen.getByRole('button', { name: 'Modifier TJM' }))
    expect(screen.getByLabelText('TJM')).toHaveAttribute('type', 'number')
    unmount()
    render(<Harness initial="2026-11-01" kind="date" label="Disponible le" onSave={vi.fn()} />)
    await user().click(screen.getByRole('button', { name: 'Modifier Disponible le' }))
    expect(screen.getByLabelText('Disponible le')).toHaveAttribute('type', 'date')
  })

  it('liste d’étiquettes : des puces en lecture, une saisie séparée par des virgules', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<Harness initial="Java, Go" kind="tags" label="Compétences" onSave={onSave} />)
    const trigger = screen.getByRole('button', { name: 'Modifier Compétences' })
    expect(trigger).toHaveTextContent('Java')
    expect(trigger).toHaveTextContent('Go')
    await user().click(trigger)
    await user().type(screen.getByRole('textbox', { name: 'Compétences' }), ', Rust{Enter}')
    expect(onSave).toHaveBeenCalledWith('Java, Go, Rust')
  })

  it('choix : une liste du produit, le changement enregistre', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <Harness
        initial="junior"
        kind="select"
        label="Séniorité"
        options={[
          { value: 'junior', label: 'Junior' },
          { value: 'senior', label: 'Senior' },
        ]}
        onSave={onSave}
      />,
    )
    const trigger = screen.getByRole('button', { name: 'Modifier Séniorité' })
    expect(trigger).toHaveTextContent('Junior')
    await user().click(trigger)
    await user().click(screen.getByRole('combobox', { name: 'Séniorité' }))
    await user().click(await screen.findByRole('option', { name: 'Senior' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('senior'))
  })

  it('désactivé : lu, jamais éditable', () => {
    render(<Harness initial="Architecte" disabled onSave={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Modifier Titre' })).not.toBeInTheDocument()
    expect(screen.getByText('Architecte')).toBeInTheDocument()
  })

  it('lu sans droit d’écriture et sans valeur : « Non renseigné »', () => {
    render(<Harness initial="" disabled onSave={vi.fn()} />)
    expect(screen.getByText('Non renseigné')).toBeInTheDocument()
  })
})
