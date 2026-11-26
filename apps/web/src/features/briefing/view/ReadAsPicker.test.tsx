import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReadAsPicker } from './ReadAsPicker'

const demo = vi.hoisted(() => ({ isDemo: true }))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => demo.isDemo }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('ReadAsPicker (#3414)', () => {
  beforeEach(() => {
    demo.isDemo = true
  })

  it('en démo : quatre lectures, dont le recruteur, et un clic choisit le rôle', () => {
    const onChange = vi.fn()
    render(<ReadAsPicker value={null} onChange={onChange} />)
    expect(screen.getAllByRole('button')).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: 'readAs.role.recruiter' }))
    expect(onChange).toHaveBeenCalledWith('recruiter')
  })

  it('re-cliquer la lecture active revient au rôle réel', () => {
    const onChange = vi.fn()
    render(<ReadAsPicker value="recruiter" onChange={onChange} />)
    const active = screen.getByRole('button', { name: 'readAs.role.recruiter' })
    expect(active).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(active)
    expect(onChange).toHaveBeenCalledWith(null)
  })

  // décision Louis 12/10 — « Lire comme » dans le produit, réservé aux rôles qui ENCADRENT.
  it.each(['Fondateur / CEO', 'Directeur de BU', 'Business Manager'])(
    'hors démo, « %s » (rôle qui encadre) : les quatre lectures sont offertes, un clic choisit',
    declaredRole => {
      demo.isDemo = false
      const onChange = vi.fn()
      render(<ReadAsPicker value={null} onChange={onChange} declaredRole={declaredRole} />)
      expect(screen.getAllByRole('button')).toHaveLength(4)
      fireEvent.click(screen.getByRole('button', { name: 'readAs.role.recruiter' }))
      expect(onChange).toHaveBeenCalledWith('recruiter')
      expect(screen.queryByTestId('read-as-profile')).toBeNull()
    },
  )

  it.each(['Business Developer', 'Talent Manager / Recruteur', 'Poste inventé'])(
    'hors démo, « %s » (n’encadre pas) : pas de chips, la lecture active et le lien vers le réglage — #3386',
    declaredRole => {
      demo.isDemo = false
      render(<ReadAsPicker value={null} onChange={vi.fn()} declaredRole={declaredRole} />)
      expect(screen.queryAllByRole('button')).toHaveLength(0)
      expect(screen.getByTestId('read-as-profile')).toHaveTextContent(declaredRole)
      expect(screen.getByRole('link', { name: 'readAs.change' })).toHaveAttribute('href', '/settings/profile/identity')
    },
  )

  it('#3386 (11/10) — le stade de la combinaison active est nommé, en démo comme hors démo', () => {
    render(<ReadAsPicker value={null} onChange={vi.fn()} stade="petite" />)
    expect(screen.getByTestId('read-as-stade')).toHaveTextContent('readAs.stade.petite')
    demo.isDemo = false
    render(<ReadAsPicker value={null} onChange={vi.fn()} declaredRole="Business Developer" stade="etablie" />)
    expect(screen.getAllByTestId('read-as-stade').at(-1)).toHaveTextContent('readAs.stade.etablie')
  })

  it('#3386 — sans stade connu : aucune ligne de stade (une absence ne fait aucune ligne)', () => {
    render(<ReadAsPicker value={null} onChange={vi.fn()} stade={null} />)
    expect(screen.queryByTestId('read-as-stade')).toBeNull()
  })

  it('hors démo sans rôle déclaré : dit l ordre standard', () => {
    demo.isDemo = false
    render(<ReadAsPicker value={null} onChange={vi.fn()} />)
    expect(screen.getByTestId('read-as-profile')).toHaveTextContent('readAs.standardOrder')
  })
})
