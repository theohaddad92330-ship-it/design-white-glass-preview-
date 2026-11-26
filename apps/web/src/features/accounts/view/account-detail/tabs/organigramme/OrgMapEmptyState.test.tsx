import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { OrgMapEmptyState } from './OrgMapEmptyState'

/**
 * Ce qui remplace l'ancien `OrgChart` (D280, 30/08) là où il s'affichait en
 * repli — jamais un blanc, jamais un « 0 ».
 *
 * DEUX vides, deux phrases : `noGraph` (« ce dossier n'a pas encore
 * d'organigramme ») et `noEntities` (« l'analyse a tourné, elle n'a rien
 * trouvé à cartographier ici »). Elles ne doivent jamais se recouvrir — c'est
 * la garde `org-map-empty-states-are-distinct.test.ts` qui le vérifie sur les
 * deux langues ; ce fichier vérifie le GESTE que chaque variante pose.
 */
const enrichContactsMutate = vi.fn()
const enrichOrgMutate = vi.fn()
let canEnrich = true
let locked = false
let enrichOrgIsPending = false

vi.mock('@/features/accounts/hooks/useEnrichAccount', () => ({
  useEnrichContacts: () => ({ mutate: enrichContactsMutate, isPending: false }),
  useEnrichOrganigram: () => ({ mutate: enrichOrgMutate, isPending: enrichOrgIsPending }),
}))
vi.mock('@/features/credits/hooks/useCreditGate', () => ({
  useCreditGate: () => ({ canEnrich, locked }),
}))

describe('OrgMapEmptyState', () => {
  beforeEach(async () => {
    canEnrich = true
    locked = false
    enrichOrgIsPending = false
    enrichContactsMutate.mockClear()
    enrichOrgMutate.mockClear()
    await i18n.changeLanguage('fr')
  })

  describe('variant "noGraph", sans aucun contact — il faut d’abord en chercher', () => {
    it('nomme le vide et pose le geste « rechercher des contacts »', async () => {
      const user = userEvent.setup()
      render(<OrgMapEmptyState variant="noGraph" accountId="a1" hasContacts={false} />)

      expect(screen.getByText(i18n.t('accountOrg:emptyState.title'))).toBeInTheDocument()
      const cta = screen.getByRole('button', { name: i18n.t('accountOrg:emptyState.cta') })
      await user.click(cta)
      expect(enrichContactsMutate).toHaveBeenCalledTimes(1)
      expect(enrichOrgMutate).not.toHaveBeenCalled()
    })
  })

  describe('variant "noGraph", des contacts existent — relancer l’enrichissement', () => {
    it('nomme le vide et pose le geste « enrichir la carte »', async () => {
      const user = userEvent.setup()
      render(<OrgMapEmptyState variant="noGraph" accountId="a1" hasContacts={true} />)

      expect(screen.getByText(i18n.t('accountOrg:mapEmptyState.noGraphTitle'))).toBeInTheDocument()
      const cta = screen.getByRole('button', { name: i18n.t('accountOrg:mapEmptyState.noGraphCta') })
      await user.click(cta)
      expect(enrichOrgMutate).toHaveBeenCalledTimes(1)
      expect(enrichContactsMutate).not.toHaveBeenCalled()
    })

    /**
     * #2502 — DÉFAUT recette 17/09 (passage 7) : « l'organigramme n'a pas été
     * créé » sur un compte à court de crédits. `enrich-organigram` (comme son
     * jumeau `enrich-contacts`, `analysis-ondemand.service.ts:960-963`) NE
     * DÉBITE AUCUN crédit — c'est un premier peuplement depuis le vide, pas un
     * rafraîchissement (`POST :accountId/refresh`, lui, débite). Le griser à
     * zéro crédit rendait le geste RÉELLEMENT injoignable : un organigramme
     * disparu, sans aucune façon de le ramener.
     */
    it('NE grise PAS le geste à zéro crédit — l’action est gratuite, pas un refus serveur à anticiper', () => {
      canEnrich = false
      render(<OrgMapEmptyState variant="noGraph" accountId="a1" hasContacts={true} />)
      expect(screen.getByRole('button', { name: i18n.t('accountOrg:mapEmptyState.noGraphCta') })).toBeEnabled()
    })

    it('grise le geste seulement quand l’accès est VERROUILLÉ (essai terminé) — une raison différente du crédit', () => {
      locked = true
      render(<OrgMapEmptyState variant="noGraph" accountId="a1" hasContacts={true} />)
      const cta = screen.getByRole('button', { name: i18n.t('accountOrg:mapEmptyState.noGraphCta') })
      expect(cta).toBeDisabled()
      expect(cta).toHaveAttribute('title', i18n.t('accountOrg:organigramme.enrichLockedTitle'))
    })

    /**
     * #3020 (retour bêta, ré-échoué en recette écran le 25/09/2026) — même
     * mutation `useEnrichOrganigram` que l'entête de l'onglet (déjà corrigée) ;
     * `isLoading` (packages/ui `Button`) y remplaçait les enfants par un
     * spinner nu, et le texte conditionnel passé en ENFANT ne s'affichait
     * donc jamais pendant l'appel.
     */
    it('#3020 — pendant l’appel, un temps RÉEL s’affiche, jamais un spinner muet', () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      enrichOrgIsPending = true
      render(<OrgMapEmptyState variant="noGraph" accountId="a1" hasContacts={true} />)
      expect(
        screen.getByRole('button', { name: i18n.t('accountOrg:organigramme.enrichingElapsed', { elapsed: 0 }) }),
      ).toBeInTheDocument()
      act(() => {
        vi.advanceTimersByTime(2_000)
      })
      expect(
        screen.getByRole('button', { name: i18n.t('accountOrg:organigramme.enrichingElapsed', { elapsed: 2 }) }),
      ).toBeInTheDocument()
      vi.useRealTimers()
    })

    // Les deux sous-cas de `noGraph` sont la MÊME phrase de vide (« pas encore
    // d'organigramme ») avec un geste différent selon ce qui manque vraiment —
    // pas deux vides distincts au sens de la garde ci-dessus.
    it('ne mélange jamais les deux gestes sur un même rendu', () => {
      render(<OrgMapEmptyState variant="noGraph" accountId="a1" hasContacts={true} />)
      expect(screen.queryByRole('button', { name: i18n.t('accountOrg:emptyState.cta') })).not.toBeInTheDocument()
    })
  })

  describe('variant "noEntities" — la vue système sur un graphe sans structure', () => {
    it('nomme le vide sans emprunter les mots de "noGraph"', () => {
      render(<OrgMapEmptyState variant="noEntities" />)
      expect(screen.getByText(i18n.t('accountOrg:mapEmptyState.noEntitiesTitle'))).toBeInTheDocument()
      expect(screen.getByText(i18n.t('accountOrg:mapEmptyState.noEntitiesDescription'))).toBeInTheDocument()
      expect(screen.queryByText(i18n.t('accountOrg:mapEmptyState.noGraphTitle'))).not.toBeInTheDocument()
      expect(screen.queryByText(i18n.t('accountOrg:emptyState.title'))).not.toBeInTheDocument()
    })

    it("ne pose aucun geste qui n'aiderait pas — pas de bouton d'enrichissement ici", () => {
      render(<OrgMapEmptyState variant="noEntities" />)
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })
  })

  it('ne rend jamais un corps vide — un crash se lit comme une panne, pas comme une absence de données', () => {
    const { container } = render(<OrgMapEmptyState variant="noEntities" />)
    expect(container.textContent?.trim().length ?? 0).toBeGreaterThan(0)
  })
})
