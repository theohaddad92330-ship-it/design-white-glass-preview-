import { render, screen } from '@testing-library/react'
import type { PilotageLevelReport, PilotageMetric } from '@bellum/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatCount } from '@/lib/locale'

/**
 * LA LIGNE D'INDICATEUR — ce qu'elle affiche, et où elle mène.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CES GARDES SONT ICI ET PLUS SUR LA PAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Elles vivaient dans `PilotagePage.test.tsx` tant que l'écran rendait ses huit
 * cartes à plat. Depuis #1433, la chaîne ne montre qu'UNE métrique par maillon
 * et les autres vivent dans le détail qui s'ouvre au clic : une garde restée sur
 * la page aurait mesuré un écran où la moitié des lignes ne sont plus rendues —
 * et serait passée au vert en ne lisant rien. Elles n'ont pas été affaiblies,
 * elles ont suivi le code qu'elles gardent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLES TIENNENT
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **Cinq indicateurs sur dix-sept mènent à leurs objets**, et les douze
 *    autres sont inertes DÉLIBÉRÉMENT : un taux ne compte pas d'objets, une
 *    valeur non lue ne dit rien de ce qu'une liste contiendrait, et un compte à
 *    zéro a une population vide.
 * 2. **Les trois zéros qui mentaient**, mesurés en recette live sur la
 *    PRODUCTION le 30/08/2026 (D306 · D307 · D308) :
 *    - « Taux de correction 0 % » à deux centimètres de « Éléments corrigés
 *      12 » — les deux chiffres de la même carte se contredisaient ;
 *    - « Taux de qualification 0 % » sans dénominateur — un décrochage réel et
 *      une division par rien s'écrivaient pareil ;
 *    - « Clients actifs 0 » peint du gris de « non mesuré », alors que ce zéro a
 *      été LU.
 *    ⚠️ Le piège à ne pas retourner : remplacer un VRAI zéro par « non mesuré »
 *    ment tout autant. « 0 réponse sur 300 emails » doit rester « 0 % ».
 */

/** L'arbre de routes que CE navigateur connaît — voir `quality/lib/destinations`. */
let routesByPath: Record<string, unknown> = {}

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string } & Record<string, unknown>) => (
    <a href={to} {...(rest as Record<string, string>)}>
      {children}
    </a>
  ),
  useRouter: () => ({ routesByPath }),
}))

const { LevelDetail } = await import('./LevelDetail')
const { knownDestinations } = await import('../quality/lib/destinations')

function metric(key: string, value: number | null, unit: 'count' | 'rate' = 'count'): PilotageMetric {
  return { key, value, unit, status: value === null ? 'non_mesure' : 'ok' }
}

/** Un taux tel que le contrat le rend : sa valeur ET sur combien il est calculé. */
function rate(key: string, value: number, denominator: number): PilotageMetric {
  return { key, value, unit: 'rate', status: 'ok', denominator }
}

/** Les cinq écrans qui portent les objets comptés par la chaîne. */
const ALL_ROUTES: Record<string, unknown> = {
  '/signals': true,
  '/contacts': true,
  '/projects/needs': true,
  '/consultants': true,
  '/accounts': true,
}

function show(metrics: PilotageMetric[]) {
  const level: PilotageLevelReport = { level: 'acquisition', status: 'ok', metrics }
  return render(<LevelDetail level={level} known={knownDestinations(routesByPath)} baseline={undefined} />)
}

function liens(): (string | null)[] {
  return screen.queryAllByRole('link').map(link => link.getAttribute('href'))
}

beforeEach(() => {
  routesByPath = ALL_ROUTES
})

