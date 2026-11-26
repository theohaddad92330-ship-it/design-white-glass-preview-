import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SurfaceContextContract } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { SurfaceContextChip } from './SurfaceContextChip'

const hook = vi.hoisted(() => ({ data: undefined as SurfaceContextContract | undefined, calls: [] as unknown[][] }))
vi.mock('../api', () => ({
  useSurfaceContextContract: (...args: unknown[]) => {
    hook.calls.push(args)
    return { data: hook.data }
  },
}))

const discover: SurfaceContextContract = {
  surface: 'discover',
  mode: 'my_activity',
  modes_available: ['my_activity', 'one_off_mission', 'neutral'],
  layers: [
    { id: 'esn_profile', state: 'used', name: 'Acme Conseil', version: 12 },
    { id: 'portfolio', state: 'used' },
    { id: 'crm', state: 'not_read_here' },
  ],
}

beforeEach(() => {
  hook.data = undefined
  hook.calls = []
})

/**
 * #2454.1 / .6 / .7 — la chip « Contexte » : un preset simple au premier
 * niveau, le détail des couches derrière un clic, rendu par LE composant de
 * Laura (`ContextDisclosure`, GA-26).
 */
describe('SurfaceContextChip (#2454)', () => {
  it('sans contrat (requête en cours ou en échec) : RIEN — jamais une ligne devinée', () => {
    const { container } = renderWithRouter(<SurfaceContextChip surface="discover" mode="my_activity" />)
    expect(container.querySelector('[data-surface-context]')).toBeNull()
  })

  it('rend la ligne « Contexte utilisé » avec le profil versionné, derrière un clic', async () => {
    hook.data = discover
    renderWithRouter(<SurfaceContextChip surface="discover" mode="my_activity" onModeChange={() => {}} />)
    expect(await screen.findByText('Cette recherche utilise ton profil, ton portefeuille.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Contexte utilisé/ }))
    expect(screen.getByText('Profil ESN : Acme Conseil · v12')).toBeInTheDocument()
    expect(screen.getByText("Ton CRM n'est pas lu par cette recherche")).toBeInTheDocument()
  })

  // #2451.1 — le choix passe par LE composant de mode de Laura
  // (`ContextModePicker`) : même déclencheur, mêmes trois modes, même liste.
  it('le choix passe par le composant UNIQUE de Laura, avec les modes que la surface tient', async () => {
    hook.data = discover
    const onModeChange = vi.fn()
    renderWithRouter(<SurfaceContextChip surface="discover" mode="my_activity" onModeChange={onModeChange} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Contexte de travail : Mon activité' }))
    const radios = await screen.findAllByRole('radio')
    expect(radios.map(r => r.getAttribute('aria-label'))).toEqual(['Mon activité', 'Mission ponctuelle', 'Neutre'])
    expect(radios[0]).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(radios[1])
    expect(onModeChange).toHaveBeenCalledWith('one_off_mission')
  })

  it("sans mode choisi, le serveur applique le défaut de l'ESPACE — la chip montre ce qu'il rend", async () => {
    hook.data = { ...discover, mode: 'neutral', layers: [{ id: 'esn_profile', state: 'ignored_by_mode' }] }
    renderWithRouter(<SurfaceContextChip surface="discover" onModeChange={() => {}} />)
    expect(await screen.findByRole('button', { name: 'Contexte de travail : Neutre' })).toBeInTheDocument()
    expect(hook.calls[0]).toEqual(['discover', undefined])
  })

  it('le mode demandé part au serveur — le contrat décrit CE mode, pas un autre', async () => {
    hook.data = { ...discover, mode: 'neutral' }
    renderWithRouter(<SurfaceContextChip surface="discover" mode="neutral" />)
    await screen.findAllByText('Neutre')
    expect(hook.calls[0]).toEqual(['discover', 'neutral'])
  })

  it('une surface qui ne tient qu’un mode ne propose aucun choix', async () => {
    hook.data = {
      surface: 'analyze',
      mode: 'my_activity',
      modes_available: ['my_activity'],
      layers: [{ id: 'crm', state: 'not_connected', action: 'connect_crm' }],
    }
    renderWithRouter(<SurfaceContextChip surface="analyze" mode="my_activity" onModeChange={() => {}} />)
    expect(await screen.findByText('Mon activité')).toBeInTheDocument()
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
  })

  it('« Neutre » se DIT en clair sous la chip', async () => {
    hook.data = {
      ...discover,
      mode: 'neutral',
      layers: [{ id: 'esn_profile', state: 'ignored_by_mode', name: 'Acme Conseil' }],
    }
    renderWithRouter(<SurfaceContextChip surface="discover" mode="neutral" onModeChange={() => {}} />)
    expect(
      await screen.findByText(
        'Mode Neutre : ton profil habituel est ignoré pour cette demande. Ce n’est ni une conversation privée ni une exclusion des données de l’espace.',
      ),
    ).toBeInTheDocument()
  })

  it('« Mission ponctuelle » se dit aussi — jamais confondue avec « Neutre »', async () => {
    hook.data = {
      ...discover,
      mode: 'one_off_mission',
      layers: [{ id: 'esn_profile', state: 'ignored_by_mode', name: 'Acme Conseil' }],
    }
    renderWithRouter(<SurfaceContextChip surface="discover" mode="one_off_mission" onModeChange={() => {}} />)
    expect(await screen.findByText(/Mode Mission ponctuelle : ton profil habituel est écarté/)).toBeInTheDocument()
    expect(screen.queryByText(/Mode Neutre/)).toBeNull()
  })

  // #3163 (retour bêta, 28/09/2026) — Louis : « mets tout ça sur une ligne,
  // plus simple, net, synthétique ». Le libellé, le mode et le résumé
  // vivaient chacun sur sa propre ligne ; ils partagent désormais un seul
  // conteneur `flex-nowrap`, et le texte long tronque plutôt que de casser
  // la ligne (troncature CSS, texte complet dans une infobulle).
  describe('une seule ligne compacte (#3163)', () => {
    it('la section ne retombe JAMAIS à la ligne — un seul conteneur flex-nowrap', async () => {
      hook.data = discover
      renderWithRouter(<SurfaceContextChip surface="discover" mode="my_activity" onModeChange={() => {}} />)
      const section = await screen.findByText('Contexte')
      const container = section.closest('[data-surface-context]')
      expect(container).not.toBeNull()
      expect(container?.className).toMatch(/flex-nowrap/)
      // #1816/#2351 — plus d'empilement vertical (`space-y-*`) : c'était la
      // marque des lignes empilées que ce correctif retire.
      expect(container?.className).not.toMatch(/space-y/)
    })

    it('le résumé tronque (troncature CSS) et porte son texte complet dans une infobulle, au survol ET au focus', async () => {
      hook.data = discover
      renderWithRouter(<SurfaceContextChip surface="discover" mode="my_activity" onModeChange={() => {}} />)
      const summary = await screen.findByText('Cette recherche utilise ton profil, ton portefeuille.')
      expect(summary.className).toMatch(/truncate/)
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
      await userEvent.hover(summary)
      expect(await screen.findByRole('tooltip')).toHaveTextContent(
        'Cette recherche utilise ton profil, ton portefeuille.',
      )
    })

    it('le bouton « en savoir plus » perd son texte mais garde son nom accessible', async () => {
      hook.data = discover
      renderWithRouter(<SurfaceContextChip surface="discover" mode="my_activity" onModeChange={() => {}} />)
      const toggle = await screen.findByRole('button', { name: /Contexte utilisé/ })
      // Icône seule à l'écran : le nom accessible ne vient plus d'un texte visible.
      expect(toggle.textContent).toBe('')
      fireEvent.click(toggle)
      expect(screen.getByText('Profil ESN : Acme Conseil · v12')).toBeInTheDocument()
    })

    it('la note de mode (Neutre) tronque aussi, avec la MÊME phrase en infobulle', async () => {
      hook.data = {
        ...discover,
        mode: 'neutral',
        layers: [{ id: 'esn_profile', state: 'ignored_by_mode', name: 'Acme Conseil' }],
      }
      renderWithRouter(<SurfaceContextChip surface="discover" mode="neutral" onModeChange={() => {}} />)
      const note = await screen.findByText(
        'Mode Neutre : ton profil habituel est ignoré pour cette demande. Ce n’est ni une conversation privée ni une exclusion des données de l’espace.',
      )
      expect(note.className).toMatch(/truncate/)
      await userEvent.hover(note)
      expect(await screen.findByRole('tooltip')).toHaveTextContent(
        'Mode Neutre : ton profil habituel est ignoré pour cette demande. Ce n’est ni une conversation privée ni une exclusion des données de l’espace.',
      )
    })
  })

  /**
   * #3378 — retour bêta 30/09 : « centrer le bouton "mon activité" en
   * hauteur, pour qu'il soit aligné avec les mots de la phrase autour […]
   * bizarre qu'il soit justifié sur la ligne du haut ». Le sélecteur de mode
   * (bouton de 32 px) dépassait la hauteur d'une ligne de texte : aligné sur
   * le HAUT de la rangée (`items-start`), il retombait trop bas par rapport
   * au libellé « Contexte ».
   */
  it('#3378 — la rangée aligne ses segments sur leur MILIEU, jamais sur le haut', async () => {
    hook.data = discover
    renderWithRouter(<SurfaceContextChip surface="discover" mode="my_activity" onModeChange={() => {}} />)
    const section = await screen.findByText('Contexte')
    const container = section.closest('[data-surface-context]')
    expect(container?.className).toMatch(/(?:^|\s)items-center(?:\s|$)/)
    expect(container?.className).not.toMatch(/(?:^|\s)items-start(?:\s|$)/)
  })
})
