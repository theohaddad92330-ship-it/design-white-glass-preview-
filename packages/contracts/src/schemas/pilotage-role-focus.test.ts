import { describe, expect, it } from 'vitest'
import { MANAGER_KPIS } from './manager-kpi.js'
import {
  PILOTAGE_PERSONAS,
  PILOTAGE_PERSONA_FOCUS,
  PILOTAGE_PERSONA_LABELS,
  orderKpisForPersona,
  personaFromUserRole,
  userRoleFramesTeam,
} from './pilotage-role-focus.js'

/**
 * BEL-SC-242 (#3271.2-.6, .15) — « vues par rôle ». Doctrine `c76_role_
 * reordonne_jamais_ne_filtre` (CLAUDE.md § Doctrine) refuse qu'un rôle
 * retire ou masque une entrée : ces gardes vérifient que l'ordre change et
 * que le CONTENU (le jeu de clés) ne change JAMAIS.
 */
describe('PILOTAGE_PERSONA_FOCUS', () => {
  it('chaque clé de priorité existe VRAIMENT dans le dictionnaire des KPI', () => {
    const known = new Set(MANAGER_KPIS.map(kpi => kpi.key))
    for (const persona of PILOTAGE_PERSONAS) {
      const unknown = PILOTAGE_PERSONA_FOCUS[persona].filter(key => !known.has(key))
      expect(unknown, `${persona}: clés inconnues`).toEqual([])
    }
  })

  it('chaque rôle a un libellé FR et EN', () => {
    for (const persona of PILOTAGE_PERSONAS) {
      expect(PILOTAGE_PERSONA_LABELS[persona].fr.trim().length).toBeGreaterThan(0)
      expect(PILOTAGE_PERSONA_LABELS[persona].en.trim().length).toBeGreaterThan(0)
    }
  })

  it('aucune priorité vide — un rôle sans focus ne distinguerait rien', () => {
    for (const persona of PILOTAGE_PERSONAS) {
      expect(PILOTAGE_PERSONA_FOCUS[persona].length).toBeGreaterThan(0)
    }
  })
})

describe('personaFromUserRole', () => {
  it('reconnaît les intitulés de `user_role` (onboarding) qui correspondent à un rôle de pilotage', () => {
    expect(personaFromUserRole('Fondateur / CEO')).toBe('fondateur')
    expect(personaFromUserRole('Directeur de BU')).toBe('directeur_bu')
    expect(personaFromUserRole('Business Manager')).toBe('business_manager')
    expect(personaFromUserRole('Business Developer')).toBe('business_developer')
    expect(personaFromUserRole('Talent Manager / Recruteur')).toBe('recrutement_staffing')
  })

  it('rend `null` pour un intitulé sans correspondance, ou absent — jamais une supposition', () => {
    expect(personaFromUserRole('Pur technique / delivery')).toBeNull()
    expect(personaFromUserRole(undefined)).toBeNull()
    expect(personaFromUserRole(null)).toBeNull()
    expect(personaFromUserRole('')).toBeNull()
  })
})

describe('orderKpisForPersona — réordonne, ne filtre JAMAIS (c76)', () => {
  it('sans rôle connu, rend le catalogue dans son ordre STANDARD, inchangé', () => {
    const ordered = orderKpisForPersona(MANAGER_KPIS, null)
    expect(ordered).toEqual(MANAGER_KPIS)
  })

  it('pour chaque rôle, le jeu de clés rendu est EXACTEMENT le même que le catalogue reçu', () => {
    for (const persona of PILOTAGE_PERSONAS) {
      const ordered = orderKpisForPersona(MANAGER_KPIS, persona)
      expect(ordered).toHaveLength(MANAGER_KPIS.length)
      expect(new Set(ordered.map(kpi => kpi.key))).toEqual(new Set(MANAGER_KPIS.map(kpi => kpi.key)))
    }
  })

  it('les clés de la priorité du rôle passent EN TÊTE, dans l’ordre de la priorité', () => {
    const ordered = orderKpisForPersona(MANAGER_KPIS, 'recrutement_staffing')
    const focus = PILOTAGE_PERSONA_FOCUS.recrutement_staffing
    expect(ordered.slice(0, focus.length).map(kpi => kpi.key)).toEqual([...focus])
  })

  it('filtre le catalogue qu’on lui DONNE, pas une copie locale', () => {
    const served = MANAGER_KPIS.filter(kpi => kpi.family === 'finance')
    const ordered = orderKpisForPersona(served, 'fondateur')
    expect(ordered).toHaveLength(served.length)
  })
})

// décision Louis 12/10 — « Lire comme » dans le produit : réservé aux rôles qui ENCADRENT.
describe('userRoleFramesTeam', () => {
  it.each([
    'Fondateur / CEO',
    "Directeur d'agence",
    'Directeur de BU',
    'Directeur commercial',
    'Head of Sales',
    'Business Manager',
    'Account Manager',
  ])('« %s » encadre', role => {
    expect(userRoleFramesTeam(role)).toBe(true)
  })

  it.each([
    'Business Developer',
    'SDR / BDR',
    'Talent Manager / Recruteur',
    'Responsable staffing',
    'Poste inventé',
    '',
    null,
    undefined,
  ])('« %s » n’encadre pas (ni rôle inconnu, ni absent : jamais une supposition)', role => {
    expect(userRoleFramesTeam(role)).toBe(false)
  })
})
