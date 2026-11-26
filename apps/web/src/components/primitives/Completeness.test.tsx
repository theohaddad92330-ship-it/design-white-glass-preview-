import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Completeness } from './Completeness'

/**
 * « Calculé sur … » — l'élément n°6 de la loi 2 du tome 7.
 *
 * Un chiffre nu se lit comme une vérité complète. « 62 » ne dit pas que treize
 * dossiers sur trente-quatre n'ont pas pu entrer dans le calcul, et personne ne
 * le devine. C'est le pendant AFFICHABLE de la doctrine que le produit tient
 * déjà au calcul.
 */
describe('Completeness — un agrégat dit sur combien il est calculé', () => {
  it('affiche la part quand l’agrégat est PARTIEL', () => {
    render(<Completeness counted={21} total={34} of="comptes" />)
    expect(screen.getByText(/21 comptes sur 34/)).toBeInTheDocument()
    expect(screen.getByText(/62 %/)).toBeInTheDocument()
  })

  it('ne met AUCUN pourcentage quand l’agrégat est complet — « 100 % » est du bruit', () => {
    render(<Completeness counted={34} total={34} of="comptes" />)
    expect(screen.getByText(/les 34 comptes/)).toBeInTheDocument()
    expect(screen.queryByText(/100 %/)).toBeNull()
  })

  it('un dénominateur NON LU se dit, il ne s’écrit pas « 100 % » ni « 0 % »', () => {
    render(<Completeness counted={21} total={null} of="comptes" />)
    expect(screen.getByText(/21 comptes/)).toBeInTheDocument()
    expect(screen.getByText(/n'a pas pu être comptée|na pas pu être comptée/)).toBeInTheDocument()
    expect(screen.queryByText(/%/)).toBeNull()
  })

  it('une population vide dit « rien à calculer », jamais « 0 % »', () => {
    render(<Completeness counted={0} total={0} of="comptes" />)
    expect(screen.getByText(/Rien à calculer/)).toBeInTheDocument()
    expect(screen.queryByText(/%/)).toBeNull()
  })

  it('un numérateur nul sur une population réelle reste une mesure — 0 %', () => {
    render(<Completeness counted={0} total={8} of="maillons" />)
    expect(screen.getByText(/0 maillons sur 8/)).toBeInTheDocument()
    expect(screen.getByText(/0 %/)).toBeInTheDocument()
  })

  it('ne rend rien quand l’écran ne sait pas nommer sa population', () => {
    // Une complétude sans nom de population — « calculé sur 21 sur 34 » — est le
    // même défaut qu'un score nu : elle a l'air d'une mesure et n'en dit pas
    // l'objet. Mieux vaut ne rien écrire que d'écrire ça.
    const { container } = render(<Completeness counted={21} total={34} of="   " />)
    expect(container).toBeEmptyDOMElement()
  })
})

/**
 * #1866 — « réduis / supprime le texte grisé il prend de la place pour rien ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE LE RETOUR DEMANDE, ET CE QU'IL NE DEMANDE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Mesuré en production le 11/09/2026 sur `/consultants`, tuile « Disponibles
 * maintenant » : la primitive empilait DEUX notes grises sous un chiffre de
 * 24 px —
 *
 *   « Calculé sur 10 fiches du vivier sur 31 — 32 %. »            (16 px)
 *   « Hors du calcul : 21 fiches sans affectation enregistrée
 *     — disponibilité non mesurable. »                            (32 px)
 *
 * soit 48 px de gris sous un nombre, dans une tuile qui en fait ~110. Le
 * retour est JUSTE sur la place perdue.
 *
 * Il ne demande pas de rendre un zéro faux. « Disponibles maintenant : 0 »
 * sans son dénominateur se lit « 0 sur 31 », ce qui est FAUX — le vrai énoncé
 * est « 0 sur les 10 fiches mesurables ». La qualification du chiffre est
 * donc la dernière chose qui a le droit de disparaître.
 *
 * Le geste : la PREMIÈRE phrase — celle qui porte le dénominateur, donc la
 * vérité du chiffre — reste dans le flux, à sa taille. La SECONDE — le détail
 * de ce qui est sorti du dénominateur, qui dit quoi compléter mais ne change
 * pas la lecture du nombre — se replie derrière un déclencheur TABULABLE.
 * 48 px → 16 px, zéro mot perdu.
 *
 * ⚠️ Replier n'est pas supprimer, et c'est ce que ces tests tiennent : le
 * détail doit rester atteignable au clavier, et ne JAMAIS finir rangé dans un
 * attribut `title=` (le dépôt a déjà payé « la donnée rangée dans un title »).
 */
describe('#1866 — la qualification se REPLIE, elle ne se supprime pas', () => {
  const partiel = <Completeness counted={21} total={34} of="affaires" excluded={['13 sans montant saisi']} />

  it('le DÉNOMINATEUR reste dans le flux — c’est lui qui rend le chiffre vrai', () => {
    render(partiel)
    expect(screen.getByText(/21 affaires sur 34/)).toBeInTheDocument()
    expect(screen.getByText(/62 %/)).toBeInTheDocument()
  })

  it('le détail de l’exclusion ne prend plus de place au repos', () => {
    const { container } = render(partiel)
    // La place gagnée, mesurée là où elle se mesure en jsdom : le texte rendu.
    expect(container.textContent).not.toMatch(/Hors du calcul/)
    expect(container.textContent).not.toMatch(/13 sans montant saisi/)
  })

  it('mais il reste ATTEIGNABLE — un déclencheur tabulable, ouvert au clavier', async () => {
    const user = userEvent.setup()
    render(partiel)

    // « Ce qui se clique se tabule » (GA-35) : un vrai bouton, pas un div.
    const trigger = screen.getByRole('button')
    expect(trigger).toHaveAttribute('type', 'button')

    await user.tab()
    expect(trigger).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(await screen.findByText(/13 sans montant saisi/)).toBeInTheDocument()
  })

  it('le déclencheur PORTE un nom — et ce nom contient la phrase, pas seulement un verbe', () => {
    render(partiel)
    // GA-32 : un contrôle a un nom accessible. Ici le nom est le texte même du
    // bouton — la phrase de complétude — plus l'indice de ce que le geste
    // ouvre. Un `aria-label` l'aurait REMPLACÉE : le lecteur d'écran aurait
    // perdu le dénominateur, c'est-à-dire exactement ce qu'on protège.
    const trigger = screen.getByRole('button')
    expect(trigger).toHaveAccessibleName(/21 affaires sur 34/)
    expect(trigger).toHaveAccessibleName(/hors du calcul/i)
  })

  it('le détail n’est PAS rangé dans un attribut `title`', () => {
    // Le piège nommé du dépôt : une donnée dans un `title=` n'existe ni au
    // clavier, ni au doigt, ni pour un lecteur d'écran qui ne survole pas.
    const { container } = render(partiel)
    for (const node of container.querySelectorAll('[title]')) {
      expect(node.getAttribute('title')).not.toMatch(/13 sans montant saisi/)
    }
  })

  it('SANS exclusion, rien ne se replie — aucun bouton, aucune décoration en trop', () => {
    // Un déclencheur qui n'ouvre rien s'apprend à ne pas cliquer, y compris là
    // où il aurait servi (la règle de `ExplainedNumber`, PDF 6 §5.1).
    render(<Completeness counted={21} total={34} of="affaires" />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
