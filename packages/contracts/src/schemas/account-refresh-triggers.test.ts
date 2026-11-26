import { describe, expect, it } from 'vitest'
import { CREDIT_WEIGHTS } from '../billing/credit-weights.js'
import { PLAN_STALE_DAYS } from './first-move.js'
import {
  ACCOUNT_CHANGE_SECTIONS,
  REFRESH_TRIGGERS,
  accountChangeDigestSchema,
  detectRefreshTriggers,
  refreshTriggerCost,
} from './account-refresh-triggers.js'

/**
 * Les six déclencheurs de rafraîchissement et le tiroir « ce qui a changé »
 * (`T5.md:1117-1151`, D210 / D213 du dossier du 26 août).
 *
 * Ce que ces tests tiennent :
 *  - SIX déclencheurs, pas quatre dimensions choisies par l'utilisateur ;
 *  - ils PROPOSENT et n'exécutent jamais (`T5.md:1121`) ;
 *  - les coûts 1/2/2/1/1/4 dérivent de `CREDIT_WEIGHTS`, jamais écrits en dur ;
 *  - la section INCHANGÉ du tiroir est OBLIGATOIRE — c'est elle qui distingue
 *    « j'ai vérifié » de « je n'ai rien regardé ».
 */

const NOW = new Date('2026-09-01T10:00:00.000Z')

describe('les six déclencheurs', () => {
  it('en compte SIX, nommés, dans un ordre figé', () => {
    expect(REFRESH_TRIGGERS).toEqual([
      'signals_new',
      'decision_maker_moved',
      'new_entity_in_registry',
      'public_tender_changed',
      'esn_profile_changed',
      'dossier_stale',
    ])
  })

  it('coûte 1 / 2 / 2 / 1 / 1 / 4 crédits, dans cet ordre', () => {
    // La suite exacte de la source. Elle est ici pour que personne ne la
    // retrouve « par le calcul » le jour où un poids bouge sans qu'on le veuille.
    expect(REFRESH_TRIGGERS.map(refreshTriggerCost)).toEqual([1, 2, 2, 1, 1, 4])
  })

  it('tire ses coûts des poids de crédit, jamais d’un chiffre écrit en dur', () => {
    // Le sixième est EXACTEMENT `account_refresh` — le poids qui existait
    // depuis des mois sans qu'aucune route ne le débite.
    expect(refreshTriggerCost('dossier_stale')).toBe(CREDIT_WEIGHTS.account_refresh)
    expect(refreshTriggerCost('signals_new')).toBe(CREDIT_WEIGHTS.targeted_refresh)
  })
})

