import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render } from '@testing-library/react'
import type { PersonalPriority } from '@bellum/contracts'
import type { CockpitCoverage } from '@bellum/contracts'
import { PortfolioCoverageCard } from '@/features/dashboard/components/perspective/PortfolioCoverageCard'
import { MyPrioritiesCard } from '@/features/dashboard/components/personal/MyPrioritiesCard'

/**
 * Une liste d'entreprises se reconnaît, elle ne se lit pas.
 *
 * Signalé deux fois en bêta, sur les deux cartes du tableau de bord : « rajouter
 * les logos des entreprises ».
 *
 * ⚠️ **02/09/2026 — la version précédente de ce commentaire était FAUSSE.** Elle
 * affirmait que « partout ailleurs — liste des comptes, fiche, barre latérale,
 * copilote — une entreprise est précédée de son logo », et le test ne lisait que
 * les DEUX cartes du cockpit. Trois écrans le démentaient : `/favorites`
 * (#1315), le tableau des priorités (#1318) et le Kanban des projets (#1325)
 * n'affichaient qu'une colonne de noms. La garde protégeait la règle là où elle
 * était déjà tenue — c'est la définition d'une garde borgne, et le dépôt en a
 * payé six en deux jours.
 *
 * La cause n'était d'ailleurs pas la même que sur le cockpit : ici les colonnes
 * ne VOYAGEAIENT pas (aucune des trois requêtes ne sélectionnait `logo_url`).
 * La moitié « donnée » est gardée par
 * `apps/api/src/modules/projects/project-row-carries-the-logo.spec.ts` ; cette
 * moitié-ci garde l'affichage.
 *
 * Rien à collecter, donc : il manquait l'affichage. C'est la forme de défaut la
 * plus facile à laisser passer, parce que l'écran n'a pas l'air cassé.
 *
 * Ce qui est vérifié, c'est l'URL d'affichage réellement demandée par la carte.
 * On ne peut pas attendre une balise `img` : l'avatar ne la monte qu'une fois
 * l'image chargée, ce qui n'arrive jamais sous jsdom. On espionne donc la
 * fonction qui construit l'URL du logo — si la carte ne l'appelle pas, elle
 * n'affiche pas de logo, et c'était exactement le défaut.
 */

// Les deux cartes ne naviguent qu'au clic : le routeur n'a rien à faire ici.
// `PortfolioCoverageCard` rend de vrais `<Link>` (ce qui se clique se tabule) :
// le double doit donc en fournir un, sinon le test mesure l'absence du routeur
// et pas l'absence du logo.
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, ...rest }: { children?: React.ReactNode }) => <a {...rest}>{children}</a>,
}))

const logoRequests: Array<[unknown, unknown]> = []
vi.mock('@/lib/company-logo', () => ({
  companyLogoSrc: (logoUrl: unknown, website: unknown) => {
    logoRequests.push([logoUrl, website])
    return 'https://api.example/logo?src=acme'
  },
}))

/**
 * ⚠️ « Mes comptes » n'existe plus : #1408 l'a remplacée par la lecture de
 * COUVERTURE, qui ne liste plus le portefeuille mais ses anomalies. La règle,
 * elle, n'a pas bougé — une entreprise se reconnaît à son logo, y compris dans
 * une file d'anomalies —, donc la garde suit le composant plutôt que de
 * disparaître avec l'ancien.
 */
function coverage(anomalies: CockpitCoverage['anomalies']): CockpitCoverage {
  return {
    followed: 3,
    without_next_action: 1,
    no_interaction_30d: 1,
    new_signals_7d: 0,
    never_worked: 0,
    anomalies,
    provenance: { sources: ['bellum'], window_days: 30, population: 3, computed_at: '2026-09-04T09:00:00.000Z' },
  }
}

const ANOMALY = {
  account_id: '11111111-1111-4111-8111-111111111111',
  company_name: 'ACME',
  kind: 'no_recent_interaction',
  since: '2026-06-01T00:00:00.000Z',
  logo_url: 'https://logo.example/acme.png',
  website: 'https://acme.example',
} as const satisfies CockpitCoverage['anomalies'][number]

const PRIORITY: PersonalPriority = {
  account_id: '22222222-2222-4222-8222-222222222222',
  company_name: 'ACME',
  priority_score: 72,
  reason: 'Relance à faire',
  overdue: false,
  logo_url: 'https://logo.example/acme.png',
  website: 'https://acme.example',
}

