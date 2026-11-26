import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PROFILE_QUESTION_OPTIONS } from './profile-questionnaire.js'
import {
  BRIEFING_BLOCK_IDS,
  PLAYBOOK_DIMENSIONS,
  PLAYBOOK_ROLES,
  PLAYBOOK_STADES,
  ROLE_STAGE_PLAYBOOK,
  findHidingPhrase,
  playbookRoleFromUserRole,
  playbookStadeFromSize,
  renderRoleStagePlaybookJson,
  resolveRoleStageCell,
  roleStagePlaybookSchema,
} from './role-stage-playbook.js'

/**
 * #3386 — le tableau 7 rôles × 4 stades × 8 dimensions (décision Louis 11/10, « fais tout »).
 * Chaque test sait dire NON : une combinaison manquante, une cellule qui MASQUE (c76), un
 * ordre identique pour tous, une copie IA qui diverge.
 */

const IA_JSON = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../apps/ia/app/services/role_stage_playbook.json',
)

describe('#3386 — les 28 combinaisons rôle × stade', () => {
  it('sept rôles, quatre stades, huit dimensions — 28 cellules, toutes remplies', () => {
    expect(PLAYBOOK_ROLES).toHaveLength(7)
    expect(PLAYBOOK_STADES).toHaveLength(4)
    expect(PLAYBOOK_DIMENSIONS).toHaveLength(8)
    let cells = 0
    for (const role of PLAYBOOK_ROLES) {
      for (const stade of PLAYBOOK_STADES) {
        const cell = ROLE_STAGE_PLAYBOOK[role][stade]
        for (const dim of PLAYBOOK_DIMENSIONS)
          expect(cell.dims[dim].trim().length, `${role}×${stade}.${dim}`).toBeGreaterThan(9)
        cells += 1
      }
    }
    expect(cells).toBe(28)
  })

  it('la donnée réelle passe le contrat zod', () => {
    expect(roleStagePlaybookSchema.safeParse(ROLE_STAGE_PLAYBOOK).success).toBe(true)
  })

  it('le contrat refuse une combinaison absente', () => {
    const { etablie: _omitted, ...sansEtablie } = ROLE_STAGE_PLAYBOOK.fondateur
    const broken = { ...ROLE_STAGE_PLAYBOOK, fondateur: sansEtablie }
    expect(roleStagePlaybookSchema.safeParse(broken).success).toBe(false)
  })
})

describe('#3386 — garde c76 : le rôle change l’ORDRE, jamais le CONTENU', () => {
  it('sait dire NON : une cellule qui masque, retire ou filtre est refusée par le contrat', () => {
    const cell = ROLE_STAGE_PLAYBOOK.business_developer.petite
    for (const hiding of [
      'Masquer les comptes des autres commerciaux',
      'On retire le bloc Mon activité',
      'Ne montre pas les indicateurs de marge',
      'Filtrer le brief sur ses seuls comptes',
      'Le pilotage ne s’affiche pas pour ce rôle',
      'Cacher les risques critiques',
    ]) {
      expect(findHidingPhrase(hiding), hiding).not.toBeNull()
      const broken = {
        ...ROLE_STAGE_PLAYBOOK,
        business_developer: {
          ...ROLE_STAGE_PLAYBOOK.business_developer,
          petite: { ...cell, dims: { ...cell.dims, ne_pas_porter: hiding } },
        },
      }
      expect(roleStagePlaybookSchema.safeParse(broken).success, hiding).toBe(false)
    }
  })

  it('n’attrape pas ce qu’elle ne vise pas : « passe après », « en premier » restent permis', () => {
    expect(findHidingPhrase('Le suivi des comptes signés passe après l’ouverture, en premier les portes')).toBeNull()
  })

  it('aucune cellule réelle ne masque', () => {
    for (const role of PLAYBOOK_ROLES)
      for (const stade of PLAYBOOK_STADES)
        for (const dim of PLAYBOOK_DIMENSIONS)
          expect(findHidingPhrase(ROLE_STAGE_PLAYBOOK[role][stade].dims[dim]), `${role}×${stade}.${dim}`).toBeNull()
  })

  it('les rangées d’ouverture existent, sans doublon — un ordre, jamais une liste réduite', () => {
    for (const role of PLAYBOOK_ROLES) {
      for (const stade of PLAYBOOK_STADES) {
        const leads = ROLE_STAGE_PLAYBOOK[role][stade].briefingLeads
        for (const id of leads) expect(BRIEFING_BLOCK_IDS).toContain(id)
        expect(new Set(leads).size).toBe(leads.length)
      }
    }
    const cell = ROLE_STAGE_PLAYBOOK.fondateur.petite
    const dup = {
      ...ROLE_STAGE_PLAYBOOK,
      fondateur: { ...ROLE_STAGE_PLAYBOOK.fondateur, petite: { ...cell, briefingLeads: ['actions', 'actions'] } },
    }
    expect(roleStagePlaybookSchema.safeParse(dup).success).toBe(false)
  })

  it('doctrine : aucune probabilité, aucun quota dans le texte', () => {
    const corpus = PLAYBOOK_ROLES.flatMap(role =>
      PLAYBOOK_STADES.flatMap(stade => Object.values(ROLE_STAGE_PLAYBOOK[role][stade].dims)),
    )
      .join(' ')
      .toLowerCase()
    for (const banni of ['probabilit', 'chance de', 'quota']) expect(corpus).not.toContain(banni)
  })
})

