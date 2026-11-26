import { describe, expect, it } from 'vitest'
import {
  PLAYBOOK_APPROVAL_EXPIRY_DAYS,
  PLAYBOOK_BLOCK_REASONS,
  PLAYBOOK_SEND_STATES,
  decidePlaybookSendSchema,
  isPlaybookApprovalExpired,
  playbookApprovalDeadline,
  playbookApprovalSchema,
} from './playbook.js'

/**
 * L'approbation d'un envoi automatique (arbitrage Louis du 26/08/2026).
 *
 * Ce que ces tests tiennent : l'échéance ne se devine pas, un état d'envoi ne
 * disparaît pas, et une décision ne s'invente pas de troisième valeur.
 */
describe('playbook — échéance d’une demande', () => {
  const now = new Date('2026-08-26T10:00:00.000Z')

  it('périme après trois jours, pas avant', () => {
    const deadline = playbookApprovalDeadline(now)
    expect(isPlaybookApprovalExpired(deadline, now)).toBe(false)
    expect(isPlaybookApprovalExpired(deadline, new Date('2026-08-29T09:59:00.000Z'))).toBe(false)
    expect(isPlaybookApprovalExpired(deadline, new Date('2026-08-29T10:00:01.000Z'))).toBe(true)
  })

  it('l’échéance vaut bien la constante annoncée', () => {
    const deadline = playbookApprovalDeadline(now)
    const days = (deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    expect(days).toBe(PLAYBOOK_APPROVAL_EXPIRY_DAYS)
    expect(PLAYBOOK_APPROVAL_EXPIRY_DAYS).toBe(3)
  })

  it('une échéance ABSENTE ou illisible vaut PÉRIMÉ, jamais « encore valide »', () => {
    // Le seul repli sûr : un envoi client dont on ne sait pas dater
    // l'autorisation ne part pas. L'inverse enverrait sur une donnée cassée.
    expect(isPlaybookApprovalExpired(null, now)).toBe(true)
    expect(isPlaybookApprovalExpired(undefined, now)).toBe(true)
    expect(isPlaybookApprovalExpired('pas une date', now)).toBe(true)
  })

  it('accepte aussi bien une chaîne ISO qu’une Date', () => {
    const deadline = playbookApprovalDeadline(now)
    expect(isPlaybookApprovalExpired(deadline.toISOString(), now)).toBe(false)
  })
})

describe('playbook — les états d’envoi', () => {
  it('garde « sent » en TÊTE : c’est l’état des lignes historiques', () => {
    // Avant l'approbation, une ligne de `playbook_sends` ne pouvait signifier
    // que « c'est parti ». La migration les laisse à `sent`, et le défaut SQL
    // vaut `sent` : déplacer cette valeur relirait l'historique de travers.
    expect(PLAYBOOK_SEND_STATES[0]).toBe('sent')
  })

  it('porte un état « validé, envoi en cours » — la décision s’écrit AVANT l’envoi', () => {
    // Sans lui, un envoi parti pendant que la ligne dit encore « en attente »
    // serait renvoyé au clic suivant. Un doublon chez un client ne se rattrape pas.
    expect(PLAYBOOK_SEND_STATES).toContain('approved')
  })

  it('distingue « refusé », « périmé » et « échoué » — trois choses différentes', () => {
    expect(PLAYBOOK_SEND_STATES).toContain('rejected')
    expect(PLAYBOOK_SEND_STATES).toContain('expired')
    expect(PLAYBOOK_SEND_STATES).toContain('failed')
    expect(new Set(PLAYBOOK_SEND_STATES).size).toBe(PLAYBOOK_SEND_STATES.length)
  })
})

describe('playbook — la raison « en attente de validation »', () => {
  it('existe, et n’a PAS remplacé « déjà envoyé »', () => {
    // Les confondre ferait chercher une panne là où il n'y a qu'une décision
    // en attente.
    expect(PLAYBOOK_BLOCK_REASONS).toContain('awaiting_approval')
    expect(PLAYBOOK_BLOCK_REASONS).toContain('already_sent')
  })

  it('est ajoutée en FIN de liste (GA-08)', () => {
    expect(PLAYBOOK_BLOCK_REASONS[PLAYBOOK_BLOCK_REASONS.length - 1]).toBe('awaiting_approval')
  })
})

describe('playbook — la décision', () => {
  it('n’accepte que « approve » ou « reject »', () => {
    expect(decidePlaybookSendSchema.safeParse({ decision: 'approve' }).success).toBe(true)
    expect(decidePlaybookSendSchema.safeParse({ decision: 'reject', reason: 'hors sujet' }).success).toBe(true)
    expect(decidePlaybookSendSchema.safeParse({ decision: 'plus tard' }).success).toBe(false)
  })

  it('refuse un champ inventé plutôt que de l’ignorer', () => {
    expect(decidePlaybookSendSchema.safeParse({ decision: 'approve', sendAt: 'demain' }).success).toBe(false)
  })
})

describe('playbook — ce que l’écran reçoit', () => {
  it('porte le texte EXACT qui partira, et le destinataire', () => {
    // On ne valide pas un envoi en aveugle : sans l'objet, le corps et
    // l'adresse, « approuver » ne veut rien dire.
    const parsed = playbookApprovalSchema.safeParse({
      id: 'a1',
      playbook: 'mission_renewal',
      recipient: 'contact@client.example',
      subject: 'Mission — on prépare la suite ?',
      body: 'Bonjour…',
      requestedAt: '2026-08-26T10:00:00.000Z',
      expiresAt: '2026-08-29T10:00:00.000Z',
      // #2200.10/.17 — l'objet visé : toujours par e-mail pour un playbook.
      target: {
        accountId: null,
        accountName: 'Client Example',
        contactId: null,
        contactName: 'Contact',
        ownerId: 'owner-1',
        ownerName: 'Louis',
        channel: 'email',
        risk: 'low',
        source: null,
      },
    })
    expect(parsed.success).toBe(true)
  })

  it('refuse une demande sans corps de message', () => {
    const parsed = playbookApprovalSchema.safeParse({
      id: 'a1',
      playbook: 'mission_renewal',
      recipient: 'contact@client.example',
      subject: 'Objet',
      requestedAt: '2026-08-26T10:00:00.000Z',
      expiresAt: '2026-08-29T10:00:00.000Z',
    })
    expect(parsed.success).toBe(false)
  })
})
