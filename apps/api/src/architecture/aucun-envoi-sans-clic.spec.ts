import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  AUTOMATION_LEVEL_ORDER,
  DEFAULT_APPROVAL_SETTINGS,
  DEFAULT_RETRY_POLICY,
  reachesOutsideProduct,
  type ApprovalSettings,
  type WorkflowStep,
} from '@bellum/contracts'
import { demandsAHuman, levelForStep } from '../modules/action-os/approval-policy'

/**
 * GA-375 — l'envoi d'un e-mail de prospection reste un CLIC — OU un MANDAT SIGNÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 11/10/2026 — RENVERSEMENT DATÉ (#4016 L5, décision Louis : « tout ok mais
 * faut un go vérifié avant »)
 * ─────────────────────────────────────────────────────────────────────────────
 * « Ni liste blanche, ni exception, ni réglage » (21/09) devient : ni liste
 * blanche, ni exception, ni RÉGLAGE — mais un MANDAT signé explicitement, par
 * portée (`DELEGATION_SCOPES` : campagne, séquences, Laura, relance d'impayé,
 * suivi de rendez-vous), fait partir un envoi sans clic. Ce que la garde tient
 * désormais, et qu'elle sait toujours refuser :
 *  - la capacité de prospection `sendEmail`/`sendEmailBulk` reste réservée aux
 *    DEUX appelants nommés (un geste) — inchangé ;
 *  - le SEUL chemin automatique qui envoie (`MailboxService.sendBatch` sous un
 *    `@Cron`) est le dispatcher `outreach-send.sweeper.ts`, et il passe par la
 *    porte du mandat (`gate(`, `gateAwaitingMandate(`) avant d'envoyer ; un
 *    déclencheur automatique qui enverrait sans elle est rouge ;
 *  - aucun RÉGLAGE (niveau d'automatisation, seuil) ne remplace le mandat :
 *    `levelForStep` exige toujours un humain pour `send_email`.
 * L'ancienne règle, ci-dessous, reste lisible : elle vaut entière pour tout ce
 * qu'aucun mandat ne couvre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUE CETTE GARDE PROTÈGE — ET QU'ELLE N'INVENTE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * #2375.10, DÉCISION LOUIS 21/09/2026, doctrine
 * `c82_copilote_prepare_le_commercial_envoie` : NON, pas d'envoi d'e-mail sans
 * validation — **ni liste blanche, ni exception, ni réglage**. L'écran prépare
 * tout (destinataire, objet, corps, pièce jointe) et attend le clic.
 *
 * La doctrine elle-même est plus ancienne (« le copilote n'envoie jamais
 * d'e-mail : il prépare, le commercial envoie »). Ce que le 21/09 tranche est
 * la question qui revenait sous trois formes — « juste pour les contacts qu'on
 * connaît », « juste quand le commercial a déjà répondu », « juste si l'espace
 * le règle ainsi ». Les trois sont refusées, et c'est cette clôture-là qui se
 * garde ici : une règle sans exception est une règle qu'un test peut tenir.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE `external-steps-need-a-human.spec.ts` (GA-239) NE COUVRE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-239 tient les PAS d'Action OS : catalogue de workflows, routines, cartes du
 * copilote. Elle ne regarde pas la CAPACITÉ d'envoi elle-même
 * (`ContactsService.sendEmail`, #394), qu'un service, un worker ou un cron
 * pourrait appeler directement sans jamais passer par un pas.
 *
 * Celle-ci tient ce chemin-là, sur trois corpus RÉELS :
 *  1. les sources de `apps/api/src` (hors tests), sans leurs commentaires —
 *     qui APPELLE la capacité d'envoi ;
 *  2. ces mêmes sources — aucun `@Cron`, `@Interval`, `@Processor` ni
 *     `@OnEvent` ne touche cette capacité ;
 *  3. le barème d'approbation RÉEL (`levelForStep`), exercé sur les SIX niveaux
 *     d'automatisation : aucun réglage d'espace ne descend un envoi sous
 *     l'approbation d'un humain.
 *
 * ⚠️ Elle ne lit aucun commentaire, et elle ne confond pas deux capacités qui
 * portent le même nom : `BackofficeAlertDispatchService` a son propre
 * `sendEmail` privé (une alerte à NOTRE équipe), qui n'est pas un envoi de
 * prospection et que cette garde ne doit pas accuser.
 */

const API_SRC = join(__dirname, '..')

