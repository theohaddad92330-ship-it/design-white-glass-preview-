import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { EntitiesGraphCard } from './EntitiesGraphCard'

const navigate = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))

beforeEach(() => navigate.mockClear())

/**
 * Mesuré en production le 27/08/2026 : FRANCE TELEVISIONS affiche **63 sites**
 * dans la liste du haut et ses 5 entités affichaient toutes `0` ; LVMH affiche
 * 1 site et ses 3 entités affichaient `0`. « France.tv a 0 site » est faux.
 *
 * Les régions relevées sur ce compte en production sont reprises telles quelles
 * ci-dessous — « France », « Paris », « Paris, siège » — parce que c'est
 * exactement ce que le modèle écrit dans un champ dont la consigne dit « zone
 * geo », et c'est ce qui ne recoupera JAMAIS l'« Île-de-France » que nous
 * dérivons d'un code postal.
 */
const PRODUCTION_ENTITIES = [
  { name: 'France Télévisions (holding/société mère)', type: 'groupe', region: 'France' },
  { name: 'France.tv (plateforme numérique / streaming)', type: 'BU', region: 'France' },
  { name: 'FranceTV Publicité', type: 'filiale', region: 'Paris' },
  { name: 'DTSI - Direction Technique', type: 'direction', region: 'Paris, siège' },
]

/** Les sites tels que la carte les reçoit : une ville, jamais une région. */
const PRODUCTION_SITES = [{ city: 'PARIS', type: 'siège' }, { city: 'LYON' }, { city: 'RENNES' }]

function renderCard(entities: unknown, sites: unknown) {
  return render(
    <EntitiesGraphCard entities={entities} rootName="FRANCE TELEVISIONS" sites={sites} siteCategoryFilter="all" />,
  )
}

