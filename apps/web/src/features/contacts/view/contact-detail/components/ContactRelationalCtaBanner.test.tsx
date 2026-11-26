import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { useContactStop } from '@/features/contacts/hooks/useContactStop'
import { ContactRelationalCtaBanner } from './ContactRelationalCtaBanner'

vi.mock('@/features/contacts/hooks/useContactStop', () => ({ useContactStop: vi.fn() }))

function contact(overrides: Partial<Contact>): Contact {
  return {
    id: 'c-1',
    account_id: 'a-1',
    full_name: 'Jean Dupont',
    title: 'DSI',
    entity: 'SG',
    decision_role: 'technical',
    priority: 1,
    email: 'jean@sg.com',
    email_verified: false,
    phone: null,
    linkedin_url: null,
    profile_summary: null,
    why_contact: null,
    email_message: null,
    linkedin_message: null,
    phone_script: null,
    followup_message: null,
    user_status: 'new',
    source: null,
    lifecycle_state: null,
    ...overrides,
  } as Contact
}

beforeEach(() => {
  vi.mocked(useContactStop).mockReturnValue({ data: null } as unknown as ReturnType<typeof useContactStop>)
})

afterEach(() => {
  cleanup()
})

// #2160.15/.16/.17/.19 — le CTA relationnel : un bouton, un libellé qui suit
// l'état déjà calculé, jamais un second calcul à l'écran.
describe('ContactRelationalCtaBanner', () => {
  it('#2160.15 — jamais travaillé → « Préparer la première approche »', () => {
    render(<ContactRelationalCtaBanner contact={contact({ user_status: 'new' })} onGenerateMessage={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Préparer la première approche' })).toBeInTheDocument()
  })

  it('#2160.16 — relation dormante → « Préparer une reprise »', () => {
    render(<ContactRelationalCtaBanner contact={contact({ user_status: 'silence' })} onGenerateMessage={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Préparer une reprise' })).toBeInTheDocument()
  })

  it('#2160.17 — réponse reçue → « Traiter la réponse »', () => {
    render(<ContactRelationalCtaBanner contact={contact({ user_status: 'replied' })} />)
    expect(screen.getByRole('button', { name: 'Traiter la réponse' })).toBeInTheDocument()
  })

  it('#2160.19 — emploi à vérifier → « Vérifier la situation »', () => {
    render(
      <ContactRelationalCtaBanner contact={contact({ user_status: 'contacted', lifecycle_state: 'historique' })} />,
    )
    expect(screen.getByRole('button', { name: 'Vérifier la situation' })).toBeInTheDocument()
  })

  it('aucun signal particulier → rien ne se rend (jamais un bouton vide)', () => {
    const { container } = render(<ContactRelationalCtaBanner contact={contact({ user_status: 'contacted' })} />)
    expect(container).toBeEmptyDOMElement()
  })

  // #3406 (recette 30/09) — « Traiter »/« Vérifier » restent un scroll : rien
  // à y composer, seulement une carte de lecture à amener à l'écran.
  it('« Vérifier la situation » scroll vers la carte de lecture, jamais une navigation', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    document.body.innerHTML += '<div id="contact-apollo-profile"></div>'
    render(
      <ContactRelationalCtaBanner contact={contact({ user_status: 'contacted', lifecycle_state: 'historique' })} />,
    )
    screen.getByRole('button', { name: 'Vérifier la situation' }).click()
    expect(scrollIntoView).toHaveBeenCalled()
  })

  // #3716 — « Vérifier la situation » OUVRE le détail fermé qui porte le parcours.
  it('#3716 — « Vérifier la situation » ouvre le détail « Parcours » avant de s’y rendre', () => {
    Element.prototype.scrollIntoView = vi.fn()
    document.body.innerHTML = '<div id="contact-apollo-profile"><details><summary>Parcours</summary></details></div>'
    render(
      <ContactRelationalCtaBanner contact={contact({ user_status: 'contacted', lifecycle_state: 'historique' })} />,
    )
    expect(document.querySelector('details')).not.toHaveAttribute('open')
    screen.getByRole('button', { name: 'Vérifier la situation' }).click()
    expect(document.querySelector('details')).toHaveAttribute('open')
  })

  // #3720.3 — la fiche reçoit la cible : elle ouvre le pli qui la porte, attend
  // son montage et se replie si l'id manque (un scroll vers un id absent = échec).
  it('#3720.3 — avec `onReveal`, la cible part à la fiche plutôt qu’un scroll aveugle', () => {
    const onReveal = vi.fn()
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    render(
      <ContactRelationalCtaBanner
        contact={contact({ user_status: 'contacted', lifecycle_state: 'historique' })}
        onReveal={onReveal}
      />,
    )
    screen.getByRole('button', { name: 'Vérifier la situation' }).click()
    expect(onReveal).toHaveBeenCalledWith('contact-apollo-profile')
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  // #3406 (recette 30/09, « NON PROUVABLE ») — « Préparer » ouvre désormais le
  // composeur, le même que le bouton « Contacter » de l'entête — plus un
  // simple scroll vers une carte d'amorces qui n'ouvre rien.
  it('#3406 — « Préparer la première approche » ouvre le composeur sur le premier canal disponible', () => {
    const onGenerateMessage = vi.fn()
    render(
      <ContactRelationalCtaBanner
        contact={contact({ user_status: 'new', email: 'jean@sg.com', linkedin_url: null })}
        onGenerateMessage={onGenerateMessage}
      />,
    )
    screen.getByRole('button', { name: 'Préparer la première approche' }).click()
    expect(onGenerateMessage).toHaveBeenCalledWith('email')
  })

  it('#3406 — « Préparer une reprise » ouvre le composeur, pas un scroll', () => {
    const onGenerateMessage = vi.fn()
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    render(
      <ContactRelationalCtaBanner
        contact={contact({ user_status: 'silence', email: null, linkedin_url: 'https://linkedin.com/in/jean' })}
        onGenerateMessage={onGenerateMessage}
      />,
    )
    screen.getByRole('button', { name: 'Préparer une reprise' }).click()
    expect(onGenerateMessage).toHaveBeenCalledWith('linkedin')
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('#3689 — sans canal disponible, aucun bouton : plus de carte d’accroches où retomber, jamais un bouton mort', () => {
    const onGenerateMessage = vi.fn()
    render(
      <ContactRelationalCtaBanner
        contact={contact({ user_status: 'new', email: null, linkedin_url: null, phone: null, account_id: null })}
        onGenerateMessage={onGenerateMessage}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Préparer la première approche' })).not.toBeInTheDocument()
  })

  it('#3689 — « Traiter la réponse » défile vers le fil, qui porte les échanges reçus', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    document.body.innerHTML += '<div id="contact-timeline"></div>'
    render(<ContactRelationalCtaBanner contact={contact({ user_status: 'replied' })} />)
    screen.getByRole('button', { name: 'Traiter la réponse' }).click()
    expect(scrollIntoView).toHaveBeenCalled()
  })

  // #3718.2 — « Traiter la réponse » ouvre l'ÉCHANGE (messagerie filtrée sur
  // l'adresse du contact), plus un scroll vers un bloc qui peut être absent.
  it('#3718.2 — « Traiter la réponse » ouvre l’échange avec l’adresse du contact', () => {
    const onOpenExchange = vi.fn()
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    render(
      <ContactRelationalCtaBanner
        contact={contact({ user_status: 'replied', email: 'jean@sg.com' })}
        onOpenExchange={onOpenExchange}
      />,
    )
    screen.getByRole('button', { name: 'Traiter la réponse' }).click()
    expect(onOpenExchange).toHaveBeenCalledWith('jean@sg.com')
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('#3718.3 — sans adresse, le geste le DIT au lieu de ne rien faire', () => {
    const onOpenExchange = vi.fn()
    render(
      <ContactRelationalCtaBanner
        contact={contact({ user_status: 'replied', email: null })}
        onOpenExchange={onOpenExchange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Traiter la réponse' }))
    expect(onOpenExchange).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(/aucune adresse e-mail/i)
  })

  it('#3718.7 — « Répondu » est dit comme une déclaration, l’échange réel étant celui de la messagerie', () => {
    render(<ContactRelationalCtaBanner contact={contact({ user_status: 'replied' })} onOpenExchange={vi.fn()} />)
    expect(screen.getByText(/« Répondu » est ta déclaration/)).toBeInTheDocument()
  })

  it('#3718.5 — une opposition est NOMMÉE sur le geste « Traiter la réponse » (jamais contournée)', () => {
    vi.mocked(useContactStop).mockReturnValue({
      data: { reason: 'do_not_contact', since: '2026-09-20T10:00:00.000Z', motion: null },
    } as unknown as ReturnType<typeof useContactStop>)
    render(<ContactRelationalCtaBanner contact={contact({ user_status: 'replied' })} onOpenExchange={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent(/Opposition enregistrée le 20 septembre/)
    // la lecture de l'échange reste possible : seul l'envoi est fermé, côté serveur
    expect(screen.getByRole('button', { name: 'Traiter la réponse' })).toBeInTheDocument()
  })

  // #3639 / #3689 (R2 07/10) — la fiche ne branche plus `onOpenExchange` : « Traiter la réponse »
  // amène à l'HISTORIQUE de la fiche (le même `onReveal` que « Notes »), et les mentions restent.
  it('#3639/#3689 — sans `onOpenExchange`, « Traiter la réponse » révèle le fil ET garde les mentions', () => {
    vi.mocked(useContactStop).mockReturnValue({
      data: { reason: 'do_not_contact', since: '2026-09-20T10:00:00.000Z', motion: null },
    } as unknown as ReturnType<typeof useContactStop>)
    const onReveal = vi.fn()
    render(<ContactRelationalCtaBanner contact={contact({ user_status: 'replied' })} onReveal={onReveal} />)
    screen.getByRole('button', { name: 'Traiter la réponse' }).click()
    expect(onReveal).toHaveBeenCalledWith('contact-timeline')
    expect(screen.getByText(/« Répondu » est ta déclaration/)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/Opposition enregistrée le 20 septembre/)
  })

  it('#3718.5 — sans opposition, aucune mention', () => {
    render(<ContactRelationalCtaBanner contact={contact({ user_status: 'replied' })} onOpenExchange={vi.fn()} />)
    expect(screen.queryByText(/Opposition enregistrée/)).not.toBeInTheDocument()
  })
})
