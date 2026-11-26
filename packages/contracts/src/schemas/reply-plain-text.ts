import { replyBlockLeaves, splitReplyBlocks, type ReplyBlock } from './reply-blocks.js'

/**
 * #1914 — UNE RÉPONSE À CARTES, EN TEXTE.
 *
 * Une carte (`bellum-block`) ne se rend qu'à l'écran `/chat`. Tout ce qui
 * QUITTE cet écran reçoit du texte, jamais la clôture ni son JSON :
 *  - la copie d'une réponse et l'épingle en mémoire (web, `ReplyFooter`) ;
 *  - la bulle flottante, qui écrit du texte brut (web) ;
 *  - `ask_bellum`, lu par un client MCP — donc un modèle (API) ;
 *  - le résumé roulant du fil, qui repart dans le prompt (API).
 * Le service IA a sa propre implémentation, pour l'historique relu par le
 * modèle (`reply_blocks_as_text`, Python) : UNE par langage, tenues l'une à
 * l'autre par `reply-blocks.fixtures.json` (`plain_text`).
 *
 * ⚠️ LES LIBELLÉS VIENNENT DE L'APPELANT. Un contrat porte la FORME, jamais le
 * texte d'une interface : un libellé écrit ici serait français pour toujours, et
 * rien ne le signalerait. Le web passe ses traductions ; l'API passe les
 * libellés de ses sorties machine. `ReplyPlainTextLabels` exige toutes ses clés :
 * un libellé oublié ne compile pas.
 */
export const REPLY_PLAIN_TEXT_LABEL_KEYS = [
  'why',
  'limits',
  'whyNow',
  'action',
  'nextAction',
  'rankedBy',
  'notEvaluated',
  'source',
  'missing',
  'need',
  'fit',
  'gaps',
  'availability',
  'objective',
  'when',
  'owner',
  'attendees',
  'talkingPoints',
  // #4424.4 — le pitch de réunion.
  'pitch',
  'questions',
  'risks',
  'unknowns',
  // #3340 — les champs du brief consultant provisoire qu'aucune carte
  // n'employait déjà (`availability` et `unknowns` sont réutilisés ci-dessus).
  'role',
  'previousRoles',
  'seniority',
  'techFocus',
  'functionalFocus',
  'technologies',
  'sectors',
  'contractType',
  'mobility',
  'workMode',
  'rateTarget',
  'failed',
  'howToGet',
  'stillPossible',
  'notMeasured',
  // #2271.19 — une timeline vide LE DIT (GA-18/19) : pas de section absente,
  // pas de carte qui disparaît, une phrase nommée.
  'timelineEmpty',
  // #2429.13 — la carte d'approche : ses deux intitulés, et le manque NOMMÉ
  // quand le dossier ne porte aucune preuve concrète (jamais une inventée).
  'angle',
  'useCase',
  'noUseCase',
  // #3392 / #3428 — le sprint 10 dont 3 : la mémoire de marché complète, la
  // liste exécutable, et les deux champs propres au focus (`whyNow` existe déjà).
  'fullListCount',
  'sprint',
  'focus',
  'entryPoint',
  'firstMove',
  // #213.2 (#3228) — le contrat de comptage.
  'deduplicated',
  'resolvedIdentity',
  'coverage',
  // #3758 (reste du lot J14) — le compte rendu enregistré.
  'decisions',
  'actions',
  'recordedAt',
  'reminder',
  // #2985 (lot E07 08/10) — la revue de compte manager : le statut fermé du
  // verdict, ses raisons COMPTÉES (jamais une probabilité), et ses sections.
  'managerReviewVerdict',
  'managerReviewChangeDigest',
  'managerReviewActionsCompleted',
  'managerReviewActionsStalled',
  'managerReviewDecisionsRequested',
  'managerReviewArbitrations',
  'managerReviewImportantFacts',
  'managerReviewStatusAttention',
  'managerReviewStatusStable',
  'managerReviewStatusNotEvaluable',
  'managerReviewReasonStalledActions',
  'managerReviewReasonRisks',
  'managerReviewReasonCoverageGaps',
  'managerReviewReasonDecisionsPending',
  'managerReviewReasonArbitrationsPending',
] as const

export type ReplyPlainTextLabels = Readonly<Record<(typeof REPLY_PLAIN_TEXT_LABEL_KEYS)[number], string>>

type Part = string | null | undefined
type LabelKey = keyof ReplyPlainTextLabels

