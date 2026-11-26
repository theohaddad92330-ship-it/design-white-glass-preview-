import { describe, expect, it } from 'vitest'
import { resolveChannel, toneForReminder } from './reminder-channel.js'

const nothing = { mailboxDraft: false, teamChat: false, crmTask: false }

describe('resolveChannel', () => {
  it('préfère la messagerie — le seul canal où un humain relit', () => {
    const resolved = resolveChannel({ ...nothing, mailboxDraft: true, teamChat: true })
    expect(resolved.channel).toBe('mail_draft')
    expect(resolved.sendsImmediately).toBe(false)
    expect(resolved.irreversible).toBe(false)
  })

  it('annonce qu’un message d’équipe part TOUT SEUL et ne se rattrape pas', () => {
    // Le §5.3 interdit le « brouillon Teams » : une messagerie d'équipe n'a pas
    // de brouillon, et le dire ferait attendre un envoi qui ne partira jamais.
    const resolved = resolveChannel({ ...nothing, teamChat: true })
    expect(resolved.channel).toBe('chat_message')
    expect(resolved.sendsImmediately).toBe(true)
    expect(resolved.irreversible).toBe(true)
  })

  it('porte SON libellé de bouton et SA confirmation — trois promesses distinctes', () => {
    // Un libellé unique ferait promettre « brouillon » sur un canal qui envoie.
    const mail = resolveChannel({ ...nothing, mailboxDraft: true })
    const chat = resolveChannel({ ...nothing, teamChat: true })
    const none = resolveChannel(nothing)
    const labels = [mail.actionLabelKey, chat.actionLabelKey, none.actionLabelKey]
    expect(new Set(labels).size).toBe(3)
    expect(mail.confirmationKey).not.toBe(chat.confirmationKey)
  })

  it('ne prend PAS un webhook pour une messagerie d’équipe', () => {
    // Le défaut d'origine : `chat` valait « une intégration sortante existe »,
    // donc un webhook Zapier faisait proposer un canal d'équipe inexistant.
    // Le champ demande maintenant une messagerie d'équipe, nommée et émettrice.
    expect(resolveChannel(nothing).channel).toBe('in_app')
  })

  it('n’annonce pas un brouillon quand le jeton ne l’autorise pas', () => {
    // Une connexion de messagerie ne dit pas que l'écriture de brouillon est
    // accordée : le canal annoncé avant le clic était exactement celui qui
    // échouait après.
    const resolved = resolveChannel({ mailboxDraft: false, teamChat: false, crmTask: true })
    expect(resolved.channel).toBe('crm_task')
  })

  it('dégrade sans refuser quand le canal demandé n’est pas branché', () => {
    const resolved = resolveChannel({ ...nothing, crmTask: true }, 'mail_draft')
    expect(resolved.channel).toBe('crm_task')
    expect(resolved.reason).toBe('fallback')
  })

  it('rend une ligne dans l’app quand rien n’est branché, jamais une promesse d’envoi', () => {
    const resolved = resolveChannel(nothing, 'mail_draft')
    expect(resolved.channel).toBe('in_app')
    expect(resolved.sendsImmediately).toBe(false)
    expect(resolved.irreversible).toBe(false)
    expect(resolved.reason).toBe('nothing_connected')
  })

  it('respecte un canal demandé quand il EST branché', () => {
    const resolved = resolveChannel({ mailboxDraft: true, teamChat: true, crmTask: true }, 'crm_task')
    expect(resolved.channel).toBe('crm_task')
    expect(resolved.reason).toBe('preferred')
  })
})

describe('toneForReminder', () => {
  it('gradue trois tons, et s’arrête là', () => {
    expect(toneForReminder(1)).toBe('neutral')
    expect(toneForReminder(2)).toBe('firm')
    expect(toneForReminder(3)).toBe('escalate')
    // Au-delà, le sujet remonte à un humain : une quatrième relance
    // automatique n'est plus une cadence.
    expect(toneForReminder(4)).toBeNull()
    expect(toneForReminder(0)).toBeNull()
  })
})
