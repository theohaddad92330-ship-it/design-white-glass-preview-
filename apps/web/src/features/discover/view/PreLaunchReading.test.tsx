import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PreLaunchReading } from './PreLaunchReading'

describe('#4998.1 — la lecture de la demande avant le lancement', () => {
  it('dit la zone et les mots-clés saisis, sans lancer', () => {
    render(<PreLaunchReading city="Lille" keywords="commerce détail" freetext="" />)
    expect(screen.getByTestId('pre-launch-reading').textContent).toMatch(/Lille/)
    expect(screen.getByTestId('pre-launch-reading').textContent).toMatch(/commerce détail/)
  })

  it('#4998.2 — une zone libre inconnue est dite avant le lancement', () => {
    render(<PreLaunchReading city="" keywords="" freetext="talend à Zorglub-sur-Mer" />)
    expect(screen.getByTestId('pre-launch-reading').textContent).toMatch(/Zorglub-sur-Mer/)
  })

  it('#4998.3 — la phrase de la recette (taille + zone inconnue + virgule) est lue : zone ET taille dites non lues', () => {
    render(
      <PreLaunchReading
        city=""
        keywords=""
        freetext="ESN de plus de 500 personnes en Zorglub-sur-Mer, freelance Java"
      />,
    )
    const text = screen.getByTestId('pre-launch-reading').textContent ?? ''
    expect(text).toMatch(/Zorglub-sur-Mer/)
    expect(text).toMatch(/plus de 500 personnes/)
  })

  it('muette sans saisie', () => {
    const { container } = render(<PreLaunchReading city="" keywords="" freetext="" />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('#5203 — la zone posée est dite juste', () => {
  it('une région active se nomme : jamais « aucune zone posée »', () => {
    render(<PreLaunchReading city="" region={['11']} keywords="SAP" freetext="" />)
    const text = screen.getByTestId('pre-launch-reading').textContent ?? ''
    expect(text).toMatch(/Île-de-France/)
    expect(text).not.toMatch(/aucune zone posée/)
  })

  it('un département saisi se dit aussi ; rien de posé = « aucune zone posée »', () => {
    const { unmount } = render(<PreLaunchReading city="" department="59" keywords="Java" freetext="" />)
    expect(screen.getByTestId('pre-launch-reading').textContent).toMatch(/59/)
    unmount()
    render(<PreLaunchReading city="" keywords="Java" freetext="" />)
    expect(screen.getByTestId('pre-launch-reading').textContent).toMatch(/aucune zone posée/)
  })
})
