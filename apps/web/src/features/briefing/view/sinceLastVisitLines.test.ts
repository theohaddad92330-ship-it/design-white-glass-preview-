import { INTERVENTION_THRESHOLDS, SINCE_LAST_VISIT_LINES, SINCE_LAST_VISIT_UNMEASURED_STATES } from '@bellum/contracts'
import type { SinceLastVisitLine } from '@bellum/contracts'
import i18next from 'i18next'
import { describe, expect, it } from 'vitest'
import { resources } from '@/i18n/resources'
import { sinceLastVisitLineHref, sinceLastVisitLineText } from './sinceLastVisitLines'

/**
 * Les QUATRE lignes typées, dans leurs TROIS états, en FR et en EN.
 *
 * C'est ce test qui empêche la faute que le bloc a déjà commise : un écran monté
 * et visible dont personne n'a lu le contenu. On rend ici les vraies chaînes du
 * dépôt — pas des clés — parce qu'une clé qui manque se rend telle quelle sans
 * qu'aucun test de forme ne s'en aperçoive.
 *
 * ⚠️ Ce test LIT un corpus et prouve qu'il n'est pas vide (premier `it`), et il
 * sait dire NON (une ligne mesurée à `null` ne rend rien plutôt que « 0 »).
 */

const LANGUAGES = ['fr', 'en'] as const

function translator(language: (typeof LANGUAGES)[number]) {
  const instance = i18next.createInstance()
  void instance.init({ lng: language, fallbackLng: false, resources: { [language]: resources[language] } })
  return (key: string, vars?: Record<string, unknown>) => instance.t(key, { ns: 'briefing', ...vars }) as string
}

const ready = (over: Partial<SinceLastVisitLine> & Pick<SinceLastVisitLine, 'kind'>): SinceLastVisitLine => ({
  state: 'ready',
  reason: null,
  count: 1,
  scope: null,
  ...over,
})

describe('sinceLastVisitLineText', () => {
  it('lit un corpus NON VIDE — une garde qui ne lit rien passe au vert sur du vide', () => {
    expect(SINCE_LAST_VISIT_LINES.length).toBe(6)
    for (const language of LANGUAGES) {
      const lines = (resources[language].briefing as { sinceLastVisit: { lines: Record<string, unknown> } })
        .sinceLastVisit.lines
      expect(Object.keys(lines).sort()).toEqual([...SINCE_LAST_VISIT_LINES].sort())
    }
  })

  it.each(LANGUAGES)('rend une VALEUR pour chacune des quatre lignes (%s)', language => {
    const t = translator(language)
    for (const kind of SINCE_LAST_VISIT_LINES) {
      const text = sinceLastVisitLineText(t, ready({ kind, count: 3, scope: kind === 'account_signals' ? 2 : null }))
      expect(text, `${language}/${kind}`).toBeTruthy()
      // Une clé i18n non résolue se rend telle quelle : c'est le défaut que ce
      // test attrape, et il est invisible pour une garde de forme.
      expect(text, `${language}/${kind}`).not.toContain('sinceLastVisit.')
      expect(text).toContain('3')
    }
  })

  it.each(LANGUAGES)('rend une phrase pour CHAQUE silence réellement atteignable (%s)', language => {
    const t = translator(language)
    for (const kind of SINCE_LAST_VISIT_LINES) {
      for (const state of SINCE_LAST_VISIT_UNMEASURED_STATES[kind]) {
        const text = sinceLastVisitLineText(t, { kind, state, reason: 'whatever', count: null, scope: null })
        expect(text, `${language}/${kind}/${state}`).toBeTruthy()
        expect(text, `${language}/${kind}/${state}`).not.toContain('sinceLastVisit.')
        // Un silence ne s'écrit JAMAIS « 0 ». C'est la règle entière du bloc.
        expect(text, `${language}/${kind}/${state}`).not.toMatch(/\b0\b/)
      }
    }
  })

  it('accorde les DEUX nombres de la ligne signaux, séparément', () => {
    const t = translator('fr')
    expect(sinceLastVisitLineText(t, ready({ kind: 'account_signals', count: 3, scope: 2 }))).toBe(
      '3 nouveaux signaux sur 2 comptes',
    )
    expect(sinceLastVisitLineText(t, ready({ kind: 'account_signals', count: 1, scope: 1 }))).toBe(
      '1 nouveau signal sur 1 compte',
    )
  })

  it('lit le seuil des missions là où il vit, pas en dur dans une phrase', () => {
    // Le jour où `renewalHorizonDays` change, la phrase change avec lui. Un
    // « 30 » écrit dans le JSON continuerait de dire 30, et l'écran mentirait
    // sans que rien ne tombe.
    const t = translator('fr')
    const text = sinceLastVisitLineText(t, ready({ kind: 'missions_moving', count: 1 }))
    expect(text).toContain(String(INTERVENTION_THRESHOLDS.renewalHorizonDays))
  })

  it('sait dire NON : une ligne mesurée SANS compte ne rend rien plutôt que « 0 »', () => {
    // Le cas arrive quand le navigateur reçoit une réponse d'une API plus
    // ANCIENNE que lui — l'app et l'API se déploient séparément.
    const t = translator('fr')
    expect(sinceLastVisitLineText(t, ready({ kind: 'replies_received', count: null }))).toBeNull()
  })

  it('sait dire NON : la ligne signaux sans son second compte ne l’invente pas', () => {
    const t = translator('fr')
    const text = sinceLastVisitLineText(t, ready({ kind: 'account_signals', count: 4, scope: null }))
    expect(text).toBe('4 nouveaux signaux sur tes comptes')
  })
})

