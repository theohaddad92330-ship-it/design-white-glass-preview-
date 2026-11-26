import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { ContactRecordCard } from './ContactRecordCard'

const patchMutate = vi.fn()
const removeMutate = vi.fn()

vi.mock('@/features/crm-core/hooks/useRecordEdit', () => ({
  usePatchContact: () => ({ mutate: patchMutate, isPending: false }),
  useDeleteContact: () => ({ mutate: removeMutate, isPending: false }),
}))

vi.mock('@/features/crm-core/view/RecordHistory', () => ({
  RecordHistory: () => null,
}))

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
})

const user = () => userEvent.setup({ pointerEventsCheck: 0 })

const contact = {
  id: 'c-1',
  full_name: 'Camille Roux',
  title: null,
  email: null,
  phone: null,
  entity: null,
  linkedin_url: null,
  locale: null,
  decision_role: null,
  declared_person_company_relation: null,
} as unknown as Contact

/**
 * #2861 (#2437.2) — le niveau DESTINATAIRE de langue trouve son APPELANT :
 * la fiche contact rend désormais un sélecteur, corrigeable comme les autres
 * champs.
 */
describe('ContactRecordCard — #2861, la langue déclarée du destinataire', () => {
  it('non renseignée : le sélecteur montre « Non renseigné », jamais une langue devinée', () => {
    render(<ContactRecordCard contact={contact} />)
    expect(screen.getByLabelText('Langue')).toHaveTextContent('Non renseigné')
  })

  it('une langue déjà déclarée est affichée', () => {
    render(<ContactRecordCard contact={{ ...contact, locale: 'en' }} />)
    expect(screen.getByLabelText('Langue')).toHaveTextContent('Anglais')
  })

  it('choisir une langue enregistre la correction humaine', async () => {
    render(<ContactRecordCard contact={contact} />)
    await user().click(screen.getByLabelText('Langue'))
    await user().click(screen.getByText('Anglais'))
    expect(patchMutate).toHaveBeenCalledWith({ locale: 'en' })
  })
})

/**
 * #3400.6 (retour bêta #3400, « permettre à l'utilisateur de corriger [le
 * rôle de décision] ») — la fiche n'exposait AUCUN sélecteur pour ce champ
 * alors que l'écriture était déjà plombée côté API/contrat
 * (`ContactCorePatch.decisionRole`, `CONTACT_FIELD_COLUMNS.decisionRole`) :
 * du code juste, calculé, testé, que personne n'appelait.
 */
describe('ContactRecordCard — #3400.6, corriger le rôle de décision', () => {
  it('non renseigné : le sélecteur montre « Non renseigné », jamais un rôle deviné', () => {
    render(<ContactRecordCard contact={contact} />)
    expect(screen.getByLabelText('Rôle de décision')).toHaveTextContent('Non renseigné')
  })

  it('un rôle déjà attribué est affiché', () => {
    render(<ContactRecordCard contact={{ ...contact, decision_role: 'champion' }} />)
    expect(screen.getByLabelText('Rôle de décision')).toHaveTextContent('Champion')
  })

  it('choisir un rôle enregistre la correction humaine', async () => {
    render(<ContactRecordCard contact={contact} />)
    await user().click(screen.getByLabelText('Rôle de décision'))
    await user().click(screen.getByText('Champion'))
    expect(patchMutate).toHaveBeenCalledWith({ decisionRole: 'champion' })
  })
})

/**
 * #219.8 (#3231, lot Q03) — la relation personne↔entreprise DÉCLARÉE trouve sa
 * SOURCE : avant, la colonne existait et pilotait le message, mais aucun écran
 * ne permettait de la déclarer. Même geste que la langue et le rôle : une
 * correction humaine, `null` = « relation inconnue », jamais devinée.
 */
describe('ContactRecordCard — #219.8, déclarer la relation personne↔entreprise', () => {
  it('non déclarée : « Non renseigné », jamais une relation devinée d’un titre', () => {
    render(<ContactRecordCard contact={contact} />)
    expect(screen.getByLabelText('Relation avec l’entreprise')).toHaveTextContent('Non renseigné')
  })

  it('une relation déjà déclarée est affichée', () => {
    render(
      <ContactRecordCard
        contact={{ ...contact, declared_person_company_relation: 'employee_former' } as unknown as Contact}
      />,
    )
    expect(screen.getByLabelText('Relation avec l’entreprise')).toHaveTextContent('Ancien salarié')
  })

  it('choisir une relation enregistre la correction humaine', async () => {
    render(<ContactRecordCard contact={contact} />)
    await user().click(screen.getByLabelText('Relation avec l’entreprise'))
    await user().click(screen.getByText('Ancien salarié'))
    expect(patchMutate).toHaveBeenCalledWith({ declaredPersonCompanyRelation: 'employee_former' })
  })

  it('ne propose pas « unknown_relationship » : l’effacer, c’est « Non renseigné »', async () => {
    render(<ContactRecordCard contact={contact} />)
    await user().click(screen.getByLabelText('Relation avec l’entreprise'))
    expect(screen.queryByText('Relation inconnue')).not.toBeInTheDocument()
  })
})

/**
 * #3850.4 — le champ téléphone corrigeable se LIT en international lisible,
 * s'ÉDITE et se SAUVE en forme stockée (E.164 compact) : même séparation que
 * `ContactKeyInfo`/`EngagementCallBar`, portée ici par `EditableField.displayValue`.
 */
describe('ContactRecordCard — #3850.4, le téléphone corrigeable', () => {
  it('se lit en international lisible, jamais le compact brut', () => {
    render(<ContactRecordCard contact={{ ...contact, phone: '+33681050091' } as unknown as Contact} />)
    expect(screen.getByText('+33 6 81 05 00 91')).toBeInTheDocument()
    expect(screen.queryByText('+33681050091')).toBeNull()
  })

  it('s’édite et se sauve en forme stockée, pas la forme affichée', async () => {
    render(<ContactRecordCard contact={{ ...contact, phone: '+33681050091' } as unknown as Contact} />)
    await user().click(screen.getByRole('button', { name: /Corriger Téléphone/i }))
    expect(screen.getByRole('textbox', { name: /Téléphone/i })).toHaveValue('+33681050091')
  })
})

// #4404.2 — recette 21/10 M : e-mail, téléphone, LinkedIn dans cet ordre, LinkedIn sous le téléphone.
describe('ContactRecordCard — #4404.2 ordre des coordonnées', () => {
  it('e-mail, téléphone puis LinkedIn', () => {
    render(<ContactRecordCard contact={contact} />)
    const labels = ['E-mail', 'Téléphone', 'Profil professionnel'].map(name => screen.getByText(new RegExp(`^${name}`)))
    const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(follows(labels[0]!, labels[1]!)).toBe(true)
    expect(follows(labels[1]!, labels[2]!)).toBe(true)
    // Entreprise n'intercale plus rien entre téléphone et LinkedIn.
    const entity = screen.getByText(/^Entité/)
    expect(follows(entity, labels[0]!)).toBe(true)
  })
})
