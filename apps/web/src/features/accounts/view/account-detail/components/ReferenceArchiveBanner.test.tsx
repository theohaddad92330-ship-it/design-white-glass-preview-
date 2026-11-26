import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { ReferenceArchiveBanner } from './ReferenceArchiveBanner'

const ARCHIVE = {
  label: 'Archive du dépôt fourni',
  period_from: '2026-09-30',
  period_to: '2026-10-01',
  scope_note: 'périmètre France',
  verified_online: false,
}

describe('ReferenceArchiveBanner — Théo A comptes-fiche-reference.N4 / A2', () => {
  it('dit que le dossier est une archive figée, avec sa période, et qu’il n’est jamais réécrit', () => {
    render(<ReferenceArchiveBanner archive={ARCHIVE} companyName="Groupe BPCE" onCreateCopy={() => {}} />)
    expect(screen.getByText(/Archive du 30\/09–01\/10\/2026 · lecture seule/)).toBeInTheDocument()
    expect(screen.getByText(/jamais réécrit/)).toBeInTheDocument()
    expect(screen.getByText(/non revérifiée en ligne/)).toBeInTheDocument()
  })

  it('« Créer une copie de travail » déclenche la copie', () => {
    const onCreateCopy = vi.fn()
    render(<ReferenceArchiveBanner archive={ARCHIVE} companyName="Groupe BPCE" onCreateCopy={onCreateCopy} />)
    fireEvent.click(screen.getByRole('button', { name: 'Créer une copie de travail' }))
    expect(onCreateCopy).toHaveBeenCalledTimes(1)
  })

  it('pendant la copie le geste est occupé : un second clic ne part pas', () => {
    const onCreateCopy = vi.fn()
    render(<ReferenceArchiveBanner archive={ARCHIVE} companyName="Groupe BPCE" onCreateCopy={onCreateCopy} busy />)
    fireEvent.click(screen.getByRole('button', { name: 'Créer une copie de travail' }))
    expect(onCreateCopy).not.toHaveBeenCalled()
  })

  it('« Source & portée » ouvre ce que l’archive couvre, sans le confondre avec une vérification actuelle', () => {
    render(<ReferenceArchiveBanner archive={ARCHIVE} companyName="Groupe BPCE" onCreateCopy={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Source & portée' }))
    expect(screen.getByText(/pas une vérification actuelle/i)).toBeInTheDocument()
    expect(screen.getAllByText(/périmètre France/).length).toBeGreaterThan(0)
  })

  it('une archive revérifiée en ligne le dit', () => {
    render(
      <ReferenceArchiveBanner
        archive={{ ...ARCHIVE, verified_online: true }}
        companyName="Groupe BPCE"
        onCreateCopy={() => {}}
      />,
    )
    expect(screen.queryByText(/non revérifiée en ligne/)).not.toBeInTheDocument()
    expect(screen.getByText(/revérifiée en ligne/)).toBeInTheDocument()
  })
})