describe('#3386 — un rôle et un stade donnés changent VRAIMENT l’ordre', () => {
  it('même rôle, autre stade : une autre ouverture', () => {
    const solo = resolveRoleStageCell('Fondateur / CEO', '3')
    const grande = resolveRoleStageCell('Fondateur / CEO', '500+')
    expect(solo?.stade).toBe('freelance')
    expect(grande?.stade).toBe('etablie')
    expect(solo?.cell.briefingLeads).not.toEqual(grande?.cell.briefingLeads)
  })

  it('même stade, autre rôle : au moins cinq ouvertures différentes sur sept rôles', () => {
    for (const stade of PLAYBOOK_STADES) {
      const openings = new Set(PLAYBOOK_ROLES.map(role => ROLE_STAGE_PLAYBOOK[role][stade].briefingLeads.join('>')))
      expect(openings.size, stade).toBeGreaterThanOrEqual(5)
    }
  })

  it('chaque rôle change d’ouverture au moins une fois entre ses quatre stades', () => {
    for (const role of PLAYBOOK_ROLES) {
      const openings = new Set(PLAYBOOK_STADES.map(stade => ROLE_STAGE_PLAYBOOK[role][stade].briefingLeads.join('>')))
      expect(openings.size, role).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('#3386 — lecture du rôle déclaré et du stade (jamais devinés)', () => {
  it('chaque titre mappé existe dans le catalogue user_role, et les sept rôles sont atteignables', () => {
    const catalogue = PROFILE_QUESTION_OPTIONS.user_role as readonly string[]
    const reached = new Set<string>()
    for (const title of catalogue) {
      const role = playbookRoleFromUserRole(title)
      if (role) reached.add(role)
    }
    expect([...reached].sort()).toEqual([...PLAYBOOK_ROLES].sort())
    expect(playbookRoleFromUserRole('Pur commercial')).toBeNull()
    expect(playbookRoleFromUserRole(null)).toBeNull()
  })

  it('stade : même échelle que le produit (5 / 15 / 50), borne haute de la tranche', () => {
    expect(playbookStadeFromSize('3')).toBe('freelance')
    expect(playbookStadeFromSize('1-10')).toBe('petite')
    expect(playbookStadeFromSize('10-30')).toBe('structuration')
    expect(playbookStadeFromSize('30-80')).toBe('etablie')
    expect(playbookStadeFromSize('500+')).toBe('etablie')
    expect(playbookStadeFromSize('')).toBeNull()
    expect(playbookStadeFromSize(null)).toBeNull()
  })

  it('rôle illisible ou taille absente : aucune combinaison', () => {
    expect(resolveRoleStageCell('Pur commercial', '30')).toBeNull()
    expect(resolveRoleStageCell('Business Developer', null)).toBeNull()
  })
})

describe('#3386 — la copie lue par Laura (service IA) est GÉNÉRÉE d’ici', () => {
  it('apps/ia/app/services/role_stage_playbook.json est identique à la donnée (UPDATE_ROLE_STAGE_PLAYBOOK=1 la réécrit)', () => {
    const expected = `${JSON.stringify(renderRoleStagePlaybookJson(), null, 2)}\n`
    if (process.env['UPDATE_ROLE_STAGE_PLAYBOOK'] === '1') writeFileSync(IA_JSON, expected, 'utf-8')
    expect(existsSync(IA_JSON)).toBe(true)
    expect(readFileSync(IA_JSON, 'utf-8')).toBe(expected)
  })
})
