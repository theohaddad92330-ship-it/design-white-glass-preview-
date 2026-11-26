import { describe, expect, it } from 'vitest'
import { PROFILE_QUESTION_OPTIONS, personaFromUserRole, resolveRoleStageCell } from '@bellum/contracts'
import {
  BRIEFING_BLOCK_IDS,
  BRIEFING_LEADS,
  BRIEFING_MOBILE_SECTIONS,
  orderBriefingBlocks,
  orderMobileBriefingSections,
} from './block-order'

const sorted = (ids: readonly string[]) => [...ids].sort()

describe('#3386 — le rôle réordonne les blocs de /briefing, jamais le contenu', () => {
  const declared = PROFILE_QUESTION_OPTIONS.user_role as readonly string[]

  it('pour CHAQUE rôle déclaré : les mêmes blocs, chacun une fois — jamais un filtre', () => {
    for (const role of declared) {
      const order = orderBriefingBlocks(role)
      expect(sorted(order), role).toEqual(sorted(BRIEFING_BLOCK_IDS))
    }
  })

  it('sait dire NON : un bloc retiré ou dupliqué par un rôle serait refusé', () => {
    const broken = [...BRIEFING_BLOCK_IDS.slice(1), BRIEFING_BLOCK_IDS[1]]
    expect(sorted(broken)).not.toEqual(sorted(BRIEFING_BLOCK_IDS))
  })

  it('le rôle change VRAIMENT l’ordre : cinq rôles, cinq ouvertures différentes', () => {
    const openings = new Set(
      ['Business Developer', 'Business Manager', 'Directeur de BU', 'Fondateur / CEO', 'Responsable staffing'].map(
        role => orderBriefingBlocks(role).join('>'),
      ),
    )
    expect(openings.size).toBe(5)
    expect(orderBriefingBlocks('Fondateur / CEO')[0]).toBe('activity')
    expect(orderBriefingBlocks('Business Developer')[0]).toBe('actions')
  })

  it('un rôle inconnu ou absent garde l’ordre standard, jamais une préférence devinée', () => {
    expect(orderBriefingBlocks(null)).toEqual(BRIEFING_BLOCK_IDS)
    expect(orderBriefingBlocks('Pur commercial')).toEqual(BRIEFING_BLOCK_IDS)
  })

  it('les rangées d’avant-garde existent toutes (une faute de frappe ne passe pas)', () => {
    for (const leads of Object.values(BRIEFING_LEADS)) {
      for (const id of leads) expect(BRIEFING_BLOCK_IDS).toContain(id)
      expect(new Set(leads).size).toBe(leads.length)
    }
  })

  it('tous les rôles de pilotage ont une lecture, et personaFromUserRole en est la seule porte', () => {
    expect(personaFromUserRole('Fondateur / CEO')).toBe('fondateur')
    expect(Object.keys(BRIEFING_LEADS).sort()).toEqual(
      ['business_developer', 'business_manager', 'directeur_bu', 'fondateur', 'recrutement_staffing'].sort(),
    )
  })
})

describe('#3386 — le même ordre de rôle sous 768 px', () => {
  const declared = PROFILE_QUESTION_OPTIONS.user_role as readonly string[]
  const standard = BRIEFING_MOBILE_SECTIONS.map(section => section.id)

  it('pour CHAQUE rôle déclaré : les mêmes sections, chacune une fois — jamais un filtre', () => {
    for (const role of declared) {
      expect(sorted(orderMobileBriefingSections(role)), role).toEqual(sorted(standard))
    }
  })

  it('le rôle change VRAIMENT l’ouverture mobile, comme au bureau', () => {
    expect(orderMobileBriefingSections('Fondateur / CEO')[0]).toBe('activity')
    expect(orderMobileBriefingSections('Business Developer')[0]).toBe('actions')
    expect(orderMobileBriefingSections('Responsable staffing')[0]).toBe('preparations')
    expect(orderMobileBriefingSections('Fondateur / CEO')).not.toEqual(
      orderMobileBriefingSections('Business Developer'),
    )
  })

  it('sans rôle connu : l’ordre numéroté d’origine, jamais une préférence devinée', () => {
    expect(orderMobileBriefingSections(null)).toEqual(standard)
    expect(orderMobileBriefingSections('Pur commercial')).toEqual(standard)
  })

  it('chaque section de la liste mobile relève d’une rangée du bureau qui existe', () => {
    for (const section of BRIEFING_MOBILE_SECTIONS) expect(BRIEFING_BLOCK_IDS).toContain(section.block)
  })
})

describe('#3386 (Louis 11/10, « fais tout ») — la COMBINAISON rôle × stade ordonne /briefing', () => {
  const sizes = ['3', '1-10', '10-30', '500+'] as const

  it('pour CHAQUE rôle × stade : les mêmes blocs et les mêmes sections, chacun une fois (c76)', () => {
    const standard = BRIEFING_MOBILE_SECTIONS.map(section => section.id)
    for (const role of PROFILE_QUESTION_OPTIONS.user_role as readonly string[]) {
      for (const size of sizes) {
        expect(sorted(orderBriefingBlocks(role, size)), `${role} ${size}`).toEqual(sorted(BRIEFING_BLOCK_IDS))
        expect(sorted(orderMobileBriefingSections(role, size)), `${role} ${size}`).toEqual(sorted(standard))
      }
    }
  })

  it('la page s’ouvre sur les rangées de la combinaison, dans leur ordre', () => {
    for (const size of sizes) {
      const combo = resolveRoleStageCell('Fondateur / CEO', size)
      expect(combo).not.toBeNull()
      const leads = combo?.cell.briefingLeads ?? []
      expect(orderBriefingBlocks('Fondateur / CEO', size).slice(0, leads.length)).toEqual(leads)
    }
  })

  it('même rôle, autre stade : un autre ordre — au bureau comme sous 768 px', () => {
    expect(orderBriefingBlocks('Fondateur / CEO', '3')).not.toEqual(orderBriefingBlocks('Fondateur / CEO', '500+'))
    expect(orderBriefingBlocks('Fondateur / CEO', '3')[0]).toBe('actions')
    expect(orderBriefingBlocks('Fondateur / CEO', '500+')[0]).toBe('activity')
    expect(orderMobileBriefingSections('Fondateur / CEO', '3')).not.toEqual(
      orderMobileBriefingSections('Fondateur / CEO', '500+'),
    )
  })

  it('un rôle hors pilotage (Opérations commerciales) reçoit son ordre quand le stade est connu', () => {
    expect(orderBriefingBlocks('Opérations commerciales')).toEqual(BRIEFING_BLOCK_IDS)
    expect(orderBriefingBlocks('Opérations commerciales', '10-30')[0]).toBe('chainBlockers')
  })

  it('sans taille déclarée : l’ordre du rôle seul, inchangé — jamais un stade deviné', () => {
    expect(orderBriefingBlocks('Business Developer', null)).toEqual(orderBriefingBlocks('Business Developer'))
    expect(orderBriefingBlocks('Business Developer', 'inconnu')).toEqual(orderBriefingBlocks('Business Developer'))
  })
})
