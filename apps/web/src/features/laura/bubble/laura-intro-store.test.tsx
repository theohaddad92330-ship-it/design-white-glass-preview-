import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { resetLauraIntro, useAskLauraIntro, useCurrentLauraIntro } from './laura-intro-store'

/**
 * #1812 — UN ÉCRAN DÉPOSE UNE AMORCE, LA BULLE LA LIT.
 *
 * Patron de test calqué sur `page-context-store.test.tsx` : un composant
 * « déposant » et un composant « lecteur », montés et démontés pour observer
 * le magasin externe. Ce fichier ajoute ce que le magasin voisin n'a pas à
 * couvrir : PLUSIEURS déposants sur le MÊME écran (`MyDataView` en pose
 * trois), et le booléen « suis-je celui que la bulle montre ? » que
 * `AskLaura` lit pour décider de s'effacer de la page ou d'y rester.
 */

function Deposit({
  question,
  label,
  accountId,
  testId,
}: {
  question: string
  label: string
  accountId?: string
  testId: string
}) {
  const active = useAskLauraIntro({ question, label, accountId })
  return <span data-testid={testId}>{active ? 'actif' : 'inactif'}</span>
}

function Reader() {
  const intro = useCurrentLauraIntro()
  return <span data-testid="seen">{intro ? `${intro.question}|${intro.label}|${intro.accountId ?? ''}` : 'rien'}</span>
}

afterEach(() => {
  cleanup()
  resetLauraIntro()
})

describe('ce qu’un écran dépose', () => {
  it('arrive jusqu’à la bulle', () => {
    render(
      <>
        <Deposit question="Prépare une reprise." label="Demander à Laura" testId="a" />
        <Reader />
      </>,
    )
    expect(screen.getByTestId('seen')).toHaveTextContent('Prépare une reprise.|Demander à Laura|')
  })

  it('emporte le compte en portée quand l’écran en désigne un', () => {
    render(
      <>
        <Deposit question="Résume ce compte." label="Demander à Laura" accountId="acc-1" testId="a" />
        <Reader />
      </>,
    )
    expect(screen.getByTestId('seen')).toHaveTextContent('Résume ce compte.|Demander à Laura|acc-1')
  })

  it('disparaît quand l’écran se démonte', () => {
    const view = render(
      <>
        <Deposit question="Prépare une reprise." label="Demander à Laura" testId="a" />
        <Reader />
      </>,
    )
    view.rerender(<Reader />)
    expect(screen.getByTestId('seen')).toHaveTextContent('rien')
  })
})

describe('plusieurs `<AskLaura>` sur le MÊME écran (ex. MyDataView, trois CTA)', () => {
  it('le DERNIER monté gagne — la bulle ne peut proposer qu’une amorce à la fois', () => {
    render(
      <>
        <Deposit question="Question A" label="Label A" testId="a" />
        <Deposit question="Question B" label="Label B" testId="b" />
        <Reader />
      </>,
    )
    // React monte les effets des enfants dans l'ordre où ils apparaissent :
    // B, déclaré en second, est donc le dernier à publier.
    expect(screen.getByTestId('seen')).toHaveTextContent('Question B|Label B|')
  })

  it('`useAskLauraIntro` répond VRAI pour le gagnant, FAUX pour les autres — c’est ce qui décide si `AskLaura` s’efface', () => {
    render(
      <>
        <Deposit question="Question A" label="Label A" testId="a" />
        <Deposit question="Question B" label="Label B" testId="b" />
      </>,
    )
    expect(screen.getByTestId('a')).toHaveTextContent('inactif')
    expect(screen.getByTestId('b')).toHaveTextContent('actif')
  })

  it('le PERDANT peut se démonter sans effacer l’amorce du gagnant', () => {
    const view = render(
      <>
        <Deposit question="Question A" label="Label A" testId="a" />
        <Deposit question="Question B" label="Label B" testId="b" />
        <Reader />
      </>,
    )
    // Seul « A » (le perdant) part — ex. la ligne d'une liste qui se retire.
    view.rerender(
      <>
        <Deposit question="Question B" label="Label B" testId="b" />
        <Reader />
      </>,
    )
    expect(screen.getByTestId('seen')).toHaveTextContent('Question B|Label B|')
  })

  it('sait dire NON : deux questions IDENTIQUES restent deux instances distinctes', () => {
    // Le contenu ne suffit pas à décider qui gagne — l'identité si. Sans un id
    // PAR INSTANCE (et non par contenu), ce test ne pourrait pas distinguer
    // les deux `<Deposit>` puisqu'ils portent la même phrase.
    render(
      <>
        <Deposit question="Prépare une reprise." label="Demander à Laura" testId="a" />
        <Deposit question="Prépare une reprise." label="Demander à Laura" testId="b" />
      </>,
    )
    expect(screen.getByTestId('a')).toHaveTextContent('inactif')
    expect(screen.getByTestId('b')).toHaveTextContent('actif')
  })
})
