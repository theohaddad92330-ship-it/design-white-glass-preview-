import { CRM_PROVIDER_READ_SCOPE, CRM_PROVIDERS, type CrmFirstImportState, type CrmReadStatus } from '@bellum/contracts'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { CrmReadScopeNote } from './CrmReadScopeNote'

/**
 * #4189 — la note de périmètre reflète le VRAI périmètre lu, par fournisseur (le contrat
 * `CRM_PROVIDER_READ_SCOPE`, une seule source de vérité), et la synchro réelle quand elle existe.
 * Héritée de #3918.3 : rien ne dit que les affaires deviennent des signaux de veille, ni pourquoi.
 */
beforeEach(async () => {
  await i18n.changeLanguage('fr')
})

const status = (over: Partial<CrmReadStatus> = {}): CrmReadStatus => ({
  provider: 'zoho',
  accountLabel: 'exteam.fr',
  objects: ['accounts', 'contacts', 'deals', 'owners'],
  incremental: 'modified_at',
  lastSyncAt: null,
  lastError: null,
  conflicts: 0,
  ...over,
})

describe('CrmReadScopeNote (#4189)', () => {
  // #recette-21-10-K2 — Salesforce « Synchronisé à l'instant » alors que l'autorisation a EXPIRÉ.
  it('⚠️ autorisation expirée : jamais « à l’instant » — « reconnecte » et la dernière synchro RÉUSSIE datée', () => {
    render(
      <CrmReadScopeNote
        connector="salesforce"
        connected
        authExpired
        status={status({ provider: 'salesforce', lastSyncAt: new Date().toISOString() })}
      />,
    )
    const line = screen.getByTestId('crm-read-scope-last-sync')
    expect(line).toHaveTextContent('Autorisation expirée — reconnecte Salesforce')
    expect(line).not.toHaveTextContent(/à l’instant/)
    expect(screen.getByTestId('crm-read-scope-last-ok')).toHaveTextContent(
      /^Dernière synchronisation : .*\(à l’instant\)$/,
    )
    expect(screen.queryByTestId('crm-read-scope-next-sync')).not.toBeInTheDocument()
  })

  it('autorisation expirée sans synchro réussie connue : la demande de reconnexion seule, pas de date', () => {
    render(
      <CrmReadScopeNote connector="salesforce" connected authExpired status={status({ provider: 'salesforce' })} />,
    )
    expect(screen.getByTestId('crm-read-scope-last-sync')).toHaveTextContent(
      'Autorisation expirée — reconnecte Salesforce',
    )
    expect(screen.queryByTestId('crm-read-scope-last-ok')).not.toBeInTheDocument()
  })

  it('J.2 — HubSpot : les affaires accordées par le portail sont LUES, pas « non lues »', () => {
    render(
      <CrmReadScopeNote
        connector="hubspot"
        connected
        status={status({ provider: 'hubspot', objects: ['accounts', 'contacts', 'deals'] })}
      />,
    )
    expect(screen.getByTestId('crm-read-scope-read')).toHaveTextContent(/tes affaires/)
    expect(screen.getByTestId('crm-read-scope-not-read')).not.toHaveTextContent(/tes affaires/)
  })

  it('Zoho : lit comptes, contacts, affaires et propriétaires — et DIT que les activités ne sont pas lues', () => {
    render(<CrmReadScopeNote connector="zoho" connected />)
    const read = screen.getByTestId('crm-read-scope-read')
    expect(read).toHaveTextContent(/tes comptes/)
    expect(read).toHaveTextContent(/tes contacts/)
    expect(read).toHaveTextContent(/tes affaires/)
    expect(read).toHaveTextContent(/propriétaires/)
    expect(read).not.toHaveTextContent(/activités/)
    expect(screen.getByTestId('crm-read-scope-not-read')).toHaveTextContent(/tes activités/)
  })

  it('Salesforce lit ses activités ; Attio ne les lit pas — chacun selon le contrat', () => {
    const { unmount } = render(<CrmReadScopeNote connector="salesforce" connected />)
    expect(screen.getByTestId('crm-read-scope-read')).toHaveTextContent(/tes activités/)
    expect(screen.queryByTestId('crm-read-scope-not-read')).not.toBeInTheDocument()
    unmount()
    render(<CrmReadScopeNote connector="attio" connected />)
    expect(screen.getByTestId('crm-read-scope-not-read')).toHaveTextContent(/tes activités/)
  })

  it('⚠️ Attio : la synchro ne voit que les CRÉATIONS, et l’écran le dit', () => {
    render(<CrmReadScopeNote connector="attio" connected />)
    expect(screen.getByTestId('crm-read-scope-incremental')).toHaveTextContent(/créées/)
    expect(screen.getByTestId('crm-read-scope-incremental')).toHaveTextContent(/modifications/)
  })

  it('une synchro sur les modifications le dit autrement', () => {
    render(<CrmReadScopeNote connector="pipedrive" connected />)
    expect(screen.getByTestId('crm-read-scope-incremental')).toHaveTextContent(/modifiées/)
  })

  it('les affaires ne deviennent pas des signaux de veille — la raison est dite (héritée de #3918.3)', () => {
    render(<CrmReadScopeNote connector="zoho" connected />)
    const note = screen.getByTestId('crm-read-scope')
    expect(note).toHaveTextContent(/Hors périmètre/)
    expect(note).toHaveTextContent(/signaux/)
    expect(note).toHaveTextContent(/pas encore vérifiée sur une instance réelle/)
  })

  // #3918.7 (recette 18/10) — Salesforce reconnecté affichait « Hors périmètre » alors que ses affaires
  // alimentent le cache des signaux (`CRM_DEAL_SIGNAL_PROVIDERS`) : l'écran contredisait le code.
  it.each(['salesforce', 'pipedrive', 'odoo'] as const)(
    '%s : les affaires deviennent des signaux — l’écran ne dit plus « hors périmètre »',
    connector => {
      render(<CrmReadScopeNote connector={connector} connected />)
      const note = screen.getByTestId('crm-read-scope')
      expect(note).not.toHaveTextContent(/Hors périmètre/)
      expect(screen.getByTestId('crm-read-scope-deal-signals')).toHaveTextContent(/deviennent des signaux de veille/)
    },
  )

  it('date de dernière synchro : celle du serveur, jamais « maintenant » ; sans synchro, « pas encore »', () => {
    const { unmount } = render(<CrmReadScopeNote connector="zoho" connected status={status()} />)
    expect(screen.getByTestId('crm-read-scope-last-sync')).toHaveTextContent(/Pas encore synchronisé/)
    unmount()
    render(<CrmReadScopeNote connector="zoho" connected status={status({ lastSyncAt: '2026-10-14T04:55:00.000Z' })} />)
    expect(screen.getByTestId('crm-read-scope-last-sync')).toHaveTextContent(
      /Dernière synchronisation : .*2026.*\(il y a/,
    )
  })

  it('#4290.2 — SYNC-C.6 — « Dernière synchronisation : date (il y a 6 min) » et « Prochaine synchro dans 9 min » : une seule formulation', () => {
    const minutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString()
    render(
      <CrmReadScopeNote
        connector="zoho"
        connected
        status={status({ lastSyncAt: minutes(-6), nextSyncAt: minutes(9) })}
      />,
    )
    expect(screen.getByTestId('crm-read-scope-last-sync')).toHaveTextContent(
      /^Dernière synchronisation : .*\(il y a 6\s*min/,
    )
    expect(screen.getByTestId('crm-read-scope-next-sync')).toHaveTextContent(/Prochaine synchro.*(8|9)\s*min/)
    expect(screen.getAllByText(/Dernière synchronisation/)).toHaveLength(1)
  })

  it.each([
    ['salesforce', true, '2026-10-22T07:10:00.000Z'],
    ['hubspot', false, '2026-10-18T21:18:00.000Z'],
    ['pipedrive', false, new Date(Date.now() - 7 * 60_000).toISOString()],
  ] as const)(
    '#4290.2 — %s : la même formulation « Dernière synchronisation : date (relatif) »',
    (connector, expired, at) => {
      render(
        <CrmReadScopeNote
          connector={connector}
          connected
          authExpired={expired}
          status={status({ provider: connector, lastSyncAt: at })}
        />,
      )
      const id = expired ? 'crm-read-scope-last-ok' : 'crm-read-scope-last-sync'
      expect(screen.getByTestId(id)).toHaveTextContent(/^Dernière synchronisation : .+ \(.+\)$/)
    },
  )

  it('SYNC-C.6 — sans prochaine synchro prévue (jamais synchronisé, ou coupée) : aucune ligne, rien d’inventé', () => {
    render(<CrmReadScopeNote connector="zoho" connected status={status({ lastSyncAt: null, nextSyncAt: null })} />)
    expect(screen.queryByTestId('crm-read-scope-next-sync')).toBeNull()
  })

  it('SYNC-C.6 — EN : « Last sync: … » / « Next sync … »', async () => {
    await i18n.changeLanguage('en')
    const minutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString()
    render(
      <CrmReadScopeNote
        connector="zoho"
        connected
        status={status({ lastSyncAt: minutes(-6), nextSyncAt: minutes(9) })}
      />,
    )
    expect(screen.getByTestId('crm-read-scope-last-sync')).toHaveTextContent(/^Last sync: .*\(6\s*min/)
    expect(screen.getByTestId('crm-read-scope-next-sync')).toHaveTextContent(/^Next sync/)
  })

  it('une dernière synchro en échec montre l’erreur TELLE QUELLE', () => {
    render(<CrmReadScopeNote connector="zoho" connected status={status({ lastError: '401 invalid_grant' })} />)
    expect(screen.getByTestId('crm-read-scope-error')).toHaveTextContent('401 invalid_grant')
  })

  it('les fiches modifiées des deux côtés sont COMPTÉES, la correction humaine gardée', () => {
    render(<CrmReadScopeNote connector="zoho" connected status={status({ conflicts: 3 })} />)
    expect(screen.getByTestId('crm-read-scope-conflicts')).toHaveTextContent(/3 fiches/)
    expect(screen.getByTestId('crm-read-scope-conflicts')).toHaveTextContent(/ta correction est gardée/)
  })

  it('#4189 — un conflit se PROPOSE : la valeur Bellum gardée et celle du CRM, côte à côte, datées', () => {
    render(
      <CrmReadScopeNote
        connector="salesforce"
        connected
        status={status({
          provider: 'salesforce',
          conflicts: 1,
          conflictItems: [
            {
              entityType: 'contact',
              field: 'email',
              bellumValue: 'corrige@acme.fr',
              crmValue: 'autre@crm.fr',
              at: '2026-10-14T04:55:00.000Z',
            },
          ],
        })}
      />,
    )
    const item = screen.getByTestId('crm-read-scope-conflict-item')
    expect(item).toHaveTextContent(/e-mail/i)
    expect(item).toHaveTextContent('corrige@acme.fr')
    expect(item).toHaveTextContent('autre@crm.fr')
    expect(item).toHaveTextContent(/gardée/i)
    // proposer n'est pas écrire : aucun bouton qui appliquerait la valeur du CRM
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('⚠️ SAIT DIRE NON — une valeur absente côté CRM est dite « absente », jamais « null » ni vide', () => {
    render(
      <CrmReadScopeNote
        connector="salesforce"
        connected
        status={status({
          provider: 'salesforce',
          conflicts: 1,
          conflictItems: [
            {
              entityType: 'account',
              field: 'company_name',
              bellumValue: 'Acme',
              crmValue: null,
              at: '2026-10-14T04:55:00.000Z',
            },
          ],
        })}
      />,
    )
    const item = screen.getByTestId('crm-read-scope-conflict-item')
    expect(item).toHaveTextContent(/absente/i)
    expect(item.textContent).not.toMatch(/null|undefined/)
  })

  it.each(CRM_PROVIDERS)('%s : la ligne « Lu » nomme exactement ce que le contrat dit lu, rien de plus', provider => {
    render(<CrmReadScopeNote connector={provider} connected />)
    const read = screen.queryByTestId('crm-read-scope-read')
    const expected = CRM_PROVIDER_READ_SCOPE[provider]
    if (expected.length === 0) {
      expect(read).not.toBeInTheDocument()
      return
    }
    const words: Record<string, RegExp> = {
      accounts: /comptes/,
      contacts: /contacts/,
      deals: /affaires/,
      activities: /activités/,
      owners: /propriétaires/,
    }
    for (const object of Object.keys(words)) {
      const matcher = words[object] as RegExp
      const inRead = matcher.test(read?.textContent ?? '')
      expect(inRead, `${provider} / ${object}`).toBe(expected.some(declared => declared === object))
    }
  })

  it('⚠️ SAIT DIRE NON — aucun conflit, aucune ligne : on n’affiche pas ce qu’on n’a pas', () => {
    render(<CrmReadScopeNote connector="zoho" connected status={status()} />)
    expect(screen.queryByTestId('crm-read-scope-conflicts')).not.toBeInTheDocument()
    expect(screen.queryByTestId('crm-read-scope-error')).not.toBeInTheDocument()
  })

  it('⚠️ SAIT DIRE NON — rien tant que l’outil n’est pas branché', () => {
    render(<CrmReadScopeNote connector="zoho" connected={false} />)
    expect(screen.queryByTestId('crm-read-scope')).not.toBeInTheDocument()
  })

  it('parité EN, et aucun fournisseur de données nommé', async () => {
    await i18n.changeLanguage('en')
    render(<CrmReadScopeNote connector="salesforce" connected status={status({ conflicts: 1 })} />)
    const text = screen.getByTestId('crm-read-scope').textContent ?? ''
    expect(text).toMatch(/become watch signals/)
    expect(text).toMatch(/your accounts/)
    expect(text).not.toMatch(/hubspot|apollo|pappers|firecrawl|brave/i)
    expect(text).not.toMatch(/crmReadScope/) // jamais une clé i18n brute
  })
})

// #4189.9 — « Garder la valeur du CRM » sur CHAQUE écart proposé.
describe('CrmReadScopeNote — le geste « Garder la valeur du CRM » (#4189.9)', () => {
  const item = {
    id: 'e1',
    entityType: 'contact' as const,
    field: 'email',
    bellumValue: 'a@x.fr',
    crmValue: 'b@crm.fr',
    at: '2026-10-14T04:55:00.000Z',
  }

  it('chaque écart porte le geste, qui remonte l’écart choisi', () => {
    const onKeepCrm = vi.fn()
    render(
      <CrmReadScopeNote
        connector="salesforce"
        connected
        status={status({ conflicts: 2, conflictItems: [item, { ...item, id: 'e2', field: 'full_name' }] })}
        onKeepCrm={onKeepCrm}
      />,
    )
    const buttons = screen.getAllByRole('button', { name: 'Garder la valeur du CRM' })
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[1] as HTMLElement)
    expect(onKeepCrm).toHaveBeenCalledWith(expect.objectContaining({ id: 'e2', field: 'full_name' }))
  })

  it('⚠️ SAIT DIRE NON — un CRM qui n’annonce aucune valeur n’offre pas le geste', () => {
    render(
      <CrmReadScopeNote
        connector="salesforce"
        connected
        status={status({ conflictItems: [{ ...item, crmValue: null }] })}
        onKeepCrm={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Garder la valeur du CRM' })).not.toBeInTheDocument()
  })

  it('démonstration : le geste est montré, ne modifie rien et le dit', () => {
    const onKeepCrm = vi.fn()
    const { id: _id, ...demoItem } = item
    render(
      <CrmReadScopeNote
        connector="salesforce"
        connected
        status={status({ demo: true, conflictItems: [demoItem] })}
        onKeepCrm={onKeepCrm}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Garder la valeur du CRM' }))
    expect(onKeepCrm).not.toHaveBeenCalled()
    expect(screen.getByTestId('crm-read-scope-conflict-demo')).toHaveTextContent(/Démonstration/)
  })
})

const entry = (
  object: CrmFirstImportState['objects'][number]['object'],
  count: number | null,
  status: CrmFirstImportState['objects'][number]['status'] = 'done',
): CrmFirstImportState['objects'][number] => ({ object, status, count, conflicts: null, truncated: false, error: null })

const reprise = (over: Partial<CrmFirstImportState> = {}): CrmFirstImportState => ({
  provider: 'zoho',
  state: 'running',
  startedAt: '2026-10-19T20:00:00.000Z',
  finishedAt: null,
  message: null,
  reconnectNeeded: false,
  objects: [],
  ...over,
})

describe('CRM-SYNC-D.2 / D.3 — la reprise se lit sur la carte du CRM', () => {
  it('D.2 — en cours : la progression PAR OBJET, un objet non mesuré n’est jamais « 0 »', () => {
    render(
      <CrmReadScopeNote
        connector="zoho"
        connected
        firstImport={reprise({
          objects: [
            entry('contacts', 1240, 'running'),
            entry('deals', 312, 'running'),
            entry('activities', null, 'pending'),
          ],
        })}
      />,
    )
    const line = screen.getByTestId('crm-read-scope-first-import')
    expect(line).toHaveTextContent(/Reprise en cours — 1\s?240 contacts · 312 affaires/)
    expect(line).not.toHaveTextContent(/\b0 activité/)
  })

  it('D.2 — terminée : le résumé chiffré, plus de spinner', () => {
    render(
      <CrmReadScopeNote
        connector="hubspot"
        connected
        firstImport={reprise({
          provider: 'hubspot',
          state: 'done',
          finishedAt: '2026-10-19T20:02:00.000Z',
          objects: [entry('accounts', 80), entry('contacts', 1240), entry('deals', 312), entry('activities', 45)],
        })}
      />,
    )
    const line = screen.getByTestId('crm-read-scope-first-import')
    expect(line).toHaveTextContent(/Reprise terminée — 80 entreprises · 1\s?240 contacts · 312 affaires · 45 activités/)
    expect(line).not.toHaveTextContent(/en cours/)
  })

  it('D.2 — en échec : l’erreur est NOMMÉE sur la carte', () => {
    render(
      <CrmReadScopeNote
        connector="zoho"
        connected
        firstImport={reprise({ state: 'failed', message: '401 invalid_grant' })}
      />,
    )
    expect(screen.getByTestId('crm-read-scope-first-import')).toHaveTextContent(/Reprise en échec — 401 invalid_grant/)
  })

  it('D.2 — le test sait dire NON : sans reprise connue, aucune ligne de reprise', () => {
    render(<CrmReadScopeNote connector="zoho" connected />)
    expect(screen.queryByTestId('crm-read-scope-first-import')).toBeNull()
    expect(screen.queryByRole('button', { name: /Voir la reprise/ })).toBeNull()
  })

  it('D.3 — « Voir la reprise <CRM> » déplie la reprise de CE CRM, jamais l’import de fichiers', () => {
    render(
      <CrmReadScopeNote
        connector="zoho"
        connected
        firstImport={reprise({ state: 'done', objects: [entry('contacts', 1240)] })}
      />,
    )
    expect(screen.queryByText('Reprise automatique de ton CRM')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Voir la reprise Zoho/ }))
    expect(screen.getByText('Reprise automatique de ton CRM')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /assistant de reprise/ })).toBeNull()
  })

  // #4691.3 — l'écran ne se contredit pas : un objet déclaré « Non lu » n'est jamais compté dans la reprise.
  it('#4691.3 — « Non lu : tes affaires » ⇒ la reprise ne compte aucune affaire (ni activité), le reste est dit', () => {
    render(
      <CrmReadScopeNote
        connector="hubspot"
        connected
        status={status({ provider: 'hubspot', objects: ['accounts', 'contacts'] })}
        firstImport={reprise({
          provider: 'hubspot',
          state: 'done',
          objects: [entry('accounts', 4), entry('contacts', 316), entry('deals', 3), entry('activities', 12)],
        })}
      />,
    )
    expect(screen.getByTestId('crm-read-scope-not-read')).toHaveTextContent(/tes affaires/)
    const line = screen.getByTestId('crm-read-scope-first-import')
    expect(line).toHaveTextContent(/Reprise terminée — 4 entreprises · 316 contacts/)
    expect(line).not.toHaveTextContent(/affaire/)
    expect(line).not.toHaveTextContent(/activité/)
  })

  it('#4691.3 — NON : quand les affaires SONT lues, elles restent comptées', () => {
    render(
      <CrmReadScopeNote
        connector="hubspot"
        connected
        status={status({ provider: 'hubspot', objects: ['accounts', 'contacts', 'deals'] })}
        firstImport={reprise({
          provider: 'hubspot',
          state: 'done',
          objects: [entry('accounts', 4), entry('contacts', 316), entry('deals', 3)],
        })}
      />,
    )
    expect(screen.getByTestId('crm-read-scope-first-import')).toHaveTextContent(/316 contacts · 3 affaires/)
  })

  // #4290.16 — UNE date : la dernière synchro réussie ; un essai plus récent en échec se dit avec sa raison.
  it('#4290.16 — dernier essai en échec : la date de réussite reste, l’essai est dit avec sa raison', () => {
    const minutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString()
    render(
      <CrmReadScopeNote
        connector="pipedrive"
        connected
        status={status({
          provider: 'pipedrive',
          lastSyncAt: '2026-10-19T04:55:00.000Z',
          lastAttemptAt: minutes(-13),
          lastError: '401 invalid_grant',
        })}
      />,
    )
    expect(screen.getByTestId('crm-read-scope-last-sync')).toHaveTextContent(/Dernière synchronisation : .*\(il y a/)
    expect(screen.getByTestId('crm-read-scope-error')).toHaveTextContent(
      /Dernier essai.*13\s*min.*échec : 401 invalid_grant/,
    )
    expect(screen.getAllByText(/Dernière synchronisation/)).toHaveLength(1)
  })

  it('#4290.16 — jamais réussi mais essayé : « pas encore synchronisé » + l’essai raté, aucune date de réussite', () => {
    const minutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString()
    render(
      <CrmReadScopeNote
        connector="odoo"
        connected
        status={status({ provider: 'odoo', lastSyncAt: null, lastAttemptAt: minutes(-2), lastError: 'HTTP 403' })}
      />,
    )
    expect(screen.getByTestId('crm-read-scope-last-sync')).toHaveTextContent(/Pas encore synchronisé/)
    expect(screen.getByTestId('crm-read-scope-error')).toHaveTextContent(/échec : HTTP 403/)
  })

  // #4467 — quand chaque passe échoue, la carte dit QUAND (dernier essai) et POURQUOI (raison nommée, outil du client).
  it.each([
    ['hubspot', 'hubspot_owners_scope', /Reconnecte HubSpot pour accorder l’accès aux propriétaires/],
    ['salesforce', 'authorization_expired', /Reconnecte Salesforce/],
    ['attio', 'attio_deals_disabled', /Un admin Attio doit activer les deals/],
    ['odoo', 'odoo_endpoint_unreachable', /L’adresse de l’instance Odoo ne répond pas à l’API : vérifie l’URL/],
  ] as const)('#4467 — %s : la raison nommée remplace l’erreur brute', (connector, hint, expected) => {
    render(
      <CrmReadScopeNote
        connector={connector}
        connected
        status={status({
          provider: connector,
          lastSyncAt: '2026-10-18T04:55:00.000Z',
          lastAttemptAt: new Date(Date.now() - 13 * 60_000).toISOString(),
          lastError: 'HTTP 403 brut',
          lastErrorHint: hint,
        })}
      />,
    )
    const line = screen.getByTestId('crm-read-scope-error')
    expect(line).toHaveTextContent(/Dernier essai.*13\s*min/)
    expect(line).toHaveTextContent(expected)
    expect(line).not.toHaveTextContent('HTTP 403 brut')
  })

  // #4290.17 — Pipedrive n'a pas de webhook : la carte dit « toutes les 15 min », pas « en temps réel ».
  it('#4290.17 — relecture : « mis à jour toutes les 15 min » ; webhook : « en temps réel »', () => {
    const { unmount } = render(
      <CrmReadScopeNote
        connector="pipedrive"
        connected
        status={status({ provider: 'pipedrive', refresh: { mode: 'poll', everyMinutes: 15 } })}
      />,
    )
    expect(screen.getByTestId('crm-read-scope-refresh')).toHaveTextContent(/toutes les 15 min/)
    expect(screen.getByTestId('crm-read-scope-refresh')).not.toHaveTextContent(/temps réel/)
    unmount()
    render(
      <CrmReadScopeNote
        connector="hubspot"
        connected
        status={status({ provider: 'hubspot', refresh: { mode: 'webhook' } })}
      />,
    )
    expect(screen.getByTestId('crm-read-scope-refresh')).toHaveTextContent(/en temps réel/)
  })

  it('#4290.17 — sans l’information (serveur antérieur) : aucune ligne, rien d’inventé', () => {
    render(<CrmReadScopeNote connector="pipedrive" connected status={status({ provider: 'pipedrive' })} />)
    expect(screen.queryByTestId('crm-read-scope-refresh')).toBeNull()
  })

  // #4290.17 (recette 22/10) — la carte NON connectée (« Connecter Pipedrive ») le dit aussi, avant le branchement.
  it('#4290.17 — carte non connectée : Pipedrive dit qu’il n’a pas de webhook (relecture périodique) ; HubSpot, rien', () => {
    const { unmount } = render(<CrmReadScopeNote connector="pipedrive" connected={false} />)
    expect(screen.getByTestId('crm-read-scope-refresh-static')).toHaveTextContent(
      /pas de webhook.*intervalle régulier/i,
    )
    expect(screen.queryByTestId('crm-read-scope')).toBeNull()
    unmount()
    render(<CrmReadScopeNote connector="hubspot" connected={false} />)
    expect(screen.queryByTestId('crm-read-scope-refresh-static')).toBeNull()
  })
})
