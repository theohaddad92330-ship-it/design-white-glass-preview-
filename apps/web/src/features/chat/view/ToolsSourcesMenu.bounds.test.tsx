import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ConnectedClientTool } from '@bellum/contracts'
import { ToolsSourcesMenu } from './ToolsSourcesMenu'

vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children?: ReactNode }) => <a href={to}>{children}</a>,
}))

const hubspot: ConnectedClientTool = { provider: 'hubspot', family: 'crm', name: 'HubSpot' }

const manyTools: ConnectedClientTool[] = Array.from({ length: 12 }, (_, index) => ({
  provider: `provider-${index}`,
  family: 'email',
  name: index === 11 ? 'Google Drive' : `Outil ${index}`,
}))

// #3708 — le popover mesurait 810 px dans une fenêtre de 827 px et débordait au-dessus (y = −152) :
// hauteur bornée à la fenêtre (dvh, jamais vh), défilement interne, collision/flip dans l'écran.
describe('#3708 — le popover « Outils et sources » tient dans la fenêtre', () => {
  it('borne sa hauteur (dvh + hauteur disponible Radix) et défile en interne', () => {
    render(<ToolsSourcesMenu tools={[hubspot]} excludedProviders={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /outils et sources/i }))
    const content = screen.getByRole('dialog')
    const cls = content.className
    expect(cls).toContain('overflow-y-auto')
    expect(cls).toMatch(/max-h-\[[^\]]*dvh[^\]]*\]/)
    expect(cls).toContain('--radix-popover-content-available-height')
    expect(cls).not.toMatch(/\d+vh/)
  })
})

/**
 * Recette 07/10 — avec beaucoup d'outils connectés, la dernière ligne (« Google
 * Drive ») était coupée en bas du popover : TOUT le contenu (titre, liste,
 * pied « Gérer les connexions » / « Terminé ») défilait comme UN seul bloc, et
 * le pied partait avec la liste au lieu de rester atteignable. La liste doit
 * défiler EN INTERNE, dans sa propre région bornée — le titre et le pied
 * restent, eux, toujours visibles et joignables sans avoir à défiler jusqu'au
 * bout de la liste.
 */
describe('recette 07/10 — la liste défile EN INTERNE, chaque ligne reste atteignable', () => {
  it('porte sa propre région bornée et défilante, distincte du titre et du pied', () => {
    render(<ToolsSourcesMenu tools={manyTools} excludedProviders={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /outils et sources/i }))

    const list = screen.getByRole('list')
    expect(list.className).toContain('overflow-y-auto')
    // Its bound is the popover's (dvh + Radix available height), shared through flex.
    expect(list.className).toContain('min-h-0')
    expect(list.className).toContain('flex-1')

    // La dernière ligne existe dans le DOM (atteignable par le défilement
    // INTERNE de la liste), et le pied n'est pas un descendant de cette
    // liste : il reste hors de sa zone de défilement.
    expect(screen.getByText('Google Drive')).toBeInTheDocument()
    const manage = screen.getByRole('link', { name: /gérer/i })
    expect(list.contains(manage)).toBe(false)
  })
})

/**
 * Recette prod 09/10 — « entrée Outlook rognée sous le texte de pied (~40 px) » :
 * le titre et le pied n'avaient pas de hauteur protégée (`shrink-0`) ; quand le
 * popover manquait de place, flexbox les compressait au lieu de laisser la
 * LISTE (seule `flex-1`) absorber la contrainte, et leur texte chevauchait la
 * dernière ligne de la liste. Chaque élément FIXE autour de la liste doit
 * porter `shrink-0` : c'est lui qui garantit qu'il ne cède jamais sa place.
 */
describe('recette prod 09/10 — le titre et le pied ne cèdent jamais leur place à la liste', () => {
  it('le titre, le pied et le lien « Gérer les connexions » portent shrink-0', () => {
    render(<ToolsSourcesMenu tools={manyTools} excludedProviders={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /outils et sources/i }))

    const dialog = screen.getByRole('dialog')
    const title = within(dialog).getByText('Outils de cette conversation')
    expect(title.className).toContain('shrink-0')

    const manage = screen.getByRole('link', { name: /gérer/i })
    const footer = manage.closest('div') as HTMLElement
    expect(footer.className).toContain('shrink-0')
  })
})

/**
 * #3708.a (recette prod 09/10, build aef69661e9 — `shrink-0` déjà servi) —
 * « ligne Outlook rognée à y 486-506, pied à 509 ». Le titre et le pied ne
 * chevauchaient plus rien : c'est la LISTE qui coupait sa dernière ligne, parce
 * qu'elle portait un plafond FIXE (`max-h-80`, 320 px) indépendant de la place
 * réelle — elle défilait à 320 px même quand la fenêtre en offrait 550, et la
 * huitième ligne restait tranchée au bord de cette zone, sans repère. La liste
 * ne porte plus de plafond propre : elle prend la hauteur bornée du popover
 * (flex), et ne défile que quand la fenêtre manque réellement de place — sa
 * zone est alors délimitée (bordures) et sa dernière ligne garde une marge.
 */
describe('#3708.a — la liste n’a pas de plafond fixe qui tranche sa dernière ligne', () => {
  it('aucune hauteur maximale propre à la liste : elle hérite de celle du popover', () => {
    render(<ToolsSourcesMenu tools={manyTools} excludedProviders={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /outils et sources/i }))

    const list = screen.getByRole('list')
    expect(list.className).not.toMatch(/(^|\s)max-h-/)
    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toMatch(/max-h-\[[^\]]*dvh[^\]]*\]/)
  })

  it('quand elle défile, sa zone est délimitée et la dernière ligne n’est pas collée au bord', () => {
    render(<ToolsSourcesMenu tools={manyTools} excludedProviders={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /outils et sources/i }))

    const list = screen.getByRole('list')
    expect(list.className).toContain('border-y')
    expect(list.className).toMatch(/(^|\s)pb-\d/)
    expect(list.className).toContain('overscroll-contain')
  })
})

// #3708 — recette 09/10 : après « Terminé », le popover fermé captait encore les clics.
describe('#3708 — le popover fermé ne capte plus aucun clic', () => {
  it('porte pointer-events-none à l’état fermé, et se démonte après « Terminé »', () => {
    render(<ToolsSourcesMenu tools={[hubspot]} excludedProviders={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /outils et sources/i }))
    expect(screen.getByRole('dialog').className).toContain('data-[state=closed]:pointer-events-none')
    fireEvent.click(screen.getByRole('button', { name: /terminé/i }))
    expect(screen.queryByRole('link', { name: /gérer/i })).not.toBeInTheDocument()
  })
})
