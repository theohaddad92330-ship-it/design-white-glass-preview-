import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProjectFramingBlock } from './ProjectFramingBlock'

const contacts = vi.hoisted(() => ({ data: [] as { contact_id: string; full_name: string; role: string }[] }))
vi.mock('../hooks/useProjectContacts', () => ({ useProjectContacts: () => ({ data: contacts.data }) }))

// #4291.7 (recette 23/10, démo forfait) — « Plan stratégique 2029 » : 90 000 € et « Lancer le matching », ni périmètre
// ni sponsor. En forfait, le projet se lit : périmètre, sponsor, budget — et chaque absence se NOMME.
describe('ProjectFramingBlock', () => {
  it('lit le périmètre, le sponsor et le budget', () => {
    contacts.data = [
      { contact_id: 'c1', full_name: 'Julien Castaing', role: 'sponsor' },
      { contact_id: 'c2', full_name: 'Nadia Perrin', role: 'acheteur' },
    ]
    render(
      <ProjectFramingBlock
        project={{ id: 'p1', scope_label: 'Plan stratégique 2029 — lots applicatifs', amount_cents: 9_000_000 }}
      />,
    )
    const block = screen.getByTestId('project-framing')
    expect(block).toHaveTextContent('Plan stratégique 2029 — lots applicatifs')
    expect(block).toHaveTextContent('Julien Castaing')
    expect(block).not.toHaveTextContent('Nadia Perrin')
    expect(block).toHaveTextContent('90')
  })

  it('SAIT DIRE NON : sans périmètre, sponsor ni budget, chaque absence se nomme « à cadrer » — jamais un 0', () => {
    contacts.data = [{ contact_id: 'c2', full_name: 'Nadia Perrin', role: 'acheteur' }]
    render(<ProjectFramingBlock project={{ id: 'p1', amount_cents: null }} />)
    const block = screen.getByTestId('project-framing')
    expect(block.textContent?.match(/à cadrer/g)?.length).toBeGreaterThanOrEqual(3)
    expect(block).not.toHaveTextContent('Nadia Perrin')
    expect(block).not.toHaveTextContent('0 €')
  })

  it('le contexte de l’affaire tient lieu de périmètre quand le grain n’est pas saisi', () => {
    contacts.data = []
    render(<ProjectFramingBlock project={{ id: 'p1', detail: 'Refonte du SI de paie', amount_cents: 1 }} />)
    expect(screen.getByTestId('project-framing')).toHaveTextContent('Refonte du SI de paie')
  })
})
