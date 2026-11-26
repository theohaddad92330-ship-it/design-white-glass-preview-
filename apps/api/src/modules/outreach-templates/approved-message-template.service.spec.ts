/**
 * #3417 (retour bêta 30/09, fiche contact) — la bibliothèque versionnée des
 * scripts et messages approuvés, testée en mémoire (GA-07 : le service ne
 * touche que ses repositories).
 */
import { NotFoundException } from '@nestjs/common'
import { ApprovedMessageTemplateService, type ApprovedMessageTemplateCtx } from './approved-message-template.service'

type Row = Record<string, unknown>

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, expected]) => row[key] === expected)
}

function repo(rows: Row[] = []) {
  return {
    rows,
    find: jest.fn(async (opts?: { where?: Row }) => rows.filter(r => matches(r, opts?.where ?? {}))),
    findOne: jest.fn(async (opts: { where: Row }) => rows.find(r => matches(r, opts.where)) ?? null),
  }
}

const WS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CTX: ApprovedMessageTemplateCtx = { userId: '11111111-1111-4111-8111-111111111111', workspaceId: WS }

const CONTACT = {
  id: 'c1111111-1111-4111-8111-111111111111',
  workspace_id: WS,
  full_name: 'Gerald B.',
  entity: null,
  account_id: 'ac111111-1111-4111-8111-111111111111',
  signals: [{ label: 'levée de fonds' }],
}

const ACCOUNT_WITH_SIGNAL = {
  id: 'ac111111-1111-4111-8111-111111111111',
  workspace_id: WS,
  company_name: 'Société Générale',
  recent_signals: [{ label: 'levée de fonds' }],
}

const TEMPLATE_READY = {
  id: 't1111111-1111-4111-8111-111111111111',
  scenario: 'invitation_acceptee',
  channel: 'linkedin',
  persona: null,
  sequence_step: 1,
  delay_days: 0,
  version: 1,
  source: 'méthode conquête ESN v3',
  exact_text: 'Merci pour la connexion {{prenom}} ! {{entreprise}} avance vite.',
  variables: ['prenom', 'entreprise'],
  required_evidence: ['recent_signal'],
  forbidden_claims: [],
  status: 'active',
}

function build(rows: { templates?: Row[]; contacts?: Row[]; accounts?: Row[] } = {}) {
  const templates = repo(rows.templates ?? [TEMPLATE_READY])
  const contacts = repo(rows.contacts ?? [CONTACT])
  const accounts = repo(rows.accounts ?? [ACCOUNT_WITH_SIGNAL])
  const service = new ApprovedMessageTemplateService(templates as never, contacts as never, accounts as never)
  return { service, templates, contacts, accounts }
}

