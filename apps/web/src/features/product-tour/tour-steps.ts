import {
  Briefcase,
  Building2,
  Crosshair,
  FolderKanban,
  Gauge,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  MessagesSquare,
  Plug,
  Search,
  Users2,
  type LucideIcon,
} from 'lucide-react'
import { PRODUCT_SCREENS, type ProductScreen } from '@bellum/contracts'

/**
 * #1787 · #1863.3 — LES ÉCRANS RETENUS POUR LA VISITE GUIDÉE, ET POURQUOI CEUX-LÀ.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE REFUS DE #1787 TIENT TOUJOURS : PAS LES 56 ÉCRANS DU CATALOGUE
 * ─────────────────────────────────────────────────────────────────────────
 * « Un tour de 56 écrans ne se termine jamais. » C'était vrai en #1787, ça
 * l'est encore. Ce qui a changé en #1863.3, c'est la manière de CHOISIR : six
 * écrans avaient été pris à la main, et une liste prise à la main ne sait pas
 * dire ce qu'elle oublie. Le retour de Louis l'a mesuré pour nous — « la visite
 * doit vraiment permettre de tout comprendre de Bellum » : le vivier, les
 * missions, les projets, le pilotage et les intégrations n'y étaient nulle
 * part, et rien dans le code ne pouvait le signaler.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE DE COMPLÉTUDE EST DÉRIVÉE, PAS CHOISIE : UNE ÉTAPE PAR **AIRE**
 * ─────────────────────────────────────────────────────────────────────────
 * Le catalogue groupe déjà ses 56 écrans en AIRES (`ProductScreen.area`) — et
 * c'est exactement la granularité que « tout comprendre du produit » demande :
 * on ne visite pas les onze écrans de `missions`, on visite CE QUE MISSIONS
 * FAIT. La visite couvre donc **toutes les aires de nature « produit »**, et
 * `tour-steps.test.ts` le vérifie dans le sens qui compte : une aire NEUVE au
 * catalogue fait rougir la CI tant qu'aucune étape ne la présente.
 *
 * Douze étapes pour onze aires, et les deux écarts sont NOMMÉS :
 *
 *  · `accueil` en porte DEUX — le tableau de bord (où l'on arrive) et la
 *    recherche (le geste fondateur du produit : taper un nom d'entreprise).
 *    Les confondre ferait disparaître la promesse elle-même.
 *  · `demarrage` n'en porte AUCUNE — `/welcome` et `/onboarding` ne sont pas
 *    une capacité, c'est le chemin d'entrée ; envoyer quelqu'un les « visiter »
 *    relancerait un assistant par-dessus la visite. Exception nommée, tenue par
 *    un témoin dans la suite (elle doit rester une EXCEPTION, pas un trou).
 *  · `acces` sort tout seul : elle ne porte aucun écran de nature « produit ».
 *
 * `prospection` (#2155) a rejoint les aires couvertes : « Mes cibles » — les
 * listes de travail qui référencent comptes et contacts sans les recopier —
 * est la troisième page du groupe qui réunit Comptes, Contacts et Mes cibles
 * dans la barre latérale (`sections.ts`). C'est ce que cette garde protège :
 * elle a rougi au premier merge qui ajoutait l'aire sans lui donner d'étape.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ORDRE RACONTE LA BOUCLE DU PRODUIT, ET IL N'EST PAS CELUI DU CATALOGUE
 * ─────────────────────────────────────────────────────────────────────────
 * Le catalogue range `missions` avant `projets` ; le produit se joue dans
 * l'autre sens — un besoin client devient une mission, jamais l'inverse. La
 * garde vérifie la COUVERTURE, pas l'ordre : l'ordre est une décision de
 * récit, et elle est écrite ici.
 *
 *  1-2. On arrive, et on tape un nom d'entreprise.
 *  3-6. Ce que ça produit : un dossier, ses interlocuteurs, qui prospecter en
 *       priorité, ce qu'il faut faire.
 *  7.   Laura, qui sait déjà tout ça.
 *  8-10. L'autre moitié du métier : qui on peut vendre, ce que le client
 *       cherche, ce qui est signé.
 *  11.  Ce que tout ça donne, vu de haut.
 *  12.  Et comment brancher ses propres outils dessus.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * RÉUTILISE LE CATALOGUE, NE LE RECOPIE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * `product-screens-catalog.ts` (#1683) est déjà LE registre des écrans, tenu à
 * jour contre `apps/web/src/routes/` par la garde GA-265. Une liste de titres
 * réécrite ici dériverait du catalogue en trois semaines (loi 1 du tome 7) :
 * chaque étape résout donc son `screen` DEPUIS le catalogue, et ne porte
 * jamais son propre libellé.
 *
 * ⚠️ Seules des routes SANS paramètre (`$id`…) sont éligibles : la visite doit
 * pouvoir naviguer vers chaque écran sans qu'un identifiant réel existe. C'est
 * pour cette raison que le dossier de conquête individuel (`/accounts/$id/brief`)
 * n'est pas une étape — l'étape « Comptes » y renvoie dans sa description.
 */