/**
 * Les SEULS fichiers autorisés à appeler la capacité d'envoi de prospection.
 * Chacun part d'un geste et le prouve :
 *  - `contacts.controller.ts` — deux routes HTTP `@CurrentUser()` : le clic ;
 *  - `action-router.service.ts` — l'intent `send_email`, classé « sort du
 *    produit », donc jamais sous l'approbation d'un humain (`levelForStep`).
 * Ajouter une ligne ici est un geste VISIBLE en relecture ; c'est le point.
 *
 * #2375.10 — DÉCISION LOUIS 21/09/2026 (ce soir) : la surface MCP
 * (`mcp-api.controller.ts`) N'EST PLUS ICI. Elle appelait `ContactsService.
 * sendEmail` directement ; la garde l'avait trouvée et nommée comme un
 * troisième chemin d'envoi (ci-dessus, avant ce lot). Elle appelle désormais
 * `ContactsService.prepareEmail` — qui résout le MÊME brouillon par les MÊMES
 * gardes (`no_email` → `no_draft` → `already_sent` → `suppressed`,
 * `resolveSendableDraft`, partagé avec `deliverDraft`) mais ne déclenche
 * jamais `MailerService.sendOutreachEmail` ni ne stocke `email_sent_at` : elle
 * dépose/valide le brouillon et rend l'identifiant du contact. Deux appelants,
 * pas trois.
 */
const PROSPECT_SEND_CALLERS = [
  'modules/action-router/action-router.service.ts',
  'modules/contacts/contacts.controller.ts',
  // Théo M2 — envoi programmé — DÉCISION LOUIS 22/10/2026 (`c102`) : le geste du commercial (valider + programmer),
  // décalé dans le temps. Le module câble LE chemin du clic (canal `mailbox`), le service ne l'appelle qu'après ses
  // deux verrous — ordre tenu par le bloc « Théo M2 » ci-dessous.
  'modules/scheduled-send/scheduled-send.module.ts',
  'modules/scheduled-send/scheduled-send.service.ts',
] as const

/**
 * Théo M2 — envoi programmé — le seul départ DIFFÉRÉ. Il n'a pas de clic à l'heure dite : il a le geste du commercial
 * enregistré AVANT (sa validation de CETTE version, son empreinte, sa date). `dispatch(` doit donc relire cette
 * validation (`assertStillValidated(`), puis réserver la ligne (`attempted_at`), et SEULEMENT ensuite appeler le
 * chemin du clic. Le déclencheur (`@Processor`) vit dans le worker, qui n'appelle que `dispatch`.
 */
const SCHEDULED_SENDER = 'modules/scheduled-send/scheduled-send.service.ts'
const SCHEDULED_WORKER = 'modules/scheduled-send/scheduled-send.worker.ts'

/** Le code SANS ses commentaires : une garde qui lit la prose accuse le bien. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * Les appels à la capacité d'envoi de PROSPECTION, par leur receveur.
 *
 * ⚠️ `this.sendEmail(` est volontairement EXCLU : c'est la forme d'une méthode
 * privée de la même classe, et `BackofficeAlertDispatchService` en a une — une
 * alerte à NOTRE équipe, qui n'a rien d'un envoi de prospection. Une garde qui
 * l'attraperait accuserait du code juste, et se ferait désarmer le jour où
 * quelqu'un le remarquerait.
 */
function prospectSendCallSites(source: string): string[] {
  const code = stripComments(source)
  const found: string[] = []
  for (const call of code.matchAll(/(?:this\.)?([A-Za-z_$][\w$]*)\.(sendEmailBulk|sendEmail)\s*\(/g)) {
    if (call[1] === 'this') continue
    found.push(`${call[1]}.${call[2]}`)
  }
  return found
}

/** Les déclencheurs qui partent SANS geste humain, dans un fichier qui envoie. */
function automaticTriggersThatSend(source: string): string[] {
  if (prospectSendCallSites(source).length === 0) return []
  const code = stripComments(source)
  const triggers = new Set<string>()
  for (const hit of code.matchAll(/@(Cron|Interval|Timeout|Processor|OnEvent)\s*\(/g)) triggers.add(`@${hit[1]}`)
  return [...triggers]
}

function sourcesOf(dir: string): { path: string; source: string }[] {
  const out: { path: string; source: string }[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourcesOf(full))
      continue
    }
    if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts')) continue
    out.push({ path: relative(API_SRC, full), source: readFileSync(full, 'utf8') })
  }
  return out
}

const SOURCES = sourcesOf(API_SRC)

