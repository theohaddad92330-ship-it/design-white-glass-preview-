import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ObjectMention } from './ObjectMention'

/**
 * F1 · Mention — « de quoi parle-t-on ? » (`T7.md:514`).
 *
 * La forme la plus petite d'un objet métier, et la plus répandue : la table de
 * `T7.md:528-545` la marque `●` pour seize objets sur dix-sept. Sa définition
 * tient en trois traits, et chacun est un test ici :
 *   · densité — nom + UN attribut, jamais deux ;
 *   · action — « ouvrir », une seule, ce qui veut dire un LIEN ;
 *   · et la règle maison qui vaut partout — une valeur absente ne s'invente pas.
 *
 * Mesuré le 29/08/2026 : le compte est mentionné à quinze endroits d'`apps/web`,
 * chacun avec son propre balisage, et pas un ne porte l'attribut que `T7.md:558`
 * lui assigne. Quinze formes pour une seule forme, c'est la loi 4 du tome 7
 * exactement à l'envers.
 */
describe('ObjectMention — F1, la mention d’un objet métier', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('rend le nom de l’objet', async () => {
    renderWithRouter(<ObjectMention kind="account" id="acc-1" name="Damaris Industries" />)
    expect(await screen.findByText('Damaris Industries')).toBeInTheDocument()
  })

  it('est un LIEN vers le dossier de l’objet — « ouvrir » est sa seule action', async () => {
    // Une mention qui ne s'ouvre pas est une étiquette. C'est la seule chose qui
    // sépare F1 d'un simple libellé de texte, et c'est ce que quatorze des
    // quinze mentions de compte faisaient déjà — mais chacune à sa façon.
    renderWithRouter(<ObjectMention kind="account" id="acc-1" name="Damaris Industries" />)
    const link = await screen.findByRole('link', { name: /Damaris Industries/ })
    expect(link).toHaveAttribute('href', '/accounts/acc-1')
  })

  it('sait mentionner un contact, avec la même forme et une autre cible', async () => {
    // Le point de la matrice : la FORME est commune, la CIBLE change. Deux
    // composants séparés divergeraient en trois semaines.
    renderWithRouter(<ObjectMention kind="contact" id="ct-9" name="Awa Diallo" />)
    const link = await screen.findByRole('link', { name: /Awa Diallo/ })
    expect(link).toHaveAttribute('href', '/contacts/ct-9')
  })

  it('sait mentionner un talent — le défaut n°1 du dépôt, réparé le 31/08/2026', async () => {
    // `/favorites` hydratait déjà `entity_type: 'talent'` sans qu'aucune
    // mention ne sache l'ouvrir : un chemin d'écriture branché, une lecture
    // manquante.
    renderWithRouter(<ObjectMention kind="talent" id="tal-3" name="Yanis Berthier" />)
    const link = await screen.findByRole('link', { name: /Yanis Berthier/ })
    expect(link).toHaveAttribute('href', '/consultants/tal-3')
  })

  it('nomme l’ACTION dans son nom accessible, pas seulement l’objet', async () => {
    // Sur un écran qui porte huit mentions, un lecteur d'écran annonce huit
    // fois un nom propre sans dire ce qui se passera au clic.
    renderWithRouter(<ObjectMention kind="account" id="acc-1" name="Damaris Industries" />)
    expect(await screen.findByRole('link', { name: 'Ouvrir Damaris Industries' })).toBeInTheDocument()
  })

  it('porte UN attribut, et le rend à côté du nom', async () => {
    renderWithRouter(<ObjectMention kind="account" id="acc-1" name="Damaris Industries" attribute="signal frais" />)
    expect(await screen.findByText('Damaris Industries')).toBeInTheDocument()
    expect(screen.getByText('signal frais')).toBeInTheDocument()
  })

  it('n’invente aucun attribut quand l’appelant n’en a pas', async () => {
    // Le contraire du repli sur zéro : une mention sans attribut rend le nom,
    // point. Elle n'écrit pas « — », qui se lirait comme « mesuré, et vide ».
    const { container } = renderWithRouter(<ObjectMention kind="account" id="acc-1" name="Damaris Industries" />)
    await screen.findByText('Damaris Industries')
    expect(container.textContent).toBe('Damaris Industries')
  })

  it('dit « non mesuré » quand le nom manque — jamais un lien vide', async () => {
    // Un objet peut arriver sans nom (import partiel, source muette). Un lien
    // vide est incliquable au clavier et inaudible ; un nom inventé serait pire.
    renderWithRouter(<ObjectMention kind="account" id="acc-1" name={null} />)
    expect(await screen.findByText('non mesuré')).toBeInTheDocument()
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/accounts/acc-1')
    expect(link.getAttribute('aria-label')).toBeTruthy()
  })

  it('traite un nom vide comme un nom absent', async () => {
    renderWithRouter(<ObjectMention kind="account" id="acc-1" name="   " />)
    expect(await screen.findByText('non mesuré')).toBeInTheDocument()
  })

  it('parle anglais aussi', async () => {
    await i18n.changeLanguage('en')
    renderWithRouter(<ObjectMention kind="account" id="acc-1" name="Damaris Industries" />)
    expect(await screen.findByRole('link', { name: 'Open Damaris Industries' })).toBeInTheDocument()
  })
})

// vu en recette 09/10 (/missions/facturation) : le titre de mission en `nowrap` débordait sur la colonne voisine.
describe('ObjectMention — le nom tient dans sa colonne (`lines`)', () => {
  it('par défaut : une seule ligne tronquée (comportement d avant)', async () => {
    renderWithRouter(<ObjectMention kind="mission" id="m1" name="Programme calculateur de vol" />)
    const name = await screen.findByText('Programme calculateur de vol')
    expect(name.className).toContain('truncate')
    expect(screen.getByRole('link')).not.toHaveAttribute('title')
  })

  it('lines=2 : le nom passe à la ligne (2 lignes max), ne force jamais la colonne, et porte le texte complet en title', async () => {
    renderWithRouter(<ObjectMention kind="mission" id="m1" name="Programme calculateur de vol" lines={2} />)
    const name = await screen.findByText('Programme calculateur de vol')
    expect(name.className).toContain('line-clamp-2')
    expect(name.className).toContain('break-words')
    expect(name.className).not.toMatch(/(^| )truncate( |$)/)
    const link = screen.getByRole('link')
    expect(link.className).toContain('max-w-full')
    expect(link).toHaveAttribute('title', 'Programme calculateur de vol')
  })
})
