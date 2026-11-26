import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { StructuredReply } from '../StructuredReply'

/**
 * #3395.1 (recette prod 30/09/2026) — « Route recommandée » et « Personne
 * utile maintenant » sur la carte verdict, pour les demandes commerciales
 * importantes. Lu depuis le jeu PARTAGÉ (même fixture que zod et pydantic) :
 * un champ que ce fichier testerait avec des données inventées pourrait
 * diverger du contrat réel sans qu'aucun test ne le voie.
 */
const fixtures = JSON.parse(
  readFileSync(
    join(__dirname, '../../../../../../../packages/contracts/src/schemas/reply-blocks.fixtures.json'),
    'utf8',
  ),
) as { valid: { verdict: { route: string; contact: { name: string; role: string; href: string } } } }

const fence = (block: unknown) => ['```bellum-block', JSON.stringify(block), '```'].join('\n')

describe('#3395.1 — VerdictCard porte la route et le contact quand ils sont fournis', () => {
  it('affiche la route recommandée', async () => {
    renderWithRouter(<StructuredReply text={fence(fixtures.valid.verdict)} />)
    expect(await screen.findByText(fixtures.valid.verdict.route)).toBeInTheDocument()
  })

  it('affiche le nom et le rôle du contact utile', async () => {
    renderWithRouter(<StructuredReply text={fence(fixtures.valid.verdict)} />)
    const { name, role } = fixtures.valid.verdict.contact
    expect(await screen.findByText(`${name} — ${role}`)).toBeInTheDocument()
  })

  it('n’affiche ni route ni contact quand le verdict ne les porte pas', async () => {
    const {
      route: _route,
      contact: _contact,
      ...withoutRouteAndContact
    } = fixtures.valid.verdict as Record<string, unknown>
    renderWithRouter(<StructuredReply text={fence(withoutRouteAndContact)} />)
    expect(await screen.findByRole('group')).toBeInTheDocument()
    expect(screen.queryByText('Route recommandée :')).not.toBeInTheDocument()
    expect(screen.queryByText('Personne utile maintenant :')).not.toBeInTheDocument()
  })
})

// #3761.12 — la personne utile est une pastille d'objet lié (bibliothèque `reply-kit`).
describe('#3761.12 — le contact du verdict est une pastille d’objet lié', () => {
  it('la pastille porte le nom et le rôle et mène à la fiche', async () => {
    const { container } = renderWithRouter(<StructuredReply text={fence(fixtures.valid.verdict)} />)
    const { name, role, href } = fixtures.valid.verdict.contact
    const pill = await screen.findByText(`${name} — ${role}`)
    expect(container.querySelector('[data-reply-object-pill]')).not.toBeNull()
    expect(pill.closest('[data-reply-object-pill]')).not.toBeNull()
    expect(pill.closest('a')?.getAttribute('href') ?? href).toContain(href.split('/')[1]!)
  })
})
