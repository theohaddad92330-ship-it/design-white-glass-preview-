import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DossierCtaButton } from './DossierCta'
import { EXPORTS_NOT_IN_PLAN } from './dossier-cta-blocked'

/**
 * #2130.47 — recette du scénario « action payante ».
 *
 * `dossier-cta-permission.test.tsx` prouve que le bouton nomme le DROIT qu'il
 * exige ; rien ne prouvait qu'il nomme aussi l'EMPÊCHEMENT tarifaire —
 * `blockedBy`, porté par les seize contrats de la barre (#2116.44-47) mais
 * jamais rendu ici. `AccountDetailHero.tsx` câble déjà `EXPORTS_NOT_IN_PLAN`
 * sur « Télécharger PDF » quand l'offre ne l'inclut pas : ce test lit la
 * PRIMITIVE qu'il appelle, une fois, pour les seize.
 */
describe('#2130.47 — un geste payant hors offre se NOMME, jamais un bouton mort sans raison', () => {
  it('le geste bloqué est DÉSACTIVÉ et son title dit pourquoi, ce qui manque, et comment débloquer', () => {
    render(
      <DossierCtaButton cta="dossier.pdf.export" blockedBy={EXPORTS_NOT_IN_PLAN} onClick={vi.fn()}>
        Télécharger PDF
      </DossierCtaButton>,
    )
    const button = screen.getByRole('button', { name: 'Télécharger PDF' })
    expect(button).toBeDisabled()
    expect(button.getAttribute('title')).toContain('Ton offre n’inclut pas le téléchargement du dossier.')
    expect(button.getAttribute('title')).toContain('Il manque l’option Exports sur ton abonnement.')
    expect(button.getAttribute('title')).toContain('Ouvre les offres qui l’incluent.')
  })

  it('avec `unblockOnClick`, le bouton MÈNE au déblocage plutôt que de rester inerte', () => {
    render(
      <DossierCtaButton cta="dossier.pdf.export" blockedBy={EXPORTS_NOT_IN_PLAN} unblockOnClick onClick={vi.fn()}>
        Télécharger PDF
      </DossierCtaButton>,
    )
    expect(screen.getByRole('button', { name: 'Télécharger PDF' })).not.toBeDisabled()
  })

  it('sait dire NON — hors empêchement, ni le titre ni l’état désactivé n’apparaissent', () => {
    render(
      <DossierCtaButton cta="dossier.pdf.export" onClick={vi.fn()}>
        Télécharger PDF
      </DossierCtaButton>,
    )
    const button = screen.getByRole('button', { name: 'Télécharger PDF' })
    expect(button).not.toBeDisabled()
    expect(button.getAttribute('title')).not.toContain('Il manque l’option Exports sur ton abonnement.')
  })
})
