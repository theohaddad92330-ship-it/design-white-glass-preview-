import { describe, expect, it } from 'vitest'
import { buildMeetingBrief, deriveMeetingPitch, deriveR1Recap, selectRex } from '@bellum/contracts'
import { buildR1R2BriefBlocks } from './meeting-r1-r2-blocks'

/** Un `t` qui rend la clé et ses valeurs : on lit CE QUE l'écran demande. */
const t = (key: string, values?: Record<string, unknown>) =>
  values && Object.keys(values).length > 0 ? `${key} ${JSON.stringify(values)}` : key

const profile = { esnName: 'DataCraft', offers: ['Data'] }
const rexFound = selectRex({
  missions: [{ label: 'Refonte data — Banque Alpha', date: '2026-05-01' }],
  documents: [],
  references: [],
})
const rexNone = selectRex({ missions: [], documents: [], references: [] })

function keys(blocks: ReturnType<typeof buildR1R2BriefBlocks>) {
  return buildMeetingBrief(blocks).map(block => block.key)
}

describe('#4424.2 — un R1 porte ses REX et sa proposition d’atelier', () => {
  const pitch = deriveMeetingPitch({
    ...profile,
    stakes: [],
    rex: null,
    accountName: 'Acme',
    meetingType: 'r1_discovery',
  })

  it('R1 : pitch, REX et proposition d’atelier — pas de reprise de R1', () => {
    const blocks = buildR1R2BriefBlocks({ meetingType: 'r1_discovery', rex: rexFound, r1: { kind: 'none' }, pitch, t })
    expect(keys(blocks)).toEqual(['pitch', 'rex', 'workshop_proposal'])
  })

  it('le REX cité nomme sa nature et son libellé, tirés de l’espace', () => {
    const blocks = buildR1R2BriefBlocks({ meetingType: 'r1_discovery', rex: rexFound, r1: { kind: 'none' }, pitch, t })
    const rex = blocks.find(block => block.key === 'rex')
    expect(rex?.lines[0]).toContain('agenda.brief.rex.item')
    expect(rex?.lines[0]).toContain('Refonte data — Banque Alpha')
    expect(rex?.lines[0]).toContain('agenda.brief.rex.kind.mission')
  })

  it('aucun REX dans l’espace : le bloc le DIT et renvoie vers Connaissances', () => {
    const blocks = buildR1R2BriefBlocks({ meetingType: 'r1_discovery', rex: rexNone, r1: { kind: 'none' }, pitch, t })
    expect(blocks.find(block => block.key === 'rex')?.lines).toEqual(['agenda.brief.rex.none'])
  })

  it('la proposition d’atelier vient des clés traduites, jamais d’un modèle', () => {
    const blocks = buildR1R2BriefBlocks({ meetingType: 'r1_discovery', rex: rexNone, r1: { kind: 'none' }, pitch, t })
    expect(blocks.find(block => block.key === 'workshop_proposal')?.lines).toEqual([
      'agenda.brief.workshop.propose',
      'agenda.brief.workshop.attendees',
      'agenda.brief.workshop.date',
    ])
  })
})

describe('#4424.3 — un R2 reprend le R1, ou le dit', () => {
  const pitch = deriveMeetingPitch({
    ...profile,
    stakes: [],
    rex: null,
    accountName: 'Acme',
    meetingType: 'r2_workshop',
  })

  it('avec un R1 noté : la reprise cite le compte rendu du R1 et les besoins nés depuis', () => {
    const r1 = deriveR1Recap({
      meetingStart: '2026-10-25T09:00:00.000Z',
      recaps: [{ label: 'Budget data 2027 confirmé', date: '2026-10-10T10:00:00.000Z' }],
      needs: [{ label: 'Lead data senior', date: '2026-10-11' }],
    })
    const blocks = buildR1R2BriefBlocks({ meetingType: 'r2_workshop', rex: rexNone, r1, pitch, t })
    expect(keys(blocks)).toEqual(['pitch', 'r1_recap'])
    const recap = blocks.find(block => block.key === 'r1_recap')
    expect(recap?.lines[0]).toContain('Budget data 2027 confirmé')
    expect(recap?.lines[1]).toContain('Lead data senior')
    expect(recap?.ground.kind).toBe('sourced')
  })

  it('sans R1 connu : la reprise DIT qu’aucun R1 n’est connu', () => {
    const blocks = buildR1R2BriefBlocks({ meetingType: 'r2_workshop', rex: rexNone, r1: { kind: 'none' }, pitch, t })
    expect(blocks.find(block => block.key === 'r1_recap')?.lines).toEqual(['agenda.brief.r1.none'])
  })

  it('comptes rendus illisibles : la reprise dit qu’elle n’a pas pu lire, pas « aucun R1 »', () => {
    const blocks = buildR1R2BriefBlocks({ meetingType: 'r2_workshop', rex: rexNone, r1: { kind: 'unread' }, pitch, t })
    expect(blocks.find(block => block.key === 'r1_recap')?.lines).toEqual(['agenda.brief.r1.unread'])
  })
})

describe('#4424.4 — le pitch, dans tous les briefs', () => {
  it('un premier contact porte aussi le pitch, en UNE ligne de 3 à 5 phrases', () => {
    const pitch = deriveMeetingPitch({
      ...profile,
      stakes: ['Moderniser la data'],
      rex: null,
      accountName: 'Acme',
      meetingType: 'first_contact',
    })
    const blocks = buildR1R2BriefBlocks({ meetingType: 'first_contact', rex: rexNone, r1: { kind: 'none' }, pitch, t })
    expect(keys(blocks)).toEqual(['pitch'])
    const lines = blocks[0]?.lines ?? []
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('agenda.brief.pitch.sentence.who')
    expect(lines[0]).toContain('Moderniser la data')
  })

  it('sans profil : le bloc pitch le dit', () => {
    const pitch = deriveMeetingPitch({
      esnName: null,
      offers: [],
      stakes: [],
      rex: null,
      accountName: null,
      meetingType: null,
    })
    const blocks = buildR1R2BriefBlocks({ meetingType: null, rex: rexNone, r1: { kind: 'none' }, pitch, t })
    expect(blocks.find(block => block.key === 'pitch')?.lines).toEqual(['agenda.brief.pitch.noProfile'])
  })

  it('un point interne n’a pas de pitch : on ne vend pas à un collègue', () => {
    const pitch = deriveMeetingPitch({
      ...profile,
      stakes: [],
      rex: null,
      accountName: null,
      meetingType: 'internal_meeting',
    })
    expect(
      buildR1R2BriefBlocks({ meetingType: 'internal_meeting', rex: rexFound, r1: { kind: 'none' }, pitch, t }),
    ).toEqual([])
  })
})