/**
 * #213.2 (#3228) — pluriel français des noms d'unité de
 * `count_contract.OBJECT_TYPES` (Python) : le contrat les porte déjà en
 * français (« contact », « parcours »…), donc ce pluriel reste dans le
 * contrat plutôt que dans une table de traduction d'interface — même choix
 * que le miroir Python (`app/services/reply_blocks.py::_plural`). Seul
 * « signal » est irrégulier (« signaux ») ; les autres prennent un « s ».
 */
function pluralObjectType(objectType: string, count: number): string {
  if (count === 1) return objectType
  return objectType === 'signal' ? 'signaux' : `${objectType}s`
}

/** #2985 (lot E07 08/10) — le statut FERMÉ du verdict, en texte. */
function managerReviewStatusLabel(
  status: 'attention' | 'stable' | 'not_evaluable',
  labels: ReplyPlainTextLabels,
): string {
  return {
    attention: labels.managerReviewStatusAttention,
    stable: labels.managerReviewStatusStable,
    not_evaluable: labels.managerReviewStatusNotEvaluable,
  }[status]
}

const MANAGER_REVIEW_REASON_LABEL_KEYS = {
  stalled_actions: 'managerReviewReasonStalledActions',
  risks: 'managerReviewReasonRisks',
  coverage_gaps: 'managerReviewReasonCoverageGaps',
  decisions_pending: 'managerReviewReasonDecisionsPending',
  arbitrations_pending: 'managerReviewReasonArbitrationsPending',
} as const satisfies Record<string, LabelKey>

export function replyPlainText(text: string, labels: ReplyPlainTextLabels): string {
  const segments = splitReplyBlocks(text)
  // Sans carte : le texte d'origine, à l'octet près.
  if (segments.every(segment => segment.kind === 'text')) return text
  return segments
    .map(segment => {
      switch (segment.kind) {
        case 'text':
          return segment.text
        case 'block':
          return blockAsText(segment.block, labels)
        case 'invalid':
          // Un bloc refusé redevient les textes qu'il portait — rien d'inventé.
          return bullets(replyBlockLeaves(segment.value))
        case 'unterminated':
          // Une carte coupée ne laisse ni clôture ni fragment.
          return ''
      }
    })
    .filter(Boolean)
    .join('\n\n')
}

function bullets(lines: readonly string[] | null | undefined): string {
  return (lines ?? []).map(line => `- ${line}`).join('\n')
}

