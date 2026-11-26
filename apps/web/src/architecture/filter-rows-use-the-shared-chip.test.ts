import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-249 — UNE RANGÉE DE FILTRES PASSE PAR `FilterChips`, PAS PAR DU JSX.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA MESURE QUI A DÉCLENCHÉ CETTE GARDE
 * ─────────────────────────────────────────────────────────────────────────
 * Le 01/09/2026, trente écrans portaient une rangée de choix exclusifs sous
 * TROIS formes qui ne partageaient rien :
 *   A. `<Button variant={actif ? 'default' : 'outline'}>` dans un `.map()`,
 *      en h-7 ou h-8 selon l'appelant, compteur en `<Badge>` ;
 *   B. un `<button>` maison `rounded-full` dont l'actif était
 *      `color-mix(in srgb, var(--bellum-primary-500) 16%, transparent)` ;
 *   C. un `<button>` maison `h-8 rounded-[6px]` dont la palette passait par
 *      un `style` en ligne.
 *
 * Quatre hauteurs, trois rayons, deux façons de dire « actif ». Louis l'a vu
 * en recette avant n'importe quel test : « c'est le deuxième ou troisième
 * différent que je vois sur tout le SaaS. »
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN CLIQUET, ET PAS UN INTERDIT
 * ─────────────────────────────────────────────────────────────────────────
 * `variant={x ? 'default' : 'outline'}` n'est pas fautif en soi : il reste
 * seize occurrences légitimes — une bascule SEULE (« seulement les bloquants
 * »), un choix d'offre, un `<Badge variant>` qui n'est pas un filtre. Une
 * garde qui les refuserait serait trop gourmande, et une garde trop gourmande
 * se fait désactiver dans la semaine.
 *
 * Le cliquet dit donc la seule chose vraie et vérifiable : **ce nombre ne
 * remonte pas**, et **les écrans déjà migrés ne réinventent pas leur rangée**.
 * Le jour où quelqu'un a besoin d'une rangée de plus, le composant existe et
 * la garde le lui rappelle.
 */

const WEB_SRC = join(__dirname, '..')
const UI_SRC = join(__dirname, '../../../../packages/ui/src')

/** L'idiome « famille A » : un bouton qui bascule entre plein et contour. */
const TOGGLE_IDIOM = "? 'default' : 'outline'"

/** L'idiome « famille B » : l'actif d'une pastille peint à 16 % d'accent. */
const CHIP_WASH_IDIOM = 'color-mix(in_srgb,var(--bellum-primary-500)_16%'

/**
 * L'idiome de la pastille écrite À LA MAIN : un rayon plein et un padding
 * horizontal de 3, la signature commune des sept formes concurrentes trouvées
 * en recette le 01/09 (Centre d'actions, angle des comptes, file partagée,
 * bibliothèque de questions, secteurs, offre, ADV).
 */
const HANDMADE_PILL_IDIOMS = ['rounded-full border px-3', 'rounded-full px-3 py-1']

/**
 * Mesuré le 01/09/2026, après la migration de quatorze rangées.
 *
 * ⚠️ Ces plafonds ne se relèvent PAS pour faire passer un lot. Ils descendent
 * quand une rangée de plus rejoint le composant — c'est le sens du cliquet.
 */
const CEILING_TOGGLE = 16
const CEILING_CHIP_WASH = 3

/**
 * Mesuré après la reprise des sept dernières rangées.
 *
 * Les trois qui restent ne sont PAS des rangées de choix : les exemples de
 * commande du lanceur, le badge de marque de l'écran de connexion, le badge
 * d'hygiène d'une fiche. Un badge porte un ÉTAT qu'on lit ; une pastille porte
 * un CHOIX qu'on fait — les confondre reviendrait à interdire la moitié des
 * badges du produit au nom d'une règle sur les filtres.
 */
const CEILING_HANDMADE_PILL = 3

