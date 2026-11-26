import { render, screen } from '@testing-library/react'
import type { Contact } from '@bellum/contracts'
import { describe, expect, it, vi } from 'vitest'
import { ContactEngagementLauncher } from './ContactEngagementLauncher'
import { BESIDE_FLOATING_BUTTONS_PADDING } from './floating-reserve'

/**
 * Le pied de page applicatif ne porte plus QUE les onglets d'engagement contact.
 *
 * La pastille « Copilote partagé » qui y vivait a été retirée : la barre
 * latérale (« Copilote IA » → `/chat`) est le seul point d'entrée du copilote.
 * Ces tests verrouillent le retrait — et surtout le fait que, sans engagement
 * en cours, la barre ne rend RIEN (pas de conteneur vide dans le pied de page).
 */

vi.mock('./EngagementTab', () => ({
  EngagementTab: ({ contact }: { contact: Contact }) => <div data-testid="engagement-tab">{contact.full_name}</div>,
}))

function contact(id: string, full_name: string): Contact {
  return { id, full_name, linkedin_url: 'https://linkedin.com/in/x' } as unknown as Contact
}

describe('ContactEngagementLauncher — pied de page sans lanceur copilote', () => {
  it('ne rend aucun lien vers /chat quand des onglets d’engagement sont ouverts', () => {
    render(<ContactEngagementLauncher inline contacts={[contact('c1', 'Alice Martin')]} channel="linkedin" />)

    expect(screen.getByTestId('engagement-tab')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /copilote/i })).not.toBeInTheDocument()
  })

  // Sans ce retrait, chaque page afficherait une barre de 30px vide — le
  // lanceur copilote en était le seul occupant par défaut.
  it('ne rend rien du tout sans engagement en cours', () => {
    const { container } = render(<ContactEngagementLauncher inline contacts={[]} />)

    expect(container).toBeEmptyDOMElement()
  })

  // #3487.3 — jsdom ne mesure aucune position : on épingle l'écart codé. Les
  // boutons flottants Laura/bug occupent 1rem → 4rem ; le chip doit commencer
  // au-dessus (≥ 4.5rem), faute de quoi il est recouvert (constat de recette).
  it('#3487.3 : le chip du composeur réduit se pose au-dessus des boutons flottants', () => {
    render(
      <ContactEngagementLauncher
        contact={contact('c1', 'Alice Martin')}
        channel="linkedin"
        onOpen={vi.fn()}
        contacts={[]}
      />,
    )
    const chip = screen.getByRole('button', { name: /Alice Martin/ }).parentElement as HTMLElement
    const offset = /bottom-\[calc\((\d+(?:\.\d+)?)rem\+/.exec(chip.className)
    expect(offset, 'le chip porte un bas en rem + hauteur de nav mobile').not.toBeNull()
    expect(Number(offset?.[1])).toBeGreaterThanOrEqual(4.5)
  })
  // #3487.3 (suite) — le correctif d'origine ne gardait que la variante à un
  // contact ; les ONGLETS (165×28 px, `bottom-2`) restaient sous les flottants.
  it('#3487.3 : la barre d’onglets portée en bas d’écran se pose aussi au-dessus des flottants', () => {
    render(<ContactEngagementLauncher contacts={[contact('c1', 'Alice Martin'), contact('c2', 'Bob Durand')]} />)
    const bar = screen.getAllByTestId('engagement-tab')[0]?.closest('.fixed') as HTMLElement | null
    expect(bar, 'la barre est un conteneur fixe').not.toBeNull()
    const offset = /bottom-\[calc\((\d+(?:\.\d+)?)rem\+/.exec(bar?.className ?? '')
    expect(offset, 'le bas est exprimé en rem + nav mobile').not.toBeNull()
    expect(Number(offset?.[1])).toBeGreaterThanOrEqual(4.5)
  })

  // #3487.3 (recette 02/10) — la bande EN LIGNE du pied de page est alignée à
  // droite, sous Laura et « Signaler » : elle réserve leur largeur (≥ 7,5rem).
  it('#3487.3 : la bande en ligne laisse la place des boutons flottants à droite', () => {
    render(<ContactEngagementLauncher inline contacts={[contact('c1', 'Alice Martin')]} />)
    const strip = screen.getByTestId('engagement-tab').closest('.overflow-hidden') as HTMLElement
    expect(strip.className).toContain(BESIDE_FLOATING_BUTTONS_PADDING)
    expect(BESIDE_FLOATING_BUTTONS_PADDING).toBe('pr-32') // 8rem ≥ 7,5rem occupés
  })
})
