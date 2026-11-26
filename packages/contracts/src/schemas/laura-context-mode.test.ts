import { describe, expect, it } from 'vitest'
import {
  CONTEXT_PRECEDENCE,
  DEFAULT_LAURA_CONTEXT_MODE,
  LAURA_CONTEXT_LAYERS,
  LAURA_CONTEXT_MODES,
  contextLayersFor,
  contextModeExcludes,
  resolveByPrecedence,
  lauraContextModeSchema,
  updateWorkspaceDefaultContextModeSchema,
  workspaceDefaultContextModeResolutionSchema,
} from './laura-context-mode.js'

/**
 * #2453 — les trois modes de contexte canoniques de Laura. Le contrat dit ce
 * que CHAQUE mode laisse entrer ; le service IA (`context_mode.py`) en est le
 * miroir (parité lue par chemin dans `test_context_mode.py`).
 */
describe('#2453 — modes de contexte canoniques', () => {
  it('trois modes, « Mon activité » par défaut', () => {
    expect(LAURA_CONTEXT_MODES).toEqual(['my_activity', 'one_off_mission', 'neutral'])
    expect(DEFAULT_LAURA_CONTEXT_MODE).toBe('my_activity')
  })

  it('le schéma refuse un mode inconnu (jamais un mode deviné)', () => {
    expect(lauraContextModeSchema.safeParse('neutral').success).toBe(true)
    expect(lauraContextModeSchema.safeParse('neutre').success).toBe(false)
    expect(lauraContextModeSchema.safeParse('').success).toBe(false)
  })

  it('Mon activité : toutes les couches, aucune exclue', () => {
    const layers = contextLayersFor('my_activity')
    expect(layers.excluded).toEqual([])
    expect(layers.included).toEqual([...LAURA_CONTEXT_LAYERS])
  })

  it('#2453.4 — Mission ponctuelle : ignore le profil habituel, le portefeuille et la mémoire durable', () => {
    const { excluded, included } = contextLayersFor('one_off_mission')
    for (const layer of ['profile', 'business_units', 'durable_memory', 'portfolio'] as const) {
      expect(excluded).toContain(layer)
      expect(included).not.toContain(layer)
    }
    // Le CRM du compte SÉLECTIONNÉ reste lisible : c'est un objet choisi.
    expect(included).toContain('crm')
  })

  it('#2453.5 / #2453.10 — Neutre : AUCUNE couche personnelle ni commerciale', () => {
    const { excluded, included } = contextLayersFor('neutral')
    expect(included).toEqual([])
    expect(excluded).toEqual([...LAURA_CONTEXT_LAYERS])
  })

  it('#2451.1 / #2453.7 — contextModeExcludes : la question que posent Analyser et Découvrir, une couche à la fois', () => {
    // Mon activité : rien n'est exclu — le chemin historique, byte-identique.
    expect(contextModeExcludes('my_activity', 'profile')).toBe(false)
    expect(contextModeExcludes('my_activity', 'crm')).toBe(false)
    // Mission ponctuelle : le profil sort, le CRM du compte choisi reste.
    expect(contextModeExcludes('one_off_mission', 'profile')).toBe(true)
    expect(contextModeExcludes('one_off_mission', 'crm')).toBe(false)
    // Neutre : tout sort.
    expect(contextModeExcludes('neutral', 'profile')).toBe(true)
    expect(contextModeExcludes('neutral', 'crm')).toBe(true)
  })

  // #2453.6 — la hiérarchie n'est pas une liste décorative : c'est elle qui
  // TRANCHE quand deux couches se contredisent (Analyser, Découvrir).
  it('#2453.6 — resolveByPrecedence : en conflit, la couche la plus HAUTE gagne', () => {
    // Demande explicite contre défaut : la demande gagne…
    expect(resolveByPrecedence({ explicit_request: 'neutral', defaults: 'my_activity' })).toBe('neutral')
    // …et l'ordre de déclaration de l'objet n'y change rien.
    expect(resolveByPrecedence({ defaults: 'my_activity', explicit_request: 'neutral' })).toBe('neutral')
    // Le mode (niveau 6) l'emporte sur les défauts (niveau 7), jamais l'inverse.
    expect(resolveByPrecedence({ mode_context: 'excluded', defaults: 'resolved' })).toBe('excluded')
    // Une exclusion explicite (niveau 2) ne se réintroduit pas par le mode (niveau 6).
    expect(resolveByPrecedence({ explicit_exclusions: 'sans assurance', mode_context: 'avec assurance' })).toBe(
      'sans assurance',
    )
  })

  it('#2453.6 — une couche ABSENTE ne gagne rien : on descend au niveau suivant, jamais un vide imposé', () => {
    expect(resolveByPrecedence({ explicit_request: undefined, defaults: 'my_activity' })).toBe('my_activity')
    expect(resolveByPrecedence({})).toBeUndefined()
  })

  it('included ∪ excluded = toutes les couches, sans recouvrement, pour chaque mode', () => {
    for (const mode of LAURA_CONTEXT_MODES) {
      const { excluded, included } = contextLayersFor(mode)
      expect([...included, ...excluded].sort()).toEqual([...LAURA_CONTEXT_LAYERS].sort())
      expect(included.filter(layer => excluded.includes(layer))).toEqual([])
    }
  })

  it('#2453.6 — une seule hiérarchie à sept niveaux, la demande explicite en tête', () => {
    expect(CONTEXT_PRECEDENCE).toHaveLength(7)
    expect(CONTEXT_PRECEDENCE[0]).toBe('explicit_request')
    expect(CONTEXT_PRECEDENCE[1]).toBe('explicit_exclusions')
    expect(CONTEXT_PRECEDENCE[6]).toBe('defaults')
  })
})

/**
 * #2451.9 — LE MODE DE CONTEXTE PAR DÉFAUT DE L'ESPACE. Un RÉGLAGE (une valeur
 * de repli), jamais une RÈGLE (`workspace-rules.ts`, #2081.14 — « le socle en
 * porte deux, et pas davantage », « une règle ne fait que RESTREINDRE ») : il
 * ne retire aucun droit à personne, il ne fait que remplacer la valeur de
 * repli d'un fil neuf.
 */
describe('#2451.9 — mode de contexte par défaut de l’espace (réglage, pas une règle)', () => {
  it('la réponse porte le mode et si l’appelant peut le changer', () => {
    const parsed = workspaceDefaultContextModeResolutionSchema.safeParse({
      defaultContextMode: 'one_off_mission',
      canEdit: false,
    })
    expect(parsed.success).toBe(true)
  })

  it('refuse un mode inconnu, jamais un mode deviné', () => {
    expect(
      workspaceDefaultContextModeResolutionSchema.safeParse({ defaultContextMode: 'neutre', canEdit: true }).success,
    ).toBe(false)
  })

  it('le PATCH est strict — un champ de plus (un rôle, un espace) est refusé, jamais ignoré', () => {
    expect(updateWorkspaceDefaultContextModeSchema.safeParse({ defaultContextMode: 'neutral' }).success).toBe(true)
    expect(
      updateWorkspaceDefaultContextModeSchema.safeParse({ defaultContextMode: 'neutral', workspaceId: 'x' }).success,
    ).toBe(false)
  })
})
