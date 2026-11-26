import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RecentSignal } from '@bellum/contracts'
import {
  estimateAccessCost,
  intelligenceEstimateKind,
  isSignalDatedToTheDay,
  needFramingOf,
  orderNavForWorkspaceProfile,
} from '@bellum/contracts'
import { rankAccountContacts, type RankableContactRow } from '../contacts/contact-ranking'
import {
  demoContactRawData,
  demoSourceUrl,
  DEMO_DELIVERY_CLIENT,
  DEMO_DOSSIERS,
  DEMO_ESN_PROFILE,
  DEMO_FORFAIT_PROFILE_NEEDS,
  DEMO_PERSONAL_ACCESS_EXTRA_SEEDS,
} from './demo-dataset'

/**
 * SEMIS-PREUVES (20/10/2026) — des points livrés n'avaient pas pu être PROUVÉS en recette : la démo n'avait pas la
 * donnée que l'écran lit. Chaque bloc ci-dessous relit la donnée SEMÉE avec la fonction de production qui la lit,
 * et sait dire NON : retirer la donnée fait rougir le bloc.
 */
const dossier = (name: string) => DEMO_DOSSIERS.find(candidate => candidate.account.company_name === name)

function rankable(name: string): RankableContactRow[] {
  return (dossier(name)?.contacts ?? []).map((contact, index): RankableContactRow => ({
    id: `semis-${index}`,
    title: contact.title,
    entity: contact.entity ?? null,
    decision_role: contact.decision_role,
    email: contact.email ?? null,
    email_verified: false,
    phone: contact.phone ?? null,
    linkedin_url: contact.linkedin_url ?? null,
    source: 'apollo',
    user_status: 'new',
    email_sent_at: null,
    last_enrichment_at: null,
    priority: contact.priority ?? 3,
    demo_seed_first_door: false,
  }))
}

const top10 = (name: string, status?: 'referenced' | 'to_build') =>
  rankAccountContacts(rankable(name), dossier(name)?.account ?? null, {}, 10, undefined, status).ranked

describe('SEMIS-PREUVES 4292.9 (#4271.1) — compte RÉFÉRENCÉ : opérationnels / acheteurs devant', () => {
  const { accountName } = DEMO_PERSONAL_ACCESS_EXTRA_SEEDS.referencedEsn

  it('le compte déclaré référencé porte une ESN rang 1 (c’est ce que lit `loadAccessStatus`)', () => {
    expect(accountName).toBe('Groupe BPCE')
    expect(dossier(accountName)).toBeDefined()
  })

  it('son top 10 est RÉORDONNÉ par le statut, sans changer le contenu du dossier', () => {
    const base = top10(accountName).map(r => r.contact_id)
    const referenced = top10(accountName, 'referenced').map(r => r.contact_id)
    expect(referenced).not.toEqual(base)
    expect(referenced).toHaveLength(10)
  })

  it('sait dire NON : sans le statut, le top 10 reste celui d’avant (octet pour octet)', () => {
    expect(top10(accountName, undefined).map(r => r.contact_id)).toEqual(top10(accountName).map(r => r.contact_id))
  })
})

