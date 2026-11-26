import type { ChatResponseContext } from './ContextDisclosure'

/**
 * La PROVENANCE d'une réponse, réduite à ce qui tient sur une ligne.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE LIGNE PLUTÔT QU'UN PANNEAU
 * ─────────────────────────────────────────────────────────────────────────────
 * Le panneau de transparence dit tout, et c'est sa qualité — mais il est REPLIÉ,
 * et un panneau replié n'est ouvert que par quelqu'un qui doute déjà. Or les
 * deux informations qui devraient faire douter sont précisément celles qu'on ne
 * voit pas sans l'ouvrir : **de quand date ce que Laura a lu**, et **ce qu'elle
 * n'a pas pu consulter**.
 *
 * Ce module en tire une ligne toujours visible. Le panneau reste, derrière
 * « Voir la source » : rien n'est retiré, la hiérarchie change.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUI PORTE TOUT LE MODULE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un compteur absent n'est pas ZÉRO. « 0 donnée manquante » affirme que Laura a
 * tout consulté ; l'absence de la liste dit seulement qu'on ne sait pas. Les
 * deux se ressemblent à l'écran et disent le contraire l'un de l'autre — c'est
 * la famille « cassé et non mesurable se ressemblent », payée trois fois dans ce
 * dépôt. D'où `null` partout où la mesure manque, et un rendu qui n'affiche
 * alors rien.
 */

type ReplyProvenance = {
  /**
   * La date du fait le plus RÉCENT parmi les sources datées (#3725).
   *
   * Recette prod 05/10 : « Source du 11 septembre » sous des signaux cités du
   * 21 septembre au 1er octobre — le pied datait la réponse AVANT ce qu'elle
   * montre. Le pied ne peut jamais être antérieur aux signaux affichés ; la
   * fraîcheur de chaque pièce reste lisible une à une dans « Voir la source ».
   */
  asOf: string | null
  /** Nombre de sources citées. `null` = le contexte n'en parle pas. */
  sourceCount: number | null
  /** Ce que Laura n'a PAS pu consulter. `null` = non mesuré, jamais « 0 ». */
  missingCount: number | null
}

/** Les outils dont la matière est le texte collé par la personne, pas une donnée lue en base. */
const PASTED_SOURCE_TOOLS: ReadonlySet<string> = new Set(['compile_need'])

/**
 * #2887.10 (r40) — « Donnée du 7 septembre » le 17/10 sous « que faire cette semaine ? » : le plan d'actions est
 * COMPOSÉ à l'instant sur le portefeuille, il n'a la fraîcheur d'aucun dossier de compte que le prompt portait.
 * Seul ce plan lu : aucune date d'un dossier ne s'affiche (la lecture d'un dossier à côté la rétablit).
 */
const LIVE_COMPOSED_TOOLS: ReadonlySet<string> = new Set([
  'get_action_plan',
  // G.4 (recette 19/10) — « Donnée du 11 septembre » sous un résumé de mails dont les fils datent du jour : la
  // messagerie et l'agenda sont LUS à l'instant, la date du dossier chargé au prompt n'est pas leur fraîcheur.
  'search_mailbox',
  'read_mail_thread',
  'list_agenda',
  'find_free_slots',
  'prepare_day_brief',
])

export function replyProvenance(context: ChatResponseContext | undefined): ReplyProvenance {
  if (!context) return { asOf: null, sourceCount: null, missingCount: null }

  // #3562.1 (recette prod 02/10) — « Source du 18 septembre · 4 sources » sous
  // une réponse qui dit « aucun résultat d'outil » : le pied parle de ce que les
  // OUTILS ont lu. Un tour dont la trace dit `tools_called: []` n'en a lu aucun ;
  // les documents injectés au prompt restent listés dans le panneau « Voir la
  // source », mais ne font ni date ni compte en pied. Trace absente (réponse
  // d'avant ce champ) : on ne devine rien, le pied est inchangé.
  const noToolRead = context.reasoning_trace?.tools_called?.length === 0
  if (noToolRead) {
    return {
      asOf: null,
      sourceCount: null,
      missingCount: Array.isArray(context.not_consulted) ? context.not_consulted.length : null,
    }
  }

  // #4059 (R20) — « Donnée du 29 septembre » sous la carte « Besoin compilé » d'un besoin COLLÉ : la date
  // venait du dossier du compte, injecté au prompt sans être lu pour cette carte. Quand les seuls outils
  // du tour compilent un texte collé, la donnée EST le collage (de maintenant) : aucune date d'une autre
  // donnée ne s'affiche, l'heure de la réponse reste en pied.
  const tools = context.reasoning_trace?.tools_called ?? []
  const pastedOnly = tools.length > 0 && tools.every(tool => PASTED_SOURCE_TOOLS.has(tool))
  const liveOnly = tools.length > 0 && tools.every(tool => LIVE_COMPOSED_TOOLS.has(tool))
  if (pastedOnly || liveOnly) {
    return {
      asOf: null,
      sourceCount: Array.isArray(context.sources) ? context.sources.length : null,
      missingCount: Array.isArray(context.not_consulted) ? context.not_consulted.length : null,
    }
  }

  const dates: number[] = []
  const push = (value: string | null | undefined) => {
    if (!value) return
    const ms = Date.parse(value)
    if (Number.isFinite(ms)) dates.push(ms)
  }
  push(context.active?.account?.as_of)
  for (const source of context.sources ?? []) {
    // #1599 — ⚠️ AUCUNE DATE DE CORPUS VISIBLE. `as_of` d'une observation de
    // mémoire marché est la période du corpus qu'elle agrège, pas une
    // fraîcheur : si une réponse combine aussi une source actuelle, cette
    // date (souvent la plus ANCIENNE) ne doit jamais devenir « la » date
    // affichée en pied de réponse. Elle reste stockée pour l'audit (elle
    // voyage dans `context.sources`, lisible dans le panneau déplié), elle ne
    // participe simplement pas à CE calcul.
    if (source.kind === 'market_observation') continue
    push(source.as_of)
  }

  return {
    asOf: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
    // `sources` est un tableau REQUIS du contrat : sa longueur est donc une vraie
    // mesure, y compris quand elle vaut zéro. `not_consulted` l'est aussi.
    sourceCount: Array.isArray(context.sources) ? context.sources.length : null,
    missingCount: Array.isArray(context.not_consulted) ? context.not_consulted.length : null,
  }
}

/** Date ISO → date courte localisée. `null` si absente ou illisible. */
export function formatAsOf(iso: string | null, language: string): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const locale = language === 'fr' ? 'fr-FR' : 'en-GB'
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}
