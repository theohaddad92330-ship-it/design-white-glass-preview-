import { describe, expect, it } from 'vitest'
import fixtures from './reply-blocks.fixtures.json' with { type: 'json' }
import { buildChatReplyEnvelope, chatReplyEnvelopeSchema } from './chat-reply-envelope.js'
import { checkArtifactEdit, chatArtifactVersionInputSchema, isEditableArtifactType } from './chat-artifact-versions.js'
import type { ReplyBlock } from './reply-blocks.js'

const PLAN = fixtures.valid.action_plan as ReplyBlock
const VERDICT = fixtures.valid.verdict as ReplyBlock

function fenced(block: unknown): string {
  return '```bellum-block\n' + JSON.stringify(block) + '\n```'
}

const CONTENT = `Voici le plan.\n\n${fenced(VERDICT)}\n\n${fenced(PLAN)}`

describe('#2429.4 — le contrat d’un artefact dit ce qu’il est et à quelle version il en est', () => {
  it('version 1, type, message et rang DÉRIVÉS — aucune colonne de plus', () => {
    const envelope = buildChatReplyEnvelope({ messageId: 'msg-1', content: CONTENT })
    expect(envelope.artifacts.map(a => [a.id, a.type, a.rank, a.version, a.edited_at])).toEqual([
      ['msg-1:0', 'verdict', 0, 1, null],
      ['msg-1:1', 'action_plan', 1, 1, null],
    ])
    expect(chatReplyEnvelopeSchema.safeParse(envelope).success).toBe(true)
  })
})

describe('#2429.9 — un artefact modifié crée une nouvelle version, jamais une réécriture silencieuse', () => {
  const edited = { ...(PLAN as Extract<ReplyBlock, { type: 'action_plan' }>), title: 'Plan révisé' } as ReplyBlock

  it('la version la plus récente remplace le bloc MONTRÉ et dit qui/quand ; le texte reste la version 1', () => {
    const envelope = buildChatReplyEnvelope({
      messageId: 'msg-1',
      content: CONTENT,
      versions: new Map([
        ['msg-1:1', { version: 3, block: edited, editedAt: '2026-09-30T10:00:00Z', editedBy: 'user-1' }],
      ]),
    })
    expect(envelope.message).toBe(CONTENT)
    const plan = envelope.artifacts[1]
    expect(plan).toMatchObject({ version: 3, edited_by: 'user-1', edited_at: '2026-09-30T10:00:00Z' })
    expect((plan?.block as { title?: string }).title).toBe('Plan révisé')
    // Les autres artefacts du message ne bougent pas.
    expect(envelope.artifacts[0]).toMatchObject({ version: 1, edited_by: null })
  })

  it('seul un plan se modifie — une mesure (verdict) ne se réécrit pas', () => {
    expect(isEditableArtifactType('action_plan')).toBe(true)
    expect(isEditableArtifactType('verdict')).toBe(false)
    expect(checkArtifactEdit(CONTENT, 'msg-1:0', VERDICT)).toEqual({ ok: false, reason: 'not_editable' })
  })

  it('le contrôle sait dire NON : artefact inconnu, adresse mal formée, type changé', () => {
    expect(checkArtifactEdit(CONTENT, 'msg-1:9', edited)).toEqual({ ok: false, reason: 'unknown_artifact' })
    expect(checkArtifactEdit(CONTENT, 'sans-rang', edited)).toEqual({ ok: false, reason: 'unknown_artifact' })
    expect(checkArtifactEdit(CONTENT, 'msg-1:1', VERDICT)).toEqual({ ok: false, reason: 'type_changed' })
  })

  it('le contrôle accepte un plan modifié du même type et rend l’original', () => {
    const result = checkArtifactEdit(CONTENT, 'msg-1:1', edited)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.original).toEqual(PLAN)
  })

  it('le corps d’une modification est validé comme un bloc de Laura', () => {
    expect(chatArtifactVersionInputSchema.safeParse({ artifactId: 'msg-1:1', block: edited }).success).toBe(true)
    expect(
      chatArtifactVersionInputSchema.safeParse({ artifactId: 'msg-1:1', block: { type: 'inconnu' } }).success,
    ).toBe(false)
  })
})
