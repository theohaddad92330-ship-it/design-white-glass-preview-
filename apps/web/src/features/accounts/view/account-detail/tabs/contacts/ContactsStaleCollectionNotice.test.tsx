import { describe, expect, it, vi } from 'vitest'
import { SEGMENT_CAPABILITY_EPOCH } from '@bellum/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ContactsStaleCollectionNotice } from './ContactsStaleCollectionNotice'

/**
 * #AF.3 (18/09/2026) — L'AVEU DE FRAÎCHEUR, et #2543.3b/.3c/.3d (18/09/2026).
 *
 * Un compte dont la dernière collecte de contacts est ANTÉRIEURE au
 * correctif #2543 (SEGMENT_CAPABILITY_EPOCH.contacts, 18/09/2026 00:00 UTC)
 * doit le DIRE — jamais présenter son chiffre comme un fait courant.
 *
 * #2543.3b — le bandeau porte le GESTE qu'il annonce : mesuré en production
 * le 18/09, aucun bouton ne portait le libellé exact que le texte renvoyait
 * ("Enrichir contacts") — l'utilisateur devait deviner. Le bandeau reçoit
 * maintenant `onEnrich`/`enriching` et porte son propre bouton, comme
 * `AccountContactsEmailNotice` (même famille de geste, GA-26).
 *
 * #2543.3c — en espace de DÉMONSTRATION, la date de collecte n'a aucun sens
 * (rien n'a été collecté) : le bandeau ne s'affiche JAMAIS, quel que soit
 * `collectedAt`.
 *
 * #2543.3d — le bandeau tient sur UNE ligne : la phrase courte + le bouton
 * dans la MÊME ligne. L'explication longue a disparu (elle vivait dans
 * `contactsTab.staleCollection.reason`, plus rendue).
 */
/**
 * ⚠️ AUCUNE date en dur pour le témoin NÉGATIF, et c'est le correctif du
 * 21/09/2026 : `SEGMENT_CAPABILITY_EPOCH.contacts` AVANCE à chaque correctif
 * de collecte — #2655.1 l'a porté du 18/09 au 20/09, et la date `2026-09-18T12:00`
 * qui vivait ici, POSTÉRIEURE à la capacité le jour où elle a été écrite, est
 * devenue ANTÉRIEURE sans que personne n'y touche. Le bandeau s'affichait donc
 * à raison, et le témoin négatif rougissait à tort.
 *
 * On part de la capacité elle-même : un jour APRÈS, quelle qu'elle devienne.
 */
const APRES_LA_CAPACITE = new Date(
  Date.parse(SEGMENT_CAPABILITY_EPOCH.contacts ?? '') + 24 * 60 * 60 * 1000,
).toISOString()

const demo = vi.hoisted(() => ({ current: false }))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => demo.current }))

describe('ContactsStaleCollectionNotice (#AF.3, #2543.3b/.3c/.3d)', () => {
  it('ne montre rien quand la collecte est POSTÉRIEURE à la capacité (témoin négatif)', async () => {
    demo.current = false
    const { container } = renderWithRouter(
      <ContactsStaleCollectionNotice collectedAt={APRES_LA_CAPACITE} onEnrich={vi.fn()} />,
    )
    await waitFor(() => expect(container).toBeInTheDocument())
    expect(screen.queryByText(/à revérifier/i)).not.toBeInTheDocument()
  })

  it('dit la date quand la collecte est ANTÉRIEURE à la capacité (témoin positif)', async () => {
    demo.current = false
    renderWithRouter(<ContactsStaleCollectionNotice collectedAt="2026-09-10T08:00:00.000Z" onEnrich={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/10 septembre 2026/)).toBeInTheDocument())
  })

  // SIMON-FIX (vu en passant a) — recette Simon 20/10 : « Date de collecte non mesurée — à revérifier ».
  // Quand la date manque, le bandeau dit ce qu'on SAIT : la collecte est antérieure à la capacité
  // (jamais datée = antérieure au correctif qui a introduit la date), et jamais « non mesurée ».
  it('« non mesuré n’est jamais à jour » — une collecte jamais datée est signalée périmée, avec ce qu’on sait', async () => {
    demo.current = false
    renderWithRouter(<ContactsStaleCollectionNotice collectedAt={null} onEnrich={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/Collecte antérieure au/i)).toBeInTheDocument())
    expect(screen.queryByText(/non mesurée/i)).not.toBeInTheDocument()
  })

  it('#2543.3b — porte un bouton qui déclenche le geste, sans qu’il faille le chercher ailleurs', async () => {
    demo.current = false
    const onEnrich = vi.fn()
    renderWithRouter(<ContactsStaleCollectionNotice collectedAt={null} onEnrich={onEnrich} />)
    const button = await screen.findByRole('button')
    fireEvent.click(button)
    expect(onEnrich).toHaveBeenCalledTimes(1)
  })

  it('#2543.3b — le bouton se désactive pendant le geste, comme les gestes frères', async () => {
    demo.current = false
    renderWithRouter(<ContactsStaleCollectionNotice collectedAt={null} onEnrich={vi.fn()} enriching />)
    const button = await screen.findByRole('button')
    expect(button).toBeDisabled()
  })

  it('#2543.3c — ne s’affiche JAMAIS en espace de démonstration, même sur une collecte non mesurée', async () => {
    demo.current = true
    const { container } = renderWithRouter(<ContactsStaleCollectionNotice collectedAt={null} onEnrich={vi.fn()} />)
    await waitFor(() => expect(container).toBeInTheDocument())
    expect(screen.queryByText(/non mesurée|à revérifier/i)).not.toBeInTheDocument()
    demo.current = false
  })

  it('#2543.3d — la phrase et le bouton vivent dans la MÊME ligne (un seul conteneur flex)', async () => {
    demo.current = false
    renderWithRouter(<ContactsStaleCollectionNotice collectedAt={null} onEnrich={vi.fn()} />)
    const button = await screen.findByRole('button')
    const text = screen.getByText(/Collecte antérieure au/i)
    // Même parent direct : pas de ligne d'explication séparée entre les deux.
    expect(button.parentElement).toBe(text.parentElement)
  })
})
