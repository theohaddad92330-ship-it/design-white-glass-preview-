import type { MessageStyleTemplate } from '@bellum/contracts'
import { pickTemplateByScope, type MessageStyleScopeTarget } from './message-style-scope'

// #2204.65 (épopée #2947) — apprentissage workspace versionné à QUATRE niveaux : au moment de générer, le style le
// plus PROCHE gagne (conversation > équipe > utilisateur > espace), à objet / canal / persona égaux.
const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ME = UUID(1)
const OTHER = UUID(2)
const BU = UUID(3)

function tpl(patch: Partial<MessageStyleTemplate> & { id: string }): MessageStyleTemplate {
  return {
    workspaceId: UUID(9),
    ownerId: OTHER,
    objective: 'Première prise de contact',
    channel: 'email',
    persona: 'DSI',
    status: 'active',
    forbidden: [],
    version: 1,
    scope: 'workspace',
    businessUnitId: null,
    conversationId: null,
    pitch: null,
    tone: null,
    signature: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...patch,
  } as MessageStyleTemplate
}

const target: MessageStyleScopeTarget = {
  objective: 'première prise de contact',
  channel: 'email',
  persona: 'dsi',
  userId: ME,
  businessUnitId: BU,
  conversationId: 'fil-1',
}

describe('pickTemplateByScope — la portée la plus proche gagne (#2204.65)', () => {
  const workspace = tpl({ id: 'ws' })
  const mine = tpl({ id: 'me', scope: 'user', ownerId: ME })
  const team = tpl({ id: 'bu', scope: 'business_unit', businessUnitId: BU })
  const thread = tpl({ id: 'conv', scope: 'conversation', conversationId: 'fil-1' })

  it('conversation > équipe > utilisateur > espace', () => {
    expect(pickTemplateByScope([workspace, mine, team, thread], target)?.id).toBe('conv')
    expect(pickTemplateByScope([workspace, mine, team], target)?.id).toBe('bu')
    expect(pickTemplateByScope([workspace, mine], target)?.id).toBe('me')
    expect(pickTemplateByScope([workspace], target)?.id).toBe('ws')
  })

  it('un style d’un AUTRE utilisateur / équipe / fil ne s’applique pas', () => {
    const others = [
      tpl({ id: 'u2', scope: 'user', ownerId: OTHER }),
      tpl({ id: 'bu2', scope: 'business_unit', businessUnitId: UUID(4) }),
      tpl({ id: 'c2', scope: 'conversation', conversationId: 'fil-2' }),
    ]
    expect(pickTemplateByScope(others, target)).toBeNull()
  })

  it('seul un style ACTIF, du bon canal, de la bonne persona et du bon objet est candidat', () => {
    expect(pickTemplateByScope([tpl({ id: 'a', status: 'draft' })], target)).toBeNull()
    expect(pickTemplateByScope([tpl({ id: 'b', channel: 'linkedin' })], target)).toBeNull()
    expect(pickTemplateByScope([tpl({ id: 'c', persona: 'DAF' })], target)).toBeNull()
    expect(pickTemplateByScope([tpl({ id: 'd', objective: 'Relance' })], target)).toBeNull()
  })

  it('à portée égale, la version la plus haute puis la plus récente gagne', () => {
    const v1 = tpl({ id: 'v1', version: 1 })
    const v2 = tpl({ id: 'v2', version: 2 })
    expect(pickTemplateByScope([v1, v2], target)?.id).toBe('v2')
    const old = tpl({ id: 'old', version: 2, updatedAt: '2026-09-01T00:00:00.000Z' })
    const fresh = tpl({ id: 'fresh', version: 2, updatedAt: '2026-10-05T00:00:00.000Z' })
    expect(pickTemplateByScope([old, fresh], target)?.id).toBe('fresh')
  })

  it('sans persona demandée, la persona du style ne filtre pas', () => {
    expect(pickTemplateByScope([workspace], { ...target, persona: undefined })?.id).toBe('ws')
  })
})
