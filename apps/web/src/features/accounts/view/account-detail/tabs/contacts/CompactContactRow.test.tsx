import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { LastVerified } from './CompactContactRow'

/**
 * « Dernière vérification » — la colonne manquante de l'onglet Contacts
 * (maquette `03_tous_contacts_couverture.png`).
 *
 * ⚠️ Ce que ce fichier garde : une absence se NOMME, jamais une date
 * inventée ni un tiret muet — c'est la règle explicite du chantier, et un
 * tiret aurait été indiscernable d'un champ « pas encore affiché ».
 */
function contactWith(last_enrichment_at: string | null): Contact {
  return { id: 'c1', account_id: 'a1', full_name: 'Camille Roux', last_enrichment_at } as Contact
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
})

describe('LastVerified', () => {
  it("dit « jamais vérifié » — jamais un tiret muet — quand aucune date n'est connue", () => {
    render(<LastVerified contact={contactWith(null)} />)
    expect(screen.getByText('Jamais vérifié')).toBeInTheDocument()
  })

  it('affiche la date compacte quand une vérification est connue', () => {
    render(<LastVerified contact={contactWith('2026-08-26T10:00:00Z')} />)
    expect(screen.getByText('26/08')).toBeInTheDocument()
  })

  it('le titre (tooltip) porte la date COMPLÈTE, pas seulement jour/mois', () => {
    render(<LastVerified contact={contactWith('2026-08-26T10:00:00Z')} />)
    expect(screen.getByText('26/08')).toHaveAttribute('title', 'Dernière vérification le 26 août 2026')
  })

  it('suit la langue (EN)', async () => {
    await i18n.changeLanguage('en')
    render(<LastVerified contact={contactWith(null)} />)
    expect(screen.getByText('Never verified')).toBeInTheDocument()
    await i18n.changeLanguage('fr')
  })
})
