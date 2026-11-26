import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ContactsIntro } from './ContactsIntro'

/**
 * #2155.10 / #2155.12 / #2155.22 — la page Contacts dit ce qu'elle EST, et où
 * aller pour ce qu'elle n'est pas.
 *
 * Le geste empêché : un commercial ouvre Contacts pour chercher de nouvelles
 * personnes sur le marché. La page ne cherche que dans ce que l'espace connaît
 * déjà (`ContactsToolbar` filtre la liste chargée) ; sans le dire, elle
 * laissait croire à une base vide là où il fallait aller dans Découvrir ou
 * analyser une entreprise.
 */

function renderIntro(over: Partial<Parameters<typeof ContactsIntro>[0]> = {}) {
  const props = { onAddContact: () => {}, ...over }
  renderWithRouter(<ContactsIntro {...props} />, '/contacts')
  return props
}

describe('ContactsIntro — #2155.10/.12/.22', () => {
  it('porte le titre exact en h1', async () => {
    renderIntro()
    expect(await screen.findByRole('heading', { level: 1, name: 'Contacts' })).toBeInTheDocument()
  })

  // Théo B c1-repertoire.R1 — surtitre « Relations & prospection », titre court, sous-titre au tutoiement
  // (le vouvoiement de Théo « Vos interlocuteurs » n'est pas porté : D-1).
  it('c1-repertoire.R1 — surtitre, titre court et sous-titre tutoyé', async () => {
    renderIntro()
    await screen.findByRole('heading', { level: 1, name: 'Contacts' })
    expect(screen.getByText('Relations & prospection')).toBeInTheDocument()
    expect(screen.getByText('Tes interlocuteurs, tes sources. Un seul répertoire pour travailler.')).toBeInTheDocument()
    expect(screen.queryByText(/Vos |Votre /)).not.toBeInTheDocument()
  })
})

/**
 * #3375 — retour bêta 30/09 : « supprime » (capture pointée précisément sur
 * la ligne « Pour trouver de nouvelles personnes : Découvrir · Analyser une
 * entreprise »). Retirée — les deux liens ne vivent plus dans cet écran.
 */
describe('ContactsIntro — #3375 : le renvoi « pour trouver de nouvelles personnes » est retiré', () => {
  it('ne rend plus la ligne, ni ses deux liens', async () => {
    renderIntro()
    await screen.findByRole('heading', { level: 1, name: 'Contacts' })
    expect(screen.queryByText(/pour trouver de nouvelles personnes/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Découvrir' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Analyser une entreprise' })).not.toBeInTheDocument()
  })
})

/**
 * #2158.7 / #2158.8 — DEUX CTA SECONDAIRES DE L'EN-TÊTE (issue #2158, section
 * EN-TÊTE, lue à la source par `gh issue view 2158`) : « Importer mes
 * contacts » et « Créer une cible ». Chacun mène à un écran RÉEL déjà
 * existant — jamais une seconde implémentation :
 *  · l'import générique (`/settings/import`) accepte déjà l'objet `contact`
 *    (`packages/contracts/src/schemas/import.ts`, source dédiée
 *    `contacts_only`) ;
 *  · « Mes cibles » (`/mes-cibles`) porte déjà le formulaire de création
 *    (`CreateTargetListForm`, sans exiger de sélection préalable — à la
 *    différence du `CreateTargetListDialog` de cette page, réservé à une
 *    sélection de lignes déjà chargées).
 */
/**
 * #2158.6 — CTA PRINCIPAL de l'en-tête (issue #2158, section EN-TÊTE, lue à la
 * source par `gh issue view 2158`) : « Traiter les contacts prêts ». Il cible
 * la vue « à contacter » (`ContactsViewChips`) via le search param `view`,
 * bookmarkable depuis #2158.6/#2158.72 — sans lui, un lien direct n'avait rien
 * à cibler (`ContactsViewChips` ne vivait que dans un `useState` local).
 */
// Théo B c1-repertoire.R2 — deux boutons d'en-tête : « Ajouter un contact » et « Importer des contacts ».
// « Traiter les contacts prêts » (A1) est tenu par la puce « À contacter » de la rangée de vues ;
// « Créer une cible » (A2) l'est par « Enregistrer une liste » de la barre de sélection.
describe('ContactsIntro — c1-repertoire.R2 : Ajouter / Importer', () => {
  it('c1-repertoire.A1 — plus de « Traiter les contacts prêts » dans l’en-tête', async () => {
    renderIntro()
    await screen.findByRole('heading', { level: 1, name: 'Contacts' })
    expect(screen.queryByRole('link', { name: 'Traiter les contacts prêts' })).not.toBeInTheDocument()
  })

  it('« Importer des contacts » ouvre Imports & sources (Théo B c3.R1)', async () => {
    renderIntro()
    const link = await screen.findByRole('link', { name: 'Importer des contacts' })
    expect(link.getAttribute('href')).toBe('/contacts/imports')
  })

  it('c1-repertoire.A2 — plus de « Créer une cible » dans l’en-tête', async () => {
    renderIntro()
    await screen.findByRole('heading', { level: 1, name: 'Contacts' })
    expect(screen.queryByRole('link', { name: 'Créer une cible' })).not.toBeInTheDocument()
  })
})

/**
 * #2476 — « déplacer [Ajouter un contact] sur la ligne du h1 à droite pour pas
 * que ça prenne une ligne pour rien » (Louis, 16/09/2026).
 *
 * Le bouton vivait dans `headerActions` de `CustomerPage` — une entête à part,
 * SANS titre à côté (le nom de l'écran « vit dans les onglets » de section, cf
 * `PageHeader.duplication.test.tsx`) : une ligne entière pour un seul bouton,
 * pendant que le vrai h1 vu à l'écran (`ScreenIntro`, ci-dessus) n'en portait
 * aucun. Il partage désormais SA ligne — `ScreenIntro` gagne un slot `action`.
 */
describe('ContactsIntro — #2476 : « Ajouter un contact » partage la ligne du h1', () => {
  it('rend le bouton sur la MÊME ligne que le titre, jamais en dessous', async () => {
    const onAddContact = vi.fn()
    renderIntro({ onAddContact })

    const heading = await screen.findByRole('heading', { level: 1, name: 'Contacts' })
    const button = screen.getByRole('button', { name: 'Ajouter un contact' })
    // Même rangée : le plus proche ancêtre `flex … justify-between` du titre
    // contient aussi le bouton — pas un ancêtre plus haut qui engloberait
    // n'importe quoi d'autre sur l'écran.
    const row = heading.closest('.justify-between')
    expect(row).not.toBeNull()
    expect(row).toContainElement(button)
  })

  it('le clic déclenche le geste du parent, jamais un état interne', async () => {
    const onAddContact = vi.fn()
    renderIntro({ onAddContact })

    const { default: userEvent } = await import('@testing-library/user-event')
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un contact' }))
    expect(onAddContact).toHaveBeenCalledTimes(1)
  })
})

/**
 * #3527 — le déclencheur « Filtres » (#3376) a quitté l'entête : il vit à côté
 * de la recherche (`ContactsFiltersTrigger.test.tsx`).
 */
describe('ContactsIntro — #3527 : plus de bouton « Filtres » dans l’entête', () => {
  it('ne rend aucun bouton « Filtres »', async () => {
    renderIntro()
    await screen.findByRole('link', { name: 'Importer des contacts' })
    expect(screen.queryByRole('button', { name: /^filtres$/i })).not.toBeInTheDocument()
  })
})
