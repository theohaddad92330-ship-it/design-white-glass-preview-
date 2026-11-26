import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { TABLE_SCOPES } from '@bellum/contracts'

/**
 * GA-16 — une table SANS `workspace_id` est une décision, pas un oubli.
 *
 * L'invariant du dépôt est « tout objet porte `workspace_id`, aucune lecture
 * entre espaces ». Des tables y échappent, et chacune doit être déclarée AVEC
 * la raison de son exception. La liste peut grandir — c'est une décision
 * d'architecture — mais jamais en silence.
 *
 * ⚠️ Le périmètre exclut ce qui porte un `user_id` : `profiles`,
 * `user_preferences` ou `notifications` ne portent pas d'espace parce qu'elles
 * portent un UTILISATEUR, ce qui est un scope, pas une absence de scope.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE A LAISSÉ PASSER PENDANT DEUX JOURS (25/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle déclarait QUATRE tables et se croyait complète. Elle en voyait
 * effectivement quatre — parce que sa détection ne reconnaissait qu'une des
 * deux écritures du décorateur, soit 17 entités sur 142. Douze tables lui
 * échappaient, dont `mission_timesheets`, qui porte des jours facturables et
 * dont l'isolation ne tient qu'à une jointure.
 *
 * Son test de non-vacuité ne l'a pas rattrapée : il comptait les FICHIERS
 * d'entités, pas les entités RECONNUES. Compter l'entrée d'un tuyau ne dit rien
 * de ce qui en sort — c'est la leçon à retenir de cette garde-ci.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE A LAISSÉ PASSER LES QUATRE JOURS SUIVANTS (29/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Détection réparée, corpus toujours faux : elle lisait un FICHIER, y cherchait
 * `workspace_id`, et retenait le PREMIER `@Entity(...)` trouvé. Deux fichiers du
 * dépôt portent plusieurs entités — `match-run.entity.ts` en porte trois,
 * `shortlist.entity.ts` deux. Leur première sœur étant scopée, le fichier entier
 * passait pour scopé : `match_run_entries` et `shortlist_entries` n'existaient
 * pour aucune garde, alors qu'elles portent les consultants proposés et les
 * shortlists d'une ESN.
 *
 * Le même corpus manquait par ailleurs les entités qui vivent à côté de leur
 * module (`favorites/`, `watchlist-rules/`), qu'un `readdirSync` sur
 * `database/entities/` ne visite jamais.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE FAIT DÉSORMAIS, ET CE QU'ELLE A CÉDÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Sa liste privée est partie dans `packages/contracts/src/schemas/table-scopes.ts`
 * — un réglage vit à un seul endroit — et son travail d'EXHAUSTIVITÉ est passé à
 * **GA-65** (`table-scope-registry.spec.ts`), qui lit les métadonnées TypeORM des
 * entités réellement enregistrées plutôt qu'un balayage de fichiers.
 *
 * Il lui reste ce que GA-65 ne peut pas faire : le CLIQUET. GA-65 vérifie que le
 * registre est complet et cohérent avec le schéma ; il ne peut pas savoir qu'une
 * table a DÉJÀ été arbitrée. Reclasser `esn_directory` en `scoped`, ou faire
 * disparaître `mission_timesheets` du registre, laisserait GA-65 vert — les deux
 * gestes sont cohérents avec le schéma. La liste gelée ci-dessous est la mémoire
 * de ces arbitrages : chaque nom y est entré une fois, avec sa raison, et n'en
 * sort pas parce que quelqu'un a trouvé la ligne encombrante.
 */

/**
 * Les tables déclarées HORS du périmètre d'espace, avec la date de la décision.
 *
 * ⚠️ N'y figure que ce qui ne porte NI `workspace_id` NI `user_id` : une table
 * qui porte sa portée n'est pas une exception, c'est le cas nominal. C'est
 * pourquoi `access_fact_questions` et `proactivity_counters`, déclarées au
 * registre faute d'entité TypeORM, ne sont pas ici — elles ont leur colonne.
 *
 * ⚠️ Cette liste ne fait que GRANDIR. En retirer un nom demande de répondre
 * d'abord à « la table a-t-elle disparu, ou a-t-on simplement cessé de vouloir
 * l'expliquer ? » — et seule la première réponse autorise la suppression, avec
 * la migration qui la porte.
 */
