import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { ContactsCountersLine, countContactFigures } from './ContactsCountersLine'

// Théo A comptes-fiche.R5 — trois repères au-dessus des interlocuteurs : contacts · avec e-mail · relations engagées.
const c = (partial: Partial<Contact>): Contact => ({ id: 'x', email: null, user_status: 'new', ...partial }) as Contact

describe('countContactFigures', () => {
  it('compte les contacts retenus, ceux avec e-mail et les relations engagées', () => {
    const figures = countContactFigures([
      c({ email: 'a@b.fr', user_status: 'contacted' }),
      c({ email: ' ', user_status: 'replied' }),
      c({ email: 'c@d.fr', user_status: 'meeting' }),
      c({ user_status: 'new' }),
      c({ user_status: 'refused' }),
      c({ email: 'e@f.fr', hidden: true } as Partial<Contact>),
    ])
    expect(figures).toEqual({ contacts: 5, withEmail: 2, engaged: 3 })
  })

  it('un écarté ne compte pas parmi les contacts retenus', () => {
    expect(countContactFigures([c({ excluded_at: '2026-10-01' } as Partial<Contact>)]).contacts).toBe(0)
  })
})

describe('ContactsCountersLine', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('dit les trois repères', () => {
    render(<ContactsCountersLine contacts={[c({ email: 'a@b.fr', user_status: 'contacted' }), c({})]} />)
    expect(screen.getByText('2 contacts')).toBeInTheDocument()
    expect(screen.getByText('1 avec e-mail')).toBeInTheDocument()
    expect(screen.getByText('1 relation engagée')).toBeInTheDocument()
  })

  it('⚠️ une absence n’est jamais « 0 » : sans contact retenu, rien ne s’affiche', () => {
    const { container } = render(<ContactsCountersLine contacts={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('sans relation engagée, la mention disparaît au lieu de dire « 0 »', () => {
    render(<ContactsCountersLine contacts={[c({ email: 'a@b.fr' })]} />)
    expect(screen.queryByText(/relation/)).not.toBeInTheDocument()
  })
})