describe('EntitiesGraphCard — « 0 site » était faux, pas mesuré', () => {
  it('n’écrit jamais 0 pour une entité qu’on ne sait pas placer', () => {
    renderCard(PRODUCTION_ENTITIES, PRODUCTION_SITES)

    const rows = screen.getAllByRole('row').slice(1) // hors l'en-tête
    expect(rows.length).toBe(PRODUCTION_ENTITIES.length)
    for (const row of rows) {
      expect(within(row).queryByText('0')).not.toBeInTheDocument()
    }
    // #2966 — la colonne « Potentiel » (#2119.47) est elle aussi « non mesuré »
    // ici : aucun de ces comptes n'a de `priorityPerimeters` (prop absente dans
    // ce test). Deux attributs non mesurés par ligne — sites ET potentiel —
    // jamais un « 0 » pour aucun des deux.
    expect(screen.getAllByText(/non mesuré/i).length).toBe(PRODUCTION_ENTITIES.length * 2)
  })

  it('compte pour de vrai quand la région de l’entité est celle d’un site connu', () => {
    renderCard([{ name: 'Pôle Île-de-France', type: 'BU', region: 'Île-de-France' }], PRODUCTION_SITES)

    const row = screen.getAllByRole('row')[1]
    // PARIS → Île-de-France (dérivé de la ville par `siteGeo`).
    expect(within(row).getByText('1')).toBeInTheDocument()
  })

  it('une entité qu’on sait placer AILLEURS est écartée, pas comptée zéro', () => {
    // RENNES est en Bretagne, PARIS en Île-de-France : les deux régions sont
    // dans le vocabulaire des sites. Sur l'onglet « Sièges », le pôle Bretagne
    // n'a pas sa place — l'écarter est une mesure, l'afficher « 0 site » n'en
    // serait pas une, puisque le compte a bien un site en Bretagne.
    render(
      <EntitiesGraphCard
        entities={[
          { name: 'Pôle Bretagne', type: 'BU', region: 'Bretagne' },
          { name: 'Pôle Île-de-France', type: 'BU', region: 'Île-de-France' },
        ]}
        rootName="ACME"
        sites={[
          { city: 'PARIS', type: 'siège' },
          { city: 'RENNES', type: 'établissement' },
        ]}
        siteCategoryFilter="headquarters"
      />,
    )

    expect(screen.queryByText('Pôle Bretagne')).not.toBeInTheDocument()
    const row = screen.getAllByRole('row')[1]
    expect(within(row).getByText('Pôle Île-de-France')).toBeInTheDocument()
    expect(within(row).getByText('1')).toBeInTheDocument()
  })

  it('dit ce que la colonne mesure, plutôt que « nombre de sites »', () => {
    renderCard(PRODUCTION_ENTITIES, PRODUCTION_SITES)

    expect(screen.getByText(/Sites dans sa région/i)).toBeInTheDocument()
    expect(screen.queryByText(/Nombre de sites/i)).not.toBeInTheDocument()
    // …et la raison est écrite, sinon « non mesuré » se lit comme une panne.
    expect(screen.getByText(/n'est pas collecté/i)).toBeInTheDocument()
  })

  it('ne conclut pas « aucune entité » d’une entité qu’il ne sait pas placer', () => {
    // L'onglet « Sièges » vidait la carte : les régions en prose ne recoupaient
    // rien, et l'écran l'affirmait comme un fait.
    render(
      <EntitiesGraphCard
        entities={PRODUCTION_ENTITIES}
        rootName="FRANCE TELEVISIONS"
        sites={PRODUCTION_SITES}
        siteCategoryFilter="headquarters"
      />,
    )

    expect(screen.getAllByRole('row').slice(1).length).toBe(PRODUCTION_ENTITIES.length)
  })
})

/**
 * #1181 — « dois-je lancer une nouvelle analyse si je veux creuser une filiale
 * spécifique, par exemple SAFRAN SEATS ? »
 *
 * La réponse est oui, et la capacité existait déjà : `/search` accepte une
 * société pré-remplie, et le périmètre d'analyse connaît `filiales` depuis
 * `analysisScopeModeSchema`. Ce qui manquait n'était pas le moteur, c'était la
 * PORTE : la ligne d'entité était un `<TableRow>` sans `onClick`, sans `Link`,
 * sans bouton — « Safran Seats » était du texte mort. La question du bêta-testeur
 * est donc littéralement le défaut : du code juste que personne n'appelle.
 *
 * Ces tests tiennent la porte ouverte. Ils échouent si la ligne redevient inerte,
 * si elle cesse de dire ce qu'elle fait, ou si le nom de l'entité n'arrive plus
 * jusqu'à l'écran de recherche.
 */
describe('EntitiesGraphCard — creuser une entité sans la retaper (#1181)', () => {
  const named = (name: string) => (accessibleName: string) => accessibleName.includes(name)

  it('chaque entité offre de lancer SON analyse, et le dit', () => {
    renderCard(PRODUCTION_ENTITIES, PRODUCTION_SITES)

    for (const entity of PRODUCTION_ENTITIES) {
      // Le nom accessible porte le VERBE : « Safran Seats, bouton » ne dit pas ce
      // qui va se passer. Il contient aussi le nom VISIBLE — sans quoi une
      // commande vocale prononçant l'étiquette lue à l'écran ne l'atteindrait pas.
      const button = screen.getByRole('button', { name: named(entity.name) })
      expect(button.tagName).toBe('BUTTON')
      expect(button.getAttribute('aria-label')).toMatch(/analyser/i)
    }
  })

  it('ouvre la recherche pré-remplie avec le nom de l’entité', () => {
    renderCard([{ name: 'Safran Seats', type: 'filiale', region: 'France' }], PRODUCTION_SITES)

    fireEvent.click(screen.getByRole('button', { name: named('Safran Seats') }))

    // Le même geste que les quatre autres portes du dépôt vers une analyse —
    // aucun contrat inventé pour l'occasion.
    expect(navigate).toHaveBeenCalledWith({ to: '/search', search: { company: 'Safran Seats' } })
  })

  it('n’ouvre rien tant qu’on ne clique pas', () => {
    renderCard(PRODUCTION_ENTITIES, PRODUCTION_SITES)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('propose aussi les entités NON actionnables — les creuser reste un choix', () => {
    // SPV, cédées et homonymes vivent dans l'onglet secondaire. « Non actionnable »
    // veut dire « pas une cible par défaut », pas « interdit d'aller voir ».
    render(
      <EntitiesGraphCard
        entities={[{ name: 'Ex-Filiale Cédée', type: 'cedee', region: 'France', actionable: false }]}
        rootName="ACME"
        sites={PRODUCTION_SITES}
        siteCategoryFilter="all"
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: /autres entités/i }))
    fireEvent.click(screen.getByRole('button', { name: named('Ex-Filiale Cédée') }))

    expect(navigate).toHaveBeenCalledWith({ to: '/search', search: { company: 'Ex-Filiale Cédée' } })
  })
})

/**
 * #2966 (#2119.43-51) — LA CARTE DE PÉRIMÈTRE À NEUF ATTRIBUTS.
 *
 * Les neuf : pays/ville, rôle, source, confiance, potentiel, accessibilité,
 * signaux, contacts, actions. Les cinq premiers (rôle/confiance/potentiel/
 * accessibilité/signaux) viennent de `raw_analysis.priority_perimeters`, déjà
 * calculé par `apps/ia/app/services/perimeter_score.py` et jamais lu côté web
 * avant ce lot (registre du dépôt : « du code juste, calculé, testé, que
 * personne n'appelle »).
 */
describe('EntitiesGraphCard — la carte de périmètre à neuf attributs (#2966, #2119.43-51)', () => {
  const priorityPerimeters = [
    {
      name: 'France Télévisions',
      tier: 'P1' as const,
      confidence: 'high' as const,
      entryRole: 'opérationnel / prescripteur (bottom-up)',
      accessibility: 'high' as const,
      signalsCount: 2,
    },
  ]

  it('affiche pays/ville, potentiel et — repliés par défaut — rôle/source/confiance/accessibilité/signaux/contacts', () => {
    render(
      <EntitiesGraphCard
        entities={[{ name: 'France Télévisions', type: 'groupe', region: 'Paris' }]}
        rootName="FRANCE TELEVISIONS"
        sites={[]}
        siteCategoryFilter="all"
        priorityPerimeters={priorityPerimeters}
      />,
    )

    // Pays/ville et potentiel sont visibles d'emblée.
    expect(screen.getByText('Paris')).toBeInTheDocument()
    expect(screen.getByText(/Prioritaire \(P1\)/)).toBeInTheDocument()
    expect(screen.queryByText(/opérationnel \/ prescripteur/)).not.toBeInTheDocument()

    // Les six autres attendent le geste « Détails ».
    fireEvent.click(screen.getByRole('button', { name: /détails/i }))
    expect(screen.getByText(/opérationnel \/ prescripteur/)).toBeInTheDocument()
    expect(screen.getByText(/^Analyse /)).toBeInTheDocument()
    // Confiance ET accessibilité valent toutes deux « Élevée » sur ce signal.
    expect(screen.getAllByText('Élevée').length).toBe(2)
    expect(screen.getByText('2')).toBeInTheDocument() // signaux
    expect(screen.getAllByText(/non mesuré/i).length).toBeGreaterThan(0) // contacts : structurellement non mesuré
  })

  it('nomme la source légale distinctement de l’analyse BellumAI — jamais le nom d’un fournisseur', () => {
    render(
      <EntitiesGraphCard
        entities={null}
        subsidiaries={[{ legal_name: 'Boursorama', type: 'filiale' }]}
        rootName="Groupe X"
        sites={[]}
        siteCategoryFilter="all"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /détails/i }))
    expect(screen.getByText('Registre légal')).toBeInTheDocument()
    expect(screen.queryByText(/pappers/i)).not.toBeInTheDocument()
  })

  // #4327.2 — une filiale nommée par le web, sans SIREN, est ÉTIQUETÉE « non confirmée », jamais omise ni passée pour le registre.
  it('étiquette « non confirmée » une filiale du web sans SIREN', () => {
    render(
      <EntitiesGraphCard
        entities={null}
        subsidiaries={[{ name: 'Filiale Web', type: 'filiale', source: 'web', siren: null }]}
        rootName="Groupe X"
        sites={[]}
        siteCategoryFilter="all"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /détails/i }))
    expect(screen.getByText('Filiale Web')).toBeInTheDocument()
    expect(screen.getAllByText(/non confirmée/i).length).toBeGreaterThan(0)
    expect(screen.queryByText('Registre légal')).not.toBeInTheDocument()
  })

  // #4327.2 — le badge de TYPE de la ligne dit « Filiale non confirmée » quand le lien n'est pas celui du registre.
  it('badge « Filiale non confirmée » pour une filiale du web, « Filiale » pour le registre', () => {
    render(
      <EntitiesGraphCard
        entities={null}
        subsidiaries={[
          { name: 'Fortuneo', type: 'filiale', source: 'web', siren: null },
          { name: 'Boursorama', type: 'filiale', source: 'web', siren: '123456789' },
        ]}
        rootName="Groupe X"
        sites={[]}
        siteCategoryFilter="all"
      />,
    )
    expect(screen.getByText('Filiale non confirmée')).toBeInTheDocument()
    expect(screen.getAllByText('Filiale')).toHaveLength(1)
  })

  // #4327.2 (recette prod 25/10, JCDecaux) — l'étiquette ne vit plus derrière « Détails » : elle est sur la LIGNE,
  // et le nombre de filiales à confirmer est dit une fois, même quand aucune entité n'est classée « autre ».
  it('#4327.2 — la ligne d’une filiale du web sans SIREN porte « À confirmer » sans ouvrir les détails', () => {
    render(
      <EntitiesGraphCard
        entities={null}
        subsidiaries={[
          { name: 'Filiale Web', type: 'filiale', source: 'web', siren: null },
          { legal_name: 'Filiale Registre', type: 'filiale', siren: '123456789' },
        ]}
        rootName="Groupe X"
        sites={[]}
        siteCategoryFilter="all"
      />,
    )
    const row = screen.getByText('Filiale Web').closest('tr') as HTMLElement
    expect(within(row).getByText('À confirmer')).toBeInTheDocument()
    const registryRow = screen.getByText('Filiale Registre').closest('tr') as HTMLElement
    expect(within(registryRow).queryByText('À confirmer')).not.toBeInTheDocument()
    expect(screen.getByTestId('entities-unconfirmed')).toHaveTextContent('1 à confirmer')
  })

  it('#4327.2 — aucune filiale à confirmer : la note n’apparaît pas', () => {
    render(
      <EntitiesGraphCard
        entities={null}
        subsidiaries={[{ legal_name: 'Boursorama', type: 'filiale', siren: '123456789' }]}
        rootName="Groupe X"
        sites={[]}
        siteCategoryFilter="all"
      />,
    )
    expect(screen.queryByTestId('entities-unconfirmed')).not.toBeInTheDocument()
  })

  it('ne dit rien de « non confirmée » pour une filiale qui porte un SIREN', () => {
    render(
      <EntitiesGraphCard
        entities={null}
        subsidiaries={[{ legal_name: 'Boursorama', type: 'filiale', source: 'web', siren: '123456789' }]}
        rootName="Groupe X"
        sites={[]}
        siteCategoryFilter="all"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /détails/i }))
    expect(screen.queryByText(/non confirmée/i)).not.toBeInTheDocument()
    expect(screen.getByText('Registre légal')).toBeInTheDocument()
  })

  it('distingue périmètre commercial / implantation / équipe sur la ligne', () => {
    render(
      <EntitiesGraphCard
        entities={[
          { name: 'DSI Groupe', type: 'BU', region: 'Paris' },
          { name: 'EDF Saclay', type: 'site', region: 'Saclay' },
        ]}
        rootName="EDF"
        sites={[]}
        siteCategoryFilter="all"
      />,
    )
    expect(screen.getByText('Périmètre commercial')).toBeInTheDocument()
    expect(screen.getByText('Implantation')).toBeInTheDocument()
  })

  it('un périmètre sans correspondance dans `priorityPerimeters` reste « non mesuré », jamais une valeur devinée', () => {
    render(
      <EntitiesGraphCard
        entities={[{ name: 'Filiale sans rapport', type: 'filiale', region: 'Lyon' }]}
        rootName="ACME"
        sites={[]}
        siteCategoryFilter="all"
        priorityPerimeters={priorityPerimeters}
      />,
    )
    expect(screen.getAllByText(/non mesuré/i).length).toBeGreaterThan(0)
  })
})