describe('ApprovedMessageTemplateService — #3417', () => {
  it('rend le modèle PRÊT, variables substituées par des valeurs réelles du dossier', async () => {
    const { service } = build()
    const result = await service.candidatesForContact(CTX, CONTACT.id, 'linkedin', 'invitation_acceptee', null)
    expect(result.blocked).toEqual([])
    expect(result.ready).toHaveLength(1)
    expect(result.ready[0].renderedText).toBe('Merci pour la connexion Gerald ! Société Générale avance vite.')
  })

  it('#3530 — le nom du compte en capitales (registre officiel) est inséré en casse d’affichage', async () => {
    const { service } = build({
      accounts: [{ ...ACCOUNT_WITH_SIGNAL, company_name: 'CENTRE HOSPITALIER DE VALENCIENNES' }],
    })
    const result = await service.candidatesForContact(CTX, CONTACT.id, 'linkedin', 'invitation_acceptee', null)
    expect(result.ready[0].renderedText).toContain('Centre Hospitalier de Valenciennes avance vite')
    expect(result.ready[0].renderedText).not.toContain('VALENCIENNES')
  })

  it('#3417.6 — bloque et NOMME la preuve manquante plutôt que de proposer le modèle prêt à envoyer', async () => {
    const { service } = build({ contacts: [{ ...CONTACT, signals: null }] })
    const result = await service.candidatesForContact(CTX, CONTACT.id, 'linkedin', 'invitation_acceptee', null)
    expect(result.ready).toEqual([])
    expect(result.blocked).toEqual([
      expect.objectContaining({ reason: 'evidence_missing', missing: ['recent_signal'] }),
    ])
  })

  // #3417 (recette prod 02/10) — le texte affirmait « un signal récent » alors
  // que la fiche du contact disait « Aucun signal rattaché » : la preuve se lisait
  // sur les signaux du COMPTE, que ce contact ne porte pas. Elle se lit sur ce que
  // la fiche montre — les signaux rattachés au contact.
  it('#3417 — des signaux sur le COMPTE seul ne prouvent rien pour ce contact : bloqué, nommé', async () => {
    const { service } = build({ contacts: [{ ...CONTACT, signals: [] }], accounts: [ACCOUNT_WITH_SIGNAL] })
    const result = await service.candidatesForContact(CTX, CONTACT.id, 'linkedin', 'invitation_acceptee', null)
    expect(result.ready).toEqual([])
    expect(result.blocked[0]).toEqual(
      expect.objectContaining({ reason: 'evidence_missing', missing: ['recent_signal'] }),
    )
  })

  it('#3417.5 — jamais une variable inventée : bloque et NOMME celle qui manque', async () => {
    const { service } = build({ contacts: [{ ...CONTACT, full_name: '' }] })
    const result = await service.candidatesForContact(CTX, CONTACT.id, 'linkedin', 'invitation_acceptee', null)
    expect(result.ready).toEqual([])
    expect(result.blocked[0]).toEqual(expect.objectContaining({ reason: 'variables_missing', missing: ['prenom'] }))
  })

  it('filtre par persona quand il est fourni, garde les modèles sans persona déclaré', async () => {
    const forExpert = { ...TEMPLATE_READY, id: 't2222222-2222-4222-8222-222222222222', persona: 'expert' }
    const { service } = build({ templates: [TEMPLATE_READY, forExpert] })
    const result = await service.candidatesForContact(CTX, CONTACT.id, 'linkedin', 'invitation_acceptee', 'decideur')
    expect(result.ready).toHaveLength(1)
    expect(result.ready[0].id).toBe(TEMPLATE_READY.id)
  })

  // #3697.9 — « niveau adapté au rôle » : le rôle change l'ORDRE des trames, jamais leur contenu
  // (doctrine, `c76_role_reordonne_jamais_ne_filtre`) — sans persona choisi, aucune trame n'est écartée.
  describe('#3697.9 — le rôle du contact ordonne les trames, sans en écarter', () => {
    const phone = (id: string, persona: string | null, step: number) => ({
      ...TEMPLATE_READY,
      id,
      channel: 'phone',
      persona,
      sequence_step: step,
      required_evidence: [],
    })
    const rows = [phone('t-op', 'operationnel', 1), phone('t-any', null, 2), phone('t-dir', 'direction', 3)]

    it('un directeur voit d’abord la trame « direction », puis les trames sans persona, puis les autres', async () => {
      const { service } = build({
        templates: rows,
        contacts: [{ ...CONTACT, title: 'Directeur des systèmes d’information' }],
      })
      const result = await service.candidatesForContact(CTX, CONTACT.id, 'phone', 'invitation_acceptee', null)
      expect(result.ready.map(item => item.id)).toEqual(['t-dir', 't-any', 't-op'])
    })

    it('SAIT DIRE NON — un poste inconnu ne réordonne rien et une trame n’est jamais retirée', async () => {
      const { service } = build({ templates: rows, contacts: [{ ...CONTACT, title: null }] })
      const result = await service.candidatesForContact(CTX, CONTACT.id, 'phone', 'invitation_acceptee', null)
      expect(result.ready.map(item => item.id)).toEqual(['t-op', 't-any', 't-dir'])
    })

    it('un persona CHOISI garde son comportement (filtre) — le rôle ne le contredit pas', async () => {
      const { service } = build({
        templates: rows,
        contacts: [{ ...CONTACT, title: 'Directeur des systèmes d’information' }],
      })
      const result = await service.candidatesForContact(CTX, CONTACT.id, 'phone', 'invitation_acceptee', 'operationnel')
      expect(result.ready.map(item => item.id)).toEqual(['t-op', 't-any'])
    })
  })

  it('rejette un contact hors de cet espace de travail', async () => {
    const { service } = build({ contacts: [{ ...CONTACT, workspace_id: 'zzzzzzzz-zzzz-4zzz-8zzz-zzzzzzzzzzzz' }] })
    await expect(
      service.candidatesForContact(CTX, CONTACT.id, 'linkedin', 'invitation_acceptee', null),
    ).rejects.toBeInstanceOf(NotFoundException)
  })
})