describe('le tableau de bord montre les logos des entreprises', () => {
  beforeEach(() => {
    logoRequests.length = 0
  })

  it('la file de couverture demande le logo de chaque ligne', () => {
    render(<PortfolioCoverageCard coverage={coverage([ANOMALY])} />)
    expect(logoRequests).toEqual([['https://logo.example/acme.png', 'https://acme.example']])
  })

  it('la carte « mes priorités » aussi', () => {
    render(<MyPrioritiesCard priorities={[PRIORITY]} />)
    expect(logoRequests).toEqual([['https://logo.example/acme.png', 'https://acme.example']])
  })

  it('une liste vide ne demande aucun logo', () => {
    // Le garde doit distinguer « la carte appelle » de « le test appelle ».
    render(<PortfolioCoverageCard coverage={coverage([])} />)
    expect(logoRequests).toEqual([])
  })

  /**
   * Les trois écrans que la bêta a signalés le 02/09. On ne les monte pas : ils
   * tirent chacun un `useQuery`, un routeur et un DnD, et un rendu complet
   * testerait leur plomberie plutôt que la règle. Ce qui est vérifié est que le
   * composant d'avatar est BRANCHÉ sur le champ de la ligne — le seul geste qui
   * manquait, et le seul qu'un futur remaniement peut défaire.
   */
  describe('les écrans signalés en bêta le 02/09 montrent aussi le logo', () => {
    const ÉCRANS = [
      // ⚠️ #1800 (09/09/2026) — `/favorites (#1315)` a existé ici, retiré avec
      // la notion de favori (retour Louis, « supprime la notion de favori »).
      { quoi: 'le tableau des priorités (#1318)', fichier: 'src/features/sprints/view/SprintBoard.tsx' },
      { quoi: 'le Kanban des projets (#1325)', fichier: 'src/features/projects/view/PipelineBoard.tsx' },
      /**
       * #1423 — la Veille, en deux endroits, et deux causes DIFFÉRENTES pour un
       * seul symptôme : le panneau de détail montait `EntityAvatar` nu, et le
       * tableau montait `CompanyAvatar` À VIDE. Le second est le cas que ce
       * fichier appelle « sait dire NON » — il était en production.
       */
      { quoi: '/watchlist, le tableau (#1423)', fichier: 'src/features/watchlist/view/WatchlistTable.tsx' },
      {
        // #1797 — le panneau latéral est devenu une MODALE, et l'identité
        // (logo, nom, secteur, statut) est passée dans son entête : elle est
        // donc montée par l'écran. La garde suit le code, elle ne suit pas le
        // nom du fichier — sinon `readFileSync` jette et le rouge parle du
        // renommage au lieu de parler du logo.
        // #2151.60 — la modale a suivi le plateau dans `WatchlistBoard`, monté
        // par « Mes cibles » ; `WatchlistPage` n'existe plus.
        // #5191 — LA modale d'un signal est désormais `SignalBrowserDialog`,
        // montée par `WatchlistBoard` ET par les historiques : l'entête y vit.
        quoi: '/mes-cibles, l’entête de la modale de détail d’un signal (#1423)',
        fichier: 'src/features/accounts/view/account-detail/tabs/opportunities/SignalBrowserDialog.tsx',
      },
    ]

    it.each(ÉCRANS)('$quoi branche CompanyAvatar sur la ligne', ({ fichier }) => {
      // ⚠️ Ancré sur CE fichier, pas sur `process.cwd()` : le cwd d'un run
      // vitest est la racine du dépôt, pas `apps/web`, et le chemin relatif
      // lisait à côté. Attrapé par l'assertion de non-vide juste en dessous —
      // c'est exactement ce qu'elle est là pour faire.
      const racineWeb = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
      const source = readFileSync(join(racineWeb, fichier), 'utf8')

      // LA GARDE LIT QUELQUE CHOSE : un chemin faux rendrait une chaîne vide et
      // toutes les assertions suivantes seraient vertes sur du néant.
      expect(source.length).toBeGreaterThan(200)

      expect(source).toContain('<CompanyAvatar')
      // Branché sur la DONNÉE de la ligne, pas monté à vide : un avatar sans
      // `logoUrl` retombe sur l'initiale et le défaut serait intact.
      expect(source).toMatch(/logoUrl=\{[^}]+\}/)
    })

    it('sait dire NON — un écran qui monte l’avatar sans le nourrir échoue', () => {
      const faux = '<CompanyAvatar name={row.label} />'

      expect(/logoUrl=\{[^}]+\}/.test(faux)).toBe(false)
    })
  })
})
