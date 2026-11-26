import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DossierCtaButton } from './DossierCta'

/**
 * #2116.31 — LA PERMISSION S'AFFICHE AVANT LE CLIC.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE TEST FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * `DossierCtaContract.permission` était déclarée pour les vingt-quatre boutons
 * du dossier — onze en exigent une — et RIEN ne la lisait : ni écran, ni
 * infobulle, ni description accessible. `grep '\.permission'` dans `apps/web`
 * rendait un seul résultat, et c'était un commentaire. Le défaut n°1 du dépôt,
 * appliqué à la métadonnée qui dit à qui un geste est permis.
 *
 * Ce qui est rendu est la permission REQUISE par le geste, pas un verdict sur
 * la personne. Dire « ce geste demande le droit de modifier les fiches » est
 * vrai pour tout le monde.
 *
 * ⚠️ #2222 (16/09/2026) — la seconde moitié de cette raison est PÉRIMÉE : elle
 * disait « dire "tu n'as pas ce droit" demanderait une source de rôle que l'app
 * n'a pas ». L'app l'a — `useUserPermissions` lit le rôle de l'espace actif, et
 * `useRouteAccess` ne pose plus `role: 'owner'` en dur. Ce test garde toujours
 * la même chose (le geste NOMME ce qu'il exige) ; ce qui a changé, c'est qu'un
 * verdict par personne est devenu possible.
 */
describe('#2116.31 — le bouton du dossier dit la permission qu’il exige', () => {
  it('un geste qui exige un droit le NOMME dans sa description accessible', () => {
    render(
      <DossierCtaButton cta="dossier.moreActions.archive" onClick={vi.fn()}>
        Archiver
      </DossierCtaButton>,
    )
    const button = screen.getByRole('button', { name: 'Archiver' })
    expect(button.getAttribute('title')).toContain('modifier les fiches')
  })

  it('l’export nomme SON droit, pas celui d’un autre geste', () => {
    render(
      <DossierCtaButton cta="dossier.pdf.export" onClick={vi.fn()}>
        Exporter
      </DossierCtaButton>,
    )
    expect(screen.getByRole('button', { name: 'Exporter' }).getAttribute('title')).toContain('exporter')
  })

  it('sait dire NON : un geste qui n’exige AUCUN droit n’écrit rien — `none` est une réponse', () => {
    render(
      <DossierCtaButton cta="dossier.brief.open" onClick={vi.fn()}>
        Ouvrir le brief
      </DossierCtaButton>,
    )
    const title = screen.getByRole('button', { name: 'Ouvrir le brief' }).getAttribute('title') ?? ''
    expect(title.length).toBeGreaterThan(0)
    expect(title).not.toMatch(/droit|permission/i)
  })
})