describe('detectRefreshTriggers — il PROPOSE, il n’exécute pas', () => {
  const quiet = {
    newSignals: 0,
    decisionMakersMoved: 0,
    newRegistryEntities: 0,
    tendersChanged: 0,
    esnProfileUpdatedAt: null,
    dossierGeneratedAt: '2026-08-28',
  }

  it('ne propose RIEN quand rien n’a bougé', () => {
    expect(detectRefreshTriggers(quiet, NOW)).toEqual([])
  })

  it('propose au-delà de TROIS signaux neufs, et pas à deux', () => {
    expect(detectRefreshTriggers({ ...quiet, newSignals: 2 }, NOW)).toEqual([])
    const proposed = detectRefreshTriggers({ ...quiet, newSignals: 3 }, NOW)
    expect(proposed.map(p => p.trigger)).toEqual(['signals_new'])
    expect(proposed[0].costCredits).toBe(1)
  })

  it('propose sur un décideur qui change de poste, une entité neuve, un marché', () => {
    expect(detectRefreshTriggers({ ...quiet, decisionMakersMoved: 1 }, NOW)[0].trigger).toBe('decision_maker_moved')
    expect(detectRefreshTriggers({ ...quiet, newRegistryEntities: 1 }, NOW)[0].trigger).toBe('new_entity_in_registry')
    expect(detectRefreshTriggers({ ...quiet, tendersChanged: 1 }, NOW)[0].trigger).toBe('public_tender_changed')
  })

  it('propose quand le profil de l’ESN a été modifié APRÈS le dossier', () => {
    expect(detectRefreshTriggers({ ...quiet, esnProfileUpdatedAt: '2026-08-30' }, NOW)[0].trigger).toBe(
      'esn_profile_changed',
    )
    // Modifié AVANT le dossier : le dossier en tient déjà compte.
    expect(detectRefreshTriggers({ ...quiet, esnProfileUpdatedAt: '2026-08-01' }, NOW)).toEqual([])
  })

  it('propose au-delà du seuil de péremption du plan, et le RÉUTILISE', () => {
    // 90 jours : le même seuil que le plan, à un seul endroit (GA-26).
    expect(PLAN_STALE_DAYS).toBe(90)
    const stale = detectRefreshTriggers({ ...quiet, dossierGeneratedAt: '2026-05-01' }, NOW)
    expect(stale.map(p => p.trigger)).toEqual(['dossier_stale'])
    expect(stale[0].costCredits).toBe(4)
  })

  it('ne conclut RIEN d’un dossier sans date de génération', () => {
    // « Non mesuré » n'est pas « périmé » : proposer un rafraîchissement à 4
    // crédits parce qu'on ne sait pas dater le dossier ferait payer notre trou.
    expect(detectRefreshTriggers({ ...quiet, dossierGeneratedAt: null }, NOW)).toEqual([])
  })

  it('rend les propositions dans l’ordre figé des déclencheurs', () => {
    const all = detectRefreshTriggers(
      {
        newSignals: 5,
        decisionMakersMoved: 1,
        newRegistryEntities: 1,
        tendersChanged: 1,
        esnProfileUpdatedAt: '2026-08-31',
        dossierGeneratedAt: '2026-01-01',
      },
      NOW,
    )
    expect(all.map(p => p.trigger)).toEqual(REFRESH_TRIGGERS)
    expect(all.map(p => p.costCredits)).toEqual([1, 2, 2, 1, 1, 4])
  })

  it('n’expose AUCUN chemin d’exécution — une proposition est une lecture', () => {
    const [proposal] = detectRefreshTriggers({ ...quiet, newSignals: 4 }, NOW)
    expect(Object.keys(proposal).sort()).toEqual(['costCredits', 'detectedAt', 'observed', 'trigger'])
    // Rien qui ressemble à un ordre de marche : la source écrit « proposé,
    // jamais automatique ».
    for (const forbidden of ['run', 'execute', 'apply', 'auto']) {
      expect(Object.keys(proposal)).not.toContain(forbidden)
    }
  })
})

describe('le tiroir « ce qui a changé » — la section INCHANGÉ est OBLIGATOIRE', () => {
  const sections = { changed: [], appeared: [], disappeared: [], unchanged: ['effectif', 'secteur'] }

  it('nomme ses QUATRE sections', () => {
    expect(ACCOUNT_CHANGE_SECTIONS).toEqual(['changed', 'appeared', 'disappeared', 'unchanged'])
  })

  it('REFUSE un tiroir sans section inchangé', () => {
    // Le cœur de l'exigence. Un tiroir qui ne montre que ce qui a bougé laisse
    // croire que le reste n'a pas été regardé.
    const { unchanged: _dropped, ...withoutUnchanged } = sections
    expect(accountChangeDigestSchema.safeParse({ comparedAt: '2026-09-01', ...withoutUnchanged }).success).toBe(false)
  })

  it('accepte un tiroir où RIEN n’a changé, pourvu qu’il dise ce qu’il a revérifié', () => {
    const parsed = accountChangeDigestSchema.parse({ comparedAt: '2026-09-01', ...sections })
    expect(parsed.unchanged).toEqual(['effectif', 'secteur'])
    expect(parsed.changed).toEqual([])
  })

  it('REFUSE un tiroir qui n’aurait rien regardé du tout', () => {
    // Quatre sections vides ne sont pas une vérification : c'est un écran qui
    // se tait en ayant l'air d'avoir travaillé.
    expect(
      accountChangeDigestSchema.safeParse({
        comparedAt: '2026-09-01',
        changed: [],
        appeared: [],
        disappeared: [],
        unchanged: [],
      }).success,
    ).toBe(false)
  })

  it('garde une valeur DISPARUE avec sa date — on archive, on ne supprime pas', () => {
    const parsed = accountChangeDigestSchema.parse({
      comparedAt: '2026-09-01',
      changed: [],
      appeared: [],
      disappeared: [{ field: 'effectif', lastKnownValue: '1 200', lastKnownAt: '2026-03-04' }],
      unchanged: ['secteur'],
    })
    // Un fait périmé redevient INCONNU avec sa date, il ne disparaît pas.
    expect(parsed.disappeared[0].lastKnownAt).toBe('2026-03-04')
    expect(parsed.disappeared[0].lastKnownValue).toBe('1 200')
  })
})
