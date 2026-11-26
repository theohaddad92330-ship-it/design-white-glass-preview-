import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { ContactChannels } from './CompactContactRow'

// #4404.2 — le jumeau de la fiche : e-mail, téléphone, LinkedIn SOUS les deux.
const contact = {
  id: 'c1',
  email: 'amina@exemple.fr',
  phone: '+33612345678',
  linkedin_url: 'https://www.linkedin.com/in/amina-benali',
} as unknown as Contact

describe('ContactChannels — #4404.2 ordre des coordonnées', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it("LinkedIn vient après l'e-mail et le téléphone, nommé et cliquable", () => {
    const { container } = render(<ContactChannels contact={contact} onEnrich={() => undefined} />)
    const children = Array.from(container.firstElementChild?.children ?? [])
    const link = screen.getByRole('link', { name: 'Voir sur LinkedIn' })
    expect(children.at(-1)).toBe(link)
    // L'e-mail et le téléphone vivent dans la cellule « Coordonnées », AVANT LinkedIn.
    expect(children[0]?.contains(screen.getByTitle('amina@exemple.fr'))).toBe(true)
    expect(children[0]?.contains(screen.getByRole('link', { name: '+33612345678' }))).toBe(true)
    expect(link).toHaveAttribute('href', 'https://www.linkedin.com/in/amina-benali')
  })

  it('sans URL : pas de lien mort', () => {
    render(
      <ContactChannels contact={{ ...contact, linkedin_url: null } as unknown as Contact} onEnrich={() => undefined} />,
    )
    expect(screen.queryByRole('link', { name: /LinkedIn/ })).not.toBeInTheDocument()
  })
})
