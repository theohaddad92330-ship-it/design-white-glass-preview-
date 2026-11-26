import type { ItChallenge, PainPoint, RecentSignal } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WhyNowSection } from './WhyNowSection'

// #3673 (réfuté en prod le 07/10 sur Société Générale — RB-07-10) — une analyse qui porte des
// pains/signaux mais aucun enjeu ne tait plus la colonne « Enjeux à adresser » : l'absence
// survit sous une analyse (doctrine : « on n'affiche pas ce qu'on n'a pas dans une LISTE, mais
// sous une analyse ce qui n'a pas pu être évalué se NOMME »). #3673.6 (lot F05) reste tenu pour
// le CONTENU (pas de ligne inventée par enjeu), mais la colonne elle-même ne disparaît plus.
describe('WhyNowSection', () => {
  const pain: PainPoint = { pain: 'Délais de livraison' }
  const challenge: ItChallenge = { title: 'Renouvellement des voies', description: 'x' }
  const signal: RecentSignal = { signal: 'Appel d’offres', date: '2026-09-10' }

  it('nomme l’absence d’enjeu même quand d’autres colonnes portent du contenu (SG, 07/10)', () => {
    render(<WhyNowSection pains={[pain]} challenges={[]} signals={[signal]} />)
    expect(screen.getByText(/enjeux à adresser|challenges to address/i)).toBeTruthy()
    expect(screen.getByText(/non évalués? pour ce compte|not evaluated for this account/i)).toBeTruthy()
  })

  it('rend la colonne des enjeux quand il y en a', () => {
    render(<WhyNowSection pains={[pain]} challenges={[challenge]} signals={[signal]} />)
    expect(screen.getByText('Renouvellement des voies')).toBeTruthy()
  })

  it('nomme la même absence quand rien du tout ne permet de décider', () => {
    render(<WhyNowSection pains={[]} challenges={[]} signals={[]} />)
    expect(screen.getByText(/non évalués? pour ce compte|not evaluated for this account/i)).toBeTruthy()
  })

  // #3673 (recette prod 08/10, 8c42a4032c) — « Expertises concernées » disparaissait
  // ENTIÈREMENT sans `implications` (`{implications ? <ItImplicationsCard …/> : null}`,
  // contrairement à `ItChallenges` qui nomme déjà son absence) : exactement le symptôme
  // observé sur Société Générale. Même règle que pour « Enjeux à adresser » : la carte
  // reste montée, son absence se nomme.
  it('nomme l’absence d’expertises concernées plutôt que de masquer la carte entière', () => {
    render(<WhyNowSection pains={[pain]} challenges={[challenge]} signals={[signal]} implications={null} />)
    expect(screen.getByText(/expertises concernées|concerned expertise/i)).toBeTruthy()
    expect(screen.getByText(/non évaluées? pour ce compte|not evaluated for this account/i)).toBeTruthy()
  })

  it('rend les expertises concernées quand elles sont connues', () => {
    render(
      <WhyNowSection
        pains={[pain]}
        challenges={[challenge]}
        signals={[signal]}
        implications="Besoin d’un intégrateur cloud."
      />,
    )
    expect(screen.getByText('Besoin d’un intégrateur cloud.')).toBeTruthy()
  })

  // #4142.9 — « Enjeux business » et « Enjeux à adresser » servaient le MÊME énoncé deux fois : un
  // enjeu déjà listé comme pain n'est pas répété dans la colonne voisine (au blanc, à la casse et
  // aux accents près) ; un enjeu différent, lui, reste.
  it('ne répète pas dans « Enjeux à adresser » un énoncé déjà listé dans « Enjeux business »', () => {
    render(
      <WhyNowSection
        pains={[{ pain: 'Délais de livraison' }]}
        challenges={[{ title: '  délais DE livraison ' }, challenge]}
        signals={[signal]}
      />,
    )
    expect(screen.getAllByText(/délais de livraison/i)).toHaveLength(1)
    expect(screen.getByText('Renouvellement des voies')).toBeTruthy()
  })

  // V4-CORRECTIFS-C 4294.3 (#4142.2) — le même enjeu, ponctué ou légèrement reformulé, reste UN enjeu sur la fiche.
  it('4294.3 — un enjeu ponctué ou reformulé n’est pas servi sous les deux libellés', () => {
    render(
      <WhyNowSection
        pains={[{ pain: 'Sécuriser les délais de livraison.' }]}
        challenges={[
          { title: 'Sécuriser les délais de livraison' },
          { title: 'Délais de livraison à sécuriser' },
          challenge,
        ]}
        signals={[signal]}
      />,
    )
    expect(screen.getAllByText(/délais de livraison/i)).toHaveLength(1)
    expect(screen.getByText('Renouvellement des voies')).toBeTruthy()
  })
})