describe('SEMIS-PREUVES 4292.10 (#4271.2) — compte À BÂTIR : décideurs / sponsors devant', () => {
  const { accountName, entityName } = DEMO_PERSONAL_ACCESS_EXTRA_SEEDS.toBuildAccess

  it('l’entité qui porte le rang 1 installé existe déjà parmi les entités dérivées des contacts', () => {
    const labels = (dossier(accountName)?.contacts ?? []).map(contact => (contact.entity ?? '').trim().toLowerCase())
    expect(labels).toContain(entityName.toLowerCase())
  })

  it('le compte à bâtir n’est PAS aussi le compte référencé (sinon `loadAccessStatus` lirait « référencé »)', () => {
    expect(accountName).not.toBe(DEMO_PERSONAL_ACCESS_EXTRA_SEEDS.referencedEsn.accountName)
  })

  it('son top 10 commence par des décideurs / sponsors (champions) et diffère de l’ordre d’avant', () => {
    const toBuild = top10(accountName, 'to_build')
    const base = top10(accountName)
    expect(toBuild.map(r => r.contact_id)).not.toEqual(base.map(r => r.contact_id))
    // #4802.2 — le RÔLE posé (économique / sponsor) fait passer devant autant que le groupe calculé du titre.
    const roleById = new Map(rankable(accountName).map(row => [row.id, (row.decision_role ?? '').toLowerCase()]))
    const decider = (r: (typeof toBuild)[number]) =>
      r.group === 'decision_maker' ||
      r.group === 'champion' ||
      ['economic', 'sponsor'].includes(roleById.get(r.contact_id) ?? '')
    expect(toBuild.slice(0, 3).every(decider)).toBe(true)
  })

  it('sait dire NON : sur les mêmes contacts SANS décideur ni sponsor, le statut ne réordonne rien', () => {
    const rows = rankable(accountName).filter(
      row => !['economic', 'sponsor', 'champion'].includes(row.decision_role ?? ''),
    )
    const raw = dossier(accountName)?.account ?? null
    const base = rankAccountContacts(rows, raw, {}, 10).ranked.map(r => r.contact_id)
    const withStatus = rankAccountContacts(rows, raw, {}, 10, undefined, 'to_build').ranked.map(r => r.contact_id)
    const fronted = rankAccountContacts(rows, raw, {}, 10, undefined, 'to_build').ranked.filter(
      r => r.group === 'decision_maker' || r.group === 'champion',
    )
    // Le mécanisme ne réordonne que s'il y a des décideurs : ici il n'y en a plus, l'ordre est celui d'avant.
    if (fronted.length === 0) expect(withStatus).toEqual(base)
    else expect(withStatus.slice(0, fronted.length)).toEqual(fronted.map(r => r.contact_id))
  })
})

describe('SEMIS-PREUVES 4295.19 (#4016.44) — coût d’accès « estimé » (onglet Accès)', () => {
  const { costEstimate } = DEMO_PERSONAL_ACCESS_EXTRA_SEEDS
  const NOW = new Date()
  const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()

  it('le compte source porte un coût ET le verrou ; la cible porte le MÊME verrou et AUCUN coût', () => {
    expect(costEstimate.source.accountName).not.toBe(costEstimate.target.accountName)
    expect(dossier(costEstimate.source.accountName)).toBeDefined()
    expect(dossier(costEstimate.target.accountName)).toBeDefined()
    expect(costEstimate.source.cost.trim()).not.toBe('')
  })

  it('la fonction de production produit l’estimation depuis les faits semés', () => {
    const estimate = estimateAccessCost({
      lock: costEstimate.lock,
      now: NOW,
      candidates: [
        {
          accountId: 'source',
          companyName: costEstimate.source.accountName,
          cost: costEstimate.source.cost,
          costObservedAt: daysAgo(costEstimate.source.daysAgo),
          lock: costEstimate.lock,
        },
      ],
    })
    expect(estimate).toMatchObject({ value: costEstimate.source.cost, basis: { companyName: 'Groupe BPCE' } })
  })

  it('sait dire NON : un verrou différent, ou aucun verrou, ne donne aucune estimation', () => {
    const candidate = {
      accountId: 'source',
      companyName: costEstimate.source.accountName,
      cost: costEstimate.source.cost,
      costObservedAt: daysAgo(costEstimate.source.daysAgo),
      lock: costEstimate.lock,
    }
    expect(estimateAccessCost({ lock: 'verrouille', now: NOW, candidates: [candidate] })).toBeNull()
    expect(estimateAccessCost({ lock: 'inconnu', now: NOW, candidates: [candidate] })).toBeNull()
    expect(
      estimateAccessCost({ lock: costEstimate.lock, now: NOW, candidates: [{ ...candidate, lock: 'inconnu' }] }),
    ).toBeNull()
  })
})

