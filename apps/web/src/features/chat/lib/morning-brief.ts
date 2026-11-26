import type { BriefingAction, BriefingBlockState, DailyBriefing, WorkspaceRole } from '@bellum/contracts'
import type { TFunction } from 'i18next'
import { BRIEFING_ACTION_CTA } from '@/features/briefing/action-cta'
import { briefingAccessIsSwitchedOff, briefingBlockIsRead } from '@/features/briefing/block-state'

/**
 * LE BRIEF DU MATIN, DANS LA VOIX DE LAURA — #1936.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ DEMANDÉ, ET TRANCHÉ
 * ─────────────────────────────────────────────────────────────────────────
 * « À la première connexion de la journée, Laura présente trois blocs
 * maximum : ce qui a changé, ce que j'ai préparé, ce que je te conseille. »
 * Louis, 12/09 : la 1re ouverture de Laura dans la journée EST le brief ;
 * ensuite, l'amorce courte (`laura-opener.ts`).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE COMPOSEUR FAIT, ET CE QU'IL NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * - **Aucun appel au modèle.** Même raison que l'amorce : la phrase est
 *   composée ici, à partir du `DailyBriefing` que le serveur a DÉJÀ calculé.
 * - **Aucun second classement.** Le bloc 3 reformule l'action que le brief a
 *   servie EN PREMIER — le tri vit côté serveur (`buildBriefingActions` puis
 *   la mémoire marché), et le refaire ici ferait dire à Laura autre chose
 *   qu'à l'écran « Aujourd’hui » sur la même donnée.
 * - **Un fait nommé porte son lien RÉEL, un fait agrégé s'écrit comme tel.**
 *   Le lien est celui que le brief fournit (`href`), jamais reconstruit ;
 *   un nombre (« 2 chevauchements dans ton agenda ») ne promet aucun clic.
 * - **Une source qui manque le DIT.** Un bloc ne se tait jamais et n'écrit
 *   jamais « 0 » pour « non lu » : chaque état non servi a sa phrase.
 * - **Rien du corps d'un message.** Ce texte entre ensuite dans l'historique
 *   envoyé au modèle (il est écrit avec la première réponse) : il ne contient
 *   que ce que le brief expose déjà — interlocuteur, objet, nombres (D65).
 * - **Le rôle change la VOIX, jamais les faits** (décision de Louis) : mêmes
 *   données personnelles pour tous, et une phrase de cadrage pour qui pourrait
 *   croire y lire son équipe. Aucun contenu d'équipe.
 */

export type MorningBriefInput = {
  /** Le brief du jour — `null` quand il n'a pas pu être lu : chaque bloc le dit. */
  briefing: DailyBriefing | null
  /** Le rôle dans l'espace, `null` tant qu'il n'est pas lu. */
  role: WorkspaceRole | null
}

// #1936.11 — les rôles qui ouvrent un brief en s'attendant à y lire leur équipe.
const TEAM_FACING_ROLES: ReadonlySet<WorkspaceRole> = new Set<WorkspaceRole>(['owner', 'admin', 'sales_ops'])

/** Trois comptes nommés au plus : au-delà, le bloc dit combien il en reste. */
const ACCOUNTS_NAMED_MAX = 3
const PREPARED_NAMED_MAX = 3

/** L'écran où l'on relit — et relance — le brief quand il n'a pas pu être lu. */
const BRIEFING_ROUTE = '/briefing'

export function composeMorningBrief(t: TFunction<'chat'>, input: MorningBriefInput & { firstName: string }): string {
  const greeting = input.firstName
    ? t('opener.brief.greetingWithName', { firstName: input.firstName })
    : t('opener.brief.greeting')
  // #1936.11 — une phrase de cadrage, pas un autre brief.
  const voice =
    input.role && TEAM_FACING_ROLES.has(input.role) ? `${greeting} ${t('opener.brief.scopeLead')}` : greeting

  const { briefing } = input
  const blocks = briefing
    ? [changedBlock(t, briefing), preparedBlock(t, briefing), adviceBlock(t, briefing)]
    : unreadableBlocks(t)
  // #1936.1 — trois blocs, jamais plus.
  return [voice, ...blocks].join('\n\n')
}

