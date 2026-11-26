import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import fr from '@/i18n/locales/fr/access.json'
import { CapabilityGate } from './CapabilityGate'

/**
 * Ce que la grille promet, et qu'un rendu seul ne prouve pas.
 *
 * Le test qui compte est le deuxième : au premier jet, les clés de raison
 * s'appelaient `mailbox:send`, `agenda:write`… — et `:` est le séparateur de
 * NAMESPACE d'i18next, qu'aucune option ne désactive ici. `t('gate.mailbox:send')`
 * était donc lu comme « namespace `gate.mailbox`, clé `send` », introuvable, et
 * les CINQ raisons spécifiques retombaient en silence sur le repli générique.
 *
 * Autrement dit : la primitive écrite pour empêcher « une action grisée sans
 * raison » affichait « cette action a besoin d'un outil » à la place de « connecte
 * ta messagerie ». Un test de rendu l'aurait ratée — le composant s'affichait, le
 * tooltip s'ouvrait, le texte était français et plausible.
 */

describe('CapabilityGate — quand la capacité est là', () => {
  it('rend l’enfant tel quel, sans envelopper ni griser', async () => {
    const onClick = vi.fn()
    render(
      <CapabilityGate available capability="mailbox_write">
        <button onClick={onClick}>Rédiger</button>
      </CapabilityGate>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Rédiger' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('CapabilityGate — quand elle manque', () => {
  it('ne CACHE pas l’action : on ne demande pas un accès qu’on n’a jamais vu', () => {
    render(
      <CapabilityGate available={false} capability="mailbox_write">
        <button>Rédiger</button>
      </CapabilityGate>,
    )

    expect(screen.getByRole('button', { name: 'Rédiger' })).toBeInTheDocument()
  })

  it('rattache la raison à l’action — sinon un lecteur d’écran dit « désactivé » et rien d’autre', () => {
    render(
      <CapabilityGate available={false} capability="mailbox_write">
        <button>Rédiger</button>
      </CapabilityGate>,
    )

    const described = document.querySelector('[aria-describedby]')
    expect(described?.getAttribute('aria-describedby')).toBe('capability-gate-mailbox-write')
  })

  it('déclare le mécanisme qui empêche le clic d’atteindre l’action', () => {
    // ⚠️ Ce que ce test peut et ne peut PAS dire. Le blocage est du CSS
    // (`pointer-events: none`), et jsdom n'applique aucune feuille Tailwind :
    // y simuler un clic le laisse passer, quel que soit le composant. Asserter
    // « onClick n'a pas été appelé » ici donnerait donc un test qui échoue sur
    // du code juste — ou qui passe pour une raison qui n'est pas la bonne.
    // On vérifie que le mécanisme est POSÉ ; son effet se voit en recette.
    render(
      <CapabilityGate available={false} capability="mailbox_write">
        <button>Rédiger</button>
      </CapabilityGate>,
    )

    const button = screen.getByRole('button', { name: 'Rédiger' })
    expect(button.parentElement?.className).toContain('pointer-events-none')
    expect(button.closest('[aria-describedby]')?.className).toContain('cursor-not-allowed')
  })
})

describe('les raisons sont ATTEIGNABLES', () => {
  /**
   * La garde du défaut ci-dessus. Elle ne rend rien : elle vérifie la FORME des
   * clés, parce que c'est la forme qui les rendait muettes. Un `:` dans une clé
   * i18next est un séparateur de namespace, jamais un caractère.
   */
  it('aucune clé de raison ne contient « : », qui la rendrait introuvable', () => {
    const keys = Object.keys(fr.gate)
    expect(keys.filter(key => key.includes(':'))).toEqual([])
  })

  it('chaque capacité citée par un écran a sa raison écrite', () => {
    // Ce que les écrans passent aujourd'hui. Une capacité ajoutée sans sa
    // raison retombe sur le repli — ce qui marche, mais n'apprend rien.
    expect(fr.gate).toHaveProperty('mailbox_write')
    expect(fr.gate).toHaveProperty('fallback')
  })

  it('le repli existe, et il nomme l’écran où se règle le problème', () => {
    expect(fr.gate.fallback).toContain('Intégrations')
  })
})
