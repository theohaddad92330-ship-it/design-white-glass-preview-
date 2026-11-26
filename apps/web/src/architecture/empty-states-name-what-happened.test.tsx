import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement, type ReactNode } from 'react'
import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { ListNarrowing } from '@/features/accounts/lib/listNarrowing'
import { AccountContent } from '@/features/accounts/view/AccountContent'

/**
 * GA-106 — UN VIDE FILTRÉ N'EMPRUNTE JAMAIS LES MOTS DU VIDE INITIAL.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Recette live du 30/08/2026, PRODUCTION, sur un espace de 24 comptes analysés.
 * L'encart du bas de `/accounts` propose « Voir les opportunités → » ; l'URL
 * devient `/accounts?lifecycle=opportunity` ; l'écran répond :
 *
 *   🏢 « Aucun compte analysé pour l'instant »
 *      « Lance ta première analyse : tape le nom d'une entreprise cible… »
 *      [ Lancer ma première analyse ]
 *
 * Deux états très différents rendus identiques — le motif « cassé et non
 * mesurable se ressemblent », ici en version « filtré et jamais commencé se
 * ressemblent ». Et le geste proposé n'est pas neutre : il DÉBITE 8 crédits
 * pour un problème qui n'existe pas, alors que la sortie était de retirer le
 * filtre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE VÉRIFIE, ET CE QU'ELLE NE VÉRIFIE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne vérifie PAS « un état vide existe » — les deux existaient, et l'écran
 * était quand même faux. Elle vérifie qu'ils sont DISTINGUÉS :
 *
 *   1. les deux jeux de mots ne se recouvrent pas, dans les DEUX langues ;
 *   2. sous restriction, aucun mot du vide initial n'est rendu ;
 *   3. sous restriction, aucun geste PAYANT n'est proposé ;
 *   4. sans restriction, le vide initial reste bien celui qu'on montre — sans
 *      quoi la garde se satisferait d'un écran qui n'afficherait plus jamais
 *      l'invitation à commencer.
 *
 * Le point 4 est ce qui l'empêche d'être borgne dans l'autre sens : une garde
 * qui n'exige que l'ABSENCE se contente d'un écran vide.
 */

/**
 * `framer-motion` réduit à des balises nues.
 *
 * L'écran monte ses états vides sous `AnimatePresence` et `motion.div` : les
 * laisser animer ferait dépendre une assertion d'ABSENCE de la durée d'une
 * transition, ce qui est la recette d'un test qui vacille. Ce que la garde
 * mesure est ce qui est RENDU, pas quand.
 */
type MotionProps = { children?: ReactNode } & Record<string, unknown>

/**
 * ⚠️ Le Proxy MÉMORISE ses composants.
 *
 * Sans ce cache, chaque accès à `motion.div` rend une closure NEUVE : React voit
 * un type différent d'un rendu à l'autre, démonte tout le sous-arbre et le
 * remonte — l'état local des enfants part avec, et le test devient aveugle à
 * toute interaction qui change un état. Mesuré le 03/09 : un clic passait, le
 * `setState` était bien appelé, et l'écran entier disparaissait du DOM.
 */
const motionComponents = new Map<string, unknown>()

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, tag: string) => {
        const cached = motionComponents.get(tag)
        if (cached) return cached
        const MotionTag = ({ children, ...props }: MotionProps) => createElement(tag, props, children)
        motionComponents.set(tag, MotionTag)
        return MotionTag
      },
    },
  ),
  AnimatePresence: ({ children }: MotionProps) => <>{children}</>,
  useInView: () => true,
  useReducedMotion: () => false,
  useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
  useTransform: () => 0,
}))

const LOCALES = join(__dirname, '..', 'i18n', 'locales')
const LANGS = ['fr', 'en'] as const

type AccountsCatalogue = {
  emptyState: { title: string; description: string; cta: string }
  emptyFiltered: { title: string; description: string; notInLifecycle: string; removeFilter: string }
}

function catalogue(lang: string): AccountsCatalogue {
  return JSON.parse(readFileSync(join(LOCALES, lang, 'accounts.json'), 'utf8')) as AccountsCatalogue
}

/** Le vide INITIAL : « tu n'as encore rien analysé », et un geste qui débite. */
function initialCopy(lang: string): string[] {
  const { emptyState } = catalogue(lang)
  return [emptyState.title, emptyState.description, emptyState.cta]
}

/** Le vide FILTRÉ : « aucun résultat pour ce filtre », et un geste qui relâche. */
function filteredCopy(lang: string): string[] {
  const { emptyFiltered } = catalogue(lang)
  return [emptyFiltered.title, emptyFiltered.description, emptyFiltered.notInLifecycle, emptyFiltered.removeFilter]
}

