/**
 * #2117.59 — AUCUN PANNEAU NE COUPE SON CONTENU SANS MOYEN DE LE LIRE EN
 * ENTIER.
 *
 * `line-clamp-4` tronque la prochaine action (texte de l'analyse, longueur
 * non bornée) sans AUCUN moyen de lire le reste — ni Dialog, ni Sheet, ni
 * `title`. Le patron déjà en usage ailleurs dans ce dossier pour le même
 * problème (`AccountTimelineCard.tsx:84`, `title={event.label}`) est le
 * correctif le moins coûteux : une info-bulle native, jamais une donnée
 * perdue.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NextActionCard } from './NextActionCard'

describe('NextActionCard — le texte tronqué reste lisible en entier (#2117.59)', () => {
  it('porte un `title` égal au texte complet, jamais seulement les quatre lignes visibles', () => {
    const action =
      "Contacter la direction du programme de refonte du portail client, qui porte le budget de l'année et cherche un partenaire capable de tenir un calendrier serré sur les trois prochains mois."
    render(<NextActionCard action={action} onViewPlan={vi.fn()} />)

    expect(screen.getByText(action)).toHaveAttribute('title', action)
  })
})