/**
 * #2966 (#2119.52) — « CHOISIR CE PÉRIMÈTRE COMME CIBLE ».
 */
describe('EntitiesGraphCard — choisir un périmètre comme cible (#2966, #2119.52)', () => {
  it('propose le bouton, et le remplace par « retirer » sur la cible active', () => {
    const onChooseTarget = vi.fn()
    const onClearTarget = vi.fn()
    render(
      <EntitiesGraphCard
        entities={[{ name: 'DSI Groupe', type: 'BU', region: 'Paris' }]}
        rootName="ACME"
        sites={[]}
        siteCategoryFilter="all"
        onChooseTarget={onChooseTarget}
        onClearTarget={onClearTarget}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /choisir ce périmètre comme cible/i }))
    expect(onChooseTarget).toHaveBeenCalledWith('DSI Groupe')
  })

  it('marque la cible active et permet de la retirer', () => {
    const onClearTarget = vi.fn()
    render(
      <EntitiesGraphCard
        entities={[{ name: 'DSI Groupe', type: 'BU', region: 'Paris' }]}
        rootName="ACME"
        sites={[]}
        siteCategoryFilter="all"
        targetPerimeter="DSI Groupe"
        onChooseTarget={vi.fn()}
        onClearTarget={onClearTarget}
      />,
    )

    expect(screen.getByText('Cible actuelle')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /retirer la cible/i }))
    expect(onClearTarget).toHaveBeenCalled()
  })

  it('sans callback, aucun bouton de cible ne se rend — composant utilisable hors contexte de route', () => {
    renderCard([{ name: 'DSI Groupe', type: 'BU', region: 'Paris' }], [])
    expect(screen.queryByRole('button', { name: /choisir ce périmètre comme cible/i })).not.toBeInTheDocument()
  })
})