function renderAccounts(narrowing: ListNarrowing, over: Record<string, unknown> = {}) {
  renderWithRouter(
    <AccountContent
      accounts={[]}
      counters={undefined}
      loading={false}
      failed={false}
      onRetry={() => {}}
      viewMode="list"
      onChangeViewMode={() => {}}
      selectedIds={new Set<string>()}
      onSelectedIdsChange={() => {}}
      compareOpen={false}
      onCompareOpenChange={() => {}}
      query=""
      onQueryChange={() => {}}
      sortKey="date_desc"
      onSortKeyChange={() => {}}
      activeTab="all"
      onTabChange={() => {}}
      activeFilters={[]}
      onFiltersChange={() => {}}
      onClearFilters={() => {}}
      narrowing={narrowing}
      {...over}
    />,
    '/accounts?lifecycle=opportunity',
  )
}

/**
 * Attend qu'un état vide — N'IMPORTE lequel des deux — soit à l'écran.
 *
 * Sans ce point d'ancrage, une assertion d'ABSENCE passerait sur le premier
 * tick, quand le routeur n'a encore rien monté : la garde serait verte devant
 * un écran blanc, ce qui est le contraire de ce qu'elle vérifie.
 */
async function anEmptyStateIsShown(): Promise<void> {
  const titles = [catalogue('fr').emptyFiltered.title, catalogue('fr').emptyState.title]
  await waitFor(() => {
    expect(titles.some(title => screen.queryByText(title) !== null)).toBe(true)
  })
}

describe('GA-106 — un vide FILTRÉ n’est pas un portefeuille vide', () => {
  it('la garde lit bien les deux jeux de mots — sinon elle serait verte sur du vide', () => {
    const collected = LANGS.flatMap(lang => [...initialCopy(lang), ...filteredCopy(lang)])
    // 3 + 4 phrases × 2 langues. Le compte est écrit : une clé renommée ou
    // supprimée fait tomber la garde ici, pas trois tests plus loin sur un
    // `undefined` silencieux.
    expect(collected).toHaveLength(14)
    for (const phrase of collected) {
      expect(typeof phrase).toBe('string')
      expect(phrase.trim().length).toBeGreaterThan(0)
    }
  })

  it('les deux jeux de mots ne se recouvrent pas, dans les deux langues', () => {
    for (const lang of LANGS) {
      const initial = new Set(initialCopy(lang).map(s => s.trim()))
      for (const phrase of filteredCopy(lang)) {
        // Le défaut de production, dans sa forme la plus directe : le vide
        // filtré qui reprend MOT POUR MOT la phrase du vide initial.
        expect(initial.has(phrase.trim())).toBe(false)
      }
    }
  })

  it('sous restriction, l’écran ne rend AUCUN mot du vide initial', async () => {
    renderAccounts({ active: true, lifecycle: 'opportunity' })
    await anEmptyStateIsShown()

    // L'absence est vérifiée D'ABORD, et nommée : c'est ELLE le défaut de
    // production, et un rouge qui dit « je n'ai pas trouvé l'autre titre »
    // envoie chercher au mauvais endroit.
    for (const phrase of initialCopy('fr')) {
      expect(screen.queryByText(phrase), `le vide INITIAL est rendu sous restriction : « ${phrase} »`).toBeNull()
    }
    expect(screen.queryByText(catalogue('fr').emptyFiltered.title)).not.toBeNull()
  })

  it('sous restriction, aucun geste PAYANT n’est proposé', async () => {
    renderAccounts({ active: true, lifecycle: 'opportunity' }, { query: 'Doctolib' })
    await anEmptyStateIsShown()

    // Lancer une analyse coûte 8 crédits. Le proposer pour sortir d'un filtre
    // fait payer un problème qui n'existe pas.
    for (const link of screen.queryAllByRole('link')) {
      expect(
        link.getAttribute('href') ?? '',
        'un geste qui débite des crédits est offert sous restriction',
      ).not.toContain('/search')
    }
    expect(
      screen.queryByRole('button', { name: new RegExp(catalogue('fr').emptyState.cta, 'i') }),
      'le bouton du vide initial (payant) est rendu sous restriction',
    ).toBeNull()
  })

  it('sans restriction, le vide INITIAL reste celui qu’on montre', async () => {
    renderAccounts({ active: false, lifecycle: null })

    expect(await screen.findByText(catalogue('fr').emptyState.title)).toBeInTheDocument()
    expect(screen.queryByText(catalogue('fr').emptyFiltered.title)).not.toBeInTheDocument()
  })
})
