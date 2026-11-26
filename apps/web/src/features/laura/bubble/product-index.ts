import {
  resolveChangelogEntries,
  resolveChangelogLanguage,
  type ChangelogEntry,
  type LauraPageContext,
} from '@bellum/contracts'
import { NAV_SECTIONS, sectionForPath } from '@/components/navigation/sections'
import { SETTINGS_SECTIONS } from '@/components/sidebar/items.settings'

/**
 * CE QUE LAURA SAIT DIRE DU PRODUIT — et d'où chaque phrase vient.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CE FICHIER EXISTE POUR NE PAS COMMETTRE
 * ─────────────────────────────────────────────────────────────────────────────
 * La façon évidente de faire expliquer Bellum par Laura est d'écrire le produit
 * dans son prompt : « voici les neuf sections, voici les nouveautés, voici
 * comment créer un besoin ». Ça marche le jour où on l'écrit, et c'est périmé
 * trois semaines plus tard sans qu'aucun test ne tombe — le dépôt nomme ce
 * défaut : « l'essentiel vit dans un PROMPT, et un prompt se réécrit sans
 * qu'un test tombe » (`c36_recrutement_preuve`). Un tuto qui décrit un écran
 * qui n'existe pas est pire que pas de tuto.
 *
 * Ce module ne contient donc **aucune connaissance produit écrite à la main**.
 * Il DÉRIVE ses réponses de deux sources qui vivent déjà dans le dépôt et que
 * quelqu'un met à jour pour d'autres raisons :
 *
 *  · **le changelog** (`packages/contracts/src/changelog/`) — les entrées
 *    datées, FR et EN, que la convention du dépôt oblige à écrire AVANT le
 *    merge de toute feature user-facing. C'est par là que Louis suit le
 *    produit ; c'est donc la seule source honnête de « qu'est-ce qui a
 *    changé ? ».
 *  · **la navigation** (`apps/web/src/components/navigation/sections.ts`) — les
 *    neuf sections et leurs onglets, chacun avec sa route réelle et sa clé de
 *    libellé. C'est la seule source honnête de « où je trouve … ? », et elle a
 *    la propriété qui compte : une route qui disparaît disparaît de la réponse.
 *
 * ⚠️ **Elle explique le PRODUIT, jamais le CODE.** « Branchée au code » veut
 * dire que ce qu'elle affirme est dérivé de sources vérifiables du dépôt — pas
 * qu'elle lit des fichiers source à quelqu'un.
 *
 * ⚠️ **Aucun nom d'éditeur.** Ce module ne nomme que des surfaces de Bellum ;
 * les libellés viennent des traductions du produit, qui nomment déjà la
 * CAPACITÉ (« votre CRM ») et non le fournisseur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE FAIT PAS : DEVINER UNE INTENTION
 * ─────────────────────────────────────────────────────────────────────────────
 * Il n'y a pas de classifieur « cette question parle-t-elle du produit ? ». Un
 * détecteur qui rate intercepte une vraie question, et un détecteur qui déborde
 * répond à côté. Ce module rend des **candidats mesurés** — un recouvrement de
 * mots au-dessus d'un seuil — que la bulle propose SOUS le champ de saisie, à
 * côté de la question. La touche Entrée envoie toujours à Laura. Proposer
 * n'intercepte rien.
 */

/**
 * Le seuil de recouvrement au-dessus duquel une entrée de navigation est
 * proposée.
 *
 * `1` = un mot significatif de la question se retrouve dans le libellé ou la
 * route. Plus bas n'a pas de sens (zéro mot commun = aucun lien), plus haut
 * ferait rater « notes de frais » posé « frais ». C'est délibérément permissif :
 * une proposition à côté se lit et s'ignore, une proposition absente ne se
 * découvre jamais.
 */
const NAV_MATCH_MIN_TOKENS = 1

/**
 * Les mots qu'on ne compte pas.
 *
 * Sans eux, « où » et « je » recouvriraient la moitié de la navigation et
 * chaque question rendrait neuf propositions — c'est-à-dire aucune.
 */
const STOP_WORDS: ReadonlySet<string> = new Set([
  'ou',
  'je',
  'tu',
  'on',
  'le',
  'la',
  'les',
  'un',
  'une',
  'des',
  'du',
  'de',
  'trouve',
  'trouver',
  'est',
  'sont',
  'ce',
  'cette',
  'quoi',
  'que',
  'qui',
  'comment',
  'dans',
  'sur',
  'pour',
  'mes',
  'mon',
  'ma',
  'me',
  'the',
  'a',
  'an',
  'of',
  'in',
  'on',
  'to',
  'my',
  'where',
  'what',
  'how',
  'do',
  'does',
  'is',
  'are',
  'find',
  'can',
  'i',
])

/** Insensible à la casse ET aux accents — même repli que `filterThreads`. */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function tokens(value: string): string[] {
  return fold(value)
    .split(/[^a-z0-9]+/)
    .filter(token => token.length > 1 && !STOP_WORDS.has(token))
}

