import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AccountsListHead } from './AccountsListHead'

function renderHead(overrides: Partial<Parameters<typeof AccountsListHead>[0]> = {}) {
  return render(
    <AccountsListHead
      portfolioTab="all"
      onPortfolioTabChange={vi.fn()}
      crmCount={12}
      crmActive={false}
      crmName="HubSpot"
      onCrmToggle={vi.fn()}
      importedCount={602}
      importedActive={false}
      onImportedToggle={vi.fn()}
      deliveryLens={false}
      onDeliveryLensChange={vi.fn()}
      {...overrides}
    />,
  )
}

/**
 * #4496 — UNE SEULE RANGÉE (maquette V22 `.a4-list-head`). Recette prod 23/10 : deux rangées. Cause : les onglets
 * prenaient `w-full` dans un conteneur `flex-wrap` — 100 % de la rangée — et repoussaient la puce « Mon CRM » (puis la
 * bascule Commercial | Facturation) à la ligne. jsdom ne mesure rien : on garde la STRUCTURE qui rend la rangée unique.
 */
describe('#4496 — la tête de liste des comptes tient sur une seule rangée', () => {
  it('onglets, puce Mon CRM et bascule Commercial | Facturation sont frères dans UNE rangée', () => {
    renderHead()
    const row = screen.getByTestId('accounts-list-head-row')
    const tabs = screen.getByRole('button', { name: 'Tout le portefeuille' })
    const chip = screen.getByTestId('accounts-crm-chip')
    const lens = screen.getByRole('button', { name: 'Commercial' })
    for (const element of [tabs, chip, lens]) expect(row.contains(element)).toBe(true)
    // Aucun conteneur intermédiaire ne regroupe deux des trois : un `flex-wrap` interne (la cause de la recette
    // 23/10) recréerait la seconde rangée. Chacun est un enfant DIRECT de la rangée, à un enveloppement près.
    const items = [tabs, chip, lens]
    for (const element of items) {
      let node = element.parentElement
      while (node && node !== row) {
        const grouped = items.filter(other => node!.contains(other)).length
        expect(grouped, node.outerHTML.slice(0, 120)).toBe(1)
        node = node.parentElement
      }
    }
  })

  it('les onglets ne s’étirent pas sur toute la rangée, et la rangée ne se replie pas au-delà de la borne mobile', () => {
    renderHead()
    const row = screen.getByTestId('accounts-list-head-row')
    expect(row.className).toMatch(/\bmd:flex-nowrap\b/)
    const tabNav = screen.getByRole('button', { name: 'Favoris' }).closest('.overflow-x-auto')
    expect(tabNav).not.toBeNull()
    expect(tabNav!.className).not.toMatch(/\bw-full\b/)
  })

  it('sans bascule (onglet Suivis) et sans puce (zéro compte CRM), les onglets restent seuls — rien ne disparaît d’autre', () => {
    renderHead({ crmCount: 0, onDeliveryLensChange: undefined })
    for (const name of ['Tout le portefeuille', 'Favoris', 'Suivis', 'Archives']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    expect(screen.queryByTestId('accounts-crm-chip')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Commercial' })).toBeNull()
  })
})

// #4597 — « Importés » rejoint la MÊME rangée, à la taille de la rangée ; ne dépend pas du nom d'un CRM.
describe('#4597 — la puce « Importés » dans la rangée des comptes', () => {
  it('est un frère direct de la rangée, de la taille de la puce CRM', () => {
    renderHead()
    const row = screen.getByTestId('accounts-list-head-row')
    const imported = screen.getByTestId('accounts-imported-chip')
    expect(row.contains(imported)).toBe(true)
    expect(imported).toHaveTextContent('Importés')
    expect(imported).toHaveTextContent('602')
    expect(imported.className).toBe(screen.getByTestId('accounts-crm-chip').className.replace(/\s+/g, ' '))
  })

  it('SAIT DIRE NON : zéro compte importé ⇒ aucune puce, la puce CRM reste', () => {
    renderHead({ importedCount: 0 })
    expect(screen.queryByTestId('accounts-imported-chip')).toBeNull()
    expect(screen.getByTestId('accounts-crm-chip')).toBeInTheDocument()
  })

  it('une liste ouverte sur UN import porte sa puce, qui se relâche', () => {
    const onClear = vi.fn()
    renderHead({ onClearImportJob: onClear })
    screen.getByTestId('accounts-import-job-chip').click()
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('sans import précis, aucune puce « Cet import »', () => {
    renderHead()
    expect(screen.queryByTestId('accounts-import-job-chip')).toBeNull()
  })
})