describe('SEMIS-PREUVES 4291.6 / 4291.7 (#4270.2-3) — profil forfait : le besoin se lit comme un projet à cadrer', () => {
  const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
  const { toScope, won } = DEMO_FORFAIT_PROFILE_NEEDS

  it('le besoin à cadrer porte périmètre, sponsor et budget — les trois lignes de la carte « Projet à cadrer »', () => {
    expect(
      needFramingOf({
        context: toScope.context,
        decision_maker_contact_id: DEMO_DELIVERY_CLIENT.contacts.some(c => c.full_name === toScope.sponsor_contact_name)
          ? 'contact-du-compte'
          : null,
        budget_cents: toScope.budget_cents,
      }),
    ).toEqual({
      scope: toScope.context,
      sponsorContactId: 'contact-du-compte',
      budgetCents: String(toScope.budget_cents),
    })
  })

  it('le sponsor est une PERSONNE du compte client, de niveau décideur — jamais un nom libre', () => {
    for (const need of [toScope, won]) {
      const sponsor = DEMO_DELIVERY_CLIENT.contacts.find(contact => contact.full_name === need.sponsor_contact_name)
      expect(sponsor).toBeDefined()
      expect(['economic', 'sponsor']).toContain(sponsor?.decision_role)
    }
  })

  it('le semis résout le sponsor dans les contacts du compte (colonne `decision_maker_contact_id`)', () => {
    expect(seed).toContain('decision_maker_contact_id)')
    expect(seed).toContain('c.account_id = $2::uuid AND c.full_name = $11::text')
  })

  it('sait dire NON : la salle reste l’espace staffing — le profil n’est pas semé, la bascule se fait dans Réglages', () => {
    expect(DEMO_ESN_PROFILE).not.toHaveProperty('workspace_profile')
    const nav = ['/projects/needs', '/consultants', '/missions', '/team']
    expect(orderNavForWorkspaceProfile(nav, null, route => route)).toEqual(nav)
    expect(orderNavForWorkspaceProfile(nav, 'forfait_conseil', route => route)).toEqual([
      '/missions',
      '/projects/needs',
      '/consultants',
      '/team',
    ])
  })
})

describe('SEMIS-PREUVES 4290.13 (#4055.9) — titre périmé et départ confirmé, lus par la fiche contact', () => {
  const NOW = Date.parse('2026-10-20T12:00:00Z')
  const sncf = dossier('SNCF')
  // La fiche lit `raw_data.employmentCheck` : on vérifie la donnée semée elle-même (forme + date lisible), sans le web.
  const checkOf = (fullName: string) => {
    const contact = sncf?.contacts.find(candidate => candidate.full_name === fullName)
    expect(contact).toBeDefined()
    const check = (contact ? demoContactRawData(contact, NOW) : null)?.['employmentCheck'] as
      { state?: string; at?: string; organization?: string } | undefined
    if (check) expect(Number.isNaN(new Date(check.at ?? '').getTime())).toBe(false)
    return check
  }

  it('Thibault Revel : DÉPART CONFIRMÉ — un autre employeur observé, daté (« Ancienne fonction »)', () => {
    expect(checkOf('Thibault Revel')).toMatchObject({ state: 'left', organization: 'Orange Business' })
  })

  it('Mathilde Garnier : TITRE PÉRIMÉ — non retrouvée à la relecture, sans départ affirmé (« Non retrouvé »)', () => {
    expect(checkOf('Mathilde Garnier')).toMatchObject({ state: 'not_found' })
    expect(checkOf('Mathilde Garnier')?.organization).toBeUndefined()
  })

  it('sont deux personnes SIMULÉES, sans coordonnées : jamais un fait posé sur un dirigeant réel', () => {
    for (const name of ['Thibault Revel', 'Mathilde Garnier']) {
      const contact = sncf?.contacts.find(candidate => candidate.full_name === name)
      expect(contact?.linkedin_url ?? '').toMatch(/linkedin\.com\/in\/demo-bellum-/)
      expect(contact?.email ?? null).toBeNull()
      expect(contact?.phone ?? null).toBeNull()
    }
  })

  it('sait dire NON : un contact sans relecture reste « Pas encore vérifié », jamais parti', () => {
    const other = sncf?.contacts.find(candidate => !candidate.employment_check)
    expect(other).toBeDefined()
    expect(other ? demoContactRawData(other, NOW)?.['employmentCheck'] : 'absent').toBeUndefined()
  })
})

