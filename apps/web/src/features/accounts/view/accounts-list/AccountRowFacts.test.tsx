import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AccountRowFacts } from './AccountRowFacts'

/**
 * #1417.1 / #1417.7 — CE QUI SE REPLIE, ET CE QUI NE SE REPLIE JAMAIS.
 *
 * Le retour demande de « réduire les textes administratifs » et de faire passer
 * « les informations secondaires en tooltip/drawer ». Il ne demande PAS de
 * dé-qualifier un chiffre : la question posée devant chaque texte retiré du
 * flux est « si je l'enlève, le chiffre à côté reste-t-il VRAI ? ».
 *
 * Ce composant ne replie que des faits ADMINISTRATIFS — le libellé NAF entier,
 * la tranche d'effectif du registre, l'étape du pipe. Aucun d'eux ne qualifie
 * un nombre de la ligne : le score garde sa colonne, la date de dernière
 * analyse et « À rafraîchir » restent dans le flux (c'est
 * `accountRowFoldsOnlyAdministrativeFacts.test.ts` qui le tient).
 *
 * Le patron est celui de `Completeness` (#1866, `/consultants`) : ce qui reste
 * visible est le TEXTE du déclencheur, et le nom accessible du bouton le
 * CONTIENT — jamais un `aria-label` qui le remplacerait, sinon un lecteur
 * d'écran perdrait la phrase qu'on voulait garder.
 */

afterEach(cleanup)

function monter(props: Partial<Parameters<typeof AccountRowFacts>[0]> = {}) {
  return render(
    <AccountRowFacts
      companyName="edf"
      sector="Énergie - production et distribution (NAF 35.11Z) pour l'entité juridique"
      employees="200 à 249"
      commercialStatus="watching"
      {...props}
    />,
  )
}

const NAF_ENTIER = "Énergie - production et distribution (NAF 35.11Z) pour l'entité juridique"