// CEDRIC-FIX C.6 — « Safran › Voir toutes les entités » : 14 boutons « Analyser … », aucune SAFRAN SEATS
// (filiale connue, demandée nommément). La liste vient de la recherche (jamais plafonnée côté écran) : une
// filiale que la source ne rend pas se TAPE depuis le bloc, et pré-remplit /search comme les autres boutons.
describe('EntitiesGraphCard — une entité absente de la liste se tape', () => {
  it('pré-remplit /search avec le nom saisi', () => {
    renderCard(PRODUCTION_ENTITIES, PRODUCTION_SITES)

    fireEvent.change(screen.getByRole('textbox', { name: /autre entité à analyser/i }), {
      target: { value: '  SAFRAN SEATS  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^analyser cette entité$/i }))

    expect(navigate).toHaveBeenCalledWith({ to: '/search', search: { company: 'SAFRAN SEATS' } })
  })

  it('SAIT DIRE NON — un champ vide ne lance rien', () => {
    renderCard(PRODUCTION_ENTITIES, PRODUCTION_SITES)

    const button = screen.getByRole('button', { name: /^analyser cette entité$/i })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(navigate).not.toHaveBeenCalled()
  })
})

// #4612.3 — « 5 sur 12 affichées » collé au bouton « Voir toutes les entités », lisible SANS aucun clic : le compteur
// était juste mais « le geste est peu visible » (5 lignes sous un « 13 », deux gestes pour tout voir).
describe('EntitiesGraphCard — « 5 sur N affichées » sans aucun clic (#4612.3)', () => {
  const many = Array.from({ length: 12 }, (_, index) => ({
    name: `Filiale ${index + 1}`,
    type: 'filiale',
    region: 'Paris',
  }))

  it('dit « 5 sur 12 affichées » à côté de « Voir toutes les entités », N = le nombre réel de lignes', () => {
    renderCard(many, PRODUCTION_SITES)
    const showAll = screen.getByRole('button', { name: /voir toutes les entités/i })
    const sentence = screen.getByTestId('entities-shown-count')
    expect(sentence).toHaveTextContent('5 sur 12 affichées')
    expect(screen.getAllByRole('row').slice(1)).toHaveLength(5)
    // Collée au bouton : même bande, sans déplier.
    expect(showAll.parentElement).toContainElement(sentence)
  })

  it('une fois tout affiché, la phrase ne dit plus « 5 sur » : toutes sont affichées', () => {
    renderCard(many, PRODUCTION_SITES)
    fireEvent.click(screen.getByRole('button', { name: /voir toutes les entités/i }))
    expect(screen.getByTestId('entities-shown-count')).toHaveTextContent('12 affichées')
    expect(screen.getByTestId('entities-shown-count')).not.toHaveTextContent(/sur/)
  })

  it('SAIT DIRE NON — jusqu’à 5 entités, aucune phrase (rien n’est caché), et jamais « 0 »', () => {
    renderCard(many.slice(0, 5), PRODUCTION_SITES)
    expect(screen.queryByTestId('entities-shown-count')).not.toBeInTheDocument()
    expect(screen.queryByText(/\b0 sur\b|sur 0\b/)).not.toBeInTheDocument()
  })
})
