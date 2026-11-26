import type { Contact } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { ContactKeyInfo } from './ContactKeyInfo'

vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-moi' } }) }))
vi.mock('./ContactAssignControl', () => ({
  ContactAssignControl: ({ label }: { label?: string }) => <button type="button">{label ?? 'Attribuer'}</button>,
}))
vi.mock('@/features/team-guardrails/components/DoNotContactPreference', () => ({
  DoNotContactPreference: () => <span>Aucune opposition consignée</span>,
}))

/**
 * #4522.3 — un e-mail long ne sort pas de sa carte, et reste LU EN ENTIER.
 *
 * jsdom ne calcule aucune mise en page : on ne peut pas lire une largeur. On lit donc le mécanisme exact qui a causé les
 * 21,4 px mesurés en prod (25/10) : `break-words` ne réduit pas la largeur minimale d'un mot sans espace, seul
 * `overflow-wrap:anywhere` (ou `break-all`) le fait. AVANT : classes `break-words` → débord 21,4 px. APRÈS : repli.
 */
const LONG = 'alina.gherman.prenom.nom@thalesgroup-communications.com' // 55 caractères

const contact = {
  id: 'c1',
  account_id: 'a1',
  full_name: 'Alina Gherman',
  email: LONG,
  phone: null,
  linkedin_url: null,
  raw_data: {},
} as unknown as Contact

const TRUNCATING =
  /(^|\s)(truncate|text-ellipsis|line-clamp-\d+|overflow-hidden|whitespace-nowrap|sr-only|hidden)(\s|$)/

describe('ContactKeyInfo — #4522.3 e-mail long', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it("l'adresse complète est dans le DOM, et se replie au lieu de déborder", () => {
    render(<ContactKeyInfo contact={contact} />)
    const email = screen.getByText(LONG)
    expect(email.textContent).toBe(LONG)
    const wraps = email.className.includes('[overflow-wrap:anywhere]') || /\bbreak-all\b/.test(email.className)
    expect(wraps, email.className).toBe(true)
    // La valeur n'est jamais plus large que sa ligne.
    expect(email.className).toMatch(/\bmax-w-full\b/)
  })

  it('aucune troncature ni masquage sur l’adresse ni sur ses conteneurs jusqu’à la ligne', () => {
    render(<ContactKeyInfo contact={contact} />)
    const email = screen.getByText(LONG)
    const row = email.closest('[data-stacked="true"]')!
    expect(row).not.toBeNull()
    for (let node: HTMLElement | null = email; node && node !== row.parentElement; node = node.parentElement) {
      expect(node.className, node.tagName).not.toMatch(TRUNCATING)
    }
  })

  it('dit NON : l’ancienne classe `break-words` seule ne suffit pas à passer', () => {
    const old = 'break-words text-left text-foreground'
    expect(old.includes('[overflow-wrap:anywhere]') || /\bbreak-all\b/.test(old)).toBe(false)
    expect('truncate text-left').toMatch(TRUNCATING)
  })
})
