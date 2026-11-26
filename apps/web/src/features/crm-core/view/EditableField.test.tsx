import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EditableField } from './EditableField'

/**
 * Le champ corrigeable — la brique qui fait passer une fiche de la lecture
 * seule à l'édition. Ce qui se vérifie ici n'est pas l'apparence mais les trois
 * décisions qui font qu'on peut lui confier une saisie.
 */
describe('EditableField', () => {
  it('affiche « Non renseigné » pour un champ vide, au lieu d’un blanc muet', () => {
    render(<EditableField label="Téléphone" value={null} onSave={vi.fn()} />)
    expect(screen.getByText('Non renseigné')).toBeInTheDocument()
  })

  it('#3702 — en édition, le champ prend toute la largeur (61 px dans un parent de 141 px) et les boutons passent dessous', () => {
    render(<EditableField label="Nom" value="Louis" onSave={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Corriger Nom/i }))

    const input = screen.getByRole('textbox', { name: 'Nom' })
    expect(input.className).toMatch(/\bmin-w-0\b/)
    expect(input.className).toMatch(/\bbasis-full\b/)
    expect(input.parentElement?.className).toMatch(/\bflex-wrap\b/)
    expect(screen.getByRole('button', { name: 'Enregistrer' }).className).toMatch(/\bmin-h-11\b/)
  })

  it('enregistre la nouvelle valeur à la validation', () => {
    const onSave = vi.fn()
    render(<EditableField label="Raison sociale" value="Groupe TF1" onSave={onSave} />)

    fireEvent.click(screen.getByRole('button', { name: /Corriger Raison sociale/i }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Raison sociale' }), { target: { value: 'TF1 PUB' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(onSave).toHaveBeenCalledWith('TF1 PUB')
  })

  it('rend `null` quand l’utilisateur VIDE le champ — lui seul peut effacer', () => {
    const onSave = vi.fn()
    render(<EditableField label="Siège" value="Paris" onSave={onSave} />)

    fireEvent.click(screen.getByRole('button', { name: /Corriger Siège/i }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Siège' }), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(onSave).toHaveBeenCalledWith(null)
  })

  it('n’enregistre rien quand la valeur n’a pas bougé', () => {
    const onSave = vi.fn()
    render(<EditableField label="Secteur" value="Médias" onSave={onSave} />)

    fireEvent.click(screen.getByRole('button', { name: /Corriger Secteur/i }))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Secteur' }), { key: 'Enter' })

    expect(onSave).not.toHaveBeenCalled()
  })

  it('abandonne la saisie sur Échap sans rien enregistrer', () => {
    const onSave = vi.fn()
    render(<EditableField label="Secteur" value="Médias" onSave={onSave} />)

    fireEvent.click(screen.getByRole('button', { name: /Corriger Secteur/i }))
    const input = screen.getByRole('textbox', { name: 'Secteur' })
    fireEvent.change(input, { target: { value: 'Banque' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText('Médias')).toBeInTheDocument()
  })

  it('ne propose pas de crayon quand l’édition est fermée', () => {
    render(<EditableField label="Secteur" value="Médias" onSave={vi.fn()} disabled />)
    expect(screen.queryByRole('button', { name: /Corriger/i })).toBeNull()
  })

  // #3850.4 — `displayValue` change ce qui se LIT (téléphone en international
  // lisible) sans toucher ce qui s'ÉDITE ni ce qui se SAUVE (forme stockée).
  describe('#3850.4 — displayValue sépare la lecture de l’édition', () => {
    it('affiche `displayValue` au repos, jamais `value` brut', () => {
      render(<EditableField label="Téléphone" value="+33681050091" displayValue="+33 6 81 05 00 91" onSave={vi.fn()} />)
      expect(screen.getByText('+33 6 81 05 00 91')).toBeInTheDocument()
      expect(screen.queryByText('+33681050091')).toBeNull()
    })

    it('édite la forme STOCKÉE (`value`), pas `displayValue`', () => {
      const onSave = vi.fn()
      render(<EditableField label="Téléphone" value="+33681050091" displayValue="+33 6 81 05 00 91" onSave={onSave} />)
      fireEvent.click(screen.getByRole('button', { name: 'Corriger Téléphone' }))
      const input = screen.getByRole('textbox', { name: 'Téléphone' }) as HTMLInputElement
      expect(input.value).toBe('+33681050091')
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(onSave).not.toHaveBeenCalled()
    })

    it('sans `displayValue`, reste identique à `value` (comportement par défaut inchangé)', () => {
      render(<EditableField label="Siège" value="Lyon" onSave={vi.fn()} />)
      expect(screen.getByText('Lyon')).toBeInTheDocument()
    })
  })

  describe('#2598.4 bis — décision Louis 20/09/2026 : affordance PERMANENTE, pas conditionnée au pointeur', () => {
    it('le bouton « Corriger » ne dépend plus d’un survol, d’un focus ni du type de pointeur pour être visible', () => {
      render(<EditableField label="Téléphone" value="01 23 45 67 89" onSave={vi.fn()} />)
      const trigger = screen.getByRole('button', { name: 'Corriger Téléphone' })

      // Avant #2598.4 bis : `opacity-0 pointer-coarse:opacity-100 group-hover:opacity-100
      // focus-visible:opacity-100` — invisible par défaut, visible seulement sous
      // pointeur grossier, au survol souris ou au focus. `pointer-coarse:` dépend
      // d'une détection de type de pointeur qui ment sur certains hybrides
      // (trackpad tactile, stylet) : la décision du 20/09/2026 est PARTOUT et
      // sans condition — le crayon est toujours à l'écran.
      expect(trigger.className).not.toMatch(/(^|\s)opacity-0(\s|$)/)
      expect(trigger.className).not.toContain('group-hover:opacity-100')
      expect(trigger.className).not.toContain('pointer-coarse:opacity-100')
      expect(trigger.className).not.toContain('focus-visible:opacity-100')
    })

    it('porte toujours la cible tactile de 44 px sous pointeur grossier (GA-32), héritée du bouton icône partagé', () => {
      render(<EditableField label="Fonction" value="RSSI" onSave={vi.fn()} />)
      const trigger = screen.getByRole('button', { name: 'Corriger Fonction' })
      expect(trigger.className).toContain('pointer-coarse:min-h-11')
      expect(trigger.className).toContain('pointer-coarse:min-w-11')
    })

    // #2598.4 — mesuré en production le 20/09 par `getBoundingClientRect` /
    // `getComputedStyle`, SANS survol : `opacity: 1` et `visibility: visible`
    // (l'affordance permanente, #2598.4 bis, tient) mais `width = height =
    // 36px` partout, six boutons sur la fiche contact, dix sur la fiche
    // compte LVMH. `pointer-coarse:min-h-11`/`min-w-11` (test juste au-dessus)
    // ne joue QUE sous un pointeur grossier (GA-30, `responsive-tables.test.ts`,
    // doctrine assumée : « une tablette pointée à la souris n'en a pas
    // besoin ») — sous pointeur FIN (souris, trackpad, ou l'environnement de
    // mesure), le plancher ne s'applique jamais : ce test-ci le codifiait
    // comme correct, c'est le piège que #2598.4 nomme. Le geste de correction
    // n'est pas un bouton décoratif parmi d'autres — GA-30 le pose lui-même
    // (« un cliquet et non un interdit : beaucoup de contrôles sont
    // légitimement petits ») : celui-ci ne l'est pas, il est SEUL sur sa
    // fiche à porter la correction, donc un plancher tactile INCONDITIONNEL,
    // sans dégrader la densité — c'est la ZONE cliquable qui grandit,
    // jamais le crayon dessiné (`size-3.5`, inchangé).
    it('porte une cible ≥ 44 px SANS condition de pointeur — pas seulement sous pointeur grossier', () => {
      render(<EditableField label="Fonction" value="RSSI" onSave={vi.fn()} />)
      const trigger = screen.getByRole('button', { name: 'Corriger Fonction' })
      expect(trigger.className).toMatch(/(^|\s)min-h-11(\s|$)/)
      expect(trigger.className).toMatch(/(^|\s)min-w-11(\s|$)/)
    })

    it('a un nom accessible qui nomme le champ corrigé', () => {
      render(<EditableField label="E-mail" value="a@b.fr" onSave={vi.fn()} />)
      expect(screen.getByRole('button', { name: 'Corriger E-mail' })).toBeInTheDocument()
    })

    it('reste atteignable au clavier — Tab l’ordonne après le libellé', () => {
      render(<EditableField label="Siège" value="Lyon" onSave={vi.fn()} />)
      const trigger = screen.getByRole('button', { name: 'Corriger Siège' })
      trigger.focus()
      expect(trigger).toHaveFocus()
    })
  })
})
