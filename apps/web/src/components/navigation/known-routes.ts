import { SETTINGS_SECTIONS } from '../sidebar/items.settings'
import { offNavRoutes } from './off-nav-screens'
import { allNavRoutes } from './sections'

/**
 * OÙ LE COPILOTE A LE DROIT DE T'ENVOYER — #1778.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Le rendu des réponses de Laura ne connaissait que le gras : un lien écrit en
 * markdown s'affichait crochets compris, et aucune URL n'était cliquable. Ne
 * pouvant pas MONTRER le chemin, elle le DÉCRIT — et le 09/09 elle a décrit un
 * bouton qui n'existe pas (#1768, « Clique sur Lancer la recherche »).
 *
 * Rendre le lien cliquable ne vaut que si la cible existe. Deux dangers, pas
 * un :
 *
 *  1. **la redirection ouverte** — `route` traverse un modèle, et
 *     `//ailleurs.example` commence par `/` tout en quittant le domaine ;
 *  2. **le lien mort** — `/decouvrir` reste dans l'application et rend un 404.
 *     Ce dépôt l'a déjà payé : une route émise par le serveur (`/messagerie`)
 *     n'existait pas côté SPA (`/mailbox`).
 *
 * La liste des cibles n'est donc pas écrite ici : elle est DÉRIVÉE de la
 * navigation (`allNavRoutes`), déjà tenue par `sections.test.ts`. Une liste
 * recopiée aurait divergé au premier onglet déplacé — il y en a eu un le 26/08.
 *
 * ⚠️ C'est une AUTORISATION, pas un inventaire : une route qui existe sans être
 * ici n'est simplement pas proposable par le copilote (le back-office, l'écran
 * de connexion, un tunnel d'inscription). GA-277 le vérifie dans les deux sens.
 */

/**
 * Les écrans de réglages vers lesquels une réponse renvoie légitimement.
 *
 * Ils ne sont pas dans `allNavRoutes()` : la barre de réglages est une seconde
 * navigation, et `sections.ts` déclare zéro onglet sur la section Réglages
 * (ils ne s'y afficheraient jamais). Ceux-ci sont ceux que Laura a des
 * raisons de nommer — brancher un outil, compléter son profil, ses crédits.
 *
 * ⚠️⚠️ #1820 / #1822 / #1823 (09/09/2026) — CETTE LISTE AVALE EN SILENCE.
 *
 * C'est une liste BLANCHE, et ce qui n'y figure pas ne produit pas d'erreur :
 * `appRouteTarget()` rend `null`, et la carte de proposition passe en
 * `phase: 'failed'` sans que rien ne dise pourquoi. Mesuré : Laura sait
 * parfaitement lire les routines et l'assistant d'import, et proposer d'y
 * emmener — mais la proposition mourait ici, à la dernière porte.
 *
 * C'est le même défaut que ce dépôt a déjà payé ailleurs : un filtre déclaré
 * au contrat, accepté par le serveur, posé dans l'URL, passé au hook — et
 * jamais envoyé, parce qu'une liste blanche l'avalait. Une liste blanche ne
 * se met pas à jour toute seule, et son échec ne se voit pas.
 *
 * Règle pour la suite : **tout écran de réglages que le copilote sait LIRE
 * doit pouvoir être atteint.** Ajouter un outil de lecture sur un écran sans
 * l'ajouter ici livre une moitié de geste.
 *
 * ⚠️⚠️ #1903.15 / #1933 (13/09/2026) — LA RÈGLE N'ÉTAIT PAS TENUE : LA LISTE ÉTAIT RECOPIÉE.
 *
 * Elle portait cinq écrans écrits à la main. Le catalogue que Laura reçoit pour
 * renvoyer vers les réglages (`SETTINGS_SCREENS`,
 * `apps/ia/app/services/chat_tools.py`) en porte vingt et un — dérivés de la
 * barre des Réglages, synchronisés par `test_settings_screens_catalog.py`.
 * « Ouvrir Lexique », « Ouvrir Mémoire », « Ouvrir Listes métier » — des renvois
 * que ses propres outils recommandent — mouraient ICI au clic, en silence :
 * mesuré par `laura-deep-links.test.ts`, qui relit les routes littérales du
 * service IA et les soumet à cette fonction.
 *
 * La liste DÉRIVE désormais de la même source que ce catalogue
 * (`SETTINGS_SECTIONS`) : un écran ajouté à la barre des Réglages est ouvrable
 * le jour même, sans que personne ait à s'en souvenir. Ce n'est pas une
 * ouverture de droits — chaque écran garde sa propre garde de rôle, ce module ne
 * dit que « la route existe et un lien peut y mener ».
 */
