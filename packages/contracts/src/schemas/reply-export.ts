import { replyBlockLeaves, splitReplyBlocks, type ReplyBlock } from './reply-blocks.js'
import type { ReplyPlainTextLabels } from './reply-plain-text.js'

/**
 * #3770 (BEL-LAU-1016) — UNE RÉPONSE RICHE QUI SORT DE L'ÉCRAN SANS PERDRE SA FORME.
 *
 * `replyPlainText` (#1914) donne le texte NU : il sert la copie simple, le
 * modèle, le client MCP. Il aplatit les titres, les tableaux et les listes.
 * Deux autres formes quittent l'écran, avec les MÊMES libellés (aucune clé
 * neuve : la vue écran et la version copiée disent la même chose) :
 *  - `replyMarkdown` : la forme STRUCTURÉE — titres, tableaux, étapes à cocher —
 *    pour la copie « structurée » et le fichier partageable ;
 *  - `replyCompact` : la forme COMPACTE — une ligne par carte (ou par élément
 *    classé), pour un message court.
 *
 * Doctrine tenue ici : une valeur non mesurée dit `labels.notMeasured`, jamais
 * « 0 » ni une cellule vide ; une source absente ne se fabrique pas ; aucune
 * probabilité n'est ajoutée ; un bloc refusé redevient ses textes, un bloc
 * coupé ne laisse rien. Le copilote n'envoie rien : ces formes se COPIENT.
 */
type Part = string | null | undefined
type Mode = 'markdown' | 'compact'

const clean = (value: string): string => value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')

/** « Action : » → « **Action** : » ; « Pourquoi » → « **Pourquoi** ». */
function bold(label: string): string {
  const match = /^(.*?)(\s*:\s*)?$/.exec(label.trim())
  return `**${match?.[1] ?? label}**${match?.[2]?.trimEnd() ? ` ${match[2].trim()}` : ''}`
}

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const line = (cells: readonly string[]) => `| ${cells.map(clean).join(' | ')} |`
  return [line(header), line(header.map(() => '---')), ...rows.map(line)].join('\n')
}

const list = (lines: readonly string[] | null | undefined): string => (lines ?? []).map(line => `- ${line}`).join('\n')