/**
 * Les écrans dont la rangée est passée au composant partagé.
 *
 * Chaque entrée est un cliquet nominatif : le fichier DOIT continuer
 * d'importer `FilterChips`. Sans cette liste, un lot pourrait réécrire une
 * rangée à la main sans faire bouger les compteurs ci-dessus, en inventant
 * une QUATRIÈME forme.
 */
const MIGRATED = [
  'features/consultants/view/TalentFilters.tsx',
  'features/contacts/view/contacts-list/ContactsViewChips.tsx',
  'features/contacts/view/contacts-list/ContactsLifecycleFilter.tsx',
  'features/watchlist/view/WatchlistFacets.tsx',
  'features/matching/view/InverseMatchPanel.tsx',
  'features/consultants/view/reverse-market/ReverseMarketPage.tsx',
  // PR 12C (#4511, décision Louis 23/10/2026) — `IntegrationCenterPage.tsx` est RETIRÉ À DESSEIN : la maquette V22
  // n'a AUCUNE rangée de filtres sur Connecteurs ; les pastilles Branchés / À reconnecter / À brancher et « Plus de
  // filtres » sont retirées, seul reste « Chercher un outil ». Aucune rangée réécrite à la main : il n'y en a plus.
  'features/pilotage/view/CrmPipelinePanel.tsx',
  'features/admin-docs/view/AdminDocsCard.tsx',
  'features/telephony/view/TelephonyCard.tsx',
  /*
   * ⚠️ `features/territory/view/Territory.tsx` a été RETIRÉ de cette liste le
   * 10/09/2026 (#1796.2), et c'est le seul motif que son docblock admet : le
   * fichier n'existe plus.
   *
   * Sa rangée n'a pas été réécrite à la main ailleurs — elle a été ABSORBÉE.
   * L'écran Territoire a fusionné dans Découvrir, et sa fenêtre 30/90/180 jours
   * ne se recode pas : le rail de recherche en portait DÉJÀ une, sur le
   * composant partagé. Il y a donc une rangée de moins dans le produit, pas une
   * quatrième forme de plus — ce que cette garde existe précisément pour
   * empêcher.
   */
  'features/mailbox/view/MailboxPage.tsx',
  // Théo C missions-notes-de-frais.N3 (22/10/2026) — la rangée d'états de « Notes de frais » est
  // RETIRÉE À DESSEIN : les quatre tuiles (En attente · Validées · Refusées · Brouillons) sont le
  // filtre d'état (`aria-pressed`), comme sur la page de Théo. Garder la rangée ET les tuiles
  // ferait deux formes pour un seul réglage. L'écran ne revient pas dans cette liste.
  // Les sept reprises après la recette live du 01/09.
  'features/action-os/view/ActionCenter.tsx',
  'features/accounts/view/accounts-list/AccountsLensToggle.tsx',
  'features/manager/view/cockpit/SharedActionsQueue.tsx',
  'features/accounts/view/account-detail/tabs/plan/QuestionLibraryCard.tsx',
  'features/projects/view/ProjectSectorsPanel.tsx',
  // Vague 23 (17/09) — la source du coût et le simulateur de marge d'une mission (#2420 / LAU-134).
  'features/missions/view/MissionCostSourceForm.tsx',
  'features/missions/view/MissionMarginEngine.tsx',
] as const

/**
 * Les écrans qui empruntent la GRAMMAIRE sans être une rangée de filtres : une
 * puce dans un dialogue, une tuile de bandeau, une pastille de formulaire. Ils
 * gardent leur composant local — ce ne sont pas des rangées — mais ils doivent
 * lire leurs classes dans `chip-style` plutôt que de les réécrire.
 */
const BORROW_THE_GRAMMAR = [
  'features/accounts/view/account-detail/tabs/plan/ReplanDialog.tsx',
  'features/adv/view/AdvPage.tsx',
  'features/profile/components/OfferPortfolioSection.tsx',
  'features/projects/open-needs/view/OpenNeedsPage.tsx',
] as const

function tsxFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist') continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (entry.endsWith('.tsx') && !entry.includes('.test.')) out.push(full)
    }
  }
  walk(root)
  return out
}