const LINKABLE_SETTINGS: readonly string[] = SETTINGS_SECTIONS.flatMap(section =>
  section.items.flatMap(item => (typeof item.to === 'string' ? [item.to] : [])),
)

/**
 * Les écrans qui portent une FICHE, donc un identifiant en dernier segment.
 *
 * Sans eux, « ouvre le compte SOCOTEC » ne peut mener nulle part : la nav ne
 * connaît que `/accounts`, la fiche est `/accounts/<id>`. Le routeur déclare
 * bien une route à identifiant pour chacun — GA-277 le vérifie, sinon le lien
 * serait mort d'une autre façon.
 */
export const LINKABLE_DETAIL_PREFIXES = [
  '/accounts',
  '/consultants',
  '/contacts',
  '/actions',
  '/missions',
  // #3267 (recette du 30/09) — la fiche d'un besoin (`/projects/needs/<id>`)
  // porte son onglet matching (`?tab=matching`, `NeedMatchTab.tsx`) : le
  // classement de `run_matching` existait déjà côté outil, mais Laura ne
  // pouvait renvoyer vers aucun écran qui le montre. Même défaut que celui
  // documenté en tête de ce module (lien mort avalé en silence par la liste
  // blanche), mesuré cette fois par la recette plutôt qu'en production.
  '/projects/needs',
] as const

/**
 * #1903 / #1933.5 — les SOUS-ÉCRANS d'une fiche, écrits comme le routeur les déclare.
 *
 * « J'ai un consultant disponible » → le marché inverse DE ce consultant, qui vit
 * à `/consultants/<id>/reverse-market` : deux segments après le préfixe, donc
 * refusé par la règle « UN segment d'identifiant » — la page était
 * architecturalement inatteignable depuis Laura. Chaque sous-écran est nommé
 * plutôt qu'accepté en joker : un joker rouvrirait les profondeurs que le routeur
 * ne porte pas. `$id` vaut un segment d'identifiant ; GA-277 vérifie que chaque
 * forme existe au routeur, et `test_chat_guided_action_app_routes.py` que le
 * catalogue Python la recopie à l'identique.
 */
export const LINKABLE_DETAIL_SUBSCREENS = ['/consultants/$id/reverse-market'] as const

/**
 * #2151.1 / #2151.26 (16/09/2026) — LES ÉCRANS SERVIS QUI ONT QUITTÉ LA NAVIGATION.
 *
 * Le lot navigation de la vague 5 a sorti « Veille » et « Partenaires » des
 * onglets de Comptes. Les DEUX écrans restent servis par le routeur — leurs
 * commentaires dans `sections.ts` le disent explicitement, et `sections.test.ts`
 * en tient la raison écrite (`REACHED_OTHERWISE`, `linkedFromAScreen`). Mais la
 * liste ci-dessous DÉRIVE de la navigation : retirer l'onglet a retiré
 * l'autorisation, et « ouvre la veille » mourait à la dernière porte — le défaut
 * n°2 documenté en tête de ce module, avalé en silence par la liste blanche.
 *
 * Dériver de la navigation reste la bonne règle pour tout le reste : elle évite
 * la liste recopiée qui diverge au premier onglet déplacé. Ce qu'il manquait,
 * c'est que « je ne suis plus une DESTINATION de la nav » et « je ne suis plus
 * un ÉCRAN » sont deux choses différentes. Un écran qui se rejoint autrement —
 * depuis un bloc de /discover, depuis un onglet de fiche compte — reste un écran
 * où l'utilisateur peut se trouver, donc un écran où Laura peut l'emmener.
 *
 * ⚠️ `/accounts/partners` était accepté AVANT ce correctif, mais par accident :
 * `partners` a la forme d'un segment d'identifiant, donc la règle des fiches le
 * prenait pour le compte d'identifiant « partners ». Une autorisation qui tient
 * à une homonymie n'en est pas une — elle est nommée ici.
 *
 * ⚠️ Cette liste reste une AUTORISATION, pas un fourre-tout : un écran ne s'y
 * ajoute que s'il est servi par le routeur (GA-277 le vérifie) ET que le
 * catalogue de Laura le nomme (`DEEP_LINK_SCREENS`, `chat_tools.py`).
 *
 * ⚠️⚠️ Elle était ÉCRITE ICI, et c'était un versant sur trois. `sectionForPath`
 * n'allumait plus aucune entrée de barre sur ces écrans, et les deux gardes
 * Python qui relisent la navigation du web sur le disque réclamaient qu'on les
 * retire du catalogue de Laura et de son prompt. Un même défaut de chaque côté
 * de la frontière TypeScript / Python, réparé d'un seul côté : la déclaration
 * vit désormais à UN endroit (`off-nav-screens.ts`, GA-26) et tout le monde en
 * part.
 */
