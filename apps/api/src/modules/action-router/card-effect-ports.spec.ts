import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { failure, success } from '@bellum/utils'
import {
  enrichmentJobsPortFrom,
  mailDraftPortFrom,
  messageDraftPortFrom,
  settingsPortFrom,
  type MailDraftPort,
} from './card-effect-ports'

/**
 * #1931 L2 — les ports étroits du routeur.
 *
 * Le bloc qui compte le plus est le premier : la doctrine « le copilote n'envoie
 * jamais d'e-mail » ne tient pas par une convention, elle tient par l'ABSENCE de
 * code. Ces tests la prouvent de trois façons indépendantes — à l'exécution (rien
 * ne franchit l'adaptateur), au typage (`@ts-expect-error`), et dans le texte des
 * deux fichiers qui pourraient la rouvrir.
 */

describe('create_mail_draft — UN BROUILLON, AUCUN CHEMIN D’ENVOI', () => {
  function mailbox() {
    return {
      createDraft: jest.fn().mockResolvedValue({
        draftId: 'draft-1',
        messageId: 'msg-1',
        threadId: 'thread-1',
        webUrl: 'https://mail.example/d/1',
      }),
      // #2277.34 (épopée #2771) — le rollback autorisé : supprimer, pas envoyer.
      deleteDraft: jest.fn().mockResolvedValue({ deleted: true }),
      // Ce que la vraie messagerie sait AUSSI faire — et qui ne doit jamais passer.
      sendBatch: jest.fn(),
      send: jest.fn(),
    }
  }

  it('l’adaptateur ne recopie QUE `createDraft`/`deleteDraft` — un service qui sait envoyer ne transmet pas son envoi', () => {
    const port = mailDraftPortFrom(mailbox())
    expect(Object.keys(port).sort()).toEqual(['createDraft', 'deleteDraft'])
  })

  it('supprime un brouillon par son identifiant, rien d’autre', async () => {
    const source = mailbox()
    const port = mailDraftPortFrom(source)
    expect(await port.deleteDraft('u1', 'draft-1')).toEqual({ deleted: true })
    expect(source.deleteDraft).toHaveBeenCalledWith('u1', 'draft-1')
    expect(source.sendBatch).not.toHaveBeenCalled()
    expect(source.send).not.toHaveBeenCalled()
  })

  it('créer le brouillon n’appelle rien d’autre que la création de brouillon', async () => {
    const source = mailbox()
    const port = mailDraftPortFrom(source)
    const created = await port.createDraft('u1', { to: 'claire@acme.example', subject: 'Suite', body: 'Bonjour' })
    expect(created).toEqual({
      draftId: 'draft-1',
      messageId: 'msg-1',
      threadId: 'thread-1',
      webUrl: 'https://mail.example/d/1',
    })
    expect(source.createDraft).toHaveBeenCalledWith('u1', {
      to: 'claire@acme.example',
      cc: [],
      subject: 'Suite',
      body: 'Bonjour',
      appendSignature: true,
      documentIds: [],
    })
    expect(source.sendBatch).not.toHaveBeenCalled()
    expect(source.send).not.toHaveBeenCalled()
  })

  it('au TYPAGE : le port n’a pas de méthode d’envoi (la compilation échouerait s’il en gagnait une)', () => {
    const port: MailDraftPort = mailDraftPortFrom(mailbox())
    // @ts-expect-error — `MailDraftPort` n'expose aucune méthode d'envoi.
    expect(port.sendBatch).toBeUndefined()
    // @ts-expect-error — ni sous ce nom-là.
    expect(port.send).toBeUndefined()
  })

  it('dans le TEXTE : ni le port ni le routeur ne nomment une méthode d’envoi de messagerie', () => {
    const ports = readFileSync(join(__dirname, 'card-effect-ports.ts'), 'utf8')
    const router = readFileSync(join(__dirname, 'action-router.service.ts'), 'utf8')
    // La garde LIT quelque chose : les deux fichiers portent bien le brouillon.
    expect(ports).toContain('createDraft')
    expect(router).toContain('dispatchMailDraft')
    // Et sait dire NON : un appel d'envoi ajouté à l'un ou à l'autre la fait tomber.
    const sendCall = /\.(sendBatch|sendGmail|sendMail|sendPrepared)\s*\(/
    expect(ports).not.toMatch(sendCall)
    expect(router).not.toMatch(sendCall)
    // Témoin : `sendEmail` (le brouillon RELU de #394, envoyé sur un clic humain
    // explicite) reste un autre intent — la garde ne l'attrape pas.
    expect(router).toContain('this.contacts.sendEmail(')
  })
})

describe('enrich_contact en file — ce que la file sait, sans rien deviner', () => {
  const source = (status: unknown, enqueue?: unknown) => ({
    enqueueWithReservation: jest
      .fn()
      .mockResolvedValue(enqueue ?? success({ job_id: 'enrich-c1', reservation_attached: true })),
    status: jest.fn().mockResolvedValue(status),
  })

  it('transmet la réservation au job et dit si elle y est attachée', async () => {
    const jobs = source(success({ state: 'queued', job_id: 'enrich-c1' }))
    const port = enrichmentJobsPortFrom(jobs)
    const outcome = await port.enqueue({
      contactId: 'c1',
      userId: 'u1',
      firstName: 'Claire',
      organizationName: 'ACME',
      reservationReference: 'card_t_0',
      reservationWorkspaceId: 'ws-1',
    })
    expect(outcome).toEqual({ accepted: true, jobId: 'enrich-c1', reservationAttached: true })
    // R4 — la référence voyage AVEC son espace : le worker solde dans cet espace-là.
    expect(jobs.enqueueWithReservation).toHaveBeenCalledWith(
      'c1',
      'u1',
      { first_name: 'Claire', organization_name: 'ACME' },
      { reservationReference: 'card_t_0', reservationWorkspaceId: 'ws-1' },
    )
  })

  it('un refus connu d’avance (crédits épuisés, cooldown) reste un refus typé', async () => {
    const port = enrichmentJobsPortFrom(
      source(null, failure({ code: 'insufficient_credits', message: 'Crédits épuisés.' })),
    )
    expect(await port.enqueue({ contactId: 'c1', userId: 'u1', firstName: 'C', organizationName: 'A' })).toEqual({
      accepted: false,
      code: 'insufficient_credits',
      message: 'Crédits épuisés.',
    })
  })

  it('une recherche terminée rapporte son débit, 0 compris', async () => {
    const found = enrichmentJobsPortFrom(
      source(success({ state: 'done', job_id: 'enrich-c1', result: { credits_debited: 1 } })),
    )
    const nothing = enrichmentJobsPortFrom(
      source(success({ state: 'done', job_id: 'enrich-c1', result: { credits_debited: 0 } })),
    )
    expect(await found.observe('c1', 'u1')).toEqual({ state: 'done', jobId: 'enrich-c1', creditsDebited: 1 })
    expect(await nothing.observe('c1', 'u1')).toEqual({ state: 'done', jobId: 'enrich-c1', creditsDebited: 0 })
  })

  it('un débit NON RAPPORTÉ (job d’avant le déploiement) se lit `null` — jamais 0', async () => {
    const port = enrichmentJobsPortFrom(source(success({ state: 'done', job_id: 'enrich-c1', result: {} })))
    expect(await port.observe('c1', 'u1')).toEqual({ state: 'done', jobId: 'enrich-c1', creditsDebited: null })
  })

  it('un job perdu est `unknown`, jamais « rien trouvé » ; un échec garde son code', async () => {
    expect(
      await enrichmentJobsPortFrom(source(success({ state: 'unknown', job_id: 'enrich-c1' }))).observe('c1', 'u1'),
    ).toEqual({
      state: 'unknown',
      jobId: 'enrich-c1',
    })
    expect(
      await enrichmentJobsPortFrom(
        source(failure({ code: 'enrichment_unavailable', message: 'Indisponible.' })),
      ).observe('c1', 'u1'),
    ).toEqual({ state: 'failed', jobId: 'enrich-c1', code: 'enrichment_unavailable', message: 'Indisponible.' })
  })
})

describe('generate_message — l’enveloppe de la génération est lue, jamais complétée', () => {
  it('rend le sujet et le corps générés', async () => {
    const port = messageDraftPortFrom({
      generateMessage: jest.fn().mockResolvedValue({ success: true, data: { subject: 'Suite', body: 'Bonjour' } }),
    })
    expect(await port.generate({ userId: 'u1', contactId: 'c1', channel: 'email' })).toEqual({
      subject: 'Suite',
      body: 'Bonjour',
    })
  })

  it('un sujet absent reste `null` (LinkedIn, appel) — pas une chaîne vide', async () => {
    const port = messageDraftPortFrom({
      generateMessage: jest.fn().mockResolvedValue({ success: true, data: { body: 'Bonjour' } }),
    })
    expect((await port.generate({ userId: 'u1', contactId: 'c1', channel: 'linkedin' })).subject).toBeNull()
  })

  it('une génération sans corps est une ERREUR, jamais un brouillon vide', async () => {
    const port = messageDraftPortFrom({ generateMessage: jest.fn().mockResolvedValue({ success: false, data: {} }) })
    await expect(port.generate({ userId: 'u1', contactId: 'c1', channel: 'email' })).rejects.toThrow()
  })
})

describe('update_setting — le catalogue des réglages est la SEULE liste de champs', () => {
  it('les champs écrivables des notifications viennent de `laura-settings-catalog` (langue exclue)', async () => {
    const port = settingsPortFrom({
      notifications: {
        getPreferences: jest.fn().mockResolvedValue({
          buy_signals: true,
          relance_reminders: true,
          weekly_summary: true,
          weekly_digest: false,
          credit_low: true,
          action_overdue: true,
          watchlist_daily_digest: true,
          sidebar_changelog: true,
          newsletter_changelog: true,
          laura_enabled: true,
          proactivity_cap: 3,
          email_language: 'fr',
        }),
        updatePreferences: jest.fn(),
      },
      stageSla: { effectiveFor: jest.fn(), setStageSla: jest.fn() },
    })
    const fields = await port.notificationFields('u1')
    expect(fields.map(field => field.field)).toContain('weekly_digest')
    expect(fields.map(field => field.field)).toContain('proactivity_cap')
    expect(fields.map(field => field.field)).not.toContain('email_language')
  })
})