function sendStep(): WorkflowStep {
  return {
    key: 'send',
    intentType: 'send_email',
    intent: 'Envoyer le brouillon relu',
    capability: 'email',
    permission: 'contacts:write',
    estimatedCredits: 0,
    risk: 'low',
    // `WorkflowStep` a gagné `expectedResult`/`dependsOn`/`retry` après cette
    // garde (schéma zod à défaut, donc REQUIS sur un littéral non parsé) —
    // corrigé au passage, sans quoi `check-types:tests` restait rouge pour une
    // raison qui n'a rien à voir avec #2375.10.
    expectedResult: "L'email est marqué envoyé (email_sent_at posé).",
    dependsOn: [],
    retry: DEFAULT_RETRY_POLICY,
  }
}

describe('GA-375 — qui peut appeler la capacité d’envoi', () => {
  it('lit un corpus non vide — une garde sans corpus est verte pour toujours', () => {
    expect(SOURCES.length).toBeGreaterThan(200)
    expect(SOURCES.some(({ source }) => source.includes('sendEmail'))).toBe(true)
  })

  it('les seuls appelants sont ceux qui partent d’un geste, et ils sont NOMMÉS', () => {
    const callers = new Set(SOURCES.flatMap(({ path, source }) => (prospectSendCallSites(source).length ? [path] : [])))
    expect([...callers].sort()).toEqual([...PROSPECT_SEND_CALLERS].sort())
  })

  it('chaque appel depuis un CONTRÔLEUR porte l’utilisateur qui le demande', () => {
    // Un envoi qui part d'une route sans `@CurrentUser()` n'est le geste de
    // personne : c'est la forme qu'aurait une route de service, un webhook ou
    // un rappel de tâche. Lecture du code réel, pas d'un commentaire.
    //
    // #2375.10 — depuis que la surface MCP dépose (`prepareEmail`) au lieu
    // d'envoyer, `contacts.controller.ts` est le SEUL fichier `.controller.ts`
    // qui appelle encore la capacité d'envoi — mais il le fait depuis DEUX
    // routes (`send-email/bulk` et `:id/send-email`). Le compte porte donc sur
    // les POINTS D'APPEL, pas sur le nombre de fichiers : sinon cette
    // assertion de non-vacuité tomberait avec la fermeture même que #2375.10
    // vient de faire, pour la MAUVAISE raison.
    const controleurs = SOURCES.filter(
      ({ path, source }) => path.endsWith('.controller.ts') && prospectSendCallSites(source).length > 0,
    )
    const totalCallSites = controleurs.reduce((n, { source }) => n + prospectSendCallSites(source).length, 0)
    expect(totalCallSites).toBeGreaterThan(1)
    for (const { path, source } of controleurs) {
      const code = stripComments(source)
      for (const call of code.matchAll(/(?:this\.)?[A-Za-z_$][\w$]*\.(?:sendEmailBulk|sendEmail)\s*\(/g)) {
        const avant = code.slice(Math.max(0, call.index - 500), call.index)
        expect(`${path} → ${avant.includes('@CurrentUser()')}`).toBe(`${path} → true`)
      }
    }
  })

  it('aucun déclencheur automatique n’atteint la capacité d’envoi', () => {
    const coupables = SOURCES.filter(({ source }) => automaticTriggersThatSend(source).length > 0).map(s => s.path)
    expect(coupables).toEqual([])
  })

  it('le corpus contient bien des déclencheurs automatiques — sinon le test précédent ne prouve rien', () => {
    const automatismes = SOURCES.filter(({ source }) => /@(Cron|Interval|Processor|OnEvent)\(/.test(source))
    expect(automatismes.length).toBeGreaterThan(3)
  })
})

/**
 * #4016 L5 — les fichiers où un déclencheur AUTOMATIQUE atteint le connecteur
 * d'envoi (`.sendBatch(`), et ce qui leur manque pour être couverts par un
 * mandat. Rend la liste des portes absentes : vide = le fichier passe par le
 * mandat avant d'envoyer.
 */
const MANDATE_GATES = ['.gate(', '.gateAwaitingMandate('] as const
const MANDATED_AUTOMATIC_SENDERS = ['modules/outreach/outreach-send.sweeper.ts'] as const

function automaticConnectorSends(source: string): boolean {
  const code = stripComments(source)
  return /@(Cron|Interval|Timeout|Processor|OnEvent)\s*\(/.test(code) && /\.sendBatch\s*\(/.test(code)
}

function missingMandateGates(source: string): string[] {
  const code = stripComments(source)
  return MANDATE_GATES.filter(gate => !code.includes(gate))
}

describe('GA-375 — #4016 L5 : le seul envoi SANS clic passe par le MANDAT', () => {
  it('le seul déclencheur automatique qui atteint le connecteur d’envoi est NOMMÉ', () => {
    const senders = SOURCES.filter(({ source }) => automaticConnectorSends(source)).map(s => s.path)
    expect(senders.sort()).toEqual([...MANDATED_AUTOMATIC_SENDERS].sort())
  })

  it('et il passe par les DEUX portes du mandat (message délégué, message qui attend un mandat)', () => {
    for (const path of MANDATED_AUTOMATIC_SENDERS) {
      const file = SOURCES.find(s => s.path === path)
      expect(file).toBeDefined()
      expect(`${path} → ${missingMandateGates(file?.source ?? '').join(',')}`).toBe(`${path} → `)
    }
  })

  it('un message qui attend un mandat ne part que sur un verdict `run`', () => {
    const sweeper = stripComments(SOURCES.find(s => s.path === MANDATED_AUTOMATIC_SENDERS[0])?.source ?? '')
    const start = sweeper.indexOf('async dispatchUnderMandate(')
    expect(start).toBeGreaterThan(-1)
    const end = sweeper.indexOf('private async ', start + 1)
    const body = sweeper.slice(start, end > start ? end : undefined)
    const gateAt = body.indexOf('gateAwaitingMandate(')
    const runCheckAt = body.indexOf("gate.kind !== 'run'")
    const sendAt = body.indexOf('this.send(')
    expect(gateAt).toBeGreaterThan(-1)
    expect(runCheckAt).toBeGreaterThan(gateAt)
    expect(sendAt).toBeGreaterThan(runCheckAt)
  })

  it('sait dire NON — un cron qui envoie par le connecteur SANS la porte du mandat', () => {
    const coupable = `
      @Cron('0 9 * * *')
      async relancerLesImpayes() {
        await this.mailbox.sendBatch(userId, { batchId, mode: 'send', items })
      }
    `
    expect(automaticConnectorSends(coupable)).toBe(true)
    expect(missingMandateGates(coupable)).toEqual(['.gate(', '.gateAwaitingMandate('])
  })

  it('n’attrape PAS ce qu’elle ne vise pas — un clic (sans déclencheur) ou une porte citée en commentaire', () => {
    const clic = `async decideSend(@CurrentUser() user) { await this.mailbox.sendBatch(user.userId, input) }`
    expect(automaticConnectorSends(clic)).toBe(false)
    const prose = `
      @Cron('*/10 * * * *')
      async sweep() { await this.mailbox.sendBatch(u, i) }
      // ici on appellerait this.delegations.gateAwaitingMandate(m) puis .gate(m)
    `
    expect(missingMandateGates(prose)).toEqual(['.gate(', '.gateAwaitingMandate('])
  })
})

describe('GA-375 — ni liste blanche, ni exception, ni RÉGLAGE', () => {
  it('l’envoi reste classé « sort du produit », quel que soit le reste', () => {
    expect(reachesOutsideProduct('send_email')).toBe(true)
  })

  it('AUCUN des six niveaux d’automatisation ne fait partir un envoi sans humain', () => {
    expect(AUTOMATION_LEVEL_ORDER.length).toBe(6)
    for (const defaultLevel of AUTOMATION_LEVEL_ORDER) {
      const settings: ApprovalSettings = { ...DEFAULT_APPROVAL_SETTINGS, defaultLevel }
      expect(demandsAHuman(levelForStep(sendStep(), settings))).toBe(true)
    }
  })

  it('ni un seuil relevé au maximum — un réglage de volume ne rachète pas un envoi', () => {
    const permissif: ApprovalSettings = {
      defaultLevel: 'n5_extended_auto',
      bulkThreshold: 1000,
      spendThreshold: 10_000,
    }
    expect(demandsAHuman(levelForStep(sendStep(), permissif))).toBe(true)
  })
})

describe('GA-375 — elle sait dire NON', () => {
  it('voit un service qui appelle la capacité d’envoi depuis ailleurs', () => {
    const coupable = `
      async relancerTout() {
        for (const id of ids) await this.contactsService.sendEmail(id, userId, email)
      }
    `
    expect(prospectSendCallSites(coupable)).toEqual(['contactsService.sendEmail'])
  })

  it('voit un CRON qui envoie — le chemin exact que la décision refuse', () => {
    const coupable = `
      @Cron('0 9 * * *')
      async relanceQuotidienne() {
        await this.contacts.sendEmailBulk(dus, systemUserId, systemEmail)
      }
    `
    expect(automaticTriggersThatSend(coupable)).toEqual(['@Cron'])
    expect(prospectSendCallSites(coupable)).toEqual(['contacts.sendEmailBulk'])
  })

  it('n’attrape PAS ce qu’elle ne vise pas', () => {
    // 1. L'alerte back-office a son propre `sendEmail` PRIVÉ : ce n'est pas un
    //    envoi de prospection, et l'accuser casserait du code juste.
    const alerte = `
      private async sendEmail(kind: AlertKind, subject: string): Promise<void> { await this.mailer.enqueue(...) }
      await this.sendEmail(input.kind, rendered.subject, rendered.text, rendered.html)
    `
    expect(prospectSendCallSites(alerte)).toEqual([])

    // 2. Un COMMENTAIRE qui cite l'appel n'accuse personne.
    const prose = `
      // Voir this.contactsService.sendEmail(id, userId, email) — le geste reste humain.
      /** Miroir de {@link ContactsService.sendEmail}. */
      const rien = 1
    `
    expect(prospectSendCallSites(prose)).toEqual([])

    // 3. Un cron qui ne touche pas l'envoi de prospection.
    const cronInnocent = `
      @Cron('0 3 * * *')
      async rembourserLesCredits() { await this.credits.refundAll() }
    `
    expect(automaticTriggersThatSend(cronInnocent)).toEqual([])

    // 4. Le renvoi d'un code de vérification à SOI-MÊME n'est pas une prospection.
    const otp = `await this.emailVerification.resendEmailOtp(userId)`
    expect(prospectSendCallSites(otp)).toEqual([])
  })
})

/** L'ordre des verrous dans `dispatch(` : validation relue → réservation → envoi. `null` = l'ordre tient. */
function scheduledDispatchOrderViolation(source: string): string | null {
  const code = stripComments(source)
  const start = code.indexOf('async dispatch(')
  if (start === -1) return 'dispatch( introuvable'
  const end = code.indexOf('\n  async ', start + 1)
  const body = code.slice(start, end > start ? end : undefined)
  const validatedAt = body.indexOf('this.assertStillValidated(')
  const claimAt = body.indexOf('{ attempted_at: now }')
  const sendAt = body.indexOf('.sendEmail(')
  if (validatedAt === -1) return 'la validation du commercial n’est pas relue'
  if (claimAt === -1 || claimAt < validatedAt) return 'la ligne n’est pas réservée après la validation'
  if (sendAt === -1 || sendAt < claimAt) return 'l’envoi ne suit pas la réservation'
  return null
}

describe('GA-375 — Théo M2 : l’envoi programmé est le geste du commercial, daté par lui', () => {
  it('le départ différé relit la validation, réserve, PUIS envoie', () => {
    const file = SOURCES.find(s => s.path === SCHEDULED_SENDER)
    expect(file).toBeDefined()
    expect(scheduledDispatchOrderViolation(file?.source ?? '')).toBeNull()
  })

  it('le worker n’atteint la capacité d’envoi que par `dispatch`', () => {
    const worker = stripComments(SOURCES.find(s => s.path === SCHEDULED_WORKER)?.source ?? '')
    expect(worker).toMatch(/@Processor\(/)
    expect(worker).toContain('.dispatch(')
    expect(prospectSendCallSites(worker)).toEqual([])
  })

  it('sait dire NON — un départ qui envoie avant de relire la validation ou sans réserver', () => {
    const sansValidation = `
      async dispatch(id) {
        const claimed = await this.sends.update(c, { attempted_at: now })
        await this.transport.sendEmail(a, b, c)
      }
    `
    expect(scheduledDispatchOrderViolation(sansValidation)).toBe('la validation du commercial n’est pas relue')
    const sansReservation = `
      async dispatch(id) {
        const checked = await this.assertStillValidated(send)
        await this.transport.sendEmail(a, b, c)
      }
    `
    expect(scheduledDispatchOrderViolation(sansReservation)).toBe('la ligne n’est pas réservée après la validation')
  })

  it('n’attrape PAS ce qu’elle ne vise pas — l’ordre cité en commentaire ne compte pas', () => {
    const prose = `
      async dispatch(id) {
        // this.assertStillValidated( puis { attempted_at: now } puis .sendEmail(
        return 'skipped'
      }
    `
    expect(scheduledDispatchOrderViolation(prose)).toBe('la validation du commercial n’est pas relue')
  })
})