describe('ce qui RESTE dans le flux de la ligne 2', () => {
  it('le secteur LISIBLE, et lui seul — un prétendant à la largeur, plus deux', () => {
    monter()
    const declencheur = screen.getByTestId('account-facts-trigger')
    // `compactSector` coupe au code NAF : c'est ce raccourci qui se lit.
    expect(declencheur.textContent).toContain('Énergie')
    expect(declencheur.textContent).not.toContain('NAF 35.11Z')
    // L'effectif a QUITTÉ le flux : il ne se peint plus à côté du secteur.
    expect(screen.queryByTestId('account-employees')).toBeNull()
  })

  it('#3508 — le libellé entier se lit : il se replie, il n’est jamais coupé, et la cible fait 44 px', () => {
    monter({ sprint: 'focus' })
    const classes = screen.getByTestId('account-facts-trigger').className
    // `truncate` = nowrap + overflow hidden : le préfixe d'effort sortait coupé.
    expect(classes).not.toMatch(/(^|\s)truncate(\s|$)/)
    expect(classes).not.toContain('overflow-hidden')
    expect(classes).toContain('whitespace-normal')
    expect(classes).toContain('min-h-11')
    // `break-words` coupait « partenair/e » : retour à la ligne ENTRE les mots seulement.
    expect(classes).not.toContain('break-words')
    expect(classes).toContain('break-normal')
    expect(classes).toContain('hyphens-none')
  })

  it('#3407 — le préfixe d’effort et le secteur sont UN SEUL enfant du bouton (jamais deux prétendants flex)', () => {
    monter({ sprint: 'partner_route' })
    const declencheur = screen.getByTestId('account-facts-trigger')
    // Le bouton est `inline-flex` : chaque enfant direct y devient un élément flex
    // qui se rétrécit seul. Mesuré en recette prod 02/10 : « Route partenaire »
    // 57×48 px sur 3 lignes. Un seul enfant visible ⇒ un seul bloc de texte.
    const visibles = Array.from(declencheur.childNodes).filter(
      n => !(n instanceof HTMLElement && n.classList.contains('sr-only')) && (n.textContent ?? '').trim() !== '',
    )
    expect(visibles).toHaveLength(1)
    expect(visibles[0].textContent).toMatch(/Énergie/)
  })

  it('#3407 (Y18) — avec un niveau d’effort, la ligne tient sur UNE ligne et le secteur entier reste dans le repli', () => {
    monter({ sprint: 'partner_route' })
    const texte = screen.getByTestId('account-facts-trigger').querySelector('span')!
    // « Route partenaire » mesurait 102 px contre 66-84 px : 3 lignes. Une ligne, comme ses voisines.
    expect(texte.className).toContain('line-clamp-1')
    expect(screen.getByText(/Route partenaire/).className).toContain('whitespace-nowrap')
    fireEvent.click(screen.getByTestId('account-facts-trigger'))
    expect(screen.getAllByText(NAF_ENTIER).length).toBeGreaterThan(0)
  })

  it('sans niveau d’effort, le secteur garde son repli sur plusieurs lignes (#3508)', () => {
    monter()
    expect(screen.getByTestId('account-facts-trigger').querySelector('span')!.className).not.toContain('line-clamp')
  })

  it('sans secteur, la ligne garde un ancrage : l’étape du pipe', () => {
    monter({ sector: null })
    expect(screen.getByTestId('account-facts-trigger').textContent).toContain('En observation')
  })

  it('le déclencheur est un vrai bouton, donc il se tabule (GA-35)', () => {
    monter()
    const declencheur = screen.getByTestId('account-facts-trigger')
    expect(declencheur.tagName).toBe('BUTTON')
    expect(declencheur.getAttribute('type')).toBe('button')
  })

  it('le nom accessible CONTIENT le texte visible, il ne le remplace pas (patron #1866)', () => {
    monter()
    const declencheur = screen.getByTestId('account-facts-trigger')
    // Pas d'`aria-label` : il écraserait la phrase visible.
    expect(declencheur.getAttribute('aria-label')).toBeNull()
    // Le nom accessible = le texte visible PLUS l'indice, et il nomme le compte
    // — vingt-cinq « Détail du compte » identiques ne se distinguent pas.
    expect(declencheur.textContent).toContain('Énergie')
    expect(declencheur.textContent).toMatch(/Edf/)
  })

  it('la donnée ne se range plus dans un `title=` : elle a une porte qui s’ouvre', () => {
    monter()
    // « la donnée rangée dans un attribut title » — un `title` n'existe ni au
    // clavier ni au doigt. Le libellé entier vit derrière le bouton.
    expect(screen.getByTestId('account-facts-trigger').getAttribute('title')).toBeNull()
  })
})

describe('ce qui se REPLIE reste atteignable, et nommé', () => {
  function ouvrir(props: Partial<Parameters<typeof AccountRowFacts>[0]> = {}) {
    monter(props)
    fireEvent.click(screen.getByTestId('account-facts-trigger'))
  }

  it('l’effectif est là, avec son intitulé — replié, pas supprimé', () => {
    ouvrir()
    expect(screen.getByText('Effectif')).toBeTruthy()
    expect(screen.getByText('200 à 249')).toBeTruthy()
  })

  it('le libellé NAF ENTIER est là quand il dit plus que le secteur lisible', () => {
    ouvrir()
    expect(screen.getByText('Secteur')).toBeTruthy()
    expect(screen.getByText(NAF_ENTIER)).toBeTruthy()
  })

  it('il ne se répète PAS quand il dit déjà exactement le texte visible', () => {
    // Loi 4 du tome 7 : rien n'apparaît deux fois sous la même forme avec le
    // même contenu. Un secteur déjà court n'a pas de « version longue ».
    ouvrir({ sector: 'Banque' })
    expect(screen.queryByText('Secteur')).toBeNull()
    expect(screen.getAllByText('Banque')).toHaveLength(1)
  })

  it('l’étape du pipe est là, avec son intitulé — elle a quitté sa colonne, pas l’écran', () => {
    ouvrir()
    expect(screen.getByText('Statut commercial')).toBeTruthy()
    expect(screen.getByText('En observation')).toBeTruthy()
  })

  it('un compte sans étape enregistrée retombe sur « À trier », jamais sur un vide', () => {
    ouvrir({ commercialStatus: undefined })
    expect(screen.getByText('À trier')).toBeTruthy()
  })
})

