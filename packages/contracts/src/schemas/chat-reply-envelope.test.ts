import { describe, expect, it } from 'vitest'
import fixtures from './reply-blocks.fixtures.json' with { type: 'json' }
import {
  buildChatReplyEnvelope,
  chatArtifactId,
  chatReplyEnvelopeSchema,
  chatStructuredSectionId,
  parseChatArtifactId,
  parseChatStructuredSectionId,
} from './chat-reply-envelope.js'

const VERDICT_BLOCK = fixtures.valid.verdict

function fenced(block: unknown): string {
  return '```bellum-block\n' + JSON.stringify(block) + '\n```'
}

describe('#2429.4 — une adresse d’artefact, jamais une identité devinée', () => {
  it('compose message_id et rang de bloc, et se relit à l’identique', () => {
    const id = chatArtifactId('msg-1', 2)
    expect(id).toBe('msg-1:2')
    expect(parseChatArtifactId(id)).toEqual({ messageId: 'msg-1', blockIndex: 2 })
  })

  it('un identifiant mal formé ne rend aucun rang deviné', () => {
    expect(parseChatArtifactId('sans-rang')).toBeNull()
  })

  it('un message_id qui porte lui-même « : » reste réversible (le DERNIER « : » sépare le rang)', () => {
    const id = chatArtifactId('conv:msg-1', 0)
    expect(parseChatArtifactId(id)).toEqual({ messageId: 'conv:msg-1', blockIndex: 0 })
  })
})

describe('#2429.1 (StructuredReply.tsx:229) — une section Markdown reconnue est adressable comme un bloc', () => {
  it('compose message_id et rang de section (préfixe `s`), et se relit à l’identique', () => {
    const id = chatStructuredSectionId('msg-1', 2)
    expect(id).toBe('msg-1:s2')
    expect(parseChatStructuredSectionId(id)).toEqual({ messageId: 'msg-1', sectionIndex: 2 })
  })

  it('un identifiant mal formé ne rend aucun rang deviné', () => {
    expect(parseChatStructuredSectionId('sans-rang')).toBeNull()
  })

  it('ne partage JAMAIS son espace de numérotation avec un bloc : les deux formats sont mutuellement exclusifs', () => {
    const blockId = chatArtifactId('msg-1', 0)
    const sectionId = chatStructuredSectionId('msg-1', 0)
    expect(blockId).not.toBe(sectionId)
    expect(parseChatArtifactId(sectionId)).toBeNull()
    expect(parseChatStructuredSectionId(blockId)).toBeNull()
  })
})

describe('#2429.2 / #2429.9 — l’enveloppe NOMME les briques déjà là, elle n’en écrit aucune seconde', () => {
  it('un message sans bloc rend un tableau d’artefacts vide, jamais une invention', () => {
    const envelope = buildChatReplyEnvelope({ messageId: 'msg-1', content: 'Bonjour, voici ma réponse.' })
    expect(envelope.artifacts).toEqual([])
    expect(envelope.message).toBe('Bonjour, voici ma réponse.')
    expect(envelope.sources).toEqual([])
    expect(envelope.actions).toBeUndefined()
    expect(envelope.clarification).toBeUndefined()
    expect(envelope.warnings).toBeUndefined()
    expect(envelope.job).toBeUndefined()
    expect(chatReplyEnvelopeSchema.safeParse(envelope).success).toBe(true)
  })

  it('chaque bloc du texte reçoit l’adresse EXACTE de son rang, dans l’ordre du texte', () => {
    const content = `Avant.\n\n${fenced(VERDICT_BLOCK)}\n\nEntre deux.\n\n${fenced(VERDICT_BLOCK)}\n\nAprès.`
    const envelope = buildChatReplyEnvelope({ messageId: 'msg-42', content })
    expect(envelope.artifacts.map(artifact => artifact.id)).toEqual(['msg-42:0', 'msg-42:1'])
    expect(envelope.artifacts[0]?.block).toEqual(VERDICT_BLOCK)
    expect(chatReplyEnvelopeSchema.safeParse(envelope).success).toBe(true)
  })

  it('sources / reply_options / partial se nomment sous leur brique — jamais fusionnés dans un second canal', () => {
    const envelope = buildChatReplyEnvelope({
      messageId: 'msg-1',
      content: 'Réponse.',
      sources: [{ kind: 'crm', label: 'Salesforce', as_of: '2026-09-20' }],
      replyOptions: [{ question: 'Lequel ?', options: ['A', 'B'] }],
      partial: { reason: 'turn_timeout', as_of: '2026-09-27' },
    })
    expect(envelope.sources).toEqual([{ kind: 'crm', label: 'Salesforce', as_of: '2026-09-20' }])
    expect(envelope.clarification).toEqual([{ question: 'Lequel ?', options: ['A', 'B'] }])
    expect(envelope.warnings).toEqual([{ reason: 'turn_timeout', as_of: '2026-09-27' }])
    expect(chatReplyEnvelopeSchema.safeParse(envelope).success).toBe(true)
  })

  it('un job de Laura absent ne pose aucune clé — un champ optionnel absent reste absent', () => {
    const envelope = buildChatReplyEnvelope({ messageId: 'msg-1', content: 'Réponse.' })
    expect('job' in envelope).toBe(false)
  })

  it('un job posé traverse tel quel, sans revalidation ici (déjà validé par sa propre porte, #2276.62)', () => {
    const job = { id: 'job-1', state: 'to_confirm' }
    const envelope = buildChatReplyEnvelope({ messageId: 'msg-1', content: 'Réponse.', job })
    expect(envelope.job).toBe(job)
  })
})