/** Une destination du produit, telle que la navigation la déclare. */
type ProductDestination = {
  /** La route réelle — celle que la navigation porte, jamais devinée. */
  route: string
  /** Le libellé de l'onglet, dans la langue active. */
  label: string
  /** La section qui l'accueille, dans la langue active. */
  sectionLabel: string
}

/** Le traducteur du namespace `nav`, injecté pour que ce module reste pur. */
type NavLabel = (key: string) => string

/**
 * Toutes les destinations déclarées par la navigation, à plat.
 *
 * Une section SANS onglet n'a qu'un écran : elle entre alors comme sa propre
 * destination, sinon elle serait invisible à la recherche — c'est le cas des
 * sections à un seul écran, et les oublier ferait répondre « je ne sais pas »
 * sur un écran qui existe.
 */
/**
 * #4344 (Louis 19/10/2026) — les écrans qui ont PERDU leur onglet mais restent une destination :
 * « Besoins ouverts » vit dans le Pipe (colonne « Besoin exprimé ») ; `/projects/needs` y redirige (F1-FIX). Sans cette ligne, « trouver
 * un besoin client » ne mènerait plus nulle part alors que l'écran existe.
 */
const SCREENS_WITHOUT_TAB: readonly { route: string; labelKey: string; sectionKey: string }[] = [
  { route: '/projects', labelKey: 'tabs.needsOpen', sectionKey: 'projects' },
]

export function productDestinations(label: NavLabel): ProductDestination[] {
  const out: ProductDestination[] = []
  for (const section of NAV_SECTIONS) {
    const sectionLabel = label(section.labelKey)
    if (section.tabs.length === 0) {
      out.push({ route: section.to, label: sectionLabel, sectionLabel })
      continue
    }
    for (const tab of section.tabs) {
      out.push({ route: tab.to, label: label(tab.labelKey), sectionLabel })
    }
  }
  for (const screen of SCREENS_WITHOUT_TAB) {
    const section = NAV_SECTIONS.find(candidate => candidate.key === screen.sectionKey)
    if (section) out.push({ route: screen.route, label: label(screen.labelKey), sectionLabel: label(section.labelKey) })
  }
  return out
}

/**
 * « Où je trouve … ? » — les destinations dont le libellé recouvre la question.
 *
 * Rend une liste VIDE quand rien ne recouvre. Un « je ne sais pas » silencieux
 * vaut mieux qu'une proposition au hasard : la bulle n'affiche alors rien, et
 * la question part à Laura comme n'importe quelle autre.
 */
export function findDestinations(question: string, label: NavLabel, limit = 3): ProductDestination[] {
  const asked = tokens(question)
  if (asked.length === 0) return []
  const scored = productDestinations(label).map(destination => {
    const haystack = tokens(`${destination.label} ${destination.route.replace(/[/$]/g, ' ')}`)
    const hits = asked.filter(token =>
      haystack.some(word => word === token || word.startsWith(token) || token.startsWith(word)),
    ).length
    return { destination, hits }
  })
  return scored
    .filter(entry => entry.hits >= NAV_MATCH_MIN_TOKENS)
    .sort((left, right) => right.hits - left.hits)
    .slice(0, limit)
    .map(entry => entry.destination)
}

/**
 * Les dernières nouveautés, dans la langue active.
 *
 * ⚠️ Le catalogue est résolu une fois par langue et gardé : `resolveChangelogEntries`
 * reconstruit les ~487 entrées à chaque appel, et la bulle interroge à chaque
 * frappe. Le catalogue est STATIQUE — versionné avec le code — donc le garder
 * ne peut pas servir une version périmée : un déploiement remonte le module.
 */
const CACHE = new Map<string, ChangelogEntry[]>()

export function latestChanges(language: string, limit = 3): ChangelogEntry[] {
  const resolved = resolveChangelogLanguage(language)
  let entries = CACHE.get(resolved)
  if (!entries) {
    entries = resolveChangelogEntries(resolved)
    CACHE.set(resolved, entries)
  }
  return entries.slice(0, limit)
}

/**
 * OÙ SE TROUVE L'ÉCRAN COURANT dans la navigation — le « tuto de cette page ».
 *
 * ⚠️ Le rattachement d'un chemin à sa section est une DÉRIVATION, et elle vit
 * déjà à un seul endroit : `sectionForPath` (`components/navigation/sections.ts`),
 * que la barre latérale et l'entête utilisent pour savoir quel onglet est actif.
 * En réécrire une seconde ici — « le préfixe le plus long gagne » — aurait été
 * juste le jour de l'écriture et faux au premier `matchesRoute` ajusté : la
 * bulle aurait alors annoncé une section pendant que l'entête en surlignait une
 * autre. C'est la loi 1 du tome 7 (GA-26), appliquée avant d'avoir le défaut.
 *
 * Ce qui est ajouté ici, et qui n'existait pas, c'est la TRADUCTION des
 * libellés : `sectionForPath` rend des clés i18n, la bulle rend des phrases.
 *
 * `null` quand la route courante n'appartient à aucune section — et c'est le bon
 * état : inventer un rattachement ferait dire à Laura qu'un écran vit quelque
 * part où il ne vit pas.
 */