const LINKABLE_OFF_NAV: readonly string[] = offNavRoutes()

/**
 * #4351.1 (Louis 19/10/2026) — « En cours » quitte la barre : `/missions` nu ouvre Planning, la liste
 * reste servie sous `?vue=liste`. Laura écrit encore `/missions` : l'adresse reste un lien accepté.
 * PAS dans `off-nav-screens.ts` : un écran hors barre masque la barre de TOUT son préfixe, et
 * `/missions/planification` / `/missions/facturation` perdraient leurs onglets.
 */
const LINKABLE_SECTION_LISTS: readonly string[] = ['/missions']

/**
 * Théo D (Louis 22/10/2026) — Pilotage est UNE page à sections ancrées. Les trois anciennes adresses ne sont
 * plus des écrans mais redirigent (`routes/pilotage/*.tsx`) : Laura (service IA) les écrit encore, et un lien
 * entrant ne doit pas mourir à la dernière porte. Le service IA les nommera `/pilotage#pipe…` au prochain
 * passage sur son catalogue ; d'ici là elles restent ACCEPTÉES.
 */
const LINKABLE_REDIRECTS: readonly string[] = [
  '/pilotage/pipe',
  '/pilotage/staffing',
  '/pilotage/finance',
  // #4532/#4533/#4535 (24/10) — plus d'entrée de menu, mais l'adresse EXISTE (redirection ou page gardée) : le service
  // IA les émet encore (`chat_tools.py`, `SETTINGS_SCREENS`) et une carte de Laura ne doit pas mourir au clic.
  '/settings/import',
  '/settings/vivier-export',
  '/settings/shortcuts',
]

/** Tous les chemins EXACTS vers lesquels une réponse peut renvoyer. */
export function linkableRoutes(): string[] {
  return [
    ...new Set([
      ...allNavRoutes(),
      ...LINKABLE_SETTINGS,
      ...LINKABLE_OFF_NAV,
      ...LINKABLE_SECTION_LISTS,
      ...LINKABLE_REDIRECTS,
    ]),
  ]
}

/** Un segment d'identifiant : uuid, identifiant court, ou libellé en minuscules. */
const ID_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

/**
 * Le chemin d'application vers lequel on accepte de naviguer, ou `null`.
 *
 * Rend le chemin NORMALISÉ (espaces retirés, requête et ancre conservées) plutôt
 * qu'un booléen : l'appelant navigue vers ce que la fonction a validé, jamais
 * vers la chaîne d'origine — sinon la validation porterait sur autre chose que
 * ce qui est utilisé.
 */
export function appRouteTarget(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('/')) return null
  // `//ailleurs.example` et `/\ailleurs.example` commencent par `/` et quittent
  // le domaine dans plusieurs navigateurs.
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return null
  if (trimmed.includes('..')) return null

  const [pathWithoutHash] = trimmed.split('#')
  const [pathname] = pathWithoutHash.split('?')
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname

  if (linkableRoutes().includes(path)) return trimmed

  // Une fiche : un préfixe autorisé, puis UN segment d'identifiant. Deux
  // segments de plus ne sont pas une fiche — le routeur ne les porte pas.
  for (const prefix of LINKABLE_DETAIL_PREFIXES) {
    if (!path.startsWith(`${prefix}/`)) continue
    const rest = path.slice(prefix.length + 1)
    if (ID_SEGMENT.test(rest) && !linkableRoutes().includes(path)) return trimmed
  }

  // Un sous-écran de fiche : même nombre de segments, `$…` = un identifiant.
  const segments = path.split('/')
  for (const pattern of LINKABLE_DETAIL_SUBSCREENS) {
    const expected = pattern.split('/')
    if (expected.length !== segments.length) continue
    if (
      expected.every((part, index) =>
        part.startsWith('$') ? ID_SEGMENT.test(segments[index]) : part === segments[index],
      )
    ) {
      return trimmed
    }
  }
  return null
}