describe('un compteur mène à sa population', () => {
  it('les cinq indicateurs qui dénombrent des objets ouvrent l’écran qui les porte', () => {
    show([
      metric('signals', 116),
      metric('meetings', 4),
      metric('needsQualified', 9),
      metric('benchAvailable', 2),
      metric('activeClients', 31),
    ])

    expect(liens()).toEqual(['/signals', '/contacts', '/projects/needs', '/consultants', '/accounts'])
  })

  it('un TAUX n’a pas de population — « aller voir les 42 % » n’existe pas', () => {
    show([metric('replyRate', 0.42, 'rate'), metric('conversionRate', 0.1, 'rate')])

    expect(screen.getByText('42 %')).toBeInTheDocument()
    expect(liens()).toHaveLength(0)
  })

  it('un indicateur NON MESURÉ ne mène nulle part', () => {
    // `null` = la source n'a pas été lue. Ouvrir une liste ferait croire qu'on
    // sait ce qu'elle contient.
    show([metric('signals', null), metric('activeClients', null)])

    expect(screen.getAllByText('non mesuré')).toHaveLength(2)
    expect(liens()).toHaveLength(0)
  })

  it('un compte à ZÉRO n’ouvre rien : il n’y a aucun objet à voir', () => {
    show([metric('activeClients', 0)])

    // Le zéro reste AFFICHÉ — c'est une mesure, pas une absence de mesure.
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(liens()).toHaveLength(0)
  })

  it('les indicateurs sans écran restent des chiffres nus, et c’est délibéré', () => {
    show([metric('contactsTargeted', 2044), metric('emailsSent', 310), metric('rejectedItems', 7)])

    // #3544.3 — un grand dénombrement se groupe par milliers (« 34896 » était illisible).
    expect(screen.getByText(/^2\s044$/)).toBeInTheDocument()
    expect(screen.queryByText('2044')).toBeNull()
    expect(liens()).toHaveLength(0)
  })

  it('ne rend AUCUN lien vers une destination que ce navigateur ne connaît pas', () => {
    routesByPath = { '/accounts': true }
    const { container } = show([metric('signals', 116), metric('activeClients', 31)])

    expect(liens()).toEqual(['/accounts'])
    // La ligne reste : ce qu'on retire est le lien mort, pas l'information.
    expect(container.textContent).toContain('116')
  })

  it('le lien porte un nom qui contient son libellé visible (WCAG 2.5.3)', () => {
    show([metric('signals', 116)])

    const link = screen.getByRole('link', { name: /Signaux/ })
    expect(link.getAttribute('aria-label')).toContain('116')
    // #2206.32 (clôture #2935) — un verbe NOMMÉ par maillon, plus « ouvrir la
    // liste » générique : chaque maillon avec destination dit ce qu'on va y faire.
    expect(link.getAttribute('aria-label')).toContain('voir les comptes qui viennent de signaler')
  })

  // #2206.32 (clôture #2935) — les 5 maillons qui portent une destination
  // portent chacun leur propre verbe, jamais le même pour tous.
  it('#2206.32 — chaque maillon avec destination nomme SON verbe, jamais « ouvrir la liste »', () => {
    show([
      metric('signals', 116),
      metric('meetings', 4),
      metric('needsQualified', 9),
      metric('benchAvailable', 2),
      metric('activeClients', 31),
    ])

    const expected: Record<string, string> = {
      Signaux: 'voir les comptes qui viennent de signaler',
      'Rendez-vous': 'voir les contacts rencontrés',
      'Besoins qualifiés': 'voir les besoins qualifiés',
      'Vivier disponible': 'voir le vivier disponible',
      'Clients actifs': 'voir les comptes actifs',
    }
    for (const [labelPattern, verb] of Object.entries(expected)) {
      const link = screen.getByRole('link', { name: new RegExp(labelPattern) })
      expect(link.getAttribute('aria-label')).toContain(verb)
      expect(link.getAttribute('aria-label')).not.toContain('ouvrir la liste')
    }
  })
})

describe('un quotient ne ment pas sur zéro', () => {
  /** Les indicateurs SEULS — le titre du maillon ne fait pas partie du sujet. */
  const rows = (container: HTMLElement): string => container.querySelector('dl')?.textContent ?? ''

  it('lit un corpus non vide : le détail rend bien une liste d’indicateurs', () => {
    // Sans cette ligne, chaque `not.toContain` ci-dessous passerait au vert sur
    // une chaîne vide — le défaut « une garde qui ne lit rien ».
    const { container } = show([metric('signals', 116)])
    expect(rows(container).length).toBeGreaterThan(3)
    expect(rows(container)).toContain('116')
  })

  it('douze corrections et un taux nul ne peuvent pas coexister', () => {
    // 12 / 2500 = 0,48 %. L'écran écrivait « 0 % ».
    const { container } = show([rate('correctionRate', 12 / 2500, 2500), metric('rejectedItems', 12)])

    expect(rows(container)).toContain('12')
    expect(rows(container)).not.toContain('0 %')
    expect(screen.getByText('< 1 %')).toBeInTheDocument()
  })

  // #3673 (lot R8 07/10) — vu en passant : « sur 35051 contacts » sans séparateur de milliers,
  // alors que la carte Acquisition l'affiche « 35 051 » juste à côté. Le dénominateur d'un taux
  // passait `{{count}}` tel quel à i18next, qui ne formate aucun nombre — seul `formatCount`
  // (Intl.NumberFormat) le fait, et il n'était pas appliqué ici.
  it('le dénominateur d’un taux porte le même séparateur de milliers que le reste de l’écran', () => {
    const { container } = show([rate('correctionRate', 12 / 35_051, 35_051)])

    expect(rows(container)).toContain(formatCount(35_051))
    expect(rows(container)).not.toContain('35051')
  })

  it('mais un taux VRAIMENT nul s’écrit « 0 % » — c’est le décrochage à crier', () => {
    const { container } = show([rate('replyRate', 0, 300)])

    expect(rows(container)).toContain('0 %')
    expect(screen.queryByText('< 1 %')).toBeNull()
  })

  it('un taux dit SUR COMBIEN il est calculé — sinon 0 % et 0/0 se ressemblent', () => {
    const { container } = show([metric('needsQualified', 0), rate('qualificationRate', 0, 43)])

    expect(rows(container)).toContain('0 %')
    expect(rows(container)).toContain('sur 43 besoins pris en charge')
  })

  it('un taux NON MESURÉ n’écrit ni pourcentage ni dénominateur', () => {
    const { container } = show([metric('qualificationRate', null, 'rate')])

    expect(screen.getByText('non mesuré')).toBeInTheDocument()
    expect(rows(container)).not.toContain('%')
    expect(rows(container)).not.toContain('sur ')
  })

  it('un zéro MESURÉ ne se peint pas comme un inconnu', () => {
    // « Clients actifs 0 » portait le gris de « non mesuré ». La carte montrait
    // un chiffre en disant qu'elle n'en avait pas.
    show([{ key: 'activeClients', value: 0, unit: 'count', status: 'non_mesure' }])

    const zero = screen.getByText('0')
    expect(zero.className).not.toContain('--bellum-text-muted')
    expect(zero.className).toContain('--bellum-text-primary')
  })

  it('une valeur NON LUE, elle, garde le gris de l’inconnu', () => {
    show([metric('activeClients', null)])

    expect(screen.getByText('non mesuré').className).toContain('--bellum-text-muted')
  })
})