// #1936.2 — « Ce qui a changé » : les comptes NOMMÉS avec leur lien, puis les faits agrégés, puis les silences.
function changedBlock(t: TFunction<'chat'>, briefing: DailyBriefing): string {
  const lines: string[] = []

  for (const account of briefing.accountsToWatch.slice(0, ACCOUNTS_NAMED_MAX)) {
    lines.push(bullet(t('opener.brief.changed.account', { company: markdownLink(account.companyName, account.href) })))
  }
  const unnamed = briefing.accountsToWatch.length - ACCOUNTS_NAMED_MAX
  if (unnamed > 0) lines.push(bullet(t('opener.brief.changed.accountsMore', { count: unnamed })))

  // #1936.6 — un nombre n'entre que s'il dit quelque chose : jamais « 0 », jamais sur une source non lue.
  if (isRead(briefing.agenda.state) && briefing.agenda.conflicts.length > 0) {
    lines.push(bullet(t('opener.brief.changed.conflicts', { count: briefing.agenda.conflicts.length })))
  }
  if (isRead(briefing.mail.state) && briefing.mail.positiveReplies.length > 0) {
    lines.push(bullet(t('opener.brief.changed.positiveReplies', { count: briefing.mail.positiveReplies.length })))
  }
  if (isRead(briefing.mail.state) && briefing.mail.unread.length > 0) {
    lines.push(bullet(t('opener.brief.changed.unread', { count: briefing.mail.unread.length })))
  }
  if (briefing.tasks.state === 'ready' && briefing.tasks.overdueCount > 0) {
    lines.push(bullet(t('opener.brief.changed.overdue', { count: briefing.tasks.overdueCount })))
  }

  // #1936.8 — « rien de neuf » borné à ce qui a été LU, jamais un « tout va bien » générique.
  if (lines.length === 0) lines.push(bullet(t('opener.brief.changed.nothing')))
  lines.push(...silences(t, briefing).map(bullet))

  return block(t('opener.brief.changed.title'), lines)
}

// #1936.3 / #1936.9 — « Ce que j'ai préparé » : seulement des objets RÉELS, sinon le dire.
function preparedBlock(t: TFunction<'chat'>, briefing: DailyBriefing): string {
  const artifacts = briefing.actions.flatMap(action => action.preparedArtifacts)
  // Le serveur rend `NOTHING_PREPARED` tant qu'aucun producteur n'existe : le bloc est honnêtement vide.
  if (artifacts.length === 0) return block(t('opener.brief.prepared.title'), [t('opener.brief.prepared.nothing')])
  return block(
    t('opener.brief.prepared.title'),
    artifacts
      .slice(0, PREPARED_NAMED_MAX)
      .map(artifact => bullet(markdownLink(briefingLabel(t, artifact.labelKey, artifact.labelVars), artifact.href))),
  )
}

// #1936.4 — « Ce que je te conseille » : l'action servie EN PREMIER, reformulée — jamais un second classement.
function adviceBlock(t: TFunction<'chat'>, briefing: DailyBriefing): string {
  const title = t('opener.brief.advice.title')
  const first = briefing.actions[0]
  if (!first) {
    const key = silences(t, briefing).length > 0 ? 'opener.brief.advice.nothingMissing' : 'opener.brief.advice.nothing'
    return block(title, [t(key)])
  }

  const headline = actionHeadline(t, first)
  const ctaKey = BRIEFING_ACTION_CTA[first.kind]
  const href = linkableHref(first.href)
  const sentence =
    ctaKey && href
      ? t('opener.brief.advice.firstWithAction', {
          headline,
          action: markdownLink(t(ctaKey, { ns: 'briefing' }), href),
        })
      : t('opener.brief.advice.first', { headline })
  return block(title, [sentence])
}

/** Le brief n'a pas pu être lu : consommé quand même, et chacun des trois blocs nomme le silence. */
function unreadableBlocks(t: TFunction<'chat'>): string[] {
  return [
    block(t('opener.brief.changed.title'), [t('opener.brief.changed.unreadable')]),
    block(t('opener.brief.prepared.title'), [t('opener.brief.prepared.unreadable')]),
    block(t('opener.brief.advice.title'), [
      t('opener.brief.advice.unreadable', {
        retry: markdownLink(t('opener.brief.advice.retry'), BRIEFING_ROUTE),
      }),
    ]),
  ]
}