const DÉCLARÉES_HORS_ESPACE: Record<string, string> = {
  /* 25/08/2026 — l'écriture de GA-16 */
  territory_snapshots: '25/08/2026',
  esn_directory: '25/08/2026',
  dataforge_accounts: '25/08/2026',
  dataforge_account_domains: '25/08/2026',
  mission_timesheets: '25/08/2026',
  activity_participants: '25/08/2026',
  contact_lifecycle_transitions: '25/08/2026',
  contact_merges: '25/08/2026',
  outreach_sequence_steps: '25/08/2026',
  plan_definitions: '25/08/2026',
  onboarding_stage_definitions: '25/08/2026',
  banners: '25/08/2026',
  stripe_events: '25/08/2026',
  outbox: '25/08/2026',
  oauth_clients: '25/08/2026',
  impersonation_audit: '25/08/2026',
  /* 29/08/2026 — les deux que le corpus par fichier ne montrait pas */
  shortlist_entries: '29/08/2026',
  match_run_entries: '29/08/2026',
  /* 29/08/2026 — entrées avec le registre : l'espace lui-même, et deux tables
     sans entité TypeORM que rien ne pouvait déduire */
  workspaces: '29/08/2026',
  skill_alias_library: '29/08/2026',
  config_overrides: '29/08/2026',
  /* 09/10/2026 — #3916.a, les registres publics lus en continu */
  public_registry_announcements: '09/10/2026',
  public_registry_watch_state: '09/10/2026',
  /* 09/10/2026 — #3921.a / #3921.b, le relevé Sirene du jour */
  sirene_snapshots: '09/10/2026',
  /* 03/11/2026 — #5205 (lot 783), le pack marché v2.1 en base commune */
  market_v2_rows: '03/11/2026',
  market_v2_row_identities: '03/11/2026',
  market_v2_datasets: '03/11/2026',
}

describe('GA-16 — toute table hors périmètre d’espace est DÉCLARÉE', () => {
  it('LIT quelque chose — un registre peuplé, et la garde d’exhaustivité sur le disque', () => {
    // Deux lectures vides passeraient au vert pour toujours : c'est la leçon
    // que cette garde-ci a apprise deux fois.
    expect(Object.keys(TABLE_SCOPES).length).toBeGreaterThanOrEqual(Object.keys(DÉCLARÉES_HORS_ESPACE).length)
    expect(Object.keys(DÉCLARÉES_HORS_ESPACE).length).toBeGreaterThan(20)
    // Le cliquet n'a de sens que si l'exhaustivité est tenue à côté. Si GA-65
    // disparaît, cette garde-ci ne suffit plus, et il faut le savoir ici.
    expect(existsSync(join(__dirname, 'table-scope-registry.spec.ts'))).toBe(true)
  })

  it('aucune table déjà arbitrée n’a quitté le registre', () => {
    const disparues = Object.keys(DÉCLARÉES_HORS_ESPACE).filter(table => !(table in TABLE_SCOPES))
    expect(disparues).toEqual([])
  })

  it('aucune table arbitrée « hors espace » n’a été reclassée en silence', () => {
    // Le classement peut se PRÉCISER — une table « à classer » qui trouve enfin
    // sa réponse — mais elle ne peut pas devenir une table ordinaire : une
    // exception qui redevient la règle, c'est l'exception qu'on a oubliée.
    const reclassées = Object.entries(TABLE_SCOPES)
      .filter(([table]) => table in DÉCLARÉES_HORS_ESPACE)
      .filter(([, scope]) => scope.category === 'scoped' && scope.by === 'workspace_column')
      .map(([table]) => table)
    expect(reclassées).toEqual([])
  })

  it('chaque arbitrage porte sa date', () => {
    const sansDate = Object.entries(DÉCLARÉES_HORS_ESPACE)
      .filter(([, date]) => !/^\d{2}\/\d{2}\/\d{4}$/.test(date))
      .map(([table]) => table)
    expect(sansDate).toEqual([])
  })

  it('sait dire NON — un retrait et un reclassement sont refusés', () => {
    // Rejoué sur un registre fabriqué : retirer une vraie entrée pour le
    // prouver ferait courir le risque qu'on oublie de la remettre.
    const registreAmputé: Record<string, unknown> = { ...TABLE_SCOPES }
    delete registreAmputé['esn_directory']
    expect(Object.keys(DÉCLARÉES_HORS_ESPACE).filter(table => !(table in registreAmputé))).toEqual(['esn_directory'])

    const registreReclassé = {
      ...TABLE_SCOPES,
      esn_directory: { category: 'scoped', by: 'workspace_column', reason: 'x' },
    } as typeof TABLE_SCOPES
    const reclassées = Object.entries(registreReclassé)
      .filter(([table]) => table in DÉCLARÉES_HORS_ESPACE)
      .filter(([, scope]) => scope.category === 'scoped' && scope.by === 'workspace_column')
      .map(([table]) => table)
    expect(reclassées).toEqual(['esn_directory'])
  })
})
