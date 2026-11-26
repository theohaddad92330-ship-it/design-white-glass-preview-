import { describe, expect, it } from 'vitest'
import {
  createSavedViewSchema,
  SAVED_VIEW_ALERT_CHANNELS,
  SAVED_VIEW_ALERT_FREQUENCIES,
  SAVED_VIEW_SCOPES,
  savedViewSchema,
} from './governance.js'

/**
 * #2151.3 / .6 / .7 / .10 / .11 / .12 — une recherche enregistrée de Découvrir
 * est une VUE ENREGISTRÉE, pas un second mécanisme.
 *
 * Le dépôt portait déjà `saved_views` (table, trois routes, borne au contrat,
 * `owner_id` et `shared`) et Découvrir écrivait ses recherches dans le
 * `localStorage` du navigateur : deux mécanismes pour un besoin, dont un qui ne
 * survit ni au changement de poste ni au partage. Ce qui manquait à l'existant
 * n'était pas la table — c'était le scope `discover` et les quatre champs qu'un
 * périmètre rejouable porte en plus d'un filtre : son OBJECTIF, sa FRÉQUENCE de
 * réexécution, son CANAL d'alerte et sa DERNIÈRE exécution.
 */
describe('vues enregistrées — le scope discover', () => {
  it('ajoute `discover` EN FIN de taxonomie (GA-08 : on n’insère jamais au milieu)', () => {
    expect(SAVED_VIEW_SCOPES).toContain('discover')
    // `discover` était le DERNIER scope à l'écriture de ce test ; un scope plus
    // récent (`projects_pipe`, #2170) est légitimement venu après lui, à la
    // vraie fin du tableau — c'est exactement GA-08 : chaque ajout va en FIN,
    // jamais au milieu. L'invariant qui compte n'est donc pas « `discover` est
    // éternellement le dernier », mais « `discover` n'a jamais été déplacé, ni
    // franchi par une insertion au milieu » : aucun scope antérieur ne doit se
    // retrouver APRÈS lui.
    const discoverIndex = SAVED_VIEW_SCOPES.indexOf('discover')
    const scopesBeforeDiscoverAtWriteTime = ['accounts', 'contacts', 'projects', 'talents', 'missions'] as const
    for (const earlierScope of scopesBeforeDiscoverAtWriteTime) {
      expect(SAVED_VIEW_SCOPES.indexOf(earlierScope)).toBeLessThan(discoverIndex)
    }
  })

  it('accepte une recherche enregistrée complète', () => {
    const parsed = savedViewSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      scope: 'discover',
      name: 'ETI industrielles 69/38',
      objective: 'Ouvrir trois comptes industriels en Rhône-Alpes',
      filters: { sectors: ['industry'] },
      shared: true,
      alertFrequency: 'weekly',
      alertChannel: 'email',
      lastRunAt: '2026-09-15T08:00:00.000Z',
      ownerId: '22222222-2222-4222-8222-222222222222',
      ownerName: 'Sarah Lemoine',
      createdAt: '2026-09-01T08:00:00.000Z',
    })
    expect(parsed.objective).toBe('Ouvrir trois comptes industriels en Rhône-Alpes')
    expect(parsed.alertFrequency).toBe('weekly')
    expect(parsed.alertChannel).toBe('email')
    expect(parsed.lastRunAt).toBe('2026-09-15T08:00:00.000Z')
  })

  it('distingue `lastRunAt` de `createdAt` — enregistrer n’est pas exécuter (#2151.7)', () => {
    const parsed = savedViewSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      scope: 'discover',
      name: 'Jamais rejouée',
      objective: null,
      filters: { sectors: ['industry'] },
      shared: false,
      alertFrequency: 'manual',
      alertChannel: null,
      lastRunAt: null,
      ownerId: null,
      ownerName: null,
      createdAt: '2026-09-01T08:00:00.000Z',
    })
    // Jamais rejouée = `null`, JAMAIS la date d'enregistrement : « on ne l'a
    // jamais relancée » et « on l'a relancée le jour où on l'a créée » sont deux
    // affirmations différentes, et les confondre invente une exécution.
    expect(parsed.lastRunAt).toBeNull()
    expect(parsed.createdAt).toBe('2026-09-01T08:00:00.000Z')
  })

  it('borne le canal d’alerte (#2151.12) et la fréquence (#2151.6)', () => {
    expect(SAVED_VIEW_ALERT_CHANNELS).toEqual(['in_app', 'email', 'sms'])
    expect(SAVED_VIEW_ALERT_FREQUENCIES).toEqual(['manual', 'daily', 'weekly'])
    const base = {
      scope: 'discover' as const,
      name: 'Bornée',
      filters: { sectors: ['industry'] },
    }
    expect(createSavedViewSchema.safeParse({ ...base, alertChannel: 'pigeon' }).success).toBe(false)
    expect(createSavedViewSchema.safeParse({ ...base, alertFrequency: 'hourly' }).success).toBe(false)
  })

  it('crée une recherche sans alerte par défaut — une alerte ne s’allume pas toute seule', () => {
    const parsed = createSavedViewSchema.parse({
      scope: 'discover',
      name: 'Par défaut',
      filters: { sectors: ['industry'] },
    })
    expect(parsed.alertFrequency).toBe('manual')
    expect(parsed.alertChannel).toBeNull()
    expect(parsed.objective).toBeNull()
    expect(parsed.shared).toBe(false)
  })
})
