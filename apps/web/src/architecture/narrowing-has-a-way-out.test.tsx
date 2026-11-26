import { Link } from '@tanstack/react-router'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { PortfolioExitLink } from '@/features/accounts/view/accounts-list/PortfolioExitLink'

/**
 * #4127 revient sur #4087.1 (bandeau compacté), délibérément — Louis 13/10 :
 * le bandeau « État du portefeuille » est supprimé ; la sortie (`PortfolioExitLink`)
 * vit près des filtres et porte désormais cette garde.
 *
 * GA-107 — UNE RESTRICTION A TOUJOURS UNE SORTIE, ET LA SORTIE EN SORT VRAIMENT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Recette live du 30/08/2026, PRODUCTION. Depuis `/accounts?lifecycle=opportunity`,
 * l'écran est vide et le portefeuille ne l'est pas. En haut à droite du bandeau
 * de compteurs, « Tout le portefeuille ». Clic : rien. L'URL ne bouge pas.
 *
 * Ce n'était pas un lien cassé — ce n'était pas un lien. C'était un `<p>`, qui
 * de surcroît annonçait « Tout le portefeuille » au-dessus de quatre chiffres
 * comptés par le serveur sur les seules opportunités. Aucun onglet, aucune
 * pastille de filtre ne montrait la restriction : l'utilisateur n'avait AUCUN
 * moyen visible de revenir à ses 24 comptes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX PROPRIÉTÉS GARDÉES
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. La sortie EXISTE et se tabule — `role="link"`, pas un paragraphe ni un
 *    `<div onClick>` (GA-35 : ce qui se clique se tabule).
 * 2. Elle SORT : l'URL qu'elle vise ne porte plus le moindre paramètre de
 *    restriction. Un retour qui reconduit sur le filtre dont il promet de
 *    sortir n'est pas un retour.
 *
 * Et sa réciproque : sans restriction, PAS de lien. Ramener là où l'on est
 * déjà apprend à ne plus cliquer — le même arbitrage que le geste des doublons
 * de `/pilotage/qualite`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA PISTE DE DÉPART DISAIT, ET CE QUE LA MESURE DIT
 * ─────────────────────────────────────────────────────────────────────────────
 * L'hypothèse apportée était : « un `<Link>` vers `/accounts` sans `search: {}`
 * conserve les paramètres de recherche existants ». Mesuré le 30/08/2026 sur
 * @tanstack/react-router 1.168.23, sur une route portant son `validateSearch`,
 * depuis `/accounts?lifecycle=opportunity&score=high` : le `href` rendu est
 * `/accounts` DANS LES DEUX CAS. La version en place ne reconduit pas les
 * paramètres — la cause du défaut était l'absence de lien, pas son écriture.
 *
 * D'où une garde qui lit le RÉSULTAT (`href`) et non la présence d'une
 * propriété : elle reste vraie si la bibliothèque change d'avis, et elle
 * tomberait si quelqu'un écrivait un retour qui recopie le filtre.
 */

const RESTRICTED_URL = '/accounts?lifecycle=opportunity&score=high&q=Doctolib'
const BACK = /voir tout le portefeuille/i

describe('GA-107 — une restriction a toujours une sortie', () => {
  it('la garde sait voir un retour qui RECONDUIT le filtre — sinon elle serait verte sur tout', async () => {
    // Le témoin négatif. Il n'est pas du code produit : il prouve que
    // l'assertion sur le `href` est CAPABLE de tomber. Sans lui, un `href`
    // toujours nu (par exemple parce que le routeur de test ne porte aucun
    // paramètre) rendrait les tests suivants verts pour toujours.
    renderWithRouter(
      <Link to="/accounts" search={{ lifecycle: 'opportunity' }}>
        témoin
      </Link>,
      RESTRICTED_URL,
    )

    const witness = await screen.findByRole('link', { name: 'témoin' })
    expect(witness.getAttribute('href')).toContain('lifecycle=opportunity')
  })

  it('sous restriction, la sortie existe et c’est un LIEN — pas un paragraphe', async () => {
    renderWithRouter(<PortfolioExitLink narrowed />, RESTRICTED_URL)

    const back = await screen.findByRole('link', { name: BACK })
    // `role="link"` n'est pas de la décoration : c'est ce qui donne la
    // tabulation, la touche Entrée et l'annonce au lecteur d'écran. Le `<p>`
    // de production n'avait aucun des trois.
    expect(back.tagName).toBe('A')
    expect(back).toHaveAttribute('href')
  })

  it('la sortie mène à une URL SANS le moindre paramètre de restriction', async () => {
    renderWithRouter(<PortfolioExitLink narrowed />, RESTRICTED_URL)

    const href = (await screen.findByRole('link', { name: BACK })).getAttribute('href') ?? ''
    expect(href).toBe('/accounts')
    for (const param of ['lifecycle', 'score', 'q']) {
      expect(href).not.toContain(param)
    }
  })

  it('sans restriction, aucune sortie n’est offerte — un lien qui ne mène nulle part apprend à ne plus cliquer', async () => {
    renderWithRouter(
      <>
        <PortfolioExitLink narrowed={false} />
        <p>témoin de rendu</p>
      </>,
      '/accounts',
    )

    expect(await screen.findByText('témoin de rendu')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: BACK })).not.toBeInTheDocument()
  })
})