function blockAsText(block: ReplyBlock, labels: ReplyPlainTextLabels): string {
  const section = (key: LabelKey, lines: readonly string[] | null | undefined): Part =>
    lines?.length ? `${labels[key]}\n${bullets(lines)}` : null
  const inline = (key: LabelKey, value: string | null | undefined): Part => (value ? `${labels[key]} ${value}` : null)
  const joined = (values: readonly Part[]): string => values.filter(Boolean).join(' · ')
  // La source ET sa date, telles que la carte les porte : « Registre public · 2026-07-03 ».
  // Théo B l1-laura — l'adresse de la page d'origine voyage avec la copie, comme à l'écran.
  const source = (value: { label: string; as_of?: string; url?: string } | null | undefined): Part =>
    value ? inline('source', joined([value.label, value.as_of, value.url])) : null

  const parts: Part[] = []
  switch (block.type) {
    case 'verdict':
      parts.push(block.conclusion, section('why', block.reasons), section('limits', block.limits))
      parts.push(inline('nextAction', block.next_action?.label))
      break
    case 'account_ranking':
      parts.push(block.title, inline('rankedBy', block.axes.join(' · ')))
      block.items.forEach((item, index) => {
        parts.push(`${index + 1}. ${item.name}`, item.verdict, section('why', item.why), inline('whyNow', item.why_now))
        parts.push(section('limits', item.limits), inline('notEvaluated', item.not_evaluated?.join(' · ')))
        parts.push(inline('action', item.action?.label), source(item.source))
      })
      parts.push(inline('notEvaluated', block.not_evaluated?.join(' · ')))
      break
    case 'contact_list':
      parts.push(block.title)
      block.items.forEach(item => {
        parts.push(`- ${joined([item.name, item.role, item.company])}`, item.reason, source(item.source))
      })
      parts.push(section('missing', block.missing))
      break
    case 'comparison':
      parts.push(block.title)
      block.rows.forEach(row => {
        // Une case se lit AVEC sa colonne ; inconnue, elle dit « non mesuré », jamais 0.
        parts.push(
          row.label,
          bullets(row.cells.map((cell, index) => `${block.columns[index]} — ${cell ?? labels.notMeasured}`)),
        )
      })
      parts.push(block.note)
      break
    case 'action_plan':
      parts.push(block.title, inline('objective', block.objective))
      block.steps.forEach((step, index) => {
        parts.push(`${index + 1}. ${step.label}`, step.detail, inline('when', step.when), inline('owner', step.owner))
      })
      break
    case 'consultant_shortlist':
      parts.push(block.title, inline('need', block.need))
      block.items.forEach(item => {
        parts.push(`- ${joined([item.name, item.headline])}`, inline('availability', item.availability))
        parts.push(section('fit', item.fit), section('gaps', item.gaps), source(item.source))
      })
      parts.push(inline('notEvaluated', block.not_evaluated?.join(' · ')))
      break
    case 'meeting_brief':
      parts.push(block.title, block.account?.name, block.when, inline('objective', block.objective))
      parts.push(inline('pitch', block.pitch)) // #4424.4
      parts.push(
        section(
          'attendees',
          block.attendees?.map(attendee => joined([attendee.name, attendee.role])),
        ),
      )
      parts.push(section('talkingPoints', block.talking_points), section('questions', block.questions))
      parts.push(section('risks', block.risks), section('unknowns', block.unknowns))
      break
    case 'consultant_brief':
      parts.push(block.title, inline('role', block.role))
      parts.push(section('previousRoles', block.previous_roles))
      parts.push(inline('seniority', block.seniority), inline('techFocus', block.tech_focus))
      parts.push(inline('functionalFocus', block.functional_focus))
      parts.push(section('technologies', block.technologies), section('sectors', block.sectors))
      parts.push(inline('contractType', block.contract_type), inline('availability', block.availability))
      parts.push(inline('mobility', block.mobility), inline('workMode', block.work_mode))
      parts.push(inline('rateTarget', block.rate_target))
      parts.push(section('unknowns', block.unknowns))
      break
    case 'missing_data':
      parts.push(block.title, section('failed', block.failed), labels.missing)
      block.missing.forEach(item => parts.push(`- ${item.what}`, item.why, inline('howToGet', item.how)))
      parts.push(section('stillPossible', block.still_possible))
      break
    case 'account_card':
      parts.push(block.name, block.verdict, section('why', block.highlights), section('limits', block.limits))
      parts.push(inline('notEvaluated', block.not_evaluated?.join(' · ')))
      parts.push(inline('action', block.action?.label), source(block.source))
      break
    case 'timeline':
      parts.push(block.title, block.account?.name)
      if (!block.events.length) {
        parts.push(labels.timelineEmpty)
      } else {
        block.events.forEach(event => parts.push(`- ${event.label} (${event.at})`, event.detail))
      }
      break
    case 'file_export':
      parts.push(block.title, block.columns.join(' · '))
      block.rows.forEach(row => {
        parts.push(row.cells.map(cell => cell ?? labels.notMeasured).join(' · '))
      })
      parts.push(block.note)
      break
    case 'approach':
      parts.push(block.title, inline('objective', block.objective), inline('angle', block.angle))
      parts.push(inline('useCase', block.use_case ?? labels.noUseCase))
      parts.push(inline('nextAction', block.next_action?.label))
      break
    case 'account_volume_sprint':
      parts.push(block.title, inline('fullListCount', String(block.full_list_count)))
      parts.push(
        section(
          'sprint',
          block.sprint.map(item => item.name),
        ),
      )
      parts.push(labels.focus)
      block.focus.forEach(item => {
        parts.push(`- ${item.name}`, inline('whyNow', item.why_now))
        parts.push(inline('entryPoint', item.entry_point), inline('firstMove', item.first_move))
      })
      break
    case 'count_contract':
      parts.push(`${block.raw_count} ${pluralObjectType(block.object_type, block.raw_count)}`)
      // Un compte MESURÉ à zéro reste affiché : seul `undefined` (non mesuré) est tu.
      if (block.deduplicated_count != null) parts.push(`${labels.deduplicated} ${block.deduplicated_count}`)
      if (block.resolved_count != null) parts.push(`${labels.resolvedIdentity} ${block.resolved_count}`)
      parts.push(inline('coverage', block.coverage))
      parts.push(section('limits', block.caveats))
      break
    case 'account_map': {
      // #3762 — le squelette, dans son ordre : en-tête, cadrage, synthèse, grille,
      // blocs secondaires, actions. #3758.2 — les groupes, leur couverture et ce
      // qui n'est pas couvert. Une lecture absente n'écrit aucune ligne.
      parts.push(block.title)
      if (block.completeness && block.context) {
        parts.push(joined([block.completeness.label, ...block.context.map(chip => chip.label)]))
      }
      if (block.framing) parts.push(block.framing.origin, block.framing.proves, block.framing.not_proven)
      if (block.summary) {
        const retained = block.summary.retained_count
        parts.push(joined([`${retained} ${pluralObjectType('compte', retained)}`, block.summary.qualification]))
        parts.push(block.summary.main_reserve)
      }
      parts.push(inline('coverage', block.coverage))
      block.groups?.forEach(group => {
        parts.push(group.label, bullets(group.items.map(item => joined([item.name, item.detail]))))
      })
      parts.push(section('notEvaluated', block.not_covered), source(block.source))
      block.accounts?.forEach((account, index) => {
        parts.push(`${index + 1}. ${joined([account.name, account.status.label])}`, account.proof)
        parts.push(account.tags?.length ? account.tags.join(' · ') : null, account.caution)
        parts.push(inline('nextAction', account.next_action.label))
      })
      parts.push(bullets(block.memory), section('missing', block.to_document), block.method_limit)
      const closing = block.actions
      parts.push(...[closing?.validate, closing?.discover, closing?.enrich, closing?.save].map(a => a?.label))
      break
    }
    case 'post_meeting_summary':
      // #3758 (reste du lot J14) — le compte rendu ENREGISTRÉ, jamais le
      // texte du modèle : `as_of` est la date d'enregistrement de la note.
      parts.push(block.title, inline('recordedAt', block.as_of.slice(0, 10)))
      parts.push(section('decisions', block.decisions))
      if (block.actions?.length) {
        parts.push(labels.actions)
        block.actions.forEach(item => {
          parts.push(`- ${item.what}`, inline('owner', item.owner), inline('when', item.due))
        })
      }
      if (block.reminder) {
        parts.push(inline('reminder', block.reminder.content), inline('when', block.reminder.due_label))
      }
      break
    case 'manager_review': {
      // #2985 (lot E07 08/10) — reformage du résultat de `get_account_manager_review`,
      // jamais un second calcul : voir le docstring de la carte (`reply-blocks.ts`).
      parts.push(block.account_name)
      const reasons = block.verdict.reasons.map(
        reason => `${reason.count} ${labels[MANAGER_REVIEW_REASON_LABEL_KEYS[reason.kind]]}`,
      )
      parts.push(
        inline('managerReviewVerdict', joined([managerReviewStatusLabel(block.verdict.status, labels), ...reasons])),
      )
      if (block.change_digest) {
        const digest = block.change_digest
        parts.push(
          `${labels.managerReviewChangeDigest} ${digest.changed_count} · ${digest.appeared_count} · ${digest.disappeared_count}`,
        )
      }
      parts.push(
        section(
          'managerReviewActionsCompleted',
          block.actions_completed.map(a => joined([a.label, a.target, a.owner])),
        ),
      )
      parts.push(
        section(
          'managerReviewActionsStalled',
          block.actions_stalled.map(a => joined([a.label, a.target, a.owner, a.due_date])),
        ),
      )
      parts.push(
        section(
          'risks',
          block.risks.map(r => `${r.project} — ${r.risks}`),
        ),
      )
      if (block.coverage)
        parts.push(
          section(
            'coverage',
            block.coverage.gaps.map(g => `${g.label} — ${g.reason}`),
          ),
        )
      parts.push(
        section(
          'managerReviewImportantFacts',
          block.important_facts.map(f => joined([f.label, f.date])),
        ),
      )
      parts.push(
        section(
          'managerReviewDecisionsRequested',
          block.decisions_requested.map(a => joined([a.label, a.target, a.owner])),
        ),
      )
      parts.push(
        section(
          'managerReviewArbitrations',
          block.arbitrations_requested.map(a => `${a.consultant} — ${a.account_owner} / ${a.resource_owner}`),
        ),
      )
      parts.push(inline('notEvaluated', block.verdict.not_evaluated.join(' · ')))
      break
    }
  }
  return parts.filter(Boolean).join('\n')
}
