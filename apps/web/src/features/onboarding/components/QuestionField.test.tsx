import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { findCatalogueSubStep, type Question } from '@/features/onboarding/lib/questions'
import { QuestionField } from './QuestionField'

/**
 * #2024.4 — « les sélections longues utilisent : recherche ; groupes ;
 * recommandations ; favoris ».
 *
 * La recherche et les groupes étaient déjà là. Ce qui manquait, et que le geste
 * révèle : sur les 21 expertises, on en coche cinq, puis on tape « cloud » dans
 * la recherche — et les cinq cases cochées DISPARAISSENT de l'écran, parce que
 * le filtre les exclut. L'utilisateur ne peut plus savoir ce qu'il a répondu
 * sans effacer sa recherche et redescendre la liste.
 *
 * La réponse : ce qui est choisi reste ÉPINGLÉ en tête de la liste, avec un
 * geste pour le retirer. C'est la lecture « favoris » que ce questionnaire peut
 * tenir seul ; un favori PERSISTÉ d'une session à l'autre n'en a pas le cycle
 * de vie (le questionnaire se remplit une fois) — il reste à trancher.
 *
 * ⚠️ L'ordre de la liste ne bouge PAS : remonter la ligne qu'on vient de
 * cliquer déplacerait la cible sous le doigt de l'utilisateur au clic suivant.
 */

const LONG = findCatalogueSubStep('offer_expertise', 'domaines')?.questions[0] as Question
// Théo O onboarding-couverture (22/10) — `target_company_types` passe à 9 choix (V23) : la liste COURTE du test est
// désormais `remote_and_travel_scope` (6 choix), la même sous-étape.
const SHORT = findCatalogueSubStep('target_market', 'cibles')?.questions.find(
  question => question.key === 'remote_and_travel_scope',
) as Question
// La V23 retire le plafond de sélection du catalogue ; le mécanisme (compteur, alerte) reste gardé pour toute question
// qui déclare un `max` (profil progressif) — on le prouve sur la même question, plafonnée à 5 pour le test.
const LONG_CAPPED = { ...LONG, max: 5 } as Question
// #2088.2/.3 — `positioning` (5 choix) et `main_sales_pain` (9 choix, et une
// `rationaleKey` réelle pour #2088.28) sont les deux questions `single` du
// corpus qui encadrent le seuil `SEARCH_THRESHOLD` (8).
const SHORT_SINGLE = findCatalogueSubStep('offer_expertise', 'positionnement')?.questions[0] as Question
const LONG_SINGLE = findCatalogueSubStep('target_market', 'frein')?.questions[0] as Question
// #2088.26 — `company_locations` (implantation) : la question RÉELLE qui
// prouve que les régions ont, désormais, un catalogue groupé — mesurée sans
// AUCUN catalogue avant ce lot (`kind: 'tags'` seul).
const COMPANY_LOCATIONS = findCatalogueSubStep('company_info', 'implantation')?.questions[0] as Question

const onChange = vi.fn()

beforeEach(() => {
  onChange.mockReset()
})

async function render(question: Question, value: string | string[]): Promise<void> {
  renderWithRouter(
    <>
      <QuestionField question={question} value={value} onChange={onChange} />
      <div data-testid="sentinel" />
    </>,
  )
  // Le harnais de router monte de façon ASYNCHRONE.
  await screen.findByTestId('sentinel')
}