describe('sinceLastVisitLineHref', () => {
  // #2106.22/.23/.24/.25 (#2834 pour .24) — les QUATRE lignes ouvrent une page
  // RÉELLEMENT filtrée sur ce qu'elles annoncent, jamais une liste non
  // filtrée qui laisserait chercher la ligne visée dans le tas.
  it('signaux → le portefeuille filtré sur les nouveaux signaux (le même bandeau que /accounts)', () => {
    expect(sinceLastVisitLineHref('account_signals')).toBe('/accounts?headline=newSignals7d')
  })

  it('réponses reçues → la messagerie filtrée sur les messages non lus, même notion que le compte du digest (toutes les activités entrantes, pas seulement les favorables)', () => {
    expect(sinceLastVisitLineHref('replies_received')).toBe('/mailbox?intent=unread')
  })

  it('missions qui bougent → la page de décision de renouvellement, déjà filtrée par construction', () => {
    expect(sinceLastVisitLineHref('missions_moving')).toBe('/missions')
  })

  // #2834 (#2106.24) — la liste de contacts sait désormais filtrer sur
  // `contactSourceTag(...) === 'RISQUE'` (`narrowToSourceTag`,
  // `contacts.service.ts`) : le clic ouvre cette même population, jamais une
  // notion voisine.
  it('changements de poste → les contacts filtrés sur `RISQUE` (même définition que le compte du digest)', () => {
    expect(sinceLastVisitLineHref('job_changes')).toBe('/contacts?sourceTag=RISQUE')
  })

  // #2803 (#2389.4) — aucune page ne filtre le
  // portefeuille sur « angle d'attaque créé récemment » aujourd'hui, et un angle
  // d'attaque n'a pas de fiche à lui (il vit dans le dossier compte). `null` est
  // le seul énoncé vrai tant que ce filtre n'existe pas.
  it('angles d’attaque ouverts → aucune destination filtrée n’existe, elle ne se promet pas', () => {
    expect(sinceLastVisitLineHref('attack_angles_added')).toBeNull()
  })

  // #2803 (#2389.4) — une exécution de routine n'a ni fiche ni liste filtrable.
  it('routines de nuit → aucune destination filtrée n’existe, elle ne se promet pas', () => {
    expect(sinceLastVisitLineHref('night_routines_run')).toBeNull()
  })
})