/** Les phrases des sources non servies — une par source, dans l'ordre de l'écran « Aujourd’hui ». */
function silences(t: TFunction<'chat'>, briefing: DailyBriefing): string[] {
  const said: string[] = []
  if (briefing.agenda.state !== 'ready') said.push(silence(t, 'agenda', briefing.agenda.state, briefing.agenda.reason))
  if (briefing.mail.state !== 'ready') said.push(silence(t, 'mailbox', briefing.mail.state, briefing.mail.reason))
  // Les tâches ne dépendent d'aucun fournisseur : seul « la lecture a échoué » peut arriver.
  if (briefing.tasks.state !== 'ready') said.push(t('opener.brief.silence.tasks'))
  return said
}

/**
 * #1901.2 — « N'A PAS RÉPONDU » ET « ACCÈS ÉTEINT » N'APPELLENT PAS LE MÊME GESTE.
 *
 * L'écran « Aujourd'hui » faisait déjà la différence ; Laura, elle, ne lisait
 * pas `reason` du tout et disait « n'a pas répondu » dans les deux cas — donc
 * « attends que ça repasse » pour un accès que personne n'allait rouvrir. Deux
 * présentations du MÊME système ne peuvent pas dire deux choses du même fait.
 *
 * Le FAIT se décide à un seul endroit (`briefingAccessIsSwitchedOff`), partagé
 * avec `BlockState.tsx`. La PHRASE, elle, reste propre à chacun : la page parle
 * de l'écran, Laura parle à la première personne — et c'est cette voix qui est
 * le produit.
 */
function silence(
  t: TFunction<'chat'>,
  capability: 'agenda' | 'mailbox',
  state: BriefingBlockState,
  reason: string | null,
): string {
  if (state === 'unavailable' && briefingAccessIsSwitchedOff(reason)) {
    return t(`opener.brief.silence.${capability}.provider_disabled`)
  }
  return t(`opener.brief.silence.${capability}.${state}`)
}

/** `partial` montre ce qu'il a : ses éléments comptent, et sa phrase dit ce qui manque. */
function isRead(state: BriefingBlockState): boolean {
  // La règle vit dans `block-state.ts` avec l'écran « Aujourd'hui » (#1901.2) :
  // deux copies d'une règle divergent, et celle-ci décide si un bloc compte.
  return briefingBlockIsRead(state)
}

/** Le FAIT de la carte, exactement comme l'écran « Aujourd’hui » le titre (`ActionsBlock`). */
function actionHeadline(t: TFunction<'chat'>, action: BriefingAction): string {
  return action.fact?.labelKey
    ? briefingLabel(t, action.fact.labelKey, action.fact.labelVars)
    : briefingLabel(t, action.labelKey, action.labelVars)
}

/** Une clé du serveur (`briefing.actions.…`) traduite dans SON espace de noms. */
function briefingLabel(t: TFunction<'chat'>, labelKey: string, labelVars: Record<string, string | number>): string {
  return t(labelKey.replace(/^briefing\./, ''), { ...labelVars, ns: 'briefing' })
}

/**
 * Ce qui s'écrit comme un lien SANS casser la syntaxe que `renderMarkdown` lit.
 *
 * ⚠️ La validation de la CIBLE — route existante, pas de sortie du domaine —
 * n'est pas refaite ici : elle reste à `appRouteTarget`, au rendu (GA-277).
 * Ici, seulement la forme : un espace ou une parenthèse couperait le lien et
 * afficherait la syntaxe à l'écran.
 */
const MARKDOWN_SAFE_HREF = /^\/(?!\/)[^\s()[\]]*$/
const MARKDOWN_UNSAFE_LABEL = /[[\]\n]/

function linkableHref(href: string | null | undefined): string | null {
  return href && MARKDOWN_SAFE_HREF.test(href) ? href : null
}

function markdownLink(label: string, href: string | null | undefined): string {
  const target = linkableHref(href)
  return target && !MARKDOWN_UNSAFE_LABEL.test(label) ? `[${label}](${target})` : label
}

function bullet(line: string): string {
  return `- ${line}`
}

function block(title: string, lines: string[]): string {
  return [`**${title}**`, ...lines].join('\n')
}