describe('#2024.4 — les choix cochés restent visibles', () => {
  it('épingle les choix cochés AU-DESSUS de la recherche', async () => {
    await render(LONG, ['Data & Intelligence Artificielle', 'RH & SIRH'])
    const pinned = screen.getByRole('list', { name: 'Ta sélection' })
    const search = screen.getByPlaceholderText('Rechercher…')
    // #2088.9 — chaque puce épinglée porte aussi ses boutons « Monter »/
    // « Descendre » : on compte les puces elles-mêmes (préfixe « Retirer »),
    // pas TOUS les boutons de l'épingle.
    expect(within(pinned).getAllByRole('button', { name: /^Retirer / })).toHaveLength(2)
    // DOCUMENT_POSITION_FOLLOWING = 4 : la recherche vient APRÈS l'épingle.
    expect(pinned.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('reste visible quand la recherche masque les lignes cochées', async () => {
    await render(LONG, ['RH & SIRH'])
    fireEvent.change(screen.getByPlaceholderText('Rechercher…'), { target: { value: 'cloud' } })
    const pinned = screen.getByRole('list', { name: 'Ta sélection' })
    expect(within(pinned).getByRole('button', { name: /RH & SIRH/ })).toBeInTheDocument()
  })

  it('décoche depuis l’épingle, sans toucher aux autres', async () => {
    await render(LONG, ['Data & Intelligence Artificielle', 'RH & SIRH'])
    const pinned = screen.getByRole('list', { name: 'Ta sélection' })
    // #2088.9 — deux éléments épinglés font aussi apparaître des boutons
    // « Monter »/« Descendre {{label}} » : le nom exact du bouton RETIRER
    // (préfixé « Retirer ») distingue le bon geste des deux nouveaux.
    fireEvent.click(within(pinned).getByRole('button', { name: 'Retirer Data & Intelligence Artificielle' }))
    expect(onChange).toHaveBeenCalledWith(['RH & SIRH'])
  })

  it("n'épingle rien quand rien n'est coché — jamais un bloc vide", async () => {
    await render(LONG, [])
    expect(screen.queryByRole('list', { name: 'Ta sélection' })).toBeNull()
  })

  it("n'épingle rien sur une liste COURTE : tout y est déjà visible", async () => {
    await render(SHORT, ['Sur site uniquement'])
    expect(screen.queryByPlaceholderText('Rechercher…')).toBeNull()
    expect(screen.queryByRole('list', { name: 'Ta sélection' })).toBeNull()
  })
})

/**
 * #2088.1/.2/.3 — « Ne pas utiliser la même liste verticale partout ». Un
 * choix unique COURT (≤ `SEARCH_THRESHOLD`) se lit en grille de cartes ; un
 * choix unique LONG passe en liste recherchable — le même seuil qui gouverne
 * déjà la recherche `multi` (un seul réglage, GA-26), pas un second chiffre
 * inventé pour l'occasion.
 */
describe('#2088.2/.3 — single : grille COURTE, liste recherchable LONGUE', () => {
  it('une question single COURTE (5 choix) se rend en grille de cartes, sans recherche', async () => {
    await render(SHORT_SINGLE, '')
    expect(screen.queryByPlaceholderText('Rechercher…')).toBeNull()
    // Les 5 choix sont des boutons `layout="card"` : chacun porte sa propre
    // coche potentielle (`choice-row-check`), pas un `<ul role="list">`.
    expect(screen.getAllByRole('button')).toHaveLength(5)
  })

  it('choisir une carte appelle onChange avec sa valeur', async () => {
    await render(SHORT_SINGLE, '')
    fireEvent.click(screen.getByRole('button', { name: /Expertise de niche/ }))
    expect(onChange).toHaveBeenCalledWith('Expertise de niche - spécialisé sur 1-2 domaines pointus')
  })

  it('une question single LONGUE (9 choix) affiche un champ de recherche', async () => {
    await render(LONG_SINGLE, '')
    expect(screen.getByPlaceholderText('Rechercher…')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /./ }).length).toBeGreaterThanOrEqual(9)
  })

  it('la recherche filtre les choix de la liste LONGUE', async () => {
    await render(LONG_SINGLE, '')
    fireEvent.change(screen.getByPlaceholderText('Rechercher…'), { target: { value: 'signatures' } })
    expect(screen.getByRole('button', { name: /Convertir mes RDV en signatures/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Trouver les bons comptes/ })).toBeNull()
  })
})

/**
 * #2088.28 — bouton discret « Pourquoi cette question ? », absent quand la
 * question n'a pas de `rationaleKey` (jamais un texte inventé), présent et
 * dépliable quand elle en a une.
 */
describe('#2088.28 — « Pourquoi cette question ? »', () => {
  it("n'affiche rien pour une question sans rationaleKey", async () => {
    await render(SHORT_SINGLE, '')
    expect(screen.queryByRole('button', { name: /Pourquoi cette question/ })).toBeNull()
  })

  it('affiche le bouton et déplie le texte au clic pour une question qui en porte une', async () => {
    await render(LONG_SINGLE, '')
    const button = screen.getByRole('button', { name: 'Pourquoi cette question ?' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/On s'en sert pour choisir le plan d'action/)).toBeNull()

    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/On s'en sert pour choisir le plan d'action/)).toBeInTheDocument()
  })
})

