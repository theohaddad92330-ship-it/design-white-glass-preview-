import { render, screen } from '@testing-library/react'
import fr from '@/i18n/locales/fr/contacts.json'
import en from '@/i18n/locales/en/contacts.json'

vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => 'Maëlle' }))

const { ScreenIntro } = await import('@/components/primitives/ScreenIntro')

/**
 * Théo B c1-repertoire.R1 (Louis 22/10/2026) — le titre de l'écran est COURT, comme chez Théo : « Contacts ».
 * Il REMPLACE « Tes contacts commerciaux, {prénom}. » (#2158.3 / #2167.2) : la personnalisation par le prénom
 * n'est plus portée par ce titre, le prénom ne s'interpole donc plus — ni gabarit orphelin, ni « undefined ».
 * Le sous-titre est tutoyé (D-1).
 */
describe('Contacts — l’en-tête court de Théo (c1-repertoire.R1)', () => {
  it('le titre est « Contacts » dans les deux langues, sans gabarit de prénom', () => {
    for (const bundle of [fr, en]) {
      expect(bundle.page.introTitle).toBe('Contacts')
      expect(bundle.page.introTitleWithoutName).toBe('Contacts')
    }
  })

  it('le h1 rendu est « Contacts », même quand le prénom est connu', () => {
    render(<ScreenIntro title={fr.page.introTitle} titleWithoutName={fr.page.introTitleWithoutName} />)

    const titre = screen.getByRole('heading', { level: 1 })
    expect(titre).toHaveTextContent(/^Contacts$/)
  })

  it('le sous-titre est tutoyé et le surtitre est rédigé dans les deux langues', () => {
    expect(fr.page.subtitle).toBe('Tes interlocuteurs, tes sources. Un seul répertoire pour travailler.')
    expect(fr.page.subtitle).not.toMatch(/\b(vos|votre)\b/i)
    expect(en.page.subtitle).not.toBe(fr.page.subtitle)
    expect(en.page.eyebrow).not.toBe(fr.page.eyebrow)
  })
})