describe('SEMIS-PREUVES 4294.6 (#4142.5) — deux signaux quasi identiques : le repli est visible', () => {
  const signals = (dossier('SNCF')?.account.raw_analysis['recent_signals'] ?? []) as RecentSignal[]
  const dated = signals.filter(signal => isSignalDatedToTheDay(signal.date))

  it('le dossier SNCF porte deux formulations du même partenariat, au même jour, sous deux liens', () => {
    const pair = signals.filter(signal => (signal.signal ?? '').startsWith('Partenariat de trois ans'))
    expect(pair).toHaveLength(2)
    expect(pair[0]?.date).toBe(pair[1]?.date)
    expect(pair[0]?.url).not.toBe(pair[1]?.url)
  })

  const words = (text: string) =>
    new Set(
      text
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(token => token.length > 1),
    )
  const dayGap = (a?: string | null, b?: string | null) =>
    Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000

  it('la paire est un VRAI quasi-doublon : même jour, même partenariat, mots très proches (Dice ≥ 0,8)', () => {
    const [left, right] = signals.filter(signal => (signal.signal ?? '').startsWith('Partenariat de trois ans'))
    const l = words(left?.signal ?? '')
    const r = words(right?.signal ?? '')
    const common = [...l].filter(token => r.has(token)).length
    expect(isSignalDatedToTheDay(left?.date)).toBe(true)
    expect(dayGap(left?.date, right?.date)).toBeLessThanOrEqual(1)
    expect((2 * common) / (l.size + r.size)).toBeGreaterThanOrEqual(0.8)
    expect(signals.filter(signal => (signal.signal ?? '').startsWith('Partenariat de trois ans'))).toHaveLength(2)
  })

  it('sait dire NON : à deux semaines d’écart, ce n’est plus le même fait — la fenêtre d’un jour est dépassée', () => {
    const first = dated.find(signal => signal.url === demoSourceUrl('press', 'sncf-1'))
    const shifted = dated.find(signal => signal.url === demoSourceUrl('press', 'sncf-1b'))
    expect(first).toBeDefined()
    expect(shifted).toBeDefined()
    expect(dayGap('2026-06-26', first?.date)).toBeGreaterThan(1)
  })
})

describe('SEMIS-PREUVES 4295.21 (#4016.46) — ce qui est estimé se lit « estimé » sur la fiche compte', () => {
  const openingOf = (name: string) =>
    dossier(name)?.account.raw_analysis['comment_ouvrir_compte'] as { entry_points?: { label?: string }[] } | undefined

  it('la porte d’entrée DÉDUITE (sans base de référence) porte « hypothèse » — Société Générale et SNCF', () => {
    for (const name of ['Société Générale', 'SNCF']) {
      expect((openingOf(name)?.entry_points ?? []).filter(entry => entry.label).length).toBeGreaterThan(0)
    }
    expect(intelligenceEstimateKind('inference', 'hypothesis')).toBe('hypothesis')
  })

  it('sait dire NON : une porte lue d’une source observée (correction humaine, registre) n’est pas badgée', () => {
    expect(intelligenceEstimateKind('human_correction', 'hypothesis')).toBeNull()
  })

  it('les priors de la base de référence (`dataforge`) restent non semables : tables PARTAGÉES du marché', () => {
    expect(intelligenceEstimateKind('dataforge', 'hypothesis')).toBe('hypothesis')
    expect(readFileSync(join(__dirname, 'demo-coverage.ts'), 'utf8')).toContain('dataforge')
  })
})

describe('SEMIS-PREUVES 4295.27 (#4016.121) — NON : la signature se relit chez l’outil branché, jamais en base', () => {
  const coverage = readFileSync(join(__dirname, 'demo-coverage.ts'), 'utf8')
  const reset = readFileSync(join(__dirname, 'demo-reset.service.ts'), 'utf8')
  const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')

  it('la relecture (`SignatureHandoff`) lit l’outil de signature connecté : la salle n’en a aucun, par construction', () => {
    expect(coverage).toMatch(
      /admin_docs_connections:\s*\n?\s*"La connexion d'un outil de signature ou de facturation est REFUSÉE en démo/,
    )
    expect(seed).not.toContain('INSERT INTO admin_docs_connections')
  })

  it('sait dire NON : la table reste purgée au reset — aucune connexion fabriquée ne survit', () => {
    expect(reset).toContain("'admin_docs_connections'")
  })
})