describe('ce que le repli n’invente JAMAIS', () => {
  it('un effectif absent ne rend RIEN : ni « 0 », ni « — », ni « non renseigné »', () => {
    monter({ employees: null })
    fireEvent.click(screen.getByTestId('account-facts-trigger'))
    expect(screen.queryByText('Effectif')).toBeNull()
    const texte = document.body.textContent ?? ''
    expect(texte).not.toMatch(/Effectif/)
    expect(texte).not.toMatch(/\b0\b/)
    // Contrôle positif : sans lui, un popover vide ferait passer les deux refus.
    expect(texte).toContain('En observation')
  })

  it('un effectif réduit à des blancs est ABSENT, pas une chaîne vide affichée', () => {
    monter({ employees: '   ' })
    fireEvent.click(screen.getByTestId('account-facts-trigger'))
    expect(screen.queryByText('Effectif')).toBeNull()
  })

  it('aucun secteur ⇒ aucune ligne « Secteur » inventée dans le repli', () => {
    monter({ sector: null })
    fireEvent.click(screen.getByTestId('account-facts-trigger'))
    expect(screen.queryByText('Secteur')).toBeNull()
    // L'effectif, lui, est toujours là : l'absence de l'un ne cache pas l'autre.
    expect(screen.getByText('200 à 249')).toBeTruthy()
  })
})

// #3407 (recette 03/10) — le niveau d'effort et le responsable se LISENT avec leur libellé.
describe('#3407 — « Effort » et « Responsable » nommés dans la ligne', () => {
  it('nomme l’effort et le responsable dans le texte du déclencheur', () => {
    monter({ sprint: 'focus', ownerName: 'Toi' })
    const texte = screen.getByTestId('account-facts-trigger').textContent ?? ''
    expect(texte).toContain('Effort : Priorité forte')
    expect(texte).toContain('Responsable : Toi')
  })

  it('le responsable se lit aussi dans le repli, sans effort', () => {
    monter({ ownerName: 'Maëlle Lorquin' })
    fireEvent.click(screen.getByTestId('account-facts-trigger'))
    expect(screen.getByText('Maëlle Lorquin')).toBeTruthy()
  })

  it('sans responsable ni effort, aucun libellé (jamais deviné)', () => {
    monter()
    const texte = screen.getByTestId('account-facts-trigger').textContent ?? ''
    expect(texte).not.toContain('Responsable')
    expect(texte).not.toContain('Effort')
  })
})

describe('#4497.a — la ville du compte se lit dans le flux de la ligne 2', () => {
  it('« secteur · ville », la ville tirée du siège du registre', () => {
    monter({ sector: 'Aéronautique', headquarters: '2 rond-point Émile Dewoitine, 31700 Blagnac' })
    expect(screen.getByTestId('account-facts-trigger').textContent).toContain('Aéronautique · Blagnac')
  })

  it('sans siège lisible, aucun texte de ville : ni « · » orphelin, ni « - »', () => {
    monter({ sector: 'Aéronautique', headquarters: null })
    const texte = screen.getByTestId('account-facts-trigger').textContent ?? ''
    expect(texte).toContain('Aéronautique')
    expect(texte).not.toContain('·')
    expect(texte).not.toContain(' - ')
  })

  it('un siège sans ville (un code postal seul) ne fait pas de ligne non plus', () => {
    monter({ sector: 'Aéronautique', headquarters: '31700' })
    expect(screen.getByTestId('account-facts-trigger').textContent).not.toContain('31700')
  })
})
