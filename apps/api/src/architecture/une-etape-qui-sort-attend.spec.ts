import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  OUTREACH_SEQUENCE_TEMPLATES,
  OUTREACH_STEP_REACH,
  DELEGATION_HOLD_REASONS,
  DELEGATION_SCOPES,
  delegationVerdict,
  type DelegationScope,
  outreachStepExecution,
  outreachStepKindSchema,
  outreachStepReach,
} from '@bellum/contracts'
import { automaticSequenceIntent, dispatchesThatSkipTheFrontier } from '../modules/outreach/sequence-frontier'

/**
 * GA-374 — une étape de séquence qui SORT attend ; une étape INTERNE part.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUE CETTE GARDE PROTÈGE — ET QU'ELLE N'INVENTE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * #2378.9, DÉCISION LOUIS 21/09/2026, doctrine
 * `c81_etape_sortante_attend_interne_part`.
 * Une étape programmée (J+4, J+10) s'exécute SELON CE QU'ELLE ATTEINT :
 * extérieur ⇒ elle attend une validation explicite, même programmée, même
 * lancée ; purement interne ⇒ elle part à l'heure dite, sans clic.
 *
 * Ce n'est donc PAS « auto-exécution interdite » que cette garde tient — c'est
 * la FRONTIÈRE. Une garde qui refuserait toute exécution automatique serait
 * plus simple, et fausse : le produit a le droit de poser un rappel tout seul.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE LIT VRAIMENT
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. Le CONTRAT — `OUTREACH_STEP_REACH` contre `outreachStepKindSchema` : une
 *     nature d'étape non déclarée n'existe pas, et une nature INCONNUE tombe du
 *     côté qui attend.
 *  2. Les SIX MODÈLES livrés (`OUTREACH_SEQUENCE_TEMPLATES`) — le corpus réel
 *     de ce qu'un commercial programme, pas un exemple écrit pour le test.
 *  3. Le CODE du module `outreach` — chaque `actionRouter.dispatch(` du module
 *     passe par `automaticSequenceIntent`, la porte qui refuse un intent qui
 *     sort. C'est le seul endroit du dépôt où la programmation d'une séquence
 *     déclenche quelque chose sans clic ; si un jour un ordonnanceur exécute
 *     les étapes échues, il naîtra ici.
 *
 * ⚠️ Elle ne lit AUCUN commentaire : un fichier qui expliquerait la frontière
 * en prose sans l'appeler échouerait quand même. (Le dépôt a déjà corrigé une
 * garde qui accusait du code juste pour un mot dans un commentaire.)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ET ELLE SAIT DIRE NON
 * ─────────────────────────────────────────────────────────────────────────────
 * Les trois derniers tests remettent la faute : une nature qui part sans être
 * déclarée, un intent qui sort dispatché automatiquement, un `dispatch(` du
 * module qui contourne la porte. Chacun doit produire un refus.
 */

const OUTREACH_DIR = join(__dirname, '..', 'modules', 'outreach')

function sourcesOf(dir: string): { path: string; source: string }[] {
  const out: { path: string; source: string }[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourcesOf(full))
      continue
    }
    if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts')) continue
    out.push({ path: full, source: readFileSync(full, 'utf8') })
  }
  return out
}

describe('GA-374 — le contrat déclare de quel côté tombe chaque nature d’étape', () => {
  it('toute nature d’étape du contrat est déclarée, et rien de plus', () => {
    expect(Object.keys(OUTREACH_STEP_REACH).sort()).toEqual([...outreachStepKindSchema.options].sort())
  })

  it('l’e-mail SORT et attend ; le rappel et la tâche partent à l’heure dite', () => {
    expect(outreachStepExecution('email')).toBe('awaits_validation')
    expect(outreachStepExecution('reminder')).toBe('runs_on_schedule')
    expect(outreachStepExecution('task')).toBe('runs_on_schedule')
  })

  it('les six modèles livrés n’emploient que des natures déclarées', () => {
    const kinds = Object.values(OUTREACH_SEQUENCE_TEMPLATES).flatMap(t => t.steps.map(s => s.kind))
    expect(kinds.length).toBeGreaterThan(15)
    for (const kind of kinds) expect(Object.keys(OUTREACH_STEP_REACH)).toContain(kind)
  })
})

