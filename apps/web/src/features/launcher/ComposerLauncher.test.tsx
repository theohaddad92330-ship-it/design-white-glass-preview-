import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { ComposerLauncher, RunDuration } from './ComposerLauncher'
import { LauncherExamples } from './LauncherExamples'
import { LauncherProvider, useLauncherArm } from './LauncherProvider'
import { composerCanSubmit, composerPlaceholderKey, composerSubmitMode } from './launcher-arm'

/**
 * Le lanceur, rendu pour de vrai : ses cinq exemples DANS la rangée d'amorces,
 * et ce que le composer dit une fois un run armé.
 *
 * Il ne vérifie pas la logique — `launcher-intent.test.ts` et
 * `launcher-arm.test.ts` s'en chargent, et une fonction pure se teste mieux
 * qu'un composant. Il vérifie ce qu'une fonction pure ne peut PAS prouver : que
 * les clés i18n RÉSOLVENT (une clé morte laisse un écran plein de
 * `run.needMatch`), qu'aucun clic
 * ne part sur le réseau, qu'il n'existe qu'UN champ de saisie — et, depuis le
 * 29/08/2026, que **la rangée « ⚡ Lancer : » ne revient pas** : rien ne se rend
 * sous la saisie tant qu'aucun run n'est armé.
 */

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
// Palier inconnu ⇒ tout ouvert. C'est le repli de `usePlanFeature` (« le doute
// n'interdit pas »), et il évite de faire dépendre ce test d'une charge crédits.
vi.mock('@/features/plan-features/usePlanFeature', () => ({
  usePlanFeature: () => ({ known: false, allowed: true }),
}))

beforeEach(() => navigate.mockClear())

/**
 * Le contrat de l'écran, réduit à ce qui compte : une rangée d'exemples, UN
 * champ, un bouton, et les trois fonctions pures qui décident ce qu'ils disent.
 * Le reproduire ici plutôt que de rendre `Chat` entier garde le test lisible —
 * et si ce harnais et le vrai composer divergeaient, les fonctions pures qu'ils
 * partagent tomberaient.
 */
function ComposerHarness() {
  const [value, setValue] = useState('')
  const launcher = useLauncherArm()
  const armed = launcher?.armedRun ?? null
  const mode = composerSubmitMode(armed)
  const submit = () => {
    if (!composerCanSubmit(armed, value)) return
    if (armed && launcher) launcher.go(value)
  }
  return (
    <div>
      {/* Les quatre exemples vivent AU-DESSUS du champ, dans la même rangée que
          les amorces de conversation — c'est tout l'objet du chantier. */}
      <div data-testid="examples">
        <LauncherExamples />
      </div>
      <input
        aria-label="saisie"
        value={value}
        placeholder={composerPlaceholderKey(armed, launcher?.typeKey ?? null)}
        onChange={event => setValue(event.target.value)}
      />
      {armed ? <RunDuration run={armed} /> : null}
      <button type="button" onClick={submit} disabled={!composerCanSubmit(armed, value)}>
        {mode === 'open' ? 'Ouvrir' : 'Envoyer'}
      </button>
      <div data-testid="armed-panel">
        <ComposerLauncher />
      </div>
    </div>
  )
}

function renderComposer() {
  return render(
    <LauncherProvider>
      <ComposerHarness />
    </LauncherProvider>,
  )
}