const CORPUS = [...tsxFiles(WEB_SRC), ...tsxFiles(UI_SRC)].map(path => ({
  path,
  source: readFileSync(path, 'utf8'),
}))

/** `chip-style.ts` n'est pas un `.tsx` : il se lit à part. */
const CHIP_STYLE = readFileSync(join(UI_SRC, 'molecules/chip-style.ts'), 'utf8')

function occurrences(needle: string): { path: string; count: number }[] {
  return CORPUS.map(({ path, source }) => ({ path, count: source.split(needle).length - 1 })).filter(f => f.count > 0)
}

describe('GA-249 — les rangées de filtres passent par le composant partagé', () => {
  it('LIT vraiment un corpus, et il contient les écrans visés', () => {
    // Preuve n°1 : sans elle, un chemin faux rendrait tout ce fichier vert en
    // ne lisant rien — et un cliquet à zéro sur un corpus vide est le pire
    // des faux verts, parce qu'il se lit comme une victoire.
    expect(CORPUS.length).toBeGreaterThan(800)
    for (const file of MIGRATED) {
      expect(
        CORPUS.some(f => f.path.endsWith(file)),
        `écran migré introuvable : ${file}`,
      ).toBe(true)
    }
  })

  it('sait dire NON — les deux idiomes sont bien détectés là où ils existent', () => {
    // Preuve n°2 : on vérifie que les motifs attrapent quelque chose de RÉEL.
    // Un cliquet dont le motif ne matche plus rien (une refonte, un
    // reformatage de Prettier) tomberait à zéro et se dirait vert pour
    // toujours — c'est le « faux zéro » du dépôt appliqué à une garde.
    expect(occurrences(TOGGLE_IDIOM).length).toBeGreaterThan(0)
    expect(occurrences(CHIP_WASH_IDIOM).length).toBeGreaterThan(0)
  })

  it('n’attrape PAS ce qu’elle ne vise pas — une bascule seule reste permise', () => {
    // Preuve n°3. Ces deux-là sont des usages légitimes vérifiés à la main le
    // 01/09 : une bascule unique, un choix d'offre, un badge. Ils DOIVENT
    // rester dans le corpus sans faire échouer quoi que ce soit — la garde ne
    // compte que le total, elle n'interdit pas l'idiome.
    const légitimes = [
      'features/billing/components/PlansGrid.tsx', // le choix d'une offre
      'features/projects/open-needs/view/OpenNeedsTable.tsx', // un <Badge variant>
    ]
    for (const file of légitimes) {
      expect(
        CORPUS.some(f => f.path.endsWith(file) && f.source.includes(TOGGLE_IDIOM)),
        `usage légitime disparu — le cliquet doit être remesuré : ${file}`,
      ).toBe(true)
    }
  })

  it('ne laisse pas REMONTER le nombre de rangées écrites à la main', () => {
    const total = occurrences(TOGGLE_IDIOM).reduce((sum, f) => sum + f.count, 0)
    expect(
      total,
      `${total} usages de « ${TOGGLE_IDIOM} » (plafond ${CEILING_TOGGLE}).\n` +
        `Une rangée de choix exclusifs passe par <FilterChips> de @bellum/ui.\n` +
        occurrences(TOGGLE_IDIOM)
          .map(f => `  ${f.path.split('/src/')[1]} ×${f.count}`)
          .join('\n'),
    ).toBeLessThanOrEqual(CEILING_TOGGLE)
  })

  it('ne laisse pas REMONTER l’actif peint à 16 % d’accent', () => {
    const total = occurrences(CHIP_WASH_IDIOM).reduce((sum, f) => sum + f.count, 0)
    expect(
      total,
      `${total} usages de l'actif « color-mix 16 % » (plafond ${CEILING_CHIP_WASH}).\n` +
        `C'était la marque de la famille B des pastilles ; l'actif d'un filtre est\n` +
        `désormais un remplissage plein --bellum-primary-500, décidé dans <FilterChips>.`,
    ).toBeLessThanOrEqual(CEILING_CHIP_WASH)
  })

  it('ne laisse pas REMONTER les pastilles écrites à la main', () => {
    const total = HANDMADE_PILL_IDIOMS.reduce(
      (sum, idiom) => sum + occurrences(idiom).reduce((n, f) => n + f.count, 0),
      0,
    )
    expect(
      total,
      `${total} pastilles écrites à la main (plafond ${CEILING_HANDMADE_PILL}).\n` +
        `Une rangée de CHOIX passe par <FilterChips> ; une puce isolée emprunte\n` +
        `chipClassName() de @bellum/ui. Écrire les classes à la main crée une\n` +
        `forme de plus — il y en a eu sept avant le 01/09.\n` +
        HANDMADE_PILL_IDIOMS.flatMap(idiom => occurrences(idiom))
          .map(f => `  ${f.path.split('/src/')[1]} ×${f.count}`)
          .join('\n'),
    ).toBeLessThanOrEqual(CEILING_HANDMADE_PILL)
  })

  it('fait de `chip-style` la SOURCE — les deux composants la lisent', () => {
    /*
     * ⚠️ LA RAISON D'ÊTRE DE CE TEST.
     *
     * `TabNav variant="pill"` et `FilterChips` rendaient tous deux un second
     * niveau en pastilles, et ils se CONTREDISAIENT : le fond
     * `--bellum-surface-2` disait « actif » chez l'un et « au repos » chez
     * l'autre. Le même gris, deux sens opposés, sur deux barres séparées de
     * deux pixels de hauteur. C'est ce que Louis a vu en recette.
     *
     * Les deux gardent leur code — l'un sait défiler et porter des liens,
     * l'autre sait compter et se sélectionner à plusieurs — mais un seul
     * endroit décide de la forme.
     */
    for (const file of ['molecules/tab-nav.tsx', 'molecules/filter-chips.tsx']) {
      const found = CORPUS.find(f => f.path.endsWith(file))
      expect(found, `composant introuvable : ${file}`).toBeDefined()
      expect(found?.source.includes('chipClassName'), `${file} doit lire chip-style`).toBe(true)
    }
    // Et la source dit bien les deux états, sinon elle ne décide de rien.
    expect(CHIP_STYLE).toContain('--bellum-primary-500')
    expect(CHIP_STYLE).toContain('--bellum-on-primary')
    /*
     * #1824 — cette ligne cherchait `--bellum-surface-2`, et elle a continué
     * de passer APRÈS que ce token a cessé de décider quoi que ce soit : il
     * ne subsiste plus que dans le récit du défaut, en tête de fichier. Une
     * garde qui lit un COMMENTAIRE ne garde rien. Elle vise désormais le
     * token qui commande réellement l'état de repos, et le second test de ce
     * describe prouve qu'elle sait dire non.
     */
    expect(CHIP_STYLE).toContain('--bellum-chip-rest')
    expect(CHIP_STYLE).toMatch(/bg-\[var\(--bellum-chip-rest\)\]/)
  })

  it('garde ceux qui EMPRUNTENT la grammaire sans être une rangée', () => {
    const regressions = BORROW_THE_GRAMMAR.filter(file => {
      const found = CORPUS.find(f => f.path.endsWith(file))
      return !found?.source.includes('chipClassName')
    })
    expect(
      regressions,
      `Ces écrans lisaient chip-style et ne le lisent plus :\n${regressions.map(f => `  ${f}`).join('\n')}`,
    ).toEqual([])
  })

  it('garde les écrans migrés sur le composant partagé', () => {
    const regressions = MIGRATED.filter(file => {
      const found = CORPUS.find(f => f.path.endsWith(file))
      return !found?.source.includes('FilterChips')
    })
    expect(
      regressions,
      `Ces écrans avaient leur rangée sur <FilterChips> et ne l'ont plus :\n` +
        regressions.map(f => `  ${f}`).join('\n'),
    ).toEqual([])
  })
})