export function sectionOfRoute(
  pathname: string,
  label: NavLabel,
): { section: string; siblings: ProductDestination[] } | null {
  const found = sectionForPath(pathname)
  if (!found) return settingsBarSection(pathname, label)
  const sectionLabel = label(found.section.labelKey)
  return {
    section: sectionLabel,
    siblings: found.section.tabs.map(tab => ({
      route: tab.to,
      label: label(tab.labelKey),
      sectionLabel,
    })),
  }
}

/**
 * #1904.15 — LES ÉCRANS DE LA BARRE DES RÉGLAGES QUI NE PORTENT PAS `/settings`.
 *
 * `sectionForPath` range `/settings/lexicon` sous Réglages par préfixe, mais
 * `/integrations` et `/billing` vivent dans la même barre (`SETTINGS_SECTIONS`)
 * sans en porter le chemin : la bulle y disait « Cet écran n'est rattaché à
 * aucune section de la navigation », ce qui est faux — on y arrive par
 * Réglages. La barre des Réglages est la source de ce rattachement, pas une
 * liste recopiée ici.
 *
 * Aucun onglet frère : la section Réglages n'en déclare pas (`sections.ts`),
 * ses écrans ont leur propre barre.
 */
function settingsBarSection(
  pathname: string,
  label: NavLabel,
): { section: string; siblings: ProductDestination[] } | null {
  const inSettingsBar = SETTINGS_SECTIONS.some(group =>
    group.items.some(
      item => typeof item.to === 'string' && (pathname === item.to || pathname.startsWith(`${item.to}/`)),
    ),
  )
  const settings = NAV_SECTIONS.find(section => section.key === 'settings')
  if (!inSettingsBar || !settings) return null
  return { section: label(settings.labelKey), siblings: [] }
}

/**
 * Ce que la bulle propose SOUS la saisie, dérivé de ce qui est tapé.
 *
 * Trois familles au plus, dans cet ordre : les destinations (la question la plus
 * fréquente), puis les nouveautés quand la question en parle. Rien d'autre — et
 * surtout rien qui ressemblerait à une réponse métier : celle-là vient de Laura,
 * qui a le contexte serveur.
 */
export type ProductSuggestion =
  | { kind: 'destination'; destination: ProductDestination }
  | { kind: 'changelog'; entry: ChangelogEntry }

/** Les mots qui, eux, désignent sans ambiguïté une demande de nouveautés. */
const CHANGELOG_WORDS: readonly string[] = [
  'nouveaute',
  'nouveautes',
  'nouveau',
  'change',
  'changement',
  'changements',
  'whatsnew',
  'new',
  'changed',
  'release',
  'releases',
  'quoi de neuf',
  'neuf',
]

export function productSuggestions(args: { question: string; language: string; label: NavLabel }): ProductSuggestion[] {
  const question = args.question.trim()
  if (question.length < 3) return []
  const folded = fold(question)
  const asksForChanges = CHANGELOG_WORDS.some(word => folded.includes(word))
  const suggestions: ProductSuggestion[] = findDestinations(question, args.label).map(destination => ({
    kind: 'destination' as const,
    destination,
  }))
  if (asksForChanges) {
    for (const entry of latestChanges(args.language, 2)) suggestions.push({ kind: 'changelog', entry })
  }
  return suggestions.slice(0, 4)
}

/**
 * L'écran courant, résumé pour le tuto — le titre DÉCLARÉ, jamais la route.
 *
 * Rend `null` quand l'écran ne déclare rien : la bulle dit alors qu'elle ne sait
 * pas ce qui est ouvert, ce qui est vrai, plutôt que de nommer une route.
 */
export function declaredScreenTitle(context: LauraPageContext | null): string | null {
  if (!context) return null
  const label = context.label.trim()
  return label.length > 0 ? label : null
}

/**
 * #1904.3 — L'OBJET OUVERT, TEL QUE L'ÉCRAN L'A NOMMÉ — jamais son
 * `entityId` : un identifiant ne se lit pas, voir `laura-context.ts`.
 *
 * Même règle que `declaredScreenTitle` : `null` sans écran, ou sans
 * déclaration, ou pour une valeur à blanc — jamais une ligne à trou.
 */
export function declaredEntityLabel(context: LauraPageContext | null): string | null {
  if (!context) return null
  const value = context.entityLabel?.trim()
  return value && value.length > 0 ? value : null
}

/**
 * #1904.9 — LE GESTE LE PLUS UTILE, tel que l'écran l'a désigné parmi ceux
 * qu'il rend — jamais un rang calculé ici (aucune probabilité).
 */
export function declaredRecommendedAction(context: LauraPageContext | null): string | null {
  if (!context) return null
  const value = context.recommendedAction?.trim()
  return value && value.length > 0 ? value : null
}