function renderBlock(block: ReplyBlock, labels: ReplyPlainTextLabels, mode: Mode): string {
  const compact = mode === 'compact'
  const h = (title: Part): Part => (title ? (compact ? `**${title}**` : `## ${title}`) : null)
  const h3 = (title: Part): Part => (title ? (compact ? title : `### ${title}`) : null)
  const field = (key: keyof ReplyPlainTextLabels, value: Part): Part => (value ? `${bold(labels[key])} ${value}` : null)
  const section = (key: keyof ReplyPlainTextLabels, lines: readonly string[] | null | undefined): Part =>
    lines?.length && !compact ? `${bold(labels[key])}\n${list(lines)}` : null
  const source = (value: { label: string; as_of?: string } | null | undefined): Part =>
    value && !compact ? field('source', [value.label, value.as_of].filter(Boolean).join(' · ')) : null
  const parts: Part[] = []

  switch (block.type) {
    case 'verdict':
      parts.push(block.conclusion, section('why', block.reasons), section('limits', block.limits))
      parts.push(field('nextAction', block.next_action?.label))
      break
    case 'account_ranking':
      parts.push(h(block.title), field('rankedBy', block.axes.join(' · ')))
      block.items.forEach((item, index) => {
        const head = [`${index + 1}. ${item.name}`, item.verdict].filter(Boolean).join(' — ')
        parts.push(compact ? head : `### ${head}`)
        parts.push(
          section('why', item.why),
          field('whyNow', compact ? null : item.why_now),
          section('limits', item.limits),
        )
        parts.push(compact ? null : field('notEvaluated', item.not_evaluated?.join(' · ')))
        parts.push(compact ? null : field('action', item.action?.label), source(item.source))
      })
      parts.push(field('notEvaluated', block.not_evaluated?.join(' · ')))
      break
    case 'contact_list':
      parts.push(h(block.title))
      block.items.forEach(item => {
        const head = [item.name, item.role, item.company].filter(Boolean).join(' · ')
        parts.push(`- ${head}${compact || !item.reason ? '' : ` — ${item.reason}`}`)
      })
      parts.push(compact ? null : section('missing', block.missing))
      break
    case 'comparison':
      parts.push(h(block.title))
      if (compact) {
        block.rows.forEach(row => parts.push(`- ${row.label}`))
      } else {
        parts.push(
          table(
            ['', ...block.columns],
            block.rows.map(row => [row.label, ...block.columns.map((_, i) => row.cells[i] ?? labels.notMeasured)]),
          ),
        )
        parts.push(block.note)
      }
      break
    case 'action_plan':
      parts.push(h(block.title), field('objective', block.objective))
      block.steps.forEach(step => {
        const meta = compact ? '' : [step.when, step.owner].filter(Boolean).join(' · ')
        const detail = compact || !step.detail ? '' : ` — ${step.detail}`
        parts.push(`- [ ] ${step.label}${detail}${meta ? ` (${meta})` : ''}`)
      })
      break
    case 'consultant_shortlist':
      parts.push(h(block.title), field('need', block.need))
      block.items.forEach(item => {
        parts.push(`- ${[item.name, item.headline].filter(Boolean).join(' — ')}`)
        parts.push(compact ? null : field('availability', item.availability))
        parts.push(section('fit', item.fit), section('gaps', item.gaps), source(item.source))
      })
      parts.push(compact ? null : field('notEvaluated', block.not_evaluated?.join(' · ')))
      break
    case 'meeting_brief':
      parts.push(h(block.title), block.account?.name, block.when, field('objective', block.objective))
      parts.push(field('pitch', block.pitch)) // #4424.4
      parts.push(
        section(
          'attendees',
          block.attendees?.map(a => [a.name, a.role].filter(Boolean).join(' · ')),
        ),
      )
      parts.push(section('talkingPoints', block.talking_points), section('questions', block.questions))
      parts.push(section('risks', block.risks), section('unknowns', block.unknowns))
      break
    case 'consultant_brief':
      parts.push(h(block.title), field('role', block.role))
      parts.push(compact ? null : field('seniority', block.seniority))
      parts.push(compact ? null : field('techFocus', block.tech_focus))
      parts.push(section('technologies', block.technologies), section('sectors', block.sectors))
      parts.push(compact ? null : field('availability', block.availability))
      parts.push(compact ? null : field('rateTarget', block.rate_target), section('unknowns', block.unknowns))
      break
    case 'missing_data':
      parts.push(h(block.title), compact ? null : section('failed', block.failed), bold(labels.missing))
      block.missing.forEach(item => {
        parts.push(`- ${item.what}${compact || !item.why ? '' : ` — ${item.why}`}`)
        parts.push(compact ? null : field('howToGet', item.how))
      })
      parts.push(section('stillPossible', block.still_possible))
      break
    case 'account_card':
      parts.push(h3(block.name) ?? block.name, block.verdict, section('why', block.highlights))
      parts.push(
        section('limits', block.limits),
        compact ? null : field('notEvaluated', block.not_evaluated?.join(' · ')),
      )
      parts.push(compact ? null : field('action', block.action?.label), source(block.source))
      break
    case 'timeline':
      parts.push(h(block.title), block.account?.name)
      if (!block.events.length) parts.push(labels.timelineEmpty)
      else
        block.events.forEach(event =>
          parts.push(`- **${event.at}** — ${event.label}${compact || !event.detail ? '' : ` — ${event.detail}`}`),
        )
      break
    case 'file_export':
      parts.push(h(block.title))
      if (compact) {
        parts.push(`${block.rows.length} × ${block.columns.join(' · ')}`)
      } else {
        parts.push(
          table(
            block.columns,
            block.rows.map(row => block.columns.map((_, i) => row.cells[i] ?? labels.notMeasured)),
          ),
        )
        parts.push(block.note)
      }
      break
    case 'approach':
      parts.push(h(block.title), field('objective', block.objective), field('angle', block.angle))
      parts.push(compact ? null : field('useCase', block.use_case ?? labels.noUseCase))
      parts.push(field('nextAction', block.next_action?.label))
      break
    case 'account_volume_sprint':
      parts.push(h(block.title), field('fullListCount', String(block.full_list_count)))
      parts.push(
        section(
          'sprint',
          block.sprint.map(item => item.name),
        ),
      )
      if (!compact) {
        parts.push(bold(labels.focus))
        block.focus.forEach(item => {
          parts.push(`- ${item.name}`, field('whyNow', item.why_now), field('entryPoint', item.entry_point))
          parts.push(field('firstMove', item.first_move))
        })
      }
      break
    case 'count_contract':
      // Un compte MESURÉ à zéro reste écrit : seul `undefined` (non mesuré) est tu.
      parts.push(`${block.raw_count} ${block.object_type}`)
      if (block.deduplicated_count != null) parts.push(field('deduplicated', String(block.deduplicated_count)))
      if (block.resolved_count != null) parts.push(field('resolvedIdentity', String(block.resolved_count)))
      parts.push(field('coverage', block.coverage), section('limits', block.caveats))
      break
    case 'account_map':
      // #3758.2 / #3762 — en-tête et cadrage, groupes, grille ; une lecture absente n'écrit rien.
      parts.push(
        h(block.title),
        [block.completeness?.label, ...(block.context ?? []).map(c => c.label)].filter(Boolean).join(' · '),
      )
      if (block.framing && !compact) parts.push(block.framing.origin, block.framing.proves, block.framing.not_proven)
      if (block.summary) parts.push(`${block.summary.retained_count} · ${block.summary.qualification}`)
      parts.push(field('coverage', block.coverage))
      block.groups?.forEach(group => {
        parts.push(
          h3(group.label),
          compact ? null : list(group.items.map(item => [item.name, item.detail].filter(Boolean).join(' — '))),
        )
      })
      parts.push(section('notEvaluated', block.not_covered), source(block.source))
      block.accounts?.forEach((account, index) => {
        parts.push(h3(`${index + 1}. ${account.name} — ${account.status.label}`))
        if (!compact) parts.push(account.proof, account.caution)
        parts.push(field('nextAction', account.next_action.label))
      })
      parts.push(section('missing', block.to_document), compact ? null : (block.method_limit ?? null))
      break
    case 'post_meeting_summary':
      // #3758 (reste du lot J14) — le compte rendu ENREGISTRÉ, jamais le texte du modèle.
      parts.push(h(block.title), field('recordedAt', block.as_of.slice(0, 10)))
      parts.push(section('decisions', block.decisions))
      if (block.actions?.length) {
        parts.push(bold(labels.actions))
        block.actions.forEach(action => {
          parts.push(`- ${[action.what, action.owner, action.due].filter(Boolean).join(' — ')}`)
        })
      }
      if (block.reminder) {
        parts.push(field('reminder', [block.reminder.content, block.reminder.due_label].filter(Boolean).join(' — ')))
      }
      break
    case 'manager_review': {
      // #2985 (lot E07 08/10) — reformage du résultat de `get_account_manager_review`, jamais un second
      // calcul : même liste de champs que `reply-plain-text.ts`, mise en forme markdown/compacte.
      const reasonLabel = (kind: (typeof block.verdict.reasons)[number]['kind']): keyof ReplyPlainTextLabels =>
        (
          ({
            stalled_actions: 'managerReviewReasonStalledActions',
            risks: 'managerReviewReasonRisks',
            coverage_gaps: 'managerReviewReasonCoverageGaps',
            decisions_pending: 'managerReviewReasonDecisionsPending',
            arbitrations_pending: 'managerReviewReasonArbitrationsPending',
          }) as const
        )[kind]
      const statusLabel = (
        {
          attention: labels.managerReviewStatusAttention,
          stable: labels.managerReviewStatusStable,
          not_evaluable: labels.managerReviewStatusNotEvaluable,
        } as const
      )[block.verdict.status]
      const reasons = block.verdict.reasons.map(reason => `${reason.count} ${labels[reasonLabel(reason.kind)]}`)
      parts.push(h(block.account_name))
      parts.push(field('managerReviewVerdict', [statusLabel, ...reasons].filter(Boolean).join(' · ')))
      if (block.change_digest && !compact) {
        const digest = block.change_digest
        parts.push(
          `${bold(labels.managerReviewChangeDigest)} ${digest.changed_count} · ${digest.appeared_count} · ${digest.disappeared_count}`,
        )
      }
      if (!compact) {
        parts.push(
          section(
            'managerReviewActionsCompleted',
            block.actions_completed.map(a => [a.label, a.target, a.owner].filter(Boolean).join(' · ')),
          ),
        )
        parts.push(
          section(
            'managerReviewActionsStalled',
            block.actions_stalled.map(a => [a.label, a.target, a.owner, a.due_date].filter(Boolean).join(' · ')),
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
            block.important_facts.map(f => [f.label, f.date].filter(Boolean).join(' · ')),
          ),
        )
        parts.push(
          section(
            'managerReviewDecisionsRequested',
            block.decisions_requested.map(a => [a.label, a.target, a.owner].filter(Boolean).join(' · ')),
          ),
        )
        parts.push(
          section(
            'managerReviewArbitrations',
            block.arbitrations_requested.map(a => `${a.consultant} — ${a.account_owner} / ${a.resource_owner}`),
          ),
        )
        parts.push(field('notEvaluated', block.verdict.not_evaluated.join(' · ')))
      }
      break
    }
  }
  return parts.filter(Boolean).join(compact ? '\n' : '\n\n')
}

function render(text: string, labels: ReplyPlainTextLabels, mode: Mode): string {
  const segments = splitReplyBlocks(text)
  const out = segments
    .map(segment => {
      switch (segment.kind) {
        case 'text':
          return mode === 'compact' ? segment.text.trim() : segment.text
        case 'block':
          return renderBlock(segment.block, labels, mode)
        case 'invalid':
          return list(replyBlockLeaves(segment.value))
        case 'unterminated':
          return ''
      }
    })
    .filter(Boolean)
  return out.join('\n\n')
}

/** La forme STRUCTURÉE : titres, tableaux, étapes à cocher — lisible hors de l'interface. */
export function replyMarkdown(text: string, labels: ReplyPlainTextLabels): string {
  return render(text, labels, 'markdown')
}

/** La forme COMPACTE : titres, conclusions et éléments classés, sans le détail. */
export function replyCompact(text: string, labels: ReplyPlainTextLabels): string {
  return render(text, labels, 'compact')
}
