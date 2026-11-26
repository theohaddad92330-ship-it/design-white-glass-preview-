import { render, screen } from '@testing-library/react'
import type { Contact, OrgPathOrigin } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { RecommendedPathCard } from './RecommendedPathCard'

/**
 * Le chemin recommandé PART DE TOI, et il DIT ce que vaut ce départ
 * (`T5.md:815-831`).
 *
 * Ce que ces tests tiennent :
 *  - le nœud « TOI » existe à l'écran — sans lui le chemin part de nulle part ;
 *  - les trois formes se distinguent, et l'entrée froide se dit SANS DÉTOUR ;
 *  - un chemin daté qui ne dirait pas sa péremption serait un piège : la carte
 *    montre l'avertissement dès que la relation n'est plus fraîche ;
 *  - une relation SANS date ne se lit jamais comme une relation fraîche.
 */

const contact = (id: string, fullName: string): Contact =>
  ({ id, full_name: fullName, title: 'Head of Data' }) as Contact

const origin = (over: Partial<OrgPathOrigin> = {}): OrgPathOrigin =>
  ({ form: 'cold', relationFreshness: 'inconnu', ...over }) as OrgPathOrigin

describe('RecommendedPathCard — le nœud « TOI »', () => {
  it('ouvre le chemin par TOI dès qu’une origine est connue', () => {
    render(
      <RecommendedPathCard
        contacts={[contact('c1', 'Claire M.')]}
        pathOrigin={origin({ form: 'direct', relationFreshness: 'frais', relation: 'ancien client' })}
      />,
    )
    expect(screen.getByTestId('path-origin-you')).toBeInTheDocument()
  })

  it('ne prétend RIEN quand l’origine n’a pas été calculée', () => {
    // Un dossier antérieur au chantier ne porte pas d'origine. Ne rien savoir de
    // la relation n'est PAS « entrée froide » : la carte se tait plutôt que de
    // conclure à un compte froid qu'elle n'a pas mesuré.
    render(<RecommendedPathCard contacts={[contact('c1', 'Claire M.')]} />)
    expect(screen.queryByTestId('path-origin-you')).not.toBeInTheDocument()
    expect(screen.queryByTestId('path-form')).not.toBeInTheDocument()
  })
})

describe('les trois formes', () => {
  it('nomme la relation directe', () => {
    render(<RecommendedPathCard contacts={[contact('c1', 'Claire M.')]} pathOrigin={origin({ form: 'direct' })} />)
    expect(screen.getByTestId('path-form')).toHaveTextContent(/relation directe/i)
  })

  it('nomme le saut ET la pièce sur laquelle il s’appuie', () => {
    render(
      <RecommendedPathCard
        contacts={[contact('c1', 'Claire M.')]}
        pathOrigin={origin({
          form: 'one_hop',
          hop: { personId: 'p-claire', basis: 'same_entity', sourceIds: [] },
        })}
      />,
    )
    expect(screen.getByTestId('path-form')).toHaveTextContent(/un saut/i)
    // La base du saut est AFFICHÉE : « passe par Untel » sans dire pourquoi
    // serait exactement la promesse que le refus de l'outil d'introduction
    // interdit. On dit le lien, jamais « connaît ».
    expect(screen.getByTestId('path-hop-basis')).toHaveTextContent(/même direction/i)
    expect(screen.getByTestId('path-hop-basis')).not.toHaveTextContent(/connaît/i)
  })

  it('dit l’entrée froide SANS DÉTOUR', () => {
    render(<RecommendedPathCard contacts={[contact('c1', 'Claire M.')]} pathOrigin={origin({ form: 'cold' })} />)
    expect(screen.getByTestId('path-form')).toHaveTextContent(/froide/i)
  })
})

describe('l’avertissement de péremption', () => {
  it('AVERTIT quand la relation est périmée, avec sa date', () => {
    render(
      <RecommendedPathCard
        contacts={[contact('c1', 'Claire M.')]}
        pathOrigin={origin({ form: 'direct', relationFreshness: 'perime', relationDate: '2026-04-01' })}
      />,
    )
    expect(screen.getByTestId('path-relation-freshness')).toBeInTheDocument()
  })

  it('AVERTIT aussi quand elle vieillit', () => {
    render(
      <RecommendedPathCard
        contacts={[contact('c1', 'Claire M.')]}
        pathOrigin={origin({ form: 'direct', relationFreshness: 'vieillissant', relationDate: '2026-07-01' })}
      />,
    )
    expect(screen.getByTestId('path-relation-freshness')).toBeInTheDocument()
  })

  it('n’avertit pas sur une relation fraîche — un badge permanent ne se lit plus', () => {
    render(
      <RecommendedPathCard
        contacts={[contact('c1', 'Claire M.')]}
        pathOrigin={origin({ form: 'direct', relationFreshness: 'frais', relationDate: '2026-08-25' })}
      />,
    )
    expect(screen.queryByTestId('path-relation-freshness')).not.toBeInTheDocument()
  })

  it('DIT l’inconnu plutôt que de laisser lire une relation fraîche', () => {
    // Le piège que l'exigence nomme : « passe par Untel » vaut ce que vaut la
    // fraîcheur du lien. Sans date, on ne sait pas — et se taire ici se lirait
    // « rien à signaler ».
    render(
      <RecommendedPathCard
        contacts={[contact('c1', 'Claire M.')]}
        pathOrigin={origin({ form: 'direct', relationFreshness: 'inconnu' })}
      />,
    )
    expect(screen.getByTestId('path-relation-freshness')).toBeInTheDocument()
  })
})
