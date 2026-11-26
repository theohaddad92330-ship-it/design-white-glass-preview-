import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OnboardingPrivacyStep, PRIVACY_STEP_LINES } from './OnboardingPrivacyStep'

/**
 * #2019 — l'étape de confidentialité, compacte : six phrases, un lien, aucun
 * consentement groupé. Le test tient les trois promesses du retour.
 */
describe('OnboardingPrivacyStep (#2019)', () => {
  it('dit chacune des six choses, une ligne chacune (#2019.2 → .5)', () => {
    render(<OnboardingPrivacyStep detailHref="https://example.test/privacy" />)
    const region = screen.getByRole('region', { name: 'Tes données, en clair' })
    for (const text of [
      'Ce qui est prérempli vient des registres publics des entreprises.',
      'Le profil de l’entreprise appartient à l’espace ; ton rôle, tes objectifs et ta messagerie restent personnels.',
      'Tes collègues voient les comptes et le profil de l’entreprise, jamais le contenu de ta boîte mail.',
      'Laura consulte le profil de l’espace et tes réponses pour préparer ses suggestions.',
      'Ta messagerie, ton agenda et ton CRM ne sont lus qu’après une connexion que tu autorises, outil par outil.',
      'Rien n’est envoyé ni écrit dans tes outils sans ta validation.',
    ]) {
      expect(within(region).getByText(text)).toBeInTheDocument()
    }
    expect(within(region).getAllByRole('listitem')).toHaveLength(PRIVACY_STEP_LINES.length)
  })

  it('tient en sept lignes au plus, titre compris (#2019.6)', () => {
    // Le titre partage sa ligne avec le lien : 1 + 6 = 7.
    expect(PRIVACY_STEP_LINES.length + 1).toBeLessThanOrEqual(7)
  })

  it('propose « Voir le détail » vers la page légale existante (#2019.7)', () => {
    render(<OnboardingPrivacyStep detailHref="https://example.test/privacy" />)
    const link = screen.getByRole('link', { name: 'Voir le détail de la confidentialité' })
    expect(link).toHaveAttribute('href', 'https://example.test/privacy')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('ne demande AUCUN consentement groupé : ni case, ni bouton « tout accepter » (#2019.8)', () => {
    render(<OnboardingPrivacyStep detailHref="https://example.test/privacy" />)
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
