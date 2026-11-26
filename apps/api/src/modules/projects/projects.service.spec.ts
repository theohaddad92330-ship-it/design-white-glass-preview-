import {
  CLOSED_UNWON_STAGES,
  INTAKE_STAGES,
  SIGNAL_DOMAIN_CODES,
  PROJECT_STAGES,
  projectStageInSql,
  projectStageNotInSql,
  TRIAGED_STAGES,
} from '@bellum/contracts'
import { ProjectsService } from './projects.service'
import type { ProjectEntity } from '../../database/entities/project.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * Opportunity Graph (restitution V2 §6-7). The read/lifecycle/materialize
 * projections are raw SQL, so the proofs here are about the CONTRACT of those
 * queries: workspace scoping (with the account-parent fallback that mirrors the
 * RLS policy), no deleted rows, idempotent additive materialization matching the
 * migration backfill, and a graceful degrade on failure (never throws).
 */
describe('ProjectsService', () => {
  let repo: MockRepository<ProjectEntity>
  let service: ProjectsService

  beforeEach(() => {
    repo = createMockRepository<ProjectEntity>()
    service = new ProjectsService(repo as never)
  })

  describe('listOwnerResourceConflicts (#2319, arbitrage owner/ressource)', () => {
    const row = {
      project_id: '44444444-4444-4444-4444-444444444444',
      project_label: 'Refonte portail',
      need_title: 'Ingénieur infrastructure',
      consultant_id: '55555555-5555-5555-5555-555555555555',
      consultant_name: 'Karim B.',
      account_owner_name: 'Louis S',
      account_owner_email: 'louis@example.test',
      resource_owner_name: null,
      resource_owner_email: 'marie@example.test',
    }

    it('lit les porteurs RÉELS, scopés à l’espace et au compte, sur les positionnements non clos', async () => {
      repo.manager.query.mockResolvedValue([])
      await service.listOwnerResourceConflicts('ws-1', 'acc-1')
      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(params[0]).toBe('ws-1')
      expect(params[1]).toBe('acc-1')
      expect(params[2]).toEqual(['accepted', 'rejected', 'withdrawn'])
      // Les DEUX porteurs doivent exister et différer : un porteur absent ne fait aucune ligne.
      expect(sql).toContain('o.owner_id IS NOT NULL')
      expect(sql).toContain('c.owner_user_id IS NOT NULL')
      expect(sql).toContain('c.owner_user_id <> o.owner_id')
      expect(sql).toContain('sub.submitted_at IS NOT NULL')
      expect(sql).toContain('c.workspace_id = $1')
    })

    it('nomme chaque porteur (nom, sinon e-mail) et rend une ligne par conflit', async () => {
      repo.manager.query.mockResolvedValue([row])
      const result = await service.listOwnerResourceConflicts('ws-1', 'acc-1')
      expect(result).toEqual([
        {
          projectId: row.project_id,
          projectLabel: 'Refonte portail',
          needTitle: 'Ingénieur infrastructure',
          consultantId: row.consultant_id,
          consultantName: 'Karim B.',
          accountOwnerName: 'Louis S',
          resourceOwnerName: 'marie@example.test',
        },
      ])
    })

    it('écarte un conflit dont un porteur n’a ni nom ni e-mail : jamais un nom inventé', async () => {
      repo.manager.query.mockResolvedValue([{ ...row, resource_owner_email: null }])
      expect(await service.listOwnerResourceConflicts('ws-1', 'acc-1')).toEqual([])
    })

    it('ne lève jamais : une lecture en échec rend vide', async () => {
      repo.manager.query.mockRejectedValue(new Error('boom'))
      expect(await service.listOwnerResourceConflicts('ws-1', 'acc-1')).toEqual([])
    })
  })

  describe('listForWorkspace', () => {
    it('restreint au dossier d’un compte quand on le demande (onglet Projets, BEL-CRM-104)', async () => {
      repo.manager.query.mockResolvedValue([])
      await service.listForWorkspace('ws-1', 'acc-1')
      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(params).toEqual(['ws-1', 'acc-1', null])
      // Le cast est indispensable : un `$2` nu dans une comparaison uuid fait
      // échouer la requête entière côté Postgres — la démonstration publique
      // l'a déjà payé en 500.
      expect(sql).toContain('$2::uuid')
    })

    it('scopes on the workspace (with account-parent fallback), excludes deleted, newest first', async () => {
      repo.manager.query.mockResolvedValue([])

      await service.listForWorkspace('ws-1')

      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      // Le second paramètre est le filtre par compte : `null` = tout l'espace.
      expect(params).toEqual(['ws-1', null, null])
      expect(sql).toContain('o.workspace_id = $1 OR a.workspace_id = $1')
      expect(sql).toContain("a.status <> 'deleted'")
      expect(sql).toContain('JOIN accounts a ON a.id = o.account_id')
      expect(sql).toContain('ORDER BY o.first_detected_at DESC')
      // Le montant estimé voyage en nombre (cast float8), jamais en string pg.
      expect(sql).toContain('o.estimated_amount::float8 AS estimated_amount')
    })

    /**
     * #4137 — « Archivés » : on archive, on ne supprime pas. La lecture des rangés
     * est un PARAMÈTRE de lecture ; le défaut ne change pas (zéro régression sur
     * les appelants existants) et le périmètre d'espace reste TOUJOURS posé.
     */
    it('#4137 — archivedOnly ne rend que les dossiers rangés, sans quitter le périmètre d’espace', async () => {
      repo.manager.query.mockResolvedValue([])
      await service.listForWorkspace('ws-1', undefined, undefined, { archivedOnly: true })
      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(params).toEqual(['ws-1', null, null])
      expect(sql).toContain('o.workspace_id = $1 OR a.workspace_id = $1')
      expect(sql).toContain('o.archived_at IS NOT NULL')
    })

    it('#4137 — sans archivedOnly, aucun filtre sur archived_at (comportement inchangé)', async () => {
      repo.manager.query.mockResolvedValue([])
      await service.listForWorkspace('ws-1')
      const [sql] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(sql).not.toContain('o.archived_at IS NOT NULL')
    })

    // #4137 — recette prod 31/10 : la carte archivée RESTAIT au kanban même après rechargement, car la lecture
    // par défaut (le pipe de l'espace) rendait aussi les rangés. Le pipe ne montre que les actifs ; la fiche
    // (`id`) et la lecture « Archivés » gardent la leur.
    it('#4137 — la lecture du pipe de l’espace exclut les dossiers archivés', async () => {
      repo.manager.query.mockResolvedValue([])
      await service.listForWorkspace('ws-1')
      const [sql] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain('o.archived_at IS NULL')
    })

    it('#4137 — la fiche d’un dossier (`id`) retrouve aussi un dossier archivé, pour le désarchiver', async () => {
      repo.manager.query.mockResolvedValue([])
      await service.listForWorkspace('ws-1', undefined, '7c9e6679-7425-40de-944b-e07fc1f90ae7')
      const [sql] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(sql).not.toContain('o.archived_at IS NULL')
    })

    /**
     * #2801 — LA FICHE PROJET/AFFAIRE, `/projects/$id`. Même précédent que
     * `useMission` (`GET /delivery/missions?id=…`) : la fiche relit la MÊME
     * ligne que la liste, jamais une seconde projection qui divergerait.
     */
    it('#2801 — filtre par identifiant, avec le même cast uuid que le compte', async () => {
      repo.manager.query.mockResolvedValue([])
      await service.listForWorkspace('ws-1', undefined, 'proj-1')
      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(params).toEqual(['ws-1', null, 'proj-1'])
      expect(sql).toContain('$3::uuid')
      expect(sql).toContain('o.id = $3::uuid')
    })

    /**
     * #2170.19 (lot W20, registre 16/09) — LE NOMBRE DE PROFILS POSITIONNÉS.
     * Même prédicat que `positioned_consultants_count` sur UN besoin
     * (`open-needs.service.ts`, décision Louis 17/09 : `submitted_at IS NOT
     * NULL` est LA condition), sommé sur TOUS les besoins du PROJET — la carte
     * compte l'affaire, pas un rôle recherché.
     */
    it('#2170.19 — compte les profils positionnés sur TOUS les besoins du projet, JAMAIS en chaîne pg', async () => {
      repo.manager.query.mockResolvedValue([])
      await service.listForWorkspace('ws-1')
      const [sql] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain('JOIN project_needs n ON n.id = sub.need_id')
      expect(sql).toContain('sub.submitted_at IS NOT NULL')
      expect(sql).toContain('n.project_id = o.id')
      expect(sql).toContain('::int AS positioned_count')
    })

    /**
     * #2170.13 — LE BESOIN PRINCIPAL, sur la carte. `ProjectNeedsPanel`
     * n'existait que dans le tiroir de détail : la carte ne disait rien du
     * rôle recherché. Le PREMIER besoin non archivé (le rôle pour lequel
     * l'affaire a été ouverte) — jamais le besoin le PLUS AVANCÉ
     * (`most_advanced_need_status`, `project-pipeline.service.ts`), qui
     * répond à une question différente (où en est le staffing), pas à
     * « pour quoi cherche-t-on ».
     */
    it('#2170.13 — porte le titre du premier besoin non archivé, comme besoin principal', async () => {
      repo.manager.query.mockResolvedValue([])
      await service.listForWorkspace('ws-1')
      const [sql] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain('n.project_id = o.id AND n.archived_at IS NULL')
      expect(sql).toContain('ORDER BY n.created_at ASC')
      expect(sql).toContain('AS primary_need_title')
    })

    // Théo C projects-pipeline.N3 — « Estimation HT · N poste(s) » : le nombre de postes de l'affaire, sommé sur ses
    // besoins non archivés. Aucun besoin = NULL (une carte sans ligne), jamais 0 poste.
    it('Théo C projects-pipeline.N3 — somme les postes des besoins non archivés, NULL sans besoin', async () => {
      repo.manager.query.mockResolvedValue([])
      await service.listForWorkspace('ws-1')
      const [sql] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain('SUM(n.headcount)')
      expect(sql).toContain('::int AS needs_headcount')
      expect(sql).not.toMatch(/COALESCE\(\(?SELECT SUM\(n\.headcount\)/)
    })

    // #4344.2 — la carte du pipe mène à la fiche de CE besoin : même sous-requête, par identifiant.
    it('#4344.2 — rend aussi l’identifiant du besoin principal, par la même sous-requête', async () => {
      repo.manager.query.mockResolvedValue([])
      await service.listForWorkspace('ws-1')
      const [sql] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain('AS primary_need_id')
      expect(sql.match(/ORDER BY n\.created_at ASC/g)?.length).toBeGreaterThanOrEqual(2)
    })

    it('returns [] and never throws on a query error', async () => {
      repo.manager.query.mockRejectedValue(new Error('boom'))
      await expect(service.listForWorkspace('ws-1')).resolves.toEqual([])
    })
  })

  describe('updateStage', () => {
    it('n’écrit que dans le périmètre de l’appelant et rend la ligne à jour', async () => {
      const row = { id: 'op-1', stage: 'qualified' }
      repo.manager.query.mockResolvedValue([row])

      const result = await service.updateStage('op-1', 'ws-1', 'qualified')

      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(params[0]).toBe('op-1')
      expect(params[1]).toBe('ws-1')
      expect(params[2]).toBe('qualified')
      expect(sql).toContain('UPDATE opportunities')
      expect(sql).toContain('o.workspace_id = $2 OR a.workspace_id = $2')
      expect(sql).toContain("a.status <> 'deleted'")
      expect(result).toEqual(row)
    })

    it('clôt le projet quand il passe gagné — date ET issue, pas seulement l’étape', async () => {
      repo.manager.query.mockResolvedValue([{ id: 'op-1' }])
      await service.updateStage('op-1', 'ws-1', 'won')

      const [, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(params[4]).toBeInstanceOf(Date) // closed_at
      expect(params[5]).toBe('won') // outcome
    })

    it('n’invente PAS de clôture pour un projet endormi', async () => {
      repo.manager.query.mockResolvedValue([{ id: 'op-1' }])
      await service.updateStage('op-1', 'ws-1', 'dormant')

      const [, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(params[4]).toBeNull()
      expect(params[5]).toBeNull()
    })

    it('n’efface le motif de perte que si le projet cesse d’être perdu', async () => {
      repo.manager.query.mockResolvedValue([{ id: 'op-1' }])
      await service.updateStage('op-1', 'ws-1', 'lost', 'Trop cher')

      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(params[6]).toBe('Trop cher')
      // Le cast fait partie de l'assertion : sans lui, Postgres déduit le type
      // du paramètre depuis le seul contexte disponible — aucun — et retombe
      // sur « text ». Voir `sql-parameter-casts.spec.ts`.
      expect(sql).toContain("CASE WHEN $3 = 'lost' THEN $7::text ELSE NULL END")
    })

    it('rend null quand rien ne correspond (absent ou hors périmètre)', async () => {
      repo.manager.query.mockResolvedValue([])
      await expect(service.updateStage('op-1', 'ws-1', 'dormant')).resolves.toBeNull()
    })

    it('rend null et ne lève jamais sur une erreur de requête', async () => {
      repo.manager.query.mockRejectedValue(new Error('boom'))
      await expect(service.updateStage('op-1', 'ws-1', 'won')).resolves.toBeNull()
    })
  })

  describe('caseDimensions (#3246 — stratégie / modèle d’achat / organisation d’une affaire déjà clôturée)', () => {
    it('ne touche QUE les colonnes fournies, dans le périmètre de l’appelant, sans toucher à l’étape', async () => {
      repo.manager.query.mockResolvedValue([{ strategy: 'via_partenaire', buying_model: null, organisation: null }])

      const result = await service.updateCaseDimensions('op-1', 'ws-1', { strategy: 'via_partenaire' })

      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain('UPDATE opportunities')
      expect(sql).toContain('o.workspace_id = $2 OR a.workspace_id = $2')
      expect(sql).toContain("a.status <> 'deleted'")
      expect(sql).not.toContain('stage =')
      expect(sql).not.toContain('closed_at')
      expect(params).toEqual(['op-1', 'ws-1', true, 'via_partenaire', false, null, false, null])
      expect(result).toEqual({ strategy: 'via_partenaire', buying_model: null, organisation: null })
    })

    it('null efface explicitement (flag vrai, valeur null)', async () => {
      repo.manager.query.mockResolvedValue([{ strategy: null, buying_model: 'accord_cadre', organisation: null }])
      await service.updateCaseDimensions('op-1', 'ws-1', { strategy: null })
      const [, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(params).toEqual(['op-1', 'ws-1', true, null, false, null, false, null])
    })

    it('écrit l’organisation sans toucher aux deux autres quand elle seule est fournie', async () => {
      repo.manager.query.mockResolvedValue([
        { strategy: 'via_partenaire', buying_model: null, organisation: 'comite_elargi' },
      ])
      const result = await service.updateCaseDimensions('op-1', 'ws-1', { organisation: 'comite_elargi' })
      const [, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(params).toEqual(['op-1', 'ws-1', false, null, false, null, true, 'comite_elargi'])
      expect(result).toEqual({ strategy: 'via_partenaire', buying_model: null, organisation: 'comite_elargi' })
    })

    it('rend null hors périmètre ou sur erreur — jamais une valeur inventée', async () => {
      repo.manager.query.mockResolvedValue([])
      await expect(service.updateCaseDimensions('op-1', 'ws-1', { strategy: null })).resolves.toBeNull()
      repo.manager.query.mockRejectedValue(new Error('boom'))
      await expect(service.updateCaseDimensions('op-1', 'ws-1', { strategy: null })).resolves.toBeNull()
    })

    it('lit les trois colonnes, bornées au vocabulaire fermé (une valeur hors liste sort null)', async () => {
      repo.manager.query.mockResolvedValue([
        { strategy: 'inconnue', buying_model: 'appel_offres', organisation: 'invente' },
      ])
      const result = await service.readCaseDimensions('op-1', 'ws-1')
      expect(result).toEqual({ strategy: null, buying_model: 'appel_offres', organisation: null })
      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain('SELECT')
      expect(params).toEqual(['op-1', 'ws-1'])
    })
  })

  describe('updateAmount', () => {
    it('sets the estimated amount within scope and returns the row (amount as a number)', async () => {
      const row = { id: 'op-1', estimated_amount: 25000 }
      repo.manager.query.mockResolvedValue([row])

      const result = await service.updateAmount('op-1', 'ws-1', 25000)

      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(params).toEqual(['op-1', 'ws-1', 25000])
      expect(sql).toContain('UPDATE opportunities')
      expect(sql).toContain('SET estimated_amount = $3')
      expect(sql).toContain('o.workspace_id = $2 OR a.workspace_id = $2')
      expect(sql).toContain("a.status <> 'deleted'")
      expect(sql).toContain('o.estimated_amount::float8 AS estimated_amount')
      expect(result).toEqual(row)
    })

    it('clears the amount when passed null (never a fabricated 0)', async () => {
      repo.manager.query.mockResolvedValue([{ id: 'op-1', estimated_amount: null }])
      const result = await service.updateAmount('op-1', 'ws-1', null)
      const [, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(params).toEqual(['op-1', 'ws-1', null])
      expect(result).toEqual({ id: 'op-1', estimated_amount: null })
    })

    it('returns null when nothing matched (absent or out of scope)', async () => {
      repo.manager.query.mockResolvedValue([])
      await expect(service.updateAmount('op-1', 'ws-1', 1000)).resolves.toBeNull()
    })

    it('returns null and never throws on a query error', async () => {
      repo.manager.query.mockRejectedValue(new Error('boom'))
      await expect(service.updateAmount('op-1', 'ws-1', 1000)).resolves.toBeNull()
    })
  })

  describe('findSimilar', () => {
    const reference = {
      id: 'op-1',
      account_id: 'acc-1',
      kind: 'pain',
      label: 'Migration ERP SAP',
      offer: 'TMA SAP',
    }

    it('404-material: returns null when the reference is absent or out of scope', async () => {
      repo.manager.query.mockResolvedValueOnce([])

      await expect(service.findSimilar('op-1', 'ws-1')).resolves.toBeNull()

      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(params).toEqual(['op-1', 'ws-1'])
      expect(sql).toContain('o.workspace_id = $2 OR a.workspace_id = $2')
      expect(sql).toContain("a.status <> 'deleted'")
      // the reference is re-read server-side, never taken from the client
      expect(repo.manager.query).toHaveBeenCalledTimes(1)
    })

    it('searches the OTHER accounts of the workspace on the reference words', async () => {
      repo.manager.query.mockResolvedValueOnce([reference]).mockResolvedValueOnce([])

      await service.findSimilar('op-1', 'ws-1')

      const [sql, params] = repo.manager.query.mock.calls[1] as [string, unknown[]]
      expect(sql).toContain('o.account_id <> $2')
      expect(sql).toContain('o.workspace_id = $1 OR a.workspace_id = $1')
      expect(sql).toContain('ILIKE ANY($3::text[])')
      expect(params[0]).toBe('ws-1')
      expect(params[1]).toBe('acc-1')
      expect(params[2]).toEqual(['%migration%', '%erp%', '%sap%', '%tma%'])
    })

    it('ranks the matches and carries the shared words that justify each one', async () => {
      repo.manager.query.mockResolvedValueOnce([reference]).mockResolvedValueOnce([
        { id: 'op-9', account_id: 'acc-2', kind: 'pain', label: 'Migration ERP SAP du groupe', offer: null },
        { id: 'op-8', account_id: 'acc-3', kind: 'program', label: 'Chantier SAP', offer: null },
      ])

      const result = await service.findSimilar('op-1', 'ws-1')

      expect(result?.reference).toEqual(reference)
      expect(result?.matches.map(match => match.id)).toEqual(['op-9', 'op-8'])
      expect(result?.matches[0].shared_terms).toEqual(['migration', 'erp', 'sap'])
      expect(result?.matches[0].match_score).toBeGreaterThan(result?.matches[1].match_score ?? 1)
    })

    it('says "nothing found" rather than inventing: no candidate → empty list', async () => {
      repo.manager.query.mockResolvedValueOnce([reference]).mockResolvedValueOnce([])
      await expect(service.findSimilar('op-1', 'ws-1')).resolves.toEqual({ reference, matches: [] })
    })

    it('skips the search entirely for a need made of stopwords only', async () => {
      repo.manager.query.mockResolvedValueOnce([{ ...reference, label: 'le projet', offer: null }])

      const result = await service.findSimilar('op-1', 'ws-1')

      expect(result?.matches).toEqual([])
      expect(repo.manager.query).toHaveBeenCalledTimes(1)
    })
  })

  /**
   * Boucle d'apprentissage (§6). L'agrégat ne compte QUE des cycles de vie
   * déplacés à la main : une ligne jamais touchée (`nouveau`) ne dit rien de ce
   * qui marche et ne doit pas peser dans la leçon.
   */
  describe('summarizeLearning', () => {
    it('agrège les projets RÉELLEMENT déplacés, scopés au workspace', async () => {
      repo.manager.query.mockResolvedValue([])

      await service.summarizeLearning('ws-1')

      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      const flat = sql.replace(/\s+/g, ' ')
      expect(params).toEqual(['ws-1'])
      expect(flat).toContain('o.workspace_id = $1 OR a.workspace_id = $1')
      expect(flat).toContain("a.status <> 'deleted'")
      // Le cœur de l'honnêteté de la boucle : les projets que personne n'a
      // regardés sortent de l'agrégat — ils ne disent rien de ce qui marche.
      // La population se DEMANDE au contrat, elle ne se retape pas (D37).
      expect(flat).toContain(projectStageNotInSql('o.stage', INTAKE_STAGES))
      expect(flat).toContain("COUNT(*) FILTER (WHERE o.stage = 'won')")
      expect(flat).toContain(projectStageInSql('o.stage', CLOSED_UNWON_STAGES))
    })

    /**
     * D37 — le panier « transformé en action » PART du contrat.
     *
     * Il valait `{confirmed, profiles_submitted, negotiation}` écrit à la main :
     * `qualified` n'entrait alors dans AUCUN des trois paniers alors qu'il était
     * bien dans la population comptée. Une équipe qui qualifie sans avancer ne
     * produisait qu'une ligne à zéro, jetée au tri — la boucle restait muette
     * sur un geste humain réel.
     */
    it('compte comme « transformé » TOUT projet pris en charge et encore en jeu (D37)', async () => {
      repo.manager.query.mockResolvedValue([])

      await service.summarizeLearning('ws-1')

      const [sql] = repo.manager.query.mock.calls[0] as [string]
      const flat = sql.replace(/\s+/g, ' ')
      expect(flat).toContain(projectStageInSql('o.stage', TRIAGED_STAGES))
      // `qualified` est bien DANS le panier maintenant — c'est le changement.
      expect(projectStageInSql('o.stage', TRIAGED_STAGES)).toContain("'qualified'")

      // Et les trois paniers PARTITIONNENT la population : rien ne se compte
      // deux fois, rien ne tombe entre les deux.
      const buckets = [...TRIAGED_STAGES, ...CLOSED_UNWON_STAGES, 'won'].sort()
      expect(new Set(buckets).size).toBe(buckets.length)
      expect(buckets).toEqual(
        PROJECT_STAGES.filter(stage => !(INTAKE_STAGES as readonly string[]).includes(stage)).sort(),
      )
    })

    it('dégrade en tableau vide sur erreur — jamais bloquant pour un run', async () => {
      repo.manager.query.mockRejectedValue(new Error('boom'))
      await expect(service.summarizeLearning('ws-1')).resolves.toEqual([])
    })
  })

  describe('materialize', () => {
    it('runs the five idempotent projections scoped to the account', async () => {
      repo.manager.query.mockResolvedValue([])

      await service.materialize('acc-1')

      // 5 projections + 3 rattrapages de domaine (#3978) — pain, challenge, signal.
      expect(repo.manager.query).toHaveBeenCalledTimes(8)
      const kinds = repo.manager.query.mock.calls.map(([sql]) => sql as string)
      expect(kinds[0]).toContain("'pain'")
      expect(kinds[1]).toContain("'challenge'")
      expect(kinds[2]).toContain("'program'")
      expect(kinds[3]).toContain("'signal'")
      expect(kinds[4]).toContain("'implication'")
      for (const sql of kinds.slice(0, 5)) {
        expect(sql).toContain('ON CONFLICT (account_id, kind, md5(label)) DO NOTHING')
        expect(sql).toContain("a.status <> 'deleted'")
      }
      // every projection is scoped to the single account
      for (const [, params] of repo.manager.query.mock.calls as Array<[string, unknown[]]>) {
        expect(params[0]).toBe('acc-1')
      }
    })

    /**
     * #3978 — `primary_domain_code` n'était écrit par AUCUNE projection : les trois
     * libellés par signal (le fait, « Ce que ça change », le geste) ne sortaient
     * jamais sur un compte réel. Il vient désormais du CLASSEMENT du modèle à
     * l'analyse (`domain_code` sur le pain / l'enjeu / le signal) — et de rien
     * d'autre : un programme ou une implication, que le modèle ne classe pas,
     * restent SANS domaine.
     */
    describe('#3978 — le domaine d’offre classé à l’analyse', () => {
      const queries = async () => {
        repo.manager.query.mockResolvedValue([])
        await service.materialize('acc-1')
        return repo.manager.query.mock.calls as Array<[string, unknown[]]>
      }
      const flat = (sql: string) => sql.replace(/\s+/g, ' ')

      it('écrit le code classé sur le pain, l’enjeu et le signal — sous ses deux orthographes', async () => {
        const calls = await queries()
        const [pain, challenge, , signal] = calls.map(([sql]) => flat(sql))
        for (const [sql, alias] of [
          [pain, 'p'],
          [challenge, 'c'],
          [signal, 's'],
        ] as const) {
          expect(sql).toContain('primary_domain_code')
          expect(sql).toContain(`COALESCE(${alias}->>'domain_code', ${alias}->>'domainCode')`)
          // vocabulaire FERMÉ : un code hors liste n'est pas écrit, jamais « corrigé »
          expect(sql).toContain('= ANY($2::text[])')
        }
      })

      it('ne passe que les codes de pack classables — jamais « generic »', async () => {
        const calls = await queries()
        for (const index of [0, 1, 3, 5, 6, 7]) {
          expect(calls[index]?.[1]?.[1]).toEqual(SIGNAL_DOMAIN_CODES)
        }
        expect(SIGNAL_DOMAIN_CODES).not.toContain('generic')
      })

      it('programme et implication restent sans domaine : le modèle ne les classe pas', async () => {
        const calls = await queries()
        expect(flat(calls[2]?.[0] ?? '')).not.toContain('primary_domain_code')
        expect(flat(calls[4]?.[0] ?? '')).not.toContain('primary_domain_code')
      })

      it('rattrape les lignes DÉJÀ matérialisées, sans jamais écraser un domaine posé', async () => {
        const calls = await queries()
        const fills = calls.slice(5).map(([sql]) => flat(sql))
        expect(fills).toHaveLength(3)
        const kinds = ['pain', 'challenge', 'signal']
        fills.forEach((sql, i) => {
          expect(sql).toContain('UPDATE opportunities')
          expect(sql).toContain(`o.kind = '${kinds[i]}'`)
          // une correction humaine (ou un domaine déjà posé) gagne : on ne remplit que le NULL
          expect(sql).toContain('o.primary_domain_code IS NULL')
          expect(sql).toContain('o.account_id = $1')
        })
      })
    })

    it('never throws on a query error (best-effort)', async () => {
      repo.manager.query.mockRejectedValue(new Error('boom'))
      await expect(service.materialize('acc-1')).resolves.toBeUndefined()
    })

    /**
     * #3978 (rattrapage pains/enjeux, 11/10/2026) — LE SEUL GESTE QU'UN REJEU DE
     * RECHERCHE (« Actualiser », veille quotidienne, rattrapage ciblé du segment
     * `signals`) FAIT SUR LES PISTES : remplir le domaine là où il manque.
     *
     * Les pains et enjeux sont écrits par la PHASE 1 (`bellum_strategy` tourne
     * dans `phase1_research`, `applyResearch` les persiste et date
     * `signals_collected_at`) — jamais par le plan. Sans cette passe, le rejeu
     * reclassait `raw_analysis.pains[].domain_code` mais AUCUNE piste existante ne
     * le recevait : `materialize()` ne tourne qu'à la fin d'une analyse complète.
     */
    describe('fillClassifiedDomains — #3978, le domaine sur les pistes existantes', () => {
      const flat = (sql: string) => sql.replace(/\s+/g, ' ')

      it('trois UPDATE (pain, enjeu, signal), bornés au compte, au vocabulaire fermé, et au NULL', async () => {
        repo.manager.query.mockResolvedValue([])
        await service.fillClassifiedDomains('acc-1')
        const calls = repo.manager.query.mock.calls as Array<[string, unknown[]]>
        expect(calls).toHaveLength(3)
        const kinds = ['pain', 'challenge', 'signal']
        calls.forEach(([sql, params], i) => {
          const q = flat(sql)
          expect(q).toContain('UPDATE opportunities')
          expect(q).toContain(`o.kind = '${kinds[i]}'`)
          expect(q).toContain('o.account_id = $1')
          // Un domaine déjà posé (correction humaine OU analyse précédente) gagne toujours.
          expect(q).toContain('o.primary_domain_code IS NULL')
          expect(params).toEqual(['acc-1', SIGNAL_DOMAIN_CODES])
        })
      })

      it('sait dire NON : ne CRÉE aucune piste — jamais un INSERT, jamais une autre colonne', async () => {
        repo.manager.query.mockResolvedValue([])
        await service.fillClassifiedDomains('acc-1')
        for (const [sql] of repo.manager.query.mock.calls as Array<[string, unknown[]]>) {
          expect(sql).not.toMatch(/INSERT\s+INTO/i)
          expect(flat(sql)).toMatch(/SET primary_domain_code = d\.code (FROM|$)/)
        }
      })

      it('materialize() rattrape par CE même chemin — un seul endroit décide (GA-26)', async () => {
        repo.manager.query.mockResolvedValue([])
        await service.materialize('acc-1')
        const viaMaterialize = (repo.manager.query.mock.calls as Array<[string, unknown[]]>).slice(5)
        repo.manager.query.mockClear()
        await service.fillClassifiedDomains('acc-1')
        expect(repo.manager.query.mock.calls).toEqual(viaMaterialize)
      })

      it('ne lève jamais (best-effort) : un rejeu déjà persisté ne doit pas échouer pour ça', async () => {
        repo.manager.query.mockRejectedValue(new Error('boom'))
        await expect(service.fillClassifiedDomains('acc-1')).resolves.toBeUndefined()
      })
    })

    /**
     * 5ᵉ nature (§6). Ce qui compte ici : le signal entre dans le graphe SANS
     * devenir un besoin, en gardant sa vraie source, et sans confiance inventée.
     */
    it('projette le signal d’achat sous sa propre nature, source réelle conservée', async () => {
      repo.manager.query.mockResolvedValue([])

      await service.materialize('acc-1')

      const signalSql = (repo.manager.query.mock.calls.map(([sql]) => sql as string)[3] ?? '').replace(/\s+/g, ' ')
      expect(signalSql).toContain("jsonb_array_elements(COALESCE(a.recent_signals, '[]'::jsonb))")
      // Libellé lu sous ses quatre clés historiques (title/label/description/signal).
      for (const key of ['title', 'label', 'description', 'signal']) {
        expect(signalSql).toContain(`s->>'${key}'`)
      }
      // La source affichée reste celle du signal (« Les Échos »), pas le nom de la lane.
      expect(signalSql).toContain("NULLIF(btrim(s->>'source'), '')")
      // Sans source, pas de preuve : confiance basse — la règle de la Veille, pas une invention.
      expect(signalSql).toContain("CASE WHEN NULLIF(btrim(s->>'source'), '') IS NULL THEN 'low' ELSE 'medium' END")
    })

    /**
     * `source` est un TÉMOIN, jamais le nom de la voie de code.
     *
     * Mesuré le 28/08 : les cinq projections écrivaient dans `source` le nom de
     * leur propre lane — `'pain'`, `'challenge'`, `'program'`, `'implication'`,
     * et `'signal'` en repli quand le signal n'avait AUCUNE source. Sur quatre
     * voies sur cinq, une absence de source passait donc pour une source, et la
     * ligne revendiquait « un événement daté ET sourcé » sur une tautologie :
     * `source` ne disait rien de plus que la colonne `kind` juste à côté.
     *
     * Le barème n'est pas en cause ici — c'est la DONNÉE qui mentait, l'inverse
     * exact de D27. Une ligne sans témoin identifié laisse `source` à NULL, et
     * « fait » redevient vrai sans qu'on touche à sa définition.
     *
     * Pourquoi NULL et pas mieux : `painPointSchema`, `itChallengeSchema` et
     * `programNameSchema` (packages/contracts/src/schemas/analysis/research.ts)
     * ne portent AUCUN champ de source. Il n'y a rien à écrire — et inventer
     * serait pire que se taire.
     */
    it('n’écrit jamais le nom de la voie dans `source` — un témoin ou NULL', async () => {
      repo.manager.query.mockResolvedValue([])

      await service.materialize('acc-1')

      const sql = repo.manager.query.mock.calls.map(([q]) => (q as string).replace(/\s+/g, ' '))

      // 1) pain — aucun champ de source dans `painPointSchema` : NULL.
      expect(sql[0]).toContain("NULLIF(p->>'urgency', ''), NULL::text, 'high'")
      // 2) challenge — aucun champ de source dans `itChallengeSchema` : NULL.
      expect(sql[1]).toContain("NULLIF(c->>'esn_offer_match', ''), NULL::text, 'medium'")
      // 3) program — aucun champ de source dans `programNameSchema` : NULL.
      expect(sql[2]).toContain("NULLIF(pr->>'description', ''), NULL::text, 'medium'")
      // 4) signal — le SEUL payload qui porte une vraie source. On la garde, et
      //    le repli sur le nom de la voie disparaît : sans source, NULL.
      //    (`s->>'signal'` reste ailleurs : c'est une des quatre clés de LIBELLÉ.)
      expect(sql[3]).not.toContain("COALESCE(NULLIF(btrim(s->>'source'), ''), 'signal')")
      expect(sql[3]).toContain(
        "NULLIF(btrim(COALESCE(s->>'salesImplication', s->>'sales_implication')), ''), " +
          "NULLIF(btrim(s->>'source'), ''), CASE WHEN",
      )
      // 5) implication — une déduction n'a pas de témoin, par définition.
      expect(sql[4]).toContain("NULLIF(btrim(a.raw_analysis ->> 'it_implications_for_esn'), ''), NULL::text, 'low'")

      // La garde LIT quelque chose : cinq projections + trois rattrapages (#3978), non vides.
      expect(sql).toHaveLength(8)
      for (const query of sql) expect(query.length).toBeGreaterThan(100)

      // Et elle sait dire NON : voici le défaut, mot pour mot tel qu'il était
      // écrit le 28/08. Remettre l'une de ces cinq séquences fait retomber ce
      // test au rouge — c'est ce qui empêche de « restaurer » le nom de la lane.
      // (On ne peut pas se contenter de compter le littéral de la lane : `'pain'`
      // est AUSSI une clé JSON légitime, `p->>'pain'`.)
      const defectueux = [
        "NULLIF(p->>'urgency', ''), 'pain', 'high'",
        "NULLIF(c->>'esn_offer_match', ''), 'challenge', 'medium'",
        "NULLIF(pr->>'description', ''), 'program', 'medium'",
        "COALESCE(NULLIF(btrim(s->>'source'), ''), 'signal')",
        "NULLIF(btrim(a.raw_analysis ->> 'it_implications_for_esn'), ''), 'implication', 'low'",
      ]
      const tout = sql.join(' ')
      for (const bad of defectueux) expect(tout).not.toContain(bad)
    })
  })
})

/**
 * La décroissance de fraîcheur appliquée à la LECTURE (addendum final p47).
 *
 * Sans elle, un recrutement repéré en mars est encore annoncé « confiance
 * élevée » en septembre, et le commercial ouvre sa journée sur une urgence
 * périmée. Appliquée à la lecture et non en base : une confiance dégradée écrite
 * en dur empêcherait une réanalyse de la relever, et figerait l'erreur.
 */
describe('décroissance de la confiance', () => {
  function serviceWith(rows: unknown[]) {
    const repo = { manager: { query: jest.fn().mockResolvedValue(rows) } }
    return new ProjectsService(repo as never)
  }

  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()

  it('laisse intacte une confiance récente', async () => {
    const service = serviceWith([{ id: 'o1', confidence: 'high', first_detected_at: daysAgo(5) }])
    const [row] = await service.listForWorkspace('ws-1')
    expect(row.confidence).toBe('high')
  })

  it('déclasse une confiance élevée devenue ancienne', async () => {
    const service = serviceWith([{ id: 'o1', confidence: 'high', first_detected_at: daysAgo(120) }])
    const [row] = await service.listForWorkspace('ws-1')
    expect(row.confidence).toBe('medium')
  })

  it('ramène au plus bas une photo périmée', async () => {
    const service = serviceWith([{ id: 'o1', confidence: 'high', first_detected_at: daysAgo(400) }])
    const [row] = await service.listForWorkspace('ws-1')
    expect(row.confidence).toBe('low')
  })

  it('ne remonte JAMAIS une confiance avec le temps', async () => {
    // Une fonction qui pourrait l'augmenter en vieillissant serait un générateur
    // d'urgences.
    const service = serviceWith([{ id: 'o1', confidence: 'low', first_detected_at: daysAgo(2) }])
    const [row] = await service.listForWorkspace('ws-1')
    expect(row.confidence).toBe('low')
  })

  it('laisse passer une confiance non reconnue sans y toucher', async () => {
    // La colonne est du texte libre : une valeur d'une version future ne doit pas
    // être écrasée par une supposition.
    const service = serviceWith([{ id: 'o1', confidence: 'certaine', first_detected_at: daysAgo(400) }])
    const [row] = await service.listForWorkspace('ws-1')
    expect(row.confidence).toBe('certaine')
  })
})

/**
 * Le NIVEAU DE PREUVE appliqué à la LECTURE, sur la même ligne que la
 * décroissance de confiance (addendum final p42-46).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CES TESTS FIGENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le barème de preuve (`EVIDENCE_REQUIREMENTS`, `meetsEvidenceLevel`) existait,
 * était juste, testé — et n'avait AUCUN appelant. Pendant ce temps l'écran
 * Projets annonçait « 383 projets détectés à reprendre » pour un seul projet
 * réellement au pipe : des faits isolés comptés comme des projets. Le barème
 * existe précisément pour empêcher ça.
 *
 * Calculé à la LECTURE, comme la confiance : un niveau écrit en base
 * empêcherait une qualification de le relever, et figerait l'erreur.
 */
describe('niveau de preuve rendu avec la ligne', () => {
  function serviceWith(rows: unknown[]) {
    const repo = { manager: { query: jest.fn().mockResolvedValue(rows) } }
    return new ProjectsService(repo as never)
  }

  const recently = new Date(Date.now() - 3 * 86_400_000).toISOString()

  it('un signal isolé est un FAIT, et dit ce qui lui manque pour être un projet', async () => {
    const service = serviceWith([
      { id: 'o1', kind: 'signal', stage: 'detected', source: 'Les Échos', first_detected_at: recently },
    ])
    const [row] = await service.listForWorkspace('ws-1')
    expect(row.evidence.level).toBe('fact')
    // D27 · 26/08 : le barème d'un projet détecté n'exige plus « deux faits
    // datés qui convergent » — inatteignable, une ligne `opportunities` n'en
    // porte qu'un. Ce qui manque à ce signal se NOMME donc autrement : ce
    // n'est plus un second fait, c'est ce qui le rattacherait à un chantier.
    expect(row.evidence.missing).toEqual(['unattached_fact'])
  })

  it('une implication n’est pas un fait : le niveau est ABSENT, jamais « 0 »', async () => {
    const service = serviceWith([
      { id: 'o1', kind: 'implication', stage: 'detected', source: 'implication', first_detected_at: recently },
    ])
    const [row] = await service.listForWorkspace('ws-1')
    expect(row.evidence.level).toBeNull()
    expect(row.evidence.missing).toEqual(['no_dated_fact'])
  })

  it('un projet mis dans le pipe par un humain est une demande exprimée', async () => {
    const service = serviceWith([
      { id: 'o1', kind: 'signal', stage: 'confirmed', source: 'Les Échos', first_detected_at: recently },
    ])
    const [row] = await service.listForWorkspace('ws-1')
    expect(row.evidence.level).toBe('confirmed_demand')
    expect(row.evidence.missing).toEqual([])
  })

  it('le niveau voyage avec la confiance décotée, pas à sa place', async () => {
    // Les deux dérivations vivent sur la même ligne et se composent : perdre
    // l'une en branchant l'autre est exactement le défaut qu'on corrige.
    const stale = new Date(Date.now() - 400 * 86_400_000).toISOString()
    const service = serviceWith([
      { id: 'o1', kind: 'signal', stage: 'detected', source: 'BODACC', confidence: 'high', first_detected_at: stale },
    ])
    const [row] = await service.listForWorkspace('ws-1')
    expect(row.confidence).toBe('low')
    expect(row.evidence.level).toBe('fact')
  })

  it('rend le niveau pour CHAQUE ligne — jamais seulement la première', async () => {
    const service = serviceWith([
      { id: 'o1', kind: 'signal', stage: 'detected', source: 'Les Échos', first_detected_at: recently },
      { id: 'o2', kind: 'implication', stage: 'detected', source: 'implication', first_detected_at: recently },
      { id: 'o3', kind: 'pain', stage: 'negotiation', source: 'pain', first_detected_at: recently },
    ])
    const rows = await service.listForWorkspace('ws-1')
    expect(rows).toHaveLength(3)
    expect(rows.map(row => row.evidence.level)).toEqual(['fact', null, 'confirmed_demand'])
  })
})

/**
 * #2170.3 (tranché sans Louis) — L'AFFINAGE « profils recherchés/préparés/
 * entretien » sur la CARTE, sans rouvrir `PIPELINE_STAGES` (GA-08).
 *
 * L'épopée #2949 demandait un sixième stade de pipe ; la doctrine
 * `c56_etapes_du_pipe` le refuse. `opportunityStageDetail` (@bellum/contracts)
 * répond déjà à ce besoin ailleurs (`ProjectPipelineService.health`) — ces
 * tests tiennent le CHEMIN qui manquait : `most_advanced_need_status` (la
 * projection SQL interne) jusqu'à `stage_detail` sur `ProjectReadRow`, et sa
 * disparition du wire (ce n'est pas un champ du contrat de carte).
 */
describe('stage_detail rendu avec la ligne (#2170.3)', () => {
  function serviceWith(rows: unknown[]) {
    const repo = { manager: { query: jest.fn().mockResolvedValue(rows) } }
    return new ProjectsService(repo as never)
  }

  it('traduit le besoin le plus avancé en affinage lisible, sur une étape qui le porte', async () => {
    const service = serviceWith([
      { id: 'o1', kind: 'signal', stage: 'confirmed', source: 'x', most_advanced_need_status: 'matching' },
    ])
    const [row] = await service.listForWorkspace('ws-1')
    expect(row.stage_detail).toBe('profiles_wanted')
  })

  it('rend `null` — jamais deviné — sur une étape qui ne porte pas l’affinage', async () => {
    const service = serviceWith([
      { id: 'o1', kind: 'signal', stage: 'negotiation', source: 'x', most_advanced_need_status: 'matching' },
    ])
    const [row] = await service.listForWorkspace('ws-1')
    expect(row.stage_detail).toBeNull()
  })

  it('rend `null` — jamais deviné — quand aucun besoin n’est rattaché', async () => {
    const service = serviceWith([
      { id: 'o1', kind: 'signal', stage: 'confirmed', source: 'x', most_advanced_need_status: null },
    ])
    const [row] = await service.listForWorkspace('ws-1')
    expect(row.stage_detail).toBeNull()
  })

  it('ne renvoie JAMAIS `most_advanced_need_status` — projection interne, pas un champ du contrat', async () => {
    const service = serviceWith([
      { id: 'o1', kind: 'signal', stage: 'confirmed', source: 'x', most_advanced_need_status: 'client_review' },
    ])
    const [row] = await service.listForWorkspace('ws-1')
    expect(row.stage_detail).toBe('interview')
    expect(row).not.toHaveProperty('most_advanced_need_status')
  })
})
