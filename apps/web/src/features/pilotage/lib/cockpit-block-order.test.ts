import { describe, expect, it } from 'vitest'
import { COCKPIT_BLOCK_IDS, orderCockpitBlocks } from './cockpit-block-order'

describe('orderCockpitBlocks — le rôle change l’ORDRE, jamais le CONTENU', () => {
  it('défaut : delta de la semaine → décisions → objectif → chaîne', () => {
    expect(orderCockpitBlocks(null)).toEqual(['weekDelta', 'decisions', 'objective', 'chain'])
    expect(orderCockpitBlocks('rôle-inconnu')).toEqual(['weekDelta', 'decisions', 'objective', 'chain'])
  })

  it('dirigeant : l’objectif d’abord', () => {
    expect(orderCockpitBlocks('Fondateur / CEO')[0]).toBe('objective')
    expect(orderCockpitBlocks("Directeur d'agence")[0]).toBe('objective')
  })

  it('manager commercial : les décisions d’abord', () => {
    expect(orderCockpitBlocks('Business Manager')[0]).toBe('decisions')
    expect(orderCockpitBlocks('Head of Sales')[0]).toBe('decisions')
  })

  it.each([
    null,
    'Fondateur / CEO',
    'Head of Sales',
    'Business Manager',
    'Business Developer',
    'Responsable staffing',
    'x',
  ])('rôle %s : exactement les mêmes blocs, une seule fois chacun', role => {
    const ordered = orderCockpitBlocks(role)
    expect([...ordered].sort()).toEqual([...COCKPIT_BLOCK_IDS].sort())
  })
})