/**
 * #2088.9 — « Multi : ordre de priorité ». Le choix coché en premier reste en
 * tête, mais l'utilisateur doit pouvoir le corriger APRÈS coup — un ordre
 * qu'on ne peut ajuster qu'en décochant-recochant n'est pas un ordre de
 * priorité, c'est un historique de clics.
 */
/**
 * R15N-10 — mesuré en production : cinq domaines cochés + un mot dans le champ
 * libre « Autre (préciser) » donnaient un compteur « 6/5 sélectionnés », mais
 * « Ta sélection » n'affichait que les cinq catalogués — le texte libre, lui,
 * n'y figurait pas. Ce qu'il fallait retirer n'était pas dans la liste
 * regardée, le bouton « Continuer » se désactivait sans un mot d'explication,
 * et le compteur en dépassement restait en gris neutre, sans alerte.
 */
describe('R15N-10 — le texte libre « Autre » compte dans le plafond ET entre dans la sélection', () => {
  const FIVE_CATALOG = [
    'Data & Intelligence Artificielle',
    'RH & SIRH',
    'Cybersécurité & Conformité',
    'DevOps, SRE & Automatisation',
    'SAP & ERP (S/4HANA, Oracle, Sage)',
  ]

  it('le texte libre apparaît dans « Ta sélection », à côté des choix catalogués', async () => {
    await render(LONG_CAPPED, [...FIVE_CATALOG, 'un mot libre'])
    const pinned = screen.getByRole('list', { name: 'Ta sélection' })
    expect(within(pinned).getByRole('button', { name: /un mot libre/ })).toBeInTheDocument()
  })

  it('retirer l’entrée libre depuis « Ta sélection » vide le champ « Autre », sans toucher au catalogue', async () => {
    await render(LONG_CAPPED, ['RH & SIRH', 'un mot libre'])
    const pinned = screen.getByRole('list', { name: 'Ta sélection' })
    fireEvent.click(within(pinned).getByRole('button', { name: 'Retirer un mot libre' }))
    expect(onChange).toHaveBeenCalledWith(['RH & SIRH'])
  })

  it('le compteur en dépassement porte `role="alert"`, le token sémantique d’erreur, et dit quoi retirer', async () => {
    await render(LONG_CAPPED, [...FIVE_CATALOG, 'Réseau & Télécom'])
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('6/5 sélectionnés')
    expect(alert).toHaveTextContent(/retire/i)
    expect(alert.className).toContain('danger-soft-text')
  })

  // #3709 — recette Ludovic 07/10 : à 5/5, les domaines personnalisés ne
  // doivent PAS entrer dans le plafond de 5 du catalogue.
  it('#3709 — cinq choix catalogués + deux domaines libres = 5/5, sans alerte', async () => {
    await render(LONG_CAPPED, [...FIVE_CATALOG, 'mécanique fine', 'génie nucléaire'])
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText(/5\/5 sélectionnés/)).toBeInTheDocument()
  })

  it('#3709 — à 5/5, saisir un domaine libre + Entrée l’ajoute quand même', async () => {
    await render(LONG_CAPPED, FIVE_CATALOG)
    const input = screen.getByPlaceholderText('Autre (préciser)')
    fireEvent.change(input, { target: { value: 'hydraulique' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith([...FIVE_CATALOG, 'hydraulique'])
  })

  it('sous le plafond, le compteur ne porte AUCUNE alerte — jamais un état neutre traité en erreur', async () => {
    await render(LONG_CAPPED, FIVE_CATALOG.slice(0, 2))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

/**
 * #2538 — Ludovic (call bêta 17/09, ESN d'ingénierie) : « création d'un seul
 * domaine d'expertise quand on met des customs, pas possible d'en créer
 * plusieurs ». Le champ « Autre » REMPLAÇAIT l'unique entrée libre à chaque
 * frappe (`setOther` effaçait tout ce qui n'était pas au catalogue avant de
 * poser la nouvelle valeur) — pour mécanique, automatisme, qualité, méthodes
 * et génie civil, quatre domaines sur cinq disparaissaient.
 */
describe('#2538 — plusieurs domaines personnalisés cohabitent dans « Ta sélection »', () => {
  it('trois entrées libres déjà enregistrées apparaissent TOUTES, séparément', async () => {
    await render(LONG, ['RH & SIRH', 'mécanique', 'automatisme', 'génie civil'])
    const pinned = screen.getByRole('list', { name: 'Ta sélection' })
    expect(within(pinned).getByRole('button', { name: /mécanique/ })).toBeInTheDocument()
    expect(within(pinned).getByRole('button', { name: /automatisme/ })).toBeInTheDocument()
    expect(within(pinned).getByRole('button', { name: /génie civil/ })).toBeInTheDocument()
  })

  // #2549.2 — 'frittage' n'a AUCUN alias dans `expertise-free-text-normalization.ts` :
  // ce test reste sur son sujet (plusieurs entrées libres coexistent), sans se
  // confondre avec la normalisation, prouvée séparément plus bas.
  it('valider le champ « Autre » AJOUTE une entrée sans effacer la précédente', async () => {
    await render(LONG, ['mécanique'])
    const input = screen.getByPlaceholderText('Autre (préciser)')
    fireEvent.change(input, { target: { value: 'frittage' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(['mécanique', 'frittage'])
  })

  it('le champ se vide après ajout, prêt pour la saisie suivante', async () => {
    await render(LONG, ['mécanique'])
    const input = screen.getByPlaceholderText('Autre (préciser)') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'frittage' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input.value).toBe('')
  })

  it('retirer UNE entrée libre ne touche pas les autres', async () => {
    await render(LONG, ['mécanique', 'automatisme'])
    const pinned = screen.getByRole('list', { name: 'Ta sélection' })
    fireEvent.click(within(pinned).getByRole('button', { name: 'Retirer mécanique' }))
    expect(onChange).toHaveBeenCalledWith(['automatisme'])
  })
})

/**
 * #2549.2 — retour Ludovic Marx (call bêta 17/09) : « cybersécu » / « Cybersécurité »
 * saisis en « Autre » restaient deux valeurs distinctes dans `expertise_areas`.
 * `normalizeExpertiseFreeText` (#2549.3, packages/contracts) existait, testée
 * seule, mais AUCUN appelant ne la branchait — ce bloc teste l'appelant RÉEL
 * (`LONG` = la vraie question `expertise_areas` de `domaines.ts`), pas
 * seulement la fonction pure.
 */
describe('#2549.2 — la saisie libre des domaines rejoint le catalogue', () => {
  it('une variante connue ("automatisme") arrive normalisée à `onChange`, pas telle quelle', async () => {
    await render(LONG, [])
    const input = screen.getByPlaceholderText('Autre (préciser)')
    fireEvent.change(input, { target: { value: 'automatisme' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(['Automatisme, Robotique & Contrôle-commande'])
  })

  it('la casse et les espaces ne créent pas une variante de plus ("  MÉCANIQUE  ")', async () => {
    await render(LONG, [])
    const input = screen.getByPlaceholderText('Autre (préciser)')
    fireEvent.change(input, { target: { value: '  MÉCANIQUE  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(['Mécanique & Conception (CAO, DAO)'])
  })

  it('une entrée SANS alias traverse inchangée — jamais de donnée inventée', async () => {
    await render(LONG, [])
    const input = screen.getByPlaceholderText('Autre (préciser)')
    fireEvent.change(input, { target: { value: 'poterie' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(['poterie'])
  })

  it('la normalisation SE VOIT : un message nomme ce qui a été tapé et la valeur retenue', async () => {
    await render(LONG, [])
    const input = screen.getByPlaceholderText('Autre (préciser)')
    fireEvent.change(input, { target: { value: 'automatisme' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent('automatisme')
    expect(notice).toHaveTextContent('Automatisme, Robotique & Contrôle-commande')
  })

  it("n'affiche AUCUN message quand rien n'a changé (pas d'alias)", async () => {
    await render(LONG, [])
    const input = screen.getByPlaceholderText('Autre (préciser)')
    fireEvent.change(input, { target: { value: 'poterie' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it("une réponse DÉJÀ ENREGISTRÉE en texte libre n'est jamais réécrite au rendu — une correction humaine gagne toujours", async () => {
    // 'automatisme' est un alias connu, mais ICI il arrive par `value` (une
    // réponse déjà confirmée), pas par une frappe dans le champ « Autre » :
    // il doit rester tel quel, comme avant #2549.2 (voir #2538 plus haut).
    await render(LONG, ['automatisme'])
    const pinned = screen.getByRole('list', { name: 'Ta sélection' })
    expect(within(pinned).getByRole('button', { name: /automatisme/ })).toBeInTheDocument()
  })

  it("une question `allowOther` HORS `expertise_areas` (SHORT_SINGLE n'en a pas — on fabrique le cas) ne normalise rien", async () => {
    const sectorLikeQuestion: Question = {
      ...(LONG as Extract<Question, { kind: 'multi-grouped' }>),
      key: 'target_sectors',
    }
    await render(sectorLikeQuestion, [])
    const input = screen.getByPlaceholderText('Autre (préciser)')
    fireEvent.change(input, { target: { value: 'genie civil' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // 'genie civil' est un alias d'EXPERTISE (Génie civil & Structures) —
    // mais ici la question porte `target_sectors` (le SECTEUR client, un axe
    // différent, cf. le commentaire dans expertise-free-text-normalization.ts) :
    // aucun repli ne doit s'appliquer.
    expect(onChange).toHaveBeenCalledWith(['genie civil'])
  })
})

/**
 * #2088.26 — « Autre » propose d'abord le CATALOGUE, avant de créer une
 * valeur libre : `SearchAutocomplete` (recherche d'entreprise) reste dédiée
 * au SIREN/Pappers, mais la MÊME idée — chercher, catégoriser, choisir plutôt
 * que retaper — s'applique ici sur le catalogue DÉJÀ chargé (`groups`,
 * `labelOf`), sans endpoint de plus (GA-26 : aucun second catalogue). Une
 * frappe qui correspond à un choix non coché le propose ; le choisir ajoute
 * la valeur DU CATALOGUE (pas le texte tapé), ce qui ferme directement « dix
 * façons d'écrire la même expertise ». Les régions restent hors de ce lot :
 * `company_locations` (implantation) n'a aucun catalogue à suggérer, et
 * `geo_zones` (cibles) n'a pas de texte libre — voir le rapport du lot.
 */
describe('#2088.26 — « Autre » suggère le catalogue avant de créer une valeur libre', () => {
  it('une frappe qui correspond à un choix du catalogue le propose, sans rien cocher', async () => {
    await render(LONG, [])
    const input = screen.getByPlaceholderText('Autre (préciser)')
    fireEvent.change(input, { target: { value: 'cyber' } })
    expect(screen.getByRole('button', { name: 'Ajouter Cybersécurité & Conformité' })).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('cliquer la suggestion ajoute la valeur DU CATALOGUE, jamais le texte tapé', async () => {
    await render(LONG, [])
    const input = screen.getByPlaceholderText('Autre (préciser)')
    fireEvent.change(input, { target: { value: 'cyber' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter Cybersécurité & Conformité' }))
    expect(onChange).toHaveBeenCalledWith(['Cybersécurité & Conformité'])
  })

  it('le champ « Autre » se vide après un clic sur une suggestion', async () => {
    await render(LONG, [])
    const input = screen.getByPlaceholderText('Autre (préciser)') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'cyber' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter Cybersécurité & Conformité' }))
    expect(input.value).toBe('')
  })

  it('une valeur déjà cochée ne se suggère plus — elle est déjà dans « Ta sélection »', async () => {
    await render(LONG, ['Cybersécurité & Conformité'])
    const input = screen.getByPlaceholderText('Autre (préciser)')
    fireEvent.change(input, { target: { value: 'cyber' } })
    expect(screen.queryByRole('button', { name: 'Ajouter Cybersécurité & Conformité' })).toBeNull()
  })

  it('sans correspondance, aucune suggestion ne s’affiche', async () => {
    await render(LONG, [])
    const input = screen.getByPlaceholderText('Autre (préciser)')
    fireEvent.change(input, { target: { value: 'xyzabc123' } })
    expect(screen.queryByRole('list', { name: 'Suggestions du catalogue' })).toBeNull()
  })

  it('une frappe de moins de deux caractères ne déclenche aucune suggestion', async () => {
    await render(LONG, [])
    const input = screen.getByPlaceholderText('Autre (préciser)')
    fireEvent.change(input, { target: { value: 'c' } })
    expect(screen.queryByRole('list', { name: 'Suggestions du catalogue' })).toBeNull()
  })
})

/**
 * #2088.3 / #2087.9 / #2088.19 / #2088.20 — les quatre mécanismes optionnels
 * de ce lot, prouvés ICI sur des questions FABRIQUÉES par le test, en
 * isolation du reste du composant. Absents, ils ne changent rien au rendu
 * historique ; présents, ils s'affichent. #2088.3 et #2087.9 sont réparés
 * depuis le 18/09 : `user_role` (`role.ts`) et `esn_maturity_situation`
 * (`maturite.ts`) sont désormais de VRAIES questions du corpus qui les
 * portent, prouvées par `role.test.ts` / `maturite.test.ts` — #2088.19 et
 * #2088.20 restent sans adoption réelle, hors périmètre de cette réparation.
 */
describe('#2088.3 — description du choix LONG (mécanisme, sans adoption réelle)', () => {
  it('affiche la description traduite sous le libellé du choix', async () => {
    const question: Question = {
      ...(LONG_SINGLE as Extract<Question, { kind: 'single' }>),
      choices: [
        { value: 'a', labelKey: undefined, descriptionKey: 'questionField.whyThisQuestion' },
        ...(LONG_SINGLE as Extract<Question, { kind: 'single' }>).choices.slice(1),
      ],
    }
    await render(question, '')
    // `questionField.whyThisQuestion` résout en « Pourquoi cette question ? »
    // — clé RÉELLE choisie pour ne pas ajouter une clé i18n qu'aucune
    // question n'utilise encore ; seul compte ici que `descriptionKey` est
    // bien LU et TRADUIT.
    expect(screen.getByText('Pourquoi cette question ?', { selector: 'span' })).toBeInTheDocument()
  })
})

// #2539 — Ludovic (call bêta 17/09) a hésité entre « assistance technique »
// et « régie » : le libellé seul ne suffit pas sur une sélection MULTI, pas
// seulement sur la liste recherchable `single` que #2088.3 couvrait déjà.
// Mécanisme prouvé ici sur une question FABRIQUÉE (même raison que #2088.3 :
// verrou de fichier de `lib/questions/*.ts`) ; l'adoption réelle sur
// `service_types` (offre-prestations.ts) est un fichier séparé.
describe('#2539 — description du choix sur une sélection MULTI (mécanisme)', () => {
  it('affiche la description traduite sous le libellé du choix', async () => {
    const question: Question = {
      key: 'service_types',
      kind: 'multi',
      label: 'questions.serviceTypes.label',
      choices: [{ value: 'a', descriptionKey: 'questionField.whyThisQuestion' }, { value: 'b' }],
    }
    await render(question, [])
    expect(screen.getByText('Pourquoi cette question ?', { selector: 'span' })).toBeInTheDocument()
  })
})

describe('#2088.20 — suggestions cliquables sur un champ texte (mécanisme)', () => {
  const TEXT_QUESTION: Question = {
    key: 'esn_name',
    kind: 'text',
    label: 'questions.esnName.label',
    suggestions: ['Suggestion A', 'Suggestion B'],
  }

  it("n'affiche aucune suggestion quand la question n'en porte pas", async () => {
    await render({ key: 'esn_name', kind: 'text', label: 'questions.esnName.label' }, '')
    expect(screen.queryByRole('button', { name: 'Suggestion A' })).toBeNull()
  })

  it('affiche les suggestions et clique EN FAIT la réponse réelle', async () => {
    await render(TEXT_QUESTION, '')
    fireEvent.click(screen.getByRole('button', { name: 'Suggestion A' }))
    expect(onChange).toHaveBeenCalledWith('Suggestion A')
  })
})

describe('#2088.19 — exemple de forme sur un champ tags (mécanisme)', () => {
  it('affiche l’exemple traduit à côté du conseil de saisie', async () => {
    const question: Question = {
      key: 'client_references',
      kind: 'tags',
      label: 'complement.questions.references.label',
      exampleKey: 'questionField.whyThisQuestion',
    }
    await render(question, [])
    expect(screen.getByText('Pourquoi cette question ?')).toBeInTheDocument()
  })
})

describe('#2087.9 — icône et exemple sur une carte de choix court (mécanisme)', () => {
  it('affiche icône et exemple traduits sur la carte, sans toucher aux cartes sans ces champs', async () => {
    const base = SHORT_SINGLE as Extract<Question, { kind: 'single' }>
    const question: Question = {
      ...base,
      choices: [
        { ...base.choices[0], iconKey: 'building', exampleKey: 'questionField.whyThisQuestion' },
        ...base.choices.slice(1),
      ],
    }
    await render(question, '')
    expect(screen.getByText('Pourquoi cette question ?')).toBeInTheDocument()
  })
})

describe('#2088.9 — réordonnancement de la sélection épinglée', () => {
  it("n'affiche aucun bouton de réordonnancement avec un seul élément épinglé", async () => {
    await render(LONG, ['RH & SIRH'])
    expect(screen.queryByRole('button', { name: /^Monter/ })).toBeNull()
  })

  it('monter le second élément le fait passer en tête (appelle onChange réordonné)', async () => {
    await render(LONG, ['Data & Intelligence Artificielle', 'RH & SIRH'])
    fireEvent.click(screen.getByRole('button', { name: 'Monter RH & SIRH' }))
    expect(onChange).toHaveBeenCalledWith(['RH & SIRH', 'Data & Intelligence Artificielle'])
  })

  it('le premier élément ne peut pas monter, le dernier ne peut pas descendre', async () => {
    await render(LONG, ['Data & Intelligence Artificielle', 'RH & SIRH'])
    expect(screen.getByRole('button', { name: 'Monter Data & Intelligence Artificielle' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Descendre RH & SIRH' })).toBeDisabled()
  })
})

// #2088.12 (DÉCISION Louis 18/09, point 16) — le premier kind `number` du
// questionnaire : un champ numérique avec son UNITÉ VISIBLE à côté.
describe('#2088.12 — kind `number` : un champ numérique avec son unité visible', () => {
  const NUMBER_QUESTION: Question = {
    key: 'consultant_count',
    kind: 'number',
    label: 'questions.consultantCount.label',
    unitKey: 'questions.consultantCount.unit',
  }

  it('rend un input de type number et affiche son unité', async () => {
    await render(NUMBER_QUESTION, '')
    const input = screen.getByRole('spinbutton')
    expect(input).toHaveAttribute('type', 'number')
    expect(screen.getByText('consultants')).toBeInTheDocument()
  })

  it('affiche la valeur déjà saisie', async () => {
    await render(NUMBER_QUESTION, '7')
    expect(screen.getByRole('spinbutton')).toHaveValue(7)
  })

  it('appelle onChange avec la chaîne saisie (même magasin que `text`)', async () => {
    await render(NUMBER_QUESTION, '')
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '12' } })
    expect(onChange).toHaveBeenCalledWith('12')
  })
})

/**
 * #2088.26 — « les régions ont leur catalogue ». Mesuré le 20/09 :
 * `company_locations` (implantation) n'avait AUCUN catalogue à proposer —
 * seul un `TagsField` texte libre. C'est un test de RENDU écran, pas un test
 * de données : il échoue si l'écran cesse de PROPOSER le catalogue (groupes,
 * cases à cocher), même si `implantationStep` continue de porter des
 * `groups` en mémoire — trois lots livrés le même jour avaient des tests
 * unitaires verts et étaient faux en production.
 */
describe('#2088.26 — company_locations propose le catalogue des régions', () => {
  it('affiche les groupes de régions et leurs choix, comme un vrai catalogue', async () => {
    await render(COMPANY_LOCATIONS, [])
    // Le groupe (catégorie) ET au moins une région de ce groupe sont VISIBLES
    // à l'écran — pas seulement présents dans la définition de la question.
    expect(screen.getByText('Sud-Est')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Auvergne-Rhône-Alpes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Île-de-France' })).toBeInTheDocument()
  })

  it('cocher une région DU CATALOGUE persiste la valeur canonique', async () => {
    await render(COMPANY_LOCATIONS, [])
    fireEvent.click(screen.getByRole('button', { name: 'Île-de-France' }))
    expect(onChange).toHaveBeenCalledWith(['Île-de-France'])
  })

  it('le texte libre reste disponible : une VILLE hors catalogue se tape et se garde', async () => {
    await render(COMPANY_LOCATIONS, ['Paris (siège)'])
    // Valeur déjà saisie (jeu de démo), hors catalogue : lisible telle quelle,
    // jamais devinée vers une région.
    expect(screen.getByRole('button', { name: /Paris \(siège\)/ })).toBeInTheDocument()
    const input = screen.getByPlaceholderText('Autre (préciser)')
    fireEvent.change(input, { target: { value: 'Annecy' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(['Paris (siège)', 'Annecy'])
  })
})

describe('#2539.2 — description du choix sur une carte de choix court (single)', () => {
  it('affiche la description traduite sous le libellé de la carte', async () => {
    const base = SHORT_SINGLE as Extract<Question, { kind: 'single' }>
    const question: Question = {
      ...base,
      choices: [{ ...base.choices[0], descriptionKey: 'questionField.whyThisQuestion' }, ...base.choices.slice(1)],
    }
    await render(question, '')
    expect(screen.getByText('Pourquoi cette question ?', { selector: 'span' })).toBeInTheDocument()
  })
})
