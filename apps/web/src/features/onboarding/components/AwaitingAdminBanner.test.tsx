import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AwaitingAdminBanner } from './AwaitingAdminBanner'

// #4158.12
describe('AwaitingAdminBanner', () => {
  it('nomme l’administrateur (prénom + nom en clair) et promet l’enrichissement', () => {
    render(<AwaitingAdminBanner adminName="Marie Curie" />)
    expect(
      screen.getByText(/Marie Curie, l.administrateur de ton espace, n.a pas encore décrit l.ESN/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Tes analyses s.enrichiront dès que l.ESN sera décrite/)).toBeInTheDocument()
  })

  it('sans nom connu, n’en invente pas', () => {
    render(<AwaitingAdminBanner adminName={null} />)
    expect(screen.getByText(/^L.administrateur de ton espace n.a pas encore décrit l.ESN/)).toBeInTheDocument()
    expect(screen.queryByText(/undefined|null/)).toBeNull()
  })
})
