import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { GUARDRAIL_ITEMS } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { GuardrailsCard } from './AiAssistantView'

// #3424 lot G03 (30/09) — retour prod : les garde-fous du serveur MCP
// n'étaient visibles nulle part sur /settings/mcp. Cette carte les affiche ;
// ce test échoue si un item de la liste source (`@bellum/contracts`)
// disparaît de l'écran, pas seulement si la carte est absente.
describe('GuardrailsCard — #3424, les garde-fous MCP visibles sur /settings/mcp', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('affiche les dix-neuf pratiques refusées, la MÊME liste que le serveur MCP', () => {
    render(<GuardrailsCard />)
    expect(GUARDRAIL_ITEMS).toHaveLength(19)
    for (const item of GUARDRAIL_ITEMS) {
      expect(screen.getByText(item)).toBeInTheDocument()
    }
  })

  it('nomme l’exception d’archive, jamais une levée générale', () => {
    render(<GuardrailsCard />)
    expect(screen.getByText(/rester archivé comme source historique/)).toBeInTheDocument()
  })
})
