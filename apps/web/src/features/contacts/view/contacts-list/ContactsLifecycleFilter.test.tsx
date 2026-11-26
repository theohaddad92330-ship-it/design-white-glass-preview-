import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { ContactLifecycleTally } from '@bellum/contracts'
import { ContactsLifecycleFilter } from './ContactsLifecycleFilter'

/**
 * Régression : les pastilles comptaient la PAGE chargée (25) alors que la carte
 * juste au-dessus annonçait le total workspace (210). Elles lisent désormais
 * l'agrégat serveur, et n'affichent AUCUN chiffre quand il est indisponible.
 */
const tally: ContactLifecycleTally = {
  detecte: 120,
  identite_verifiee: 41,
  qualifie: 22,
  enrichi: 15,
  actionnable: 12,
  historique: 0,
  rejete: 0,
}

const noop = () => {}

describe('ContactsLifecycleFilter', () => {
  it('affiche le total workspace sur "Tous", pas la taille de la page', () => {
    render(<ContactsLifecycleFilter tally={tally} total={210} value="all" onChange={noop} />)

    const all = screen.getByRole('button', { name: /210/ })
    expect(all).toHaveTextContent('210')
    // La somme des états affichés doit retomber sur le total annoncé.
    const sum = Object.values(tally).reduce((a, b) => a + b, 0)
    expect(sum).toBe(210)
  })

  it('affiche le compteur serveur de chaque état', () => {
    render(<ContactsLifecycleFilter tally={tally} total={210} value="all" onChange={noop} />)

    expect(screen.getByRole('button', { name: /Détecté\s*120/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Actionnable\s*12/ })).toBeInTheDocument()
  })

  it('n’affiche AUCUN chiffre quand l’agrégat est indisponible', () => {
    render(<ContactsLifecycleFilter tally={undefined} total={undefined} value="all" onChange={noop} />)

    // Les pastilles restent cliquables (le filtre marche) mais sans compteur —
    // mieux vaut rien qu'un chiffre faux.
    expect(screen.getByRole('button', { name: 'Détecté' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Actionnable' })).toBeInTheDocument()
    expect(screen.queryByText('120')).not.toBeInTheDocument()
  })

  it('remonte l’état sélectionné au parent (→ search param → API)', async () => {
    const onChange = vi.fn()
    render(<ContactsLifecycleFilter tally={tally} total={210} value="all" onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: /Actionnable/ }))

    expect(onChange).toHaveBeenCalledWith('actionnable')
  })

  it('garde visible la pastille sélectionnée même à 0', () => {
    render(
      <ContactsLifecycleFilter tally={{ ...tally, actionnable: 0 }} total={198} value="actionnable" onChange={noop} />,
    )

    expect(screen.getByRole('button', { name: /Actionnable\s*0/ })).toBeInTheDocument()
  })
})

/**
 * #1418 — « plusieurs Tous / Toutes se ressemblent sans qu'on comprenne
 * immédiatement ce qu'ils filtrent ».
 *
 * ⚠️ La réponse EXISTAIT — `ariaLabel` porte « Filtrer par vue » et « Filtrer
 * par état du contact » — mais elle n'était dite qu'aux lecteurs d'écran. Deux
 * rangées se suivaient à 48 px, chacune ouvrant sur « Toutes » puis « Tous », et
 * ceux qui VOIENT l'écran n'avaient pas droit à l'information.
 */
describe('la dimension filtrée est écrite, pas seulement annoncée', () => {
  it('affiche le nom de la dimension à l’écran', () => {
    render(<ContactsLifecycleFilter tally={tally} total={210} value="all" onChange={noop} />)
    expect(screen.getByText('Maturité de la donnée — contacts exactement à cet état')).toBeInTheDocument()
  })

  /**
   * ⚠️ Les libellés d'état venaient du CONTRAT, écrits en français une fois pour
   * toutes : la rangée entière s'affichait en français quelle que soit la
   * langue. Même défaut de forme que les gabarits de séquence, corrigé le même
   * jour.
   */
  it('prend ses libellés d’état dans le catalogue, pas dans le contrat', () => {
    render(<ContactsLifecycleFilter tally={tally} total={210} value="all" onChange={noop} />)
    expect(screen.getByRole('button', { name: /Identité vérifiée/ })).toBeInTheDocument()
  })
})