// #2149.27 — quatre exemples depuis le 23/09/2026 : « Voir un territoire »
// a quitté le catalogue avec le type `territory`, dont le run pointait sur
// `/discover/territoire`, une route absente du disque, puis ne faisait plus
// qu'ouvrir `/discover` nu depuis que le panneau Territoire a quitté Découvrir
// (#2486, Louis 16/09/2026).
describe('les quatre exemples du lanceur', () => {
  it('affiche des LIBELLÉS, pas des clés i18n', () => {
    renderComposer()
    expect(screen.getByRole('button', { name: 'Analyser une entreprise' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enrichir un contact' })).toBeInTheDocument()
    expect(screen.queryByText(/^run\./)).toBeNull()
  })

  it('#3354 (LAU-UI-306) — un exemple gouverné porte une icône, jamais présenté comme une amorce ordinaire', () => {
    // Louis, 29/09/2026 (issue #3354) : « une hiérarchie plus claire entre
    // actions principales et secondaires ». Depuis le 29/08/2026, ces cinq
    // pastilles partagent le même GABARIT que les amorces de conversation
    // (délibéré, #1600) — mais un gabarit identique ne veut pas dire un
    // contenu identique : celles-ci ARMENT un run (prix, portée, Entrée
    // ouvre un écran) plutôt que de remplir le champ, et rien ne le disait
    // avant le clic. La même icône ⚡ que `ListLauncher` (autre surface du
    // même lanceur) les distingue au premier coup d'œil.
    renderComposer()
    const chip = screen.getByRole('button', { name: 'Analyser une entreprise' })
    expect(chip.querySelector('svg')).not.toBeNull()
  })

  it('#3354.2 (LAU-UI-306, reste) — une pastille NON armée porte une teinte primaire, pas le gris neutre d’une amorce ordinaire', () => {
    // Louis, 29/09/2026 : « hiérarchie plus claire entre actions principales
    // et secondaires ». Reprendre taille/position/regroupement rouvrirait
    // #1600/#3321 (défilement déjà calibré, régression mesurée en prod) —
    // refusé par les lots précédents (29/09, 30/09). Un delta de COULEUR
    // seul, confiné à ce composant, ne touche ni la largeur ni l'ordre de la
    // rangée : `color-mix` sur le même jeton primaire que les autres accents
    // du produit (`badge.tsx`), aucun hex (GA-33), plutôt que le gris neutre
    // partagé jusqu'ici avec les amorces ordinaires.
    renderComposer()
    const chip = screen.getByRole('button', { name: 'Analyser une entreprise' })
    // Théo (23/10) : la teinte reste, portée par le jeton doux de l'accent (AA dans les deux thèmes).
    expect(chip.className).toContain('bg-[var(--accent-soft-bg)]')
    expect(chip.className).toContain('text-[var(--accent-soft-text)]')
  })

  it('#3354.reste (LAU-UI-306, recette prod 30/09) — les quatre exemples gouvernés sont REGROUPÉS dans un conteneur nommé', () => {
    // Reste de la recette : « taille, position et regroupement des actions
    // rapides ». Le REGROUPEMENT ne touche pas #1600/#3321 (largeur ou ordre
    // de la rangée qui défile) — les quatre pastilles restent chacune
    // `shrink-0 whitespace-nowrap`, seul un conteneur partagé les rassemble.
    renderComposer()
    const group = screen.getByRole('group', { name: 'Lancer un travail gouverné' })
    for (const label of ['Analyser une entreprise', 'Enrichir un contact', 'Matcher le vivier']) {
      expect(group).toContainElement(screen.getByRole('button', { name: label }))
    }
  })

  it('#4594 — le groupe lanceur ne dépasse jamais la rangée : borné à sa largeur, il défile au lieu d’être rogné en plein mot', () => {
    // Mesuré en prod (30/10, 1440 px) : le groupe (640 px, `shrink-0`) dans une rangée de 276 px était rogné par
    // `overflow-hidden` — dernière pastille tranchée, et les vraies amorces toutes masquées. `max-w-full` + défilement
    // (sans barre) laissent la rangée tenir ses comptes : on en montre moins, jamais une coupée.
    renderComposer()
    const group = screen.getByRole('group', { name: 'Lancer un travail gouverné' })
    expect(group.className).toContain('max-w-full')
    expect(group.className).toContain('overflow-x-auto')
  })

  it('#3354.2 — TAILLE : les quatre pastilles partagent exactement la même taille, cible tactile ≥ 44 px comprise', () => {
    // « taille et position individuelles » : une pastille qui dérive en taille
    // (padding, hauteur, corps) est ce que le retour appelle « posées sans
    // logique ». La taille est une classe — on la compare, pastille à pastille.
    renderComposer()
    const sizeOf = (button: HTMLElement) =>
      button.className
        .split(/\s+/)
        .filter(c => /^(min-h-|px-|py-|text-(xs|sm)|pointer-coarse:min-h-)/.test(c))
        .sort()
        .join(' ')
    const buttons = [...screen.getByTestId('examples').querySelectorAll('button')]
    expect(buttons).toHaveLength(4)
    const sizes = new Set(buttons.map(sizeOf))
    expect(sizes.size, `tailles divergentes : ${[...sizes].join(' | ')}`).toBe(1)
    // #3354 (recette prod 01/10) : 42 px mesurés à la souris — le plancher de
    // 44 px (GA-35) vaut à TOUS les pointeurs, pas seulement au doigt.
    expect([...sizes][0].split(' ')).toContain('min-h-11')
    expect([...sizes][0]).not.toMatch(/(?:^|\s)min-h-8(?:\s|$)/)
  })

  it('#3354.2 — POSITION : le groupe gouverné précède les amorces ordinaires, et le catalogue fixe l’ordre', () => {
    renderComposer()
    const group = screen.getByRole('group', { name: 'Lancer un travail gouverné' })
    const row = screen.getByTestId('examples')
    expect(row.firstElementChild).toBe(group)
  })

  it('nomme le TRAVAIL, plus le type d’objet — un nom d’objet n’est pas un exemple', () => {
    // Louis, 29/08/2026 : « enlever les "Lancer : Compte, .., .." mais juste
    // mettre ça en exemple comme d'autres trucs ». « Compte » ne dit pas ce que
    // le clic va faire ; « Analyser une entreprise » le dit.
    renderComposer()
    for (const objectName of ['Compte', 'Contact', 'Besoin', 'Talent']) {
      expect(screen.queryByRole('button', { name: objectName })).toBeNull()
    }
  })

  it('les rend TOUS les quatre, dans l’ordre figé du catalogue', () => {
    renderComposer()
    const labels = [...screen.getByTestId('examples').querySelectorAll('button')].map(b => b.textContent)
    expect(labels).toEqual([
      'Analyser une entreprise',
      'Enrichir un contact',
      'Matcher le vivier',
      'Réécrire un CV pour une mission',
    ])
  })

  it("n'a QU'UN champ de saisie, armé ou non — c'est tout l'objet du chantier précédent", () => {
    renderComposer()
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Analyser une entreprise' }))
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
  })
})

describe('la rangée « Lancer : » sous la saisie', () => {
  it('ne se rend PLUS tant qu’aucun run n’est armé', () => {
    // La correction du 29/08/2026. Une rangée d'actions permanente sous le
    // champ était la SECONDE mécanique qu'on vient de retirer : deux barres de
    // pastilles pour un même geste, dont une seule se lisait comme une
    // invitation.
    renderComposer()
    expect(screen.getByTestId('armed-panel')).toBeEmptyDOMElement()
  })

  it('n’écrit nulle part l’étiquette « Lancer : », armé ou non', () => {
    renderComposer()
    expect(screen.queryByText(/Lancer\s*:/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Analyser une entreprise' }))
    expect(screen.queryByText(/Lancer\s*:/)).toBeNull()
  })

  it('apparaît dès qu’un run est armé — c’est là que vivent le prix et la portée', () => {
    renderComposer()
    fireEvent.click(screen.getByRole('button', { name: 'Analyser une entreprise' }))
    expect(screen.getByTestId('armed-panel')).not.toBeEmptyDOMElement()
  })
})

describe('ce que le composer dit d’un run armé', () => {
  it('laisse le composer sur la voie Laura tant qu’aucun type n’est choisi', () => {
    renderComposer()
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ouvrir' })).toBeNull()
  })

  it('bascule le bouton sur « Ouvrir » dès qu’un run est armé', () => {
    renderComposer()
    fireEvent.click(screen.getByRole('button', { name: 'Analyser une entreprise' }))
    expect(screen.getByRole('button', { name: 'Ouvrir' })).toBeInTheDocument()
  })

  it('change le marque-place du champ — le signal le plus fort, et il est gratuit', () => {
    renderComposer()
    fireEvent.click(screen.getByRole('button', { name: 'Analyser une entreprise' }))
    expect(screen.getByLabelText('saisie')).toHaveAttribute('placeholder', 'launcher:placeholder.account')
  })

  // #4463 (crédits implicites) — le composer ne dit plus ni prix ni « Inclus » : un run armé
  // n'affiche aucun crédit, quel que soit son type.
  it('n’affiche aucun crédit ni « Inclus » sur un run armé', () => {
    renderComposer()
    for (const name of ['Matcher le vivier', 'Enrichir un contact', 'Analyser une entreprise']) {
      fireEvent.click(screen.getByRole('button', { name }))
      expect(document.body.textContent).not.toMatch(/cr[ée]dit|Inclus/i)
    }
  })

  // #2428.14 — nom, périmètre et coût s'affichaient déjà avant le clic ; la
  // durée, jamais. Une durée MESURÉE (compte) s'annonce ; une durée qu'on n'a
  // pas ne s'invente pas — elle se NOMME « non mesurée » (même discipline que
  // `enrichment-duration-text.ts`), jamais un chiffre deviné.
  it('annonce la durée estimée d’une analyse de compte, avant le clic', () => {
    renderComposer()
    fireEvent.click(screen.getByRole('button', { name: 'Analyser une entreprise' }))
    expect(screen.getByText('3-5 min')).toBeInTheDocument()
  })

  it('dit « non mesurée » plutôt que d’inventer une durée pour un run sans estimation', () => {
    renderComposer()
    fireEvent.click(screen.getByRole('button', { name: 'Enrichir un contact' }))
    expect(screen.getByText('Durée non mesurée')).toBeInTheDocument()
  })

  it('garde la réassurance « rien n’est débité avant ta confirmation »', () => {
    renderComposer()
    fireEvent.click(screen.getByRole('button', { name: 'Analyser une entreprise' }))
    expect(screen.getByText(/rien n'est débité avant ta confirmation/i)).toBeInTheDocument()
  })

  it('emmène sur la destination, le texte du composer en paramètre', () => {
    renderComposer()
    fireEvent.click(screen.getByRole('button', { name: 'Enrichir un contact' }))
    fireEvent.change(screen.getByLabelText('saisie'), { target: { value: 'Marie Dupont' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }))
    expect(navigate).toHaveBeenCalledWith({ to: '/contacts', search: { q: 'Marie Dupont' } })
  })

  it('n’ouvre rien tant que le champ est vide sur un run qui attend un texte', () => {
    renderComposer()
    fireEvent.click(screen.getByRole('button', { name: 'Analyser une entreprise' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }))
    expect(navigate).not.toHaveBeenCalled()
  })

  // #2149.27 — « dit qu'un territoire ne se cherche pas au clavier » testait
  // le bouton « Voir un territoire », qui a quitté le catalogue le 23/09/2026
  // en même temps que le type `territory` (sa destination `/discover/
  // territoire` n'a jamais existé sur le disque, puis son run ne faisait plus
  // qu'ouvrir `/discover` nu, #2486). Le rendu générique
  // `armedRun?.queryParam === null` reste dans `ComposerLauncher.tsx` pour un
  // futur run sans saisie clavier, mais aucun exemple réel ne l'arme
  // aujourd'hui — rien à cliquer ici sans fabriquer un type hors catalogue.

  it('se DÉSARME sur un second clic — sinon on ne peut plus revenir à Laura', () => {
    renderComposer()
    const chip = screen.getByRole('button', { name: 'Analyser une entreprise' })
    fireEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeInTheDocument()
  })

  it('offre un bouton « Annuler » explicite pour revenir à Laura', () => {
    renderComposer()
    fireEvent.click(screen.getByRole('button', { name: 'Analyser une entreprise' }))
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeInTheDocument()
    expect(screen.getByTestId('armed-panel')).toBeEmptyDOMElement()
  })

  it('repart d’une ardoise propre après un lancement', () => {
    renderComposer()
    fireEvent.click(screen.getByRole('button', { name: 'Analyser une entreprise' }))
    fireEvent.change(screen.getByLabelText('saisie'), { target: { value: 'Airbus' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }))
    expect(screen.getByRole('button', { name: 'Analyser une entreprise' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeInTheDocument()
    expect(screen.getByTestId('armed-panel')).toBeEmptyDOMElement()
  })

  // ── #1112 : « Je n'avais pas compris que ça cherchait que dans les contacts
  //             en base. » ──────────────────────────────────────────────────

  it('dit que le contact se cherche parmi ceux déjà en base', () => {
    renderComposer()
    fireEvent.click(screen.getByRole('button', { name: 'Enrichir un contact' }))
    expect(screen.getByText(/contacts déjà dans tes dossiers/i)).toBeInTheDocument()
  })

  it("n'annonce aucune portée sur le compte, qui accepte un nom inconnu", () => {
    // C'est le geste fondateur du produit : analyser une entreprise jamais
    // ouverte. Lui coller un avertissement de portée serait un bruit permanent.
    renderComposer()
    fireEvent.click(screen.getByRole('button', { name: 'Analyser une entreprise' }))
    expect(screen.queryByText(/déjà dans tes dossiers/i)).not.toBeInTheDocument()
  })
})

describe('la variante « open » — la salle de démonstration', () => {
  /**
   * La saisie y est délibérément désactivée. ARMER un run n'y a donc aucune
   * sortie : la seule qui existe est le bouton du composer, et il n'y en a pas.
   * Mesuré le 29/08/2026 — les quatre chips étaient les seuls éléments cliquables
   * de l'écran et ne menaient nulle part. Un prospect cliquait, rien.
   */
  function renderDemoRow() {
    return render(
      <LauncherProvider>
        <LauncherExamples variant="open" />
      </LauncherProvider>,
    )
  }

  it('ouvre directement l’écran de l’objet, sans passer par le champ', () => {
    renderDemoRow()
    fireEvent.click(screen.getByRole('button', { name: 'Analyser une entreprise' }))
    expect(navigate).toHaveBeenCalledWith({ to: '/search', search: {} })
  })

  // #2149.27 — « Voir un territoire » (le seul run sans saisie clavier) a
  // quitté le catalogue le 23/09/2026 : sa destination `/discover/territoire`
  // n'a jamais existé sur le disque (#2486, panneau retiré de Découvrir le
  // 16/09/2026), puis son run ne faisait plus qu'ouvrir `/discover` nu. Ce
  // test cliquait donc un bouton qui menait à un écran mort, devenu ensuite
  // redondant avec l'absence de choix ; il n'a plus de sujet.

  it('n’annonce PAS un bouton à bascule qui ne bascule pas', () => {
    // `aria-pressed` sur un bouton qui navigue promet un état qui n'existe
    // pas : un lecteur d'écran annoncerait « non pressé » après le clic.
    renderDemoRow()
    expect(screen.getByRole('button', { name: 'Analyser une entreprise' })).not.toHaveAttribute('aria-pressed')
  })
})

describe('dans la ligne d’outils du composer, qui DÉFILE', () => {
  /**
   * Les exemples ont rejoint la ligne d'outils le 02/09/2026 — un conteneur
   * flex étroit qui défile horizontalement. Leurs deux classes de survie
   * vivaient sous la variante `max-md:`, héritée du temps où la rangée
   * s'enroulait sur grand écran.
   *
   * MESURÉ EN PROD : sans `shrink-0`, un enfant de flex se comprime jusqu'à la
   * largeur de son plus long mot ; sans `whitespace-nowrap`, il se casse en
   * colonne. « Réécrire un CV pour une mission » s'affichait sur six lignes
   * d'un mot et le composer doublait de hauteur.
   *
   * ⚠️ Cette garde vit ICI et pas dans les tests du copilote : là-bas,
   * `LauncherExamples` rend `null` faute de fournisseur, si bien qu'une
   * assertion sur ses pastilles y passerait avec le défaut en place. C'est
   * arrivé — la première version de cette garde était borgne.
   */
  it('les pastilles ne rétrécissent ni ne se cassent, à TOUTES les largeurs', () => {
    render(
      <LauncherProvider>
        <LauncherExamples />
      </LauncherProvider>,
    )
    const chips = screen.getAllByRole('button')
    // #2149.27 — quatre exemples depuis le 23/09/2026 (`territory` retiré du
    // catalogue, sa destination `/discover/territoire` n'a jamais existé,
    // puis son run ne faisait plus qu'ouvrir `/discover` nu, #2486).
    expect(chips.length).toBeGreaterThanOrEqual(4)
    for (const chip of chips) {
      expect(chip.className).toContain('shrink-0')
      expect(chip.className).toContain('whitespace-nowrap')
      // Sous une variante, la classe ne s'applique qu'à une plage de largeurs :
      // c'est exactement le défaut corrigé.
      expect(chip.className).not.toMatch(/:shrink-0|:whitespace-nowrap/)
    }
  })
})

describe('sans fournisseur', () => {
  it('ne rend RIEN — le composer se comporte exactement comme avant', () => {
    // C'est ce qui rend le déplacement sûr : la surface qui n'a pas de lanceur
    // (et tout test de copilote qui ne monte pas le fournisseur) retombe sur la
    // voie qui ne peut rien coûter.
    const { container } = render(<ComposerLauncher />)
    expect(container).toBeEmptyDOMElement()
  })

  it('ne rend aucun exemple non plus', () => {
    const { container } = render(<LauncherExamples />)
    expect(container).toBeEmptyDOMElement()
  })
})
