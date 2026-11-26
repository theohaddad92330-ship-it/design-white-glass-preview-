import { render, screen } from '@testing-library/react'
import { useState } from 'react'

/**
 * RÉGLAGES › PRÉFÉRENCES › LANGUE & DATES — LE FUSEAU DE LA PERSONNE (Théo D settings-prefs.R3).
 *
 * Décision de Louis du 14/09/2026 : « ajouter un fuseau par utilisateur ».
 *
 * Ce que cette suite tient, et qu'aucun test de contrat ne peut tenir :
 *  · le réglage est VISIBLE et CORRIGIBLE — sans quoi la colonne serait du code
 *    juste que personne n'appelle (défaut n°1 du dépôt) ;
 *  · le fuseau ENREGISTRÉ gagne sur la détection du navigateur — « une
 *    correction humaine gagne toujours » ;
 *  · TÉMOIN — sans fuseau enregistré, la détection est PROPOSÉE, et rien n'est
 *    écrit tant que la personne n'a pas enregistré.
 *
 * Les mocks portent sur les BORDS (HTTP, `Intl`), jamais sur l'écran.
 */
import { TimezoneField } from './TimezoneField'

/**
 * Le navigateur de la personne, simulé au SEUL endroit qui le lit.
 *
 * Le simulacre porte sur `resolvedOptions` du PROTOTYPE, jamais sur le
 * constructeur `Intl.DateTimeFormat` : `isSupportedTimeZone` construit lui
 * aussi un `DateTimeFormat`, et remplacer le constructeur l'entraînerait dans
 * la simulation.
 *
 * ⚠️ CE QUI A FAIT ROUGIR CE FICHIER LA PREMIÈRE FOIS, et qui n'a rien à voir
 * avec ce simulacre : vitest-web résout `@bellum/contracts` vers son `dist/`
 * construit, pas vers ses sources. `isSupportedTimeZone`, tout juste ajouté au
 * contrat, valait donc `undefined` ici ; l'appeler jetait, le `try/catch` de
 * `detectedTimeZone` avalait, et la détection rendait « aucun fuseau ». Deux
 * tests sur quatre restaient VERTS — ceux qui ne détectent rien. Reconstruire
 * le paquet (`turbo run build --filter=@bellum/contracts`) est le remède ; le
 * symptôme, lui, se lit comme une fonctionnalité absente.
 */
function browserIn(zone: string): void {
  const real = Intl.DateTimeFormat.prototype.resolvedOptions
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(function (
    this: Intl.DateTimeFormat,
  ): Intl.ResolvedDateTimeFormatOptions {
    return { ...real.call(this), timeZone: zone }
  })
}

/** Le champ monté comme la vue le fait : l'état est porté par le parent. */
function Harness({ saved }: { saved: string | null }) {
  const [value, setValue] = useState(saved ?? detectedFromBrowser())
  return <TimezoneField value={value} savedTimezone={saved} onChange={setValue} />
}

function detectedFromBrowser(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return ''
  }
}

describe('TimezoneField — le fuseau horaire', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('affiche le fuseau ENREGISTRÉ, même quand le navigateur en annonce un autre', async () => {
    browserIn('Europe/Paris')
    render(<Harness saved="Asia/Singapore" />)

    const field = await screen.findByRole('combobox', { name: 'Fuseau horaire' })
    // Une correction humaine gagne : la détection ne la réécrit pas.
    expect(field).toHaveTextContent('Asia/Singapore')
    expect(field).not.toHaveTextContent('Europe/Paris')
  })

  it('PROPOSE le fuseau du navigateur quand rien n’est enregistré, et le dit', async () => {
    browserIn('America/Montreal')
    render(<Harness saved={null} />)

    const field = await screen.findByRole('combobox', { name: 'Fuseau horaire' })
    expect(field).toHaveTextContent('America/Montreal')
    // La phrase nomme la provenance : proposé, pas décidé.
    expect(await screen.findByText(/Proposé d’après ton navigateur \(America\/Montreal\)/)).toBeInTheDocument()
  })

  it('une fois enregistré, la phrase ne prétend plus que c’est une détection', async () => {
    browserIn('America/Montreal')
    render(<Harness saved="Europe/Paris" />)
    await screen.findByRole('combobox', { name: 'Fuseau horaire' })
    expect(screen.queryByText(/Proposé d’après ton navigateur/)).not.toBeInTheDocument()
  })
})
