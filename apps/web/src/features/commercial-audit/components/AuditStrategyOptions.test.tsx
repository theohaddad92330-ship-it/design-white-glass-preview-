import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { apiFetch } from '@/lib/api'
import type { AuditHeadline } from '../lib/build-audit'
import { AuditStrategyOptions } from './AuditStrategyOptions'

// F1-FIX #4345 — sur bureau « Demander à Laura » ouvre la bulle SUR PLACE ; ce test garde l'AUTRE chemin
// (mobile, surcouche, /chat : le hook rend `null` et le lien vers /chat reste le seul accès).
vi.mock('@/features/laura/bubble/use-open-laura-in-place', () => ({ useOpenLauraInPlace: () => null }))

const apiFetchMock = vi.mocked(apiFetch)

const TARGET_HEADLINE: AuditHeadline = {
  key: 'target',
  origin: 'idealAccountProfile',
  value: {
    kind: 'target',
    size: 'eti',
    decisionLevel: 'manager',
    entryStrategy: 'bottomUp',
    sectors: ['Banque'],
  },
}

const UNMEASURED_HEADLINE: AuditHeadline = {
  key: 'target',
  origin: 'idealAccountProfile',
  value: null,
}

describe('AuditStrategyOptions', () => {
  beforeEach(() => apiFetchMock.mockReset())

  // #2073.1 / #2073.2 / #2073.3 / #2073.4 — les QUATRE voies se présentent
  // toujours : c'est un catalogue de référence, pas une donnée mesurée sur
  // cette entreprise. Prérequis, limites et premier test accompagnent chacune.
  it('présente les quatre voies possibles, chacune avec prérequis, limites et premier test', async () => {
    renderWithRouter(<AuditStrategyOptions target={TARGET_HEADLINE} />)
    expect(await screen.findByText('entrée par le haut')).toBeInTheDocument()
    expect(screen.getByText('entrée par le terrain')).toBeInTheDocument()
    expect(screen.getByText('entrée sur plusieurs fils')).toBeInTheDocument()
    expect(screen.getByText('entrée par recommandation')).toBeInTheDocument()
  })

  // #2073.5 / #2073.6 / #2073.7 — la voie retenue par le profil porte un
  // badge, la phrase-cadre exacte, et la raison qui la fait passer devant.
  it('marque la voie retenue, avec la phrase-cadre et la raison', async () => {
    const { container } = renderWithRouter(<AuditStrategyOptions target={TARGET_HEADLINE} />)
    expect(await screen.findByText('Recommandée')).toBeInTheDocument()
    expect(screen.getByText(/À ta place, je commencerais par entrée par le terrain/)).toBeInTheDocument()
    // La raison cite un champ RÉEL du profil (taille de compte), jamais une
    // phrase générique de remplissage.
    expect(container.textContent ?? '').toMatch(/ETI/)
  })

  // #2073.9 — « ne rien mesurer » n'efface pas le catalogue : seule la
  // recommandation, qui dépend du profil, disparaît. Question de doctrine :
  // si cette valeur est absente, « 0 » (ou une recommandation par défaut)
  // serait-il vrai ? Non — donc aucune voie ne porte le badge.
  it('sans profil établi : le catalogue reste, aucune voie n’est recommandée', async () => {
    renderWithRouter(<AuditStrategyOptions target={UNMEASURED_HEADLINE} />)
    expect(await screen.findByText('entrée par le haut')).toBeInTheDocument()
    expect(screen.queryByText('Recommandée')).toBeNull()
    expect(screen.getByText(/non mesuré/)).toBeInTheDocument()
  })

  // #2073.9 — « modifier une hypothèse » mène à la régénération du profil,
  // la seule vraie porte qui reconsidère l'analyse (aucun champ n'édite
  // `entryStrategy` directement : c'est un champ calculé, pas saisi).
  // #2073.10 — « demander à … » ouvre le copilote sans lui parler à ta place.
  it('« modifier une hypothèse » mène à la régénération, « demander à … » ouvre le copilote', async () => {
    const { container } = renderWithRouter(<AuditStrategyOptions target={TARGET_HEADLINE} />)
    await screen.findByText('entrée par le haut')
    expect(container.querySelector('a[href="/settings/profile/context"]')).not.toBeNull()
    expect(container.querySelector('a[href^="/chat"]')).not.toBeNull()
  })

  // #2073.10 — « ne pas décider maintenant » referme le bloc : c'est un choix
  // LOCAL, rien n'est écrit ni décidé à la place de l'utilisateur.
  it('« ne pas décider maintenant » referme le bloc, sans rien persister', async () => {
    renderWithRouter(<AuditStrategyOptions target={TARGET_HEADLINE} />)
    const closeButton = await screen.findByRole('button', { name: 'Ne pas décider maintenant' })
    fireEvent.click(closeButton)
    expect(screen.queryByText('entrée par le haut')).toBeNull()
  })

  // Doctrine : aucune probabilité, aucun score nu.
  it('n’affiche aucun pourcentage ni score sur 100', async () => {
    const { container } = renderWithRouter(<AuditStrategyOptions target={TARGET_HEADLINE} />)
    await screen.findByText('entrée par le haut')
    const rendered = container.textContent ?? ''
    expect(rendered).not.toMatch(/\d+\s?%/)
    expect(rendered).not.toMatch(/\/\s?100\b/)
  })

  // #2066.20 / #2066.23 / #2066.24 / #2066.25 / #2066.26 — le corps de #2066
  // concatène « options, prérequis et premier test » : le même catalogue que
  // #2073, complété par les champs qui n'existaient pas encore. Un catalogue,
  // pas une donnée mesurée : les QUATRE cartes les portent toutes.
  it('#2066.20/.23/.24/.25/.26 — chaque voie porte son potentiel, sa charge, son délai de retour, son risque et sa condition d’arrêt', async () => {
    renderWithRouter(<AuditStrategyOptions target={TARGET_HEADLINE} />)
    await screen.findByText('entrée par le haut')
    expect(screen.getAllByText('Son potentiel')).toHaveLength(4)
    expect(screen.getAllByText('La charge')).toHaveLength(4)
    expect(screen.getAllByText('Le délai de retour')).toHaveLength(4)
    expect(screen.getAllByText('Le risque, et comment le reconnaître')).toHaveLength(4)
    expect(screen.getAllByText('La condition d’arrêt')).toHaveLength(4)
  })

  // #2073.8 — LE CŒUR DU LOT : le choix PERSISTE, distinct du calcul.
  describe('#2073.8 — « Choisir cette stratégie »', () => {
    it('chaque carte porte un bouton nommé, tant qu’aucun choix n’a été posé', async () => {
      renderWithRouter(<AuditStrategyOptions target={TARGET_HEADLINE} />)
      await screen.findByText('entrée par le haut')
      expect(screen.getAllByRole('button', { name: 'Choisir cette stratégie' })).toHaveLength(4)
    })

    it('au clic, POST /profile-context/entry-strategy avec la voie cliquée, puis la carte porte « Stratégie retenue »', async () => {
      apiFetchMock.mockResolvedValueOnce({
        profile_context: {},
        status: 'succeeded',
        validatedAt: null,
        withheld: null,
        chosenEntryStrategy: 'multiThread',
      })
      renderWithRouter(<AuditStrategyOptions target={TARGET_HEADLINE} />)
      await screen.findByText('entrée par le haut')
      const user = userEvent.setup()

      const cards = screen.getAllByRole('button', { name: 'Choisir cette stratégie' })
      // La 3e voie du catalogue (`entryStrategyValues`) est `multiThread`,
      // « entrée sur plusieurs fils ».
      await user.click(cards[2] as HTMLElement)

      expect(apiFetchMock).toHaveBeenCalledWith({
        path: '/profile-context/entry-strategy',
        method: 'POST',
        body: { entryStrategy: 'multiThread' },
      })
      expect(await screen.findByText('Stratégie retenue')).toBeInTheDocument()
      // La carte retenue ne porte plus SON bouton — il en reste trois.
      expect(screen.getAllByRole('button', { name: 'Choisir cette stratégie' })).toHaveLength(3)
      // La recommandation initiale (« entrée par le terrain ») reste nommée
      // séparément : les deux badges ne se confondent pas.
      expect(screen.getByText('Recommandée')).toBeInTheDocument()
    })

    it('une carte reçue déjà CHOISIE (prop) porte le badge sans re-cliquer', async () => {
      renderWithRouter(<AuditStrategyOptions target={TARGET_HEADLINE} chosenEntryStrategy="referral" />)
      await screen.findByText('entrée par le haut')
      expect(screen.getByText('Stratégie retenue')).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: 'Choisir cette stratégie' })).toHaveLength(3)
    })
  })

  // #2073.9 — « Comparer » : n'existe qu'une fois un choix posé.
  describe('#2073.9 — « Comparer »', () => {
    it('n’apparaît pas tant qu’aucune stratégie n’a été retenue', async () => {
      renderWithRouter(<AuditStrategyOptions target={TARGET_HEADLINE} />)
      await screen.findByText('entrée par le haut')
      expect(screen.queryByRole('button', { name: 'Comparer' })).toBeNull()
    })

    it('révèle l’écart quand le choix diffère de la recommandation initiale', async () => {
      renderWithRouter(<AuditStrategyOptions target={TARGET_HEADLINE} chosenEntryStrategy="multiThread" />)
      await screen.findByText('entrée par le haut')
      const user = userEvent.setup()

      await user.click(screen.getByRole('button', { name: 'Comparer' }))

      expect(
        screen.getByText(
          'Stratégie retenue : entrée sur plusieurs fils — la recommandation initiale était entrée par le terrain.',
        ),
      ).toBeInTheDocument()
    })

    it('indique l’accord quand le choix REJOINT la recommandation initiale', async () => {
      renderWithRouter(<AuditStrategyOptions target={TARGET_HEADLINE} chosenEntryStrategy="bottomUp" />)
      await screen.findByText('entrée par le haut')
      const user = userEvent.setup()

      await user.click(screen.getByRole('button', { name: 'Comparer' }))

      expect(
        screen.getByText('Stratégie retenue : entrée par le terrain — la même que la recommandation initiale.'),
      ).toBeInTheDocument()
    })
  })
})
