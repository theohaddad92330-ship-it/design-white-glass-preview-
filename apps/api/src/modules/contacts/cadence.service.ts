import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Not, Repository } from 'typeorm'
import {
  METHOD_RULE_CADENCE_FOLLOW_UP,
  snapDatesToRecommendedWeekday,
  type CadenceScenario,
  type CadenceStep,
  type CadenceStepKey,
  type ContactCadence,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import {
  type CadencePattern,
  cadencePatternForState,
  resolveCadenceScenario,
  resolveRevenueModel,
} from './cadence-templates'
import { CADENCE_PREFERRED_WEEKDAY, type CadencePreferredWeekdayReader } from './module-tokens'

/**
 * Moteur de cadence multi-touch (Drive #8, méthode Théo).
 *
 * Once a contact is first touched (the "message initial" — a sent email), the
 * rep follows a relance sequence whose rhythm **derives from the account's
 * relationship state** (restitution TF1 p25 ① ; annexe méthodo p6/p10/p12), not
 * a fixed J+1/J+3/J+6/J+9 constant. A cold (or simply-known) account keeps the
 * historical schedule; an accepted LinkedIn connection follows a 3-touch pattern;
 * a rang-2 partner is spaced out; an open need is worked tighter — see
 * `cadence-templates.ts` for the written méthodo patterns.
 *
 * The follow-up touches are materialised as **dated `action_plan_items`**
 * (`due_date` = anchor + offset, `cadence_step` set, `contact_id` set) so the
 * existing daily "Rappels de relance" cron reminds them for free — no second
 * cron, no second table. The opening "initial" touch is what triggered the
 * cadence, so it is not itself a scheduled follow-up (shown as done in the view).
 *
 * All logic is pure/deterministic and unit-tested (see cadence.service.spec):
 * the date maths are calendar-date arithmetic (DST/month/leap-safe), scheduling
 * is idempotent per contact, and the relationship→pattern mapping is locked in
 * cadence-templates.spec.
 */
@Injectable()
export class CadenceService {
  private readonly logger = new Logger(CadenceService.name)

  constructor(
    @InjectRepository(ActionPlanItemEntity)
    private readonly items: Repository<ActionPlanItemEntity>,
    // The account carries the relationship state (salesContext / kanban) that
    // picks the cadence pattern. Read-only here.
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    // #3289.29 — le jour appris par l'espace pour ses relances e-mail. Absent
    // (module non composé, ou test) = échéancier nominal, comme avant.
    @Optional()
    @Inject(CADENCE_PREFERRED_WEEKDAY)
    private readonly preferredWeekday?: CadencePreferredWeekdayReader,
  ) {}

  /** Le calendrier d'un contact : le nominal du motif, puis les relances calées
   *  sur le jour que l'espace a appris (jamais plus tôt que le nominal). La
   *  touche initiale — déjà partie — ne bouge pas. Une lecture en échec = nominal. */
  private async scheduleFor(contact: ContactEntity, anchor: string, pattern: CadencePattern) {
    const nominal = computeCadenceSchedule(anchor, pattern)
    let weekday: Awaited<ReturnType<CadencePreferredWeekdayReader>> = null
    if (this.preferredWeekday && contact.workspace_id) {
      try {
        weekday = await this.preferredWeekday(contact.workspace_id)
      } catch (err) {
        this.logger.warn('preferred weekday unreadable', { error: err instanceof Error ? err.message : String(err) })
      }
    }
    if (weekday === null) return nominal
    const followUps = nominal.filter(step => !step.is_initial)
    const snapped = snapDatesToRecommendedWeekday(
      followUps.map(step => step.due_date),
      weekday,
    )
    const dueByKey = new Map(followUps.map((step, i) => [step.key, snapped[i] ?? step.due_date]))
    return nominal.map(step => ({ ...step, due_date: dueByKey.get(step.key) ?? step.due_date }))
  }

  /** The cadence pattern for a contact — resolved from its account's relationship
   *  state. A missing/unreadable account resolves to cold (the standard pattern),
   *  so the behaviour degrades to exactly what it was before this feature. */
  private async patternForContact(
    contact: ContactEntity,
  ): Promise<{ pattern: CadencePattern; scenario: CadenceScenario }> {
    // #1473 — un contact à qualifier n'a pas de compte : on ne le CHERCHE pas.
    // `null` retombe sur le même repli que le compte illisible, documenté juste
    // en dessous — le motif standard, exactement le comportement d'avant.
    const account = contact.account_id
      ? await this.accounts.findOne({
          // #2671.5 — borné à l'espace du contact : un `account_id` qui pointe
          // un autre espace retombe sur le motif standard, comme un compte illisible.
          where: { id: contact.account_id, workspace_id: contact.workspace_id ?? IsNull() },
          select: ['id', 'raw_analysis', 'commercial_status'],
        })
      : null
    // No account (shouldn't happen for a persisted contact) → an empty cold
    // account, which `resolveCadenceScenario` maps to the standard pattern.
    const resolved = account ?? { raw_analysis: {}, commercial_status: 'inbox' }
    const scenario = resolveCadenceScenario(resolved)
    // #2645.2 — la cadence suit aussi le MODÈLE DE REVENU de l'ESN : un revenu
    // ponctuel resserre les relances et repousse la dernière touche après
    // livraison, un revenu récurrent étire le suivi. Non déclaré ⇒ `inconnu`,
    // et le calendrier est exactement celui d'avant ce lot.
    return { pattern: cadencePatternForState(scenario.state, resolveRevenueModel(resolved)), scenario }
  }

  /**
   * Materialise the follow-up touches (relance/preuve sociale/close-loop) for a
   * just-contacted contact as dated plan items. Idempotent: a contact that
   * already has cadence items is left untouched, so a re-send never duplicates
   * the sequence. Anchored on `email_sent_at` (the day the contact was emailed),
   * falling back to today when it is not set. The set of touches and their
   * offsets follow the account's relationship pattern.
   */
  async scheduleForContact(contact: ContactEntity, userId: string, anchorOn?: Date): Promise<void> {
    // #1473 — les relances de cadence sont des lignes du PLAN D'ACTION D'UN
    // COMPTE (`action_plan_items.account_id` est NOT NULL, et le plan se lit
    // depuis la fiche du compte). Un contact à qualifier n'en a pas : on ne
    // programme rien plutôt que d'inventer un rattachement, et les relances
    // apparaîtront le jour où l'entreprise sera renseignée.
    const accountId = contact.account_id
    if (!accountId) return
    // #4418 — seules les lignes de CADENCE bloquent : une autre action du plan visant ce contact
    // (tâche, vérification) ne doit pas faire taire ses relances.
    const existing = await this.items.find({ where: { contact_id: contact.id, cadence_step: Not(IsNull()) }, take: 1 })
    if (existing.length > 0) return

    // #4418 — `anchorOn` : le jour d'un geste MANUEL (« Marquer envoyé »), qui prime sur un ancien
    // envoi Bellum. Absent = comportement d'avant (le jour de l'envoi, sinon aujourd'hui).
    const anchor = anchorOn
      ? parisDate(anchorOn)
      : contact.email_sent_at
        ? parisDate(contact.email_sent_at)
        : parisDate(new Date())
    const { pattern } = await this.patternForContact(contact)
    const followUps = (await this.scheduleFor(contact, anchor, pattern)).filter(step => !step.is_initial)

    const rows = followUps.map(step =>
      this.items.create({
        user_id: userId,
        account_id: accountId,
        contact_id: contact.id,
        cadence_step: step.key,
        source_plan_id: null,
        label: `${step.label} — ${contact.full_name}`,
        week_index: 0,
        // Stable secondary order key; cadence rows are read by contact, not by
        // (week, step), so this only keeps a listing deterministic.
        step_index: step.offset_days,
        done: false,
        execution_status: 'todo',
        snoozed_until: null,
        assigned_to: null,
        due_date: step.due_date,
        completed_at: null,
        last_reminded_on: null,
        // #3274.4 — une relance de cadence existe parce que le premier message
        // n'a pas eu de réponse : le non-résultat est un résultat.
        method_rule: METHOD_RULE_CADENCE_FOLLOW_UP,
      }),
    )
    await this.items.save(rows)
  }

  /**
   * #2733 (SKAIZen Group, 22/09/2026) — un e-mail rebondi (adresse
   * inexistante, domaine invalide) ne doit plus déclencher les touches à
   * venir : le commercial ne relance pas quelqu'un qui n'a jamais rien reçu.
   * Appelée par `ContactsService` au moment où un webhook Resend confirme le
   * rebond (`email.bounced`).
   *
   * Ne retire QUE les touches encore `done: false` — une touche déjà jouée
   * (`done: true`) est un fait passé, et on archive, on ne supprime pas.
   * Idempotent par construction : rejouer sur un contact déjà purgé ne
   * trouve plus rien à retirer (aucune erreur, `delete` sur un ensemble vide).
   */
  async cancelPendingForBounce(contactId: string): Promise<void> {
    await this.items.delete({ contact_id: contactId, done: false })
  }

  /**
   * #2396.3 — un envoi VÉRIFIÉ (Bellum a réellement expédié l'email, la seule
   * preuve de livraison que le produit détienne — voir `message-send-provenance
   * .ts`) complète automatiquement les actions du plan encore OUVERTES qui
   * visent ce contact pour reprendre contact. `completion_mode: 'proof'`,
   * jamais `'manual'` : personne n'a choisi d'issue, c'est un fait constaté.
   *
   * Scope volontairement étroit (#2396.11) : seules les lignes dont l'objet
   * canonique est le CONTACT lui-même (`target_kind === 'contact'`) sont
   * concernées — une vérification ("confirmer l'email") ou une tâche CRM liée
   * au même `contact_id` n'est pas une prise de contact, la compléter serait
   * un mensonge. Best-effort côté appelant : un email déjà parti ne doit pas
   * échouer parce que cette écriture-ci a raté.
   */
  async completeOpenItemsByProof(contactId: string): Promise<void> {
    const open = await this.items.find({
      where: [
        { contact_id: contactId, execution_status: 'todo', target_kind: 'contact' },
        { contact_id: contactId, execution_status: 'prepared', target_kind: 'contact' },
      ],
    })
    if (open.length === 0) return
    const now = new Date()
    for (const item of open) {
      item.execution_status = 'done'
      item.done = true
      item.completed_at = now
      item.completion_mode = 'proof'
      item.outcome = null
    }
    await this.items.save(open)
  }

  /**
   * The full cadence schedule for a contact (the 4 touches) merged with its
   * persisted follow-up items: `done`/`item_id` reflect the real plan-item state,
   * the "initial" touch is done once the contact has been emailed, and
   * `next_step` is the first touch still to play. When the contact was never
   * contacted, returns a preview anchored on today (`contacted:false`).
   */
  async buildCadence(contact: ContactEntity): Promise<ContactCadence> {
    const persisted = await this.items.find({ where: { contact_id: contact.id } })
    const byStep = new Map<CadenceStepKey, ActionPlanItemEntity>()
    for (const item of persisted) {
      if (item.cadence_step) byStep.set(item.cadence_step, item)
    }

    const sentAt = contact.email_sent_at
    const contacted = sentAt != null
    const anchor = sentAt != null ? parisDate(sentAt) : parisDate(new Date())

    const { pattern, scenario } = await this.patternForContact(contact)

    // Contenu par touche (p12 « une preuve NEUVE par touche ») : la phase 4 a
    // rédigé un texte propre à chaque relance, persisté sur le contact. On le
    // rattache à la bonne étape pour que la carte l'affiche sous son échéance —
    // NULL pour l'étape initiale (son contenu est l'email lui-même) et pour un
    // dossier antérieur.
    const cadenceBodies = contact.cadence_messages ?? null
    const bodyForStep = (key: CadenceStepKey): string | null => {
      if (!cadenceBodies) return null
      if (key === 'relance') return cadenceBodies.relance?.trim() || null
      if (key === 'preuve_sociale') return cadenceBodies.preuveSociale?.trim() || null
      if (key === 'close_loop') return cadenceBodies.closeLoop?.trim() || null
      return null
    }

    const steps: CadenceStep[] = (await this.scheduleFor(contact, anchor, pattern)).map(step => {
      const item = byStep.get(step.key)
      return {
        key: step.key,
        label: step.label,
        offset_days: step.offset_days,
        // La date POSÉE fait foi : l'aperçu ne recalcule pas ce qui est déjà au plan.
        due_date: item?.due_date ?? step.due_date,
        done: step.is_initial ? contacted : (item?.done ?? false),
        item_id: item?.id ?? null,
        body: bodyForStep(step.key),
      }
    })

    return {
      contact_id: contact.id,
      scenario,
      contacted,
      anchor_date: contacted ? anchor : null,
      // "Scheduled" = at least one follow-up touch is materialised (so the
      // relance cron covers it).
      scheduled: steps.some(step => step.key !== 'initial' && step.item_id != null),
      steps,
      next_step: steps.find(step => !step.done) ?? null,
    }
  }
}

/* ----------------------------- pure cadence maths ----------------------------- */

/**
 * The DEFAULT cadence pattern (Drive #8) — the cold/known-account schedule:
 * J+1 initial → J+3 relance → J+6 preuve sociale → J+9 close-loop. It is the
 * `standard` pattern from `cadence-templates.ts`, kept exported under its
 * historical name so callers/tests that don't care about the relationship state
 * still resolve the baseline schedule.
 *
 * Each entry: `offsetDays` = days after the first-contact anchor the touch is due
 * (J+n); `label` = human label surfaced in the schedule + relance reminder;
 * `isInitial` = the opening message (triggers the cadence, not a scheduled
 * follow-up). The shape is annotated inline so no private type leaks into the
 * exported API surface (see the `lint:exports:types` rule in CLAUDE.md).
 */
export const CADENCE_TEMPLATE: readonly {
  key: CadenceStepKey
  offsetDays: number
  label: string
  isInitial: boolean
}[] = cadencePatternForState('froid').touches

/**
 * Resolve a cadence pattern against an anchor calendar date (`YYYY-MM-DD`),
 * returning each touch with its concrete `due_date` (= anchor + offset). Pure +
 * deterministic. Defaults to the standard (cold) pattern so existing callers
 * keep the historical schedule.
 */
export function computeCadenceSchedule(
  anchorIsoDate: string,
  pattern: CadencePattern = cadencePatternForState('froid'),
): { key: CadenceStepKey; label: string; offset_days: number; due_date: string; is_initial: boolean }[] {
  return pattern.touches.map(entry => ({
    key: entry.key,
    label: entry.label,
    offset_days: entry.offsetDays,
    due_date: addCalendarDays(anchorIsoDate, entry.offsetDays),
    is_initial: entry.isInitial,
  }))
}

/** Add `days` to a `YYYY-MM-DD` calendar date, returning `YYYY-MM-DD`. Uses UTC
 *  date arithmetic on the date-only value, so it is immune to DST and correctly
 *  rolls over month/leap-year boundaries. */
function addCalendarDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const shifted = new Date(Date.UTC(y, m - 1, d + days))
  const yy = shifted.getUTCFullYear()
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(shifted.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** Europe/Paris calendar date as `YYYY-MM-DD` — matches the `due_date` DATE
 *  column and `parisToday()` in the relance cron, so date compares line up. */
function parisDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(date)
}