// Non exportés : consommés uniquement ici et dans les composants de la visite
// via le type INFÉRÉ de `PRODUCT_TOUR_STEPS` — exporter un type que personne
// n'importe encore serait le défaut que `pnpm lint:exports:types` (knip) fait
// échouer (règle du dépôt : jamais de type exporté consommé dans son seul
// fichier).
type ProductTourStepKey =
  | 'dashboard'
  | 'search'
  | 'accounts'
  | 'contacts'
  | 'targets'
  | 'actions'
  | 'chat'
  | 'consultants'
  | 'projects'
  | 'missions'
  | 'pilotage'
  | 'integrations'

type ProductTourStep = {
  key: ProductTourStepKey
  /** Le motif de route, SANS paramètre — toujours résolvable en `<Link>`. */
  route: string
  /** L'icône décorative de l'étape (aria-hidden côté composant). */
  icon: LucideIcon
  /** L'écran du catalogue, résolu une fois ici — jamais recopié. */
  screen: ProductScreen
}

const STEP_ROUTES: Record<ProductTourStepKey, string> = {
  // Théo A today-jour.A8 — « Tableau de bord » retiré : la première étape présente « Ta journée » (/briefing).
  dashboard: '/briefing',
  search: '/search',
  accounts: '/accounts',
  contacts: '/contacts',
  targets: '/signals',
  actions: '/actions',
  chat: '/chat',
  consultants: '/consultants',
  projects: '/projects',
  missions: '/missions',
  pilotage: '/pilotage',
  integrations: '/integrations',
}

const STEP_ICONS: Record<ProductTourStepKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  search: Search,
  accounts: Building2,
  contacts: Users2,
  // Même icône que l'onglet de la barre latérale (`items.ts` TAB_ICONS) — la
  // visite et la nav désignent le même écran, elles ne se contredisent pas.
  targets: Crosshair,
  actions: ListChecks,
  chat: MessagesSquare,
  consultants: GraduationCap,
  projects: FolderKanban,
  missions: Briefcase,
  pilotage: Gauge,
  integrations: Plug,
}

/** L'ORDRE de la visite — c'est lui qui raconte la boucle du produit. */
const STEP_ORDER: readonly ProductTourStepKey[] = [
  'dashboard',
  'search',
  'accounts',
  'contacts',
  'targets',
  'actions',
  'chat',
  'consultants',
  'projects',
  'missions',
  'pilotage',
  'integrations',
]

/**
 * L'aire du catalogue que la visite ne présente PAS, et la raison.
 *
 * Elle est déclarée ici plutôt que dans le test : une exception que seule la
 * garde connaît est une exception que personne ne relit. Le test vérifie
 * qu'elle reste une exception — c'est-à-dire qu'elle existe vraiment au
 * catalogue, et qu'elle est la SEULE.
 */
export const TOUR_AREA_WITHOUT_STEP = 'demarrage'

function resolveStepScreen(route: string): ProductScreen {
  const screen = PRODUCT_SCREENS.find(candidate => candidate.route === route)
  if (!screen) {
    // Sait dire NON : une route retirée du catalogue casse le module au
    // chargement plutôt que de rendre un titre vide en silence.
    throw new Error(`Écran de tour introuvable dans le catalogue des écrans : ${route}`)
  }
  return screen
}

export const PRODUCT_TOUR_STEPS: readonly ProductTourStep[] = STEP_ORDER.map(key => ({
  key,
  route: STEP_ROUTES[key],
  icon: STEP_ICONS[key],
  screen: resolveStepScreen(STEP_ROUTES[key]),
}))
