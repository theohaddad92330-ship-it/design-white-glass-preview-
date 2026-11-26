import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SelectField } from '@bellum/ui'

/**
 * LA liste déroulante du produit — décision « Q5 » du 01/09/2026.
 *
 * 69 % des menus étaient des `<select>` natifs (59 balises sur 35 fichiers).
 * Le natif rend son menu avec les couleurs du système d'exploitation : ni le
 * thème, ni le rayon, ni la police du produit ne s'y appliquent. En thème
 * sombre, c'est une liste blanche qui s'ouvre au milieu d'un écran noir.
 *
 * ⚠️ CE QUE CE FICHIER GARDE AVANT TOUT : LA TRADUCTION DE LA CHAÎNE VIDE.
 * Un `<select>` natif disait « aucun filtre » avec `<option value="">`.
 * Radix INTERDIT la chaîne vide comme valeur d'item et lève à l'exécution.
 * `SelectField` porte une sentinelle interne et rend `''` à l'appelant — si
 * cette traduction casse, trente-cinq écrans passent silencieusement de
 * « tous » à « rien », ce qu'aucun test d'écran ne verrait puisque la liste
 * se viderait sans erreur.
 *
 * ⚠️ CE TEST VIT DANS `apps/web` : `packages/ui` n'a ni vitest ni
 * `@testing-library/react`, donc un test posé là-bas ne s'exécuterait nulle
 * part. Il importe depuis `@bellum/ui`, ce qui vérifie au passage que le
 * composant est bien EXPORTÉ.
 */

afterEach(cleanup)

const MOIS = [
  { value: 'janvier', label: 'Janvier' },
  { value: 'fevrier', label: 'Février' },
  { value: 'mars', label: 'Mars', disabled: true },
]

describe('SelectField — la liste déroulante du produit', () => {
  it('porte un nom accessible, et affiche la valeur choisie', () => {
    render(<SelectField ariaLabel="Mois de référence" value="fevrier" onChange={vi.fn()} options={MOIS} />)

    const trigger = screen.getByRole('combobox', { name: 'Mois de référence' })
    expect(trigger).toHaveTextContent('Février')
  })

  it('affiche le texte d’attente quand rien n’est choisi', () => {
    render(
      <SelectField
        ariaLabel="Mois"
        value={undefined}
        onChange={vi.fn()}
        options={MOIS}
        placeholder="Choisir un mois"
      />,
    )

    expect(screen.getByRole('combobox')).toHaveTextContent('Choisir un mois')
  })

  it('remonte la valeur choisie', async () => {
    const onChange = vi.fn()
    render(<SelectField ariaLabel="Mois" value="janvier" onChange={onChange} options={MOIS} />)

    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(await screen.findByRole('option', { name: 'Février' }))

    expect(onChange).toHaveBeenCalledWith('fevrier')
  })

  it('rend la CHAÎNE VIDE à l’appelant quand il choisit l’option « tous »', async () => {
    // Le cœur du composant. L'appelant écrit `value=''` et reçoit `''` : il
    // n'a jamais à connaître la sentinelle que Radix impose en interne.
    const onChange = vi.fn()
    render(
      <SelectField
        ariaLabel="Mois"
        value="janvier"
        onChange={onChange}
        options={MOIS}
        emptyOption={{ label: 'Tous les mois' }}
      />,
    )

    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(await screen.findByRole('option', { name: 'Tous les mois' }))

    expect(onChange).toHaveBeenCalledWith('')
  })

  it('affiche l’option « tous » comme sélectionnée quand la valeur est vide', () => {
    // Sans cette traduction dans l'autre sens, un filtre à `''` afficherait
    // le texte d'attente — l'écran dirait « rien de choisi » alors qu'il
    // montre bien tout.
    render(
      <SelectField
        ariaLabel="Mois"
        value=""
        onChange={vi.fn()}
        options={MOIS}
        emptyOption={{ label: 'Tous les mois' }}
        placeholder="Choisir un mois"
      />,
    )

    expect(screen.getByRole('combobox')).toHaveTextContent('Tous les mois')
  })

  it('ne fabrique PAS d’option vide quand l’appelant n’en veut pas', async () => {
    render(<SelectField ariaLabel="Mois" value="janvier" onChange={vi.fn()} options={MOIS} />)

    await userEvent.click(screen.getByRole('combobox'))
    expect(await screen.findAllByRole('option')).toHaveLength(MOIS.length)
  })

  it('accepte une option vide DANS la liste, pas seulement via `emptyOption`', async () => {
    // Plusieurs vocabulaires du produit commencent par `''` pour « non
    // renseigné » (`REMOTE_CHOICES`, `TRAVEL_CHOICES`…). Radix lève à
    // l'exécution sur cette valeur : sans la sentinelle appliquée à TOUTE
    // option vide, le formulaire consultant explosait au premier rendu.
    const onChange = vi.fn()
    const avecVide = [{ value: '', label: 'Non demandé' }, ...MOIS]
    render(<SelectField ariaLabel="Télétravail" value="" onChange={onChange} options={avecVide} />)

    expect(screen.getByRole('combobox')).toHaveTextContent('Non demandé')
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(await screen.findByRole('option', { name: 'Janvier' }))
    expect(onChange).toHaveBeenCalledWith('janvier')
  })

  it("rend `''` quand on revient sur l’option vide de la liste", async () => {
    const onChange = vi.fn()
    const avecVide = [{ value: '', label: 'Non demandé' }, ...MOIS]
    render(<SelectField ariaLabel="Télétravail" value="janvier" onChange={onChange} options={avecVide} />)

    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(await screen.findByRole('option', { name: 'Non demandé' }))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('respecte une option désactivée', async () => {
    render(<SelectField ariaLabel="Mois" value="janvier" onChange={vi.fn()} options={MOIS} />)

    await userEvent.click(screen.getByRole('combobox'))
    expect(await screen.findByRole('option', { name: 'Mars' })).toHaveAttribute('data-disabled')
  })

  it('se désactive entièrement', () => {
    render(<SelectField ariaLabel="Mois" value="janvier" onChange={vi.fn()} options={MOIS} disabled />)

    expect(screen.getByRole('combobox')).toBeDisabled()
  })

  it('offre deux hauteurs, et rien d’autre', () => {
    const { rerender } = render(<SelectField ariaLabel="Mois" value="janvier" onChange={vi.fn()} options={MOIS} />)
    expect(screen.getByRole('combobox').className).toContain('h-10')

    rerender(<SelectField ariaLabel="Mois" value="janvier" onChange={vi.fn()} options={MOIS} size="sm" />)
    expect(screen.getByRole('combobox').className).toContain('h-9')
  })

  it('s’ouvre au clavier — c’est un vrai contrôle, pas un div cliquable', async () => {
    render(<SelectField ariaLabel="Mois" value="janvier" onChange={vi.fn()} options={MOIS} />)

    await userEvent.tab()
    expect(screen.getByRole('combobox')).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(await screen.findByRole('option', { name: 'Février' })).toBeInTheDocument()
  })
})
