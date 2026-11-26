import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { McpCard } from './connector-cards'

// Le lien vers l'écran dédié n'est pas le sujet : sans routeur monté, `Link` lève.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}))

/**
 * Recette live du 27/08/2026 : `/integrations` annonçait « 6 branchés » et
 * n'affichait que CINQ badges « Connecté ».
 *
 * Le compteur d'en-tête lit le registre serveur (`/tool-registry`) ; chaque
 * carte lit son propre `/status`. Cette carte-ci ne lisait NI l'un NI l'autre :
 * elle jetait son `state`. Un consentement d'assistant actif comptait donc au
 * dénominateur sans qu'aucune carte ne le montre — et on cherchait un sixième
 * outil branché qui n'existait nulle part à l'écran.
 *
 * La règle que ce test tient : **ce qui est COMPTÉ doit être MONTRÉ.**
 */
describe('McpCard', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('montre « Connecté » quand le registre le compte branché', () => {
    render(<McpCard state="connected" />)
    expect(screen.getByText('Connecté')).toBeInTheDocument()
    // Le geste change avec l'état : on ne « connecte » plus, on gère l'accès.
    expect(screen.getByText('Gérer l’accès')).toBeInTheDocument()
  })

  it('n’affiche aucun badge tant que rien n’est branché', () => {
    render(<McpCard state="available" />)
    expect(screen.queryByText('Connecté')).not.toBeInTheDocument()
    expect(screen.getByText('Ouvrir')).toBeInTheDocument()
  })

  it('distingue une autorisation morte d’une connexion saine', () => {
    render(<McpCard state="action_required" />)
    expect(screen.queryByText('Connecté')).not.toBeInTheDocument()
    expect(screen.getByText('Autorisation expirée')).toBeInTheDocument()
  })

  // #2207.17 — huitième état demandé par le hub, jamais câblé sur une carte.
  it('nomme un connecteur que l’offre en cours n’ouvre pas — pas un badge « available » muet', () => {
    render(<McpCard state="not_included_in_plan" />)
    expect(screen.queryByText('Connecté')).not.toBeInTheDocument()
    expect(screen.getByText('Non inclus')).toBeInTheDocument()
  })
})