/**
 * LE LIBELLÉ NE S'ÉCRIT PAS DEUX FOIS SUR LA MÊME LIGNE.
 *
 * ⚠️ Défaut vu en RECETTE LIVE le 04/09/2026, et par elle seule : le détail d'un
 * maillon affichait « Rendez-vous · 0 · Rendez-vous ». Aucun des 7 471 tests ne
 * le voyait — chacun cherchait une valeur ou un libellé, aucun ne comptait les
 * OCCURRENCES. La cause est un partage : `MetricValue` a été extrait pour le
 * maillon de la chaîne, où le libellé sous le chiffre est indispensable (le nom
 * du maillon ne dit pas ce qu'on compte) ; la ligne de détail, elle, le rendait
 * déjà à gauche.
 *
 * La garde compte, elle ne cherche pas.
 */
describe('une ligne de détail n’écrit pas son libellé deux fois', () => {
  function occurrences(container: HTMLElement, needle: string): number {
    return (container.textContent ?? '').split(needle).length - 1
  }

  it('lit un corpus non vide : le libellé est bien rendu', () => {
    const { container } = show([metric('meetings', 4)])
    expect(occurrences(container, 'Rendez-vous')).toBeGreaterThan(0)
  })

  it('une seule fois par ligne, pas deux', () => {
    const { container } = show([metric('meetings', 4)])
    expect(occurrences(container, 'Rendez-vous')).toBe(1)
  })

  it('mais le DÉNOMINATEUR reste — il n’est écrit nulle part ailleurs', () => {
    const { container } = show([rate('qualificationRate', 0, 43)])
    expect(occurrences(container, 'Taux de qualification')).toBe(1)
    expect(container.textContent).toContain('sur 43 besoins pris en charge')
  })
})

/**
 * #3415.2 (beta-feedback, lot C14 30/09/2026) — SEUIL, CAUSE, DÉCISION,
 * RESPONSABLE sur un indicateur qui DÉCROCHE, et leur absence sur tout le
 * reste — un maillon `ok` n'a rien à décider (« on n'affiche pas ce qu'on
 * n'a pas »).
 */
function alerting(key: string, value: number, unit: 'count' | 'rate' = 'count'): PilotageMetric {
  return { key, value, unit, status: 'alerte' }
}

describe('seuil, cause, décision, responsable — sur un maillon qui décroche', () => {
  it('un indicateur EN ALERTE, parmi les sept qui peuvent décrocher, affiche les quatre attributs', () => {
    const { container } = show([alerting('replyRate', 0.02, 'rate')])

    expect(container.textContent).toContain('Sous 10 %, le message ne prend pas.')
    expect(container.textContent).toContain(
      "L'angle du message ne parle pas à la cible, ou le volume dépasse ce qu'un travail personnalisé permet.",
    )
    expect(container.textContent).toContain("Changer l'angle du message avant d'augmenter le volume.")
    expect(container.textContent).toContain('Commerce')
  })

  it('un indicateur OK ne montre ni seuil, ni cause, ni décision — rien à décider', () => {
    const { container } = show([metric('replyRate', 0.42, 'rate')])
    expect(container.textContent).not.toContain('Cause probable')
  })

  it('un indicateur qui ne peut PAS structurellement décrocher (stock) reste muet même en alerte', () => {
    // `activeClients` est un STOCK : le calcul ne lui donne jamais le statut
    // `alerte` (voir `pilotage.ts`), mais si une donnée malformée le portait
    // quand même, la ligne ne doit pas inventer une décision qui n'existe pas.
    const { container } = show([alerting('activeClients', 0)])
    expect(container.textContent).not.toContain('Cause probable')
  })
})