describe('GA-374 — la seule exécution automatique du constructeur reste INTERNE', () => {
  it('la porte laisse passer le rappel daté — le côté interne de la frontière', () => {
    expect(automaticSequenceIntent('schedule_reminder')).toBe('schedule_reminder')
    expect(automaticSequenceIntent('create_crm_task')).toBe('create_crm_task')
  })

  it('chaque `dispatch(` du module outreach passe par la porte', () => {
    const sources = sourcesOf(OUTREACH_DIR)
    expect(sources.length).toBeGreaterThan(2)
    const problems = sources.flatMap(({ path, source }) =>
      dispatchesThatSkipTheFrontier(source).map(t => `${path} → ${t}`),
    )
    expect(problems).toEqual([])
  })

  it('la garde lit bien quelque chose — un corpus vide passerait au vert pour toujours', () => {
    const sources = sourcesOf(OUTREACH_DIR)
    const dispatches = sources.filter(({ source }) => source.includes('.dispatch('))
    expect(dispatches.length).toBeGreaterThan(0)
    expect(sources.some(({ source }) => source.includes('automaticSequenceIntent'))).toBe(true)
  })
})

describe('GA-374 — elle sait dire NON', () => {
  it('une nature d’étape NEUVE que personne n’a déclarée attend, elle ne part pas', () => {
    // Lot L-B (#4165) — `linkedin_invite` a quitté cette liste : c'est désormais une nature DÉCLARÉE (interne :
    // le geste LinkedIn est celui du commercial, Bellum ne pilote jamais LinkedIn). La liste garde son rôle —
    // une nature que personne n'a déclarée attend.
    for (const neuve of ['sms', 'whatsapp', 'instagram_dm', 'video_message']) {
      expect(outreachStepReach(neuve)).toBe('external')
      expect(outreachStepExecution(neuve)).toBe('awaits_validation')
    }
  })

  it('lot L-B — LinkedIn et l’appel sont DÉCLARÉS internes : un geste manuel, jamais une sortie automatique', () => {
    for (const declaree of ['linkedin_invite', 'linkedin_message', 'call']) {
      expect(outreachStepReach(declaree)).toBe('internal')
      expect(outreachStepExecution(declaree)).toBe('runs_on_schedule')
    }
  })

  it('la porte REFUSE un intent qui sort, même demandé explicitement', () => {
    expect(() => automaticSequenceIntent('send_email')).toThrow(/#2378\.9/)
    expect(() => automaticSequenceIntent('create_calendar_event')).toThrow(/#2378\.9/)
  })

  it('le détecteur voit un `dispatch(` qui contourne la porte', () => {
    const coupable = `
      const result = await this.actionRouter.dispatch(
        { type: 'send_email', contactId: contact.id },
        principal,
      )
    `
    expect(dispatchesThatSkipTheFrontier(coupable)).toEqual(["type: 'send_email'"])
  })

  it('le détecteur n’attrape PAS ce qu’il ne vise pas', () => {
    const innocent = `
      const result = await this.actionRouter.dispatch(
        { type: automaticSequenceIntent('schedule_reminder'), contactId: contact.id },
        principal,
      )
      // Un commentaire qui cite type: 'send_email' ne prouve rien et n'accuse personne.
      const ailleurs = await this.mailer.send({ to })
    `
    expect(dispatchesThatSkipTheFrontier(innocent)).toEqual([])
  })
})

describe('GA-374 — #3702, la délégation renverse c81 sur un point, pas au-delà', () => {
  const NOW = new Date(2026, 9, 7, 10)
  const base = {
    now: NOW,
    step: { kind: 'email', channel: 'email', contact_id: 'c', content_hash: 'h', sender_mailbox_id: 'm' },
    contact: { replied: false, opposed: false, excluded: false },
    capabilities: { mailbox_connected: true, reply_reading_available: true },
  }

  it('sans délégation, tout ce qui sort ATTEND — c81 inchangée', () => {
    for (const kind of ['email', 'sms', 'whatsapp', 'video_message']) {
      const verdict = delegationVerdict({ ...base, delegation: null, step: { ...base.step, kind } })
      expect(verdict).toEqual({ decision: 'awaits_validation', reason: 'no_delegation' })
    }
  })

  it('l’interne part toujours, avec ou sans délégation', () => {
    expect(delegationVerdict({ ...base, delegation: null, step: { ...base.step, kind: 'reminder' } }).decision).toBe(
      'run',
    )
  })

  it('chaque raison d’attente est nommée — rien ne se masque derrière « Active »', () => {
    expect(DELEGATION_HOLD_REASONS.length).toBeGreaterThanOrEqual(12)
    expect(new Set(DELEGATION_HOLD_REASONS).size).toBe(DELEGATION_HOLD_REASONS.length)
  })
})

/**
 * ⚠️ 11/10/2026 — #4016 L5 (décision Louis) : c81 cède sur un point de plus. Un
 * mandat SIGNÉ couvre désormais cinq usages (`DELEGATION_SCOPES`), dont la
 * délégation PAR DÉFAUT des étapes de séquence de l'espace. La frontière tient
 * toujours, et c'est ce que ce bloc garde : SANS mandat de la bonne portée, ce
 * qui sort ATTEND ; un mandat d'une portée n'en couvre jamais une autre.
 */
describe('GA-374 — #4016 L5 : une portée par usage, et rien sans la sienne', () => {
  const NOW = new Date(2026, 9, 7, 10)
  const SIGNED = new Date(2026, 9, 6, 8).toISOString()
  const mandate = (scope: DelegationScope) => ({
    id: 'm',
    workspace_id: 'ws',
    scope,
    campaign_label: 'mandat',
    contact_ids: [],
    channels: ['email' as const],
    sender_mailbox_id: 'm',
    content_hash: null,
    window: { start_hour: 8, end_hour: 19 },
    starts_at: SIGNED,
    expires_at: new Date(2026, 9, 20).toISOString(),
    max_messages: 10,
    sent_count: 0,
    validated_by: ['u'],
    validated_at: SIGNED,
    revoked_at: null,
    paused_at: null,
  })
  const step = (scope: DelegationScope) => ({
    kind: 'email',
    channel: 'email',
    contact_id: 'c',
    content_hash: 'h',
    sender_mailbox_id: 'm',
    scope,
    originated_at: new Date(2026, 9, 7, 9).toISOString(),
  })
  const contact = { replied: false, opposed: false, excluded: false }
  const capabilities = { mailbox_connected: true, reply_reading_available: true }

  it('pour CHACUNE des portées : sans mandat, tout ce qui sort attend', () => {
    expect(DELEGATION_SCOPES.length).toBe(6)
    for (const scope of DELEGATION_SCOPES) {
      expect(delegationVerdict({ now: NOW, delegation: null, step: step(scope), contact, capabilities })).toEqual({
        decision: 'awaits_validation',
        reason: 'no_delegation',
      })
    }
  })

  it('le mandat de sa portée fait partir l’étape d’espace — la seule ouverture de c81', () => {
    for (const scope of DELEGATION_SCOPES.filter(s => s !== 'campaign')) {
      expect(
        delegationVerdict({ now: NOW, delegation: mandate(scope), step: step(scope), contact, capabilities }),
      ).toEqual({ decision: 'run', basis: 'delegation' })
    }
  })

  it('sait dire NON — un mandat d’une portée ne couvre AUCUNE autre', () => {
    for (const signed of DELEGATION_SCOPES) {
      for (const asked of DELEGATION_SCOPES.filter(s => s !== signed)) {
        const verdict = delegationVerdict({
          now: NOW,
          delegation: mandate(signed),
          step: step(asked),
          contact,
          capabilities,
        })
        expect(`${signed}→${asked}:${verdict.decision}`).toBe(`${signed}→${asked}:awaits_validation`)
      }
    }
  })

  it('sait dire NON — même sous mandat, une nature d’étape INCONNUE reste du côté qui attend', () => {
    const verdict = delegationVerdict({
      now: NOW,
      delegation: mandate('workspace_sequences'),
      step: { ...step('workspace_sequences'), kind: 'sms', channel: 'sms' },
      contact,
      capabilities,
    })
    expect(verdict.decision).toBe('awaits_validation')
  })
})
