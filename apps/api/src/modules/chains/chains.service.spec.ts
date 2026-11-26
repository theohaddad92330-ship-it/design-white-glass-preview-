import { ChainsService } from './chains.service'

/**
 * CE QUE LE SERVICE GARANTIT, et que les projecteurs ne garantissent pas seuls.
 *
 * Trois choses, toutes issues de #1503 : un dossier qu'on ne sait pas placer est
 * COMPTÉ et NOMMÉ plutôt que rangé à l'étape 1 ; les blocages se regroupent par
 * étape parce que c'est ce qui les rend actionnables ; et **on ne peut pas
 * cocher une position du flux dérivé** — ce serait recréer la seconde vérité que
 * ce chantier supprime.
 */
describe('ChainsService — parcours dérivés', () => {
  const DAY = 86_400_000

  /** Les lignes que les projecteurs recevront, chaîne par chaîne. */
  type Rows = Record<string, Record<string, unknown>[]>

  const build = (rows: Rows = {}) => {
    const query = jest.fn().mockImplementation((sql: string) => {
      // Chaque projecteur nomme sa table de départ : c'est ce qui permet de
      // rendre des lignes différentes selon la chaîne interrogée, sans deviner.
      if (sql.includes('FROM project_needs')) return Promise.resolve(rows.needs ?? [])
      if (sql.includes('FROM missions')) return Promise.resolve(rows.missions ?? [])
      if (sql.includes('FROM opportunities')) return Promise.resolve(rows.projects ?? [])
      if (sql.includes('FROM consultants')) return Promise.resolve(rows.consultants ?? [])
      if (sql.includes('FROM accounts')) return Promise.resolve(rows.accounts ?? [])
      return Promise.resolve([])
    })
    const marks = {
      find: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      manager: { query },
    }
    return { service: new ChainsService(marks as never), marks, query }
  }

  const need = (over: Record<string, unknown> = {}) => ({
    id: 'n-1',
    label: 'Data engineer',
    moved_at: new Date().toISOString(),
    opened_at: new Date().toISOString(),
    status: 'to_match',
    staffable: 'yes',
    staffable_reason: null,
    skill_count: 3,
    match_count: 0,
    ...over,
  })

  it('place un besoin sur le fait le plus AVANCÉ, pas sur son statut', async () => {
    // Le statut traîne souvent derrière la réalité. Deux profils partis chez le
    // client font un dossier « profil positionné », quel que soit le libellé de
    // la colonne `status`.
    const { service } = build({
      needs: [
        need({
          status: 'to_match',
          match_count: 1,
          match_at: new Date().toISOString(),
          sent_count: 2,
          sent_at: new Date().toISOString(),
          submission_count: 2,
          retained_at: new Date().toISOString(),
          dossier_count: 2,
        }),
      ],
    })
    const lanes = await service.board('w-1')
    const sourcing = lanes.find(lane => lane.chain.key === 'sourcing_matching')
    expect(sourcing?.positions.find(position => position.position === 7)?.count).toBe(1)
    expect(sourcing?.total).toBe(1)
  })

  it('un besoin dont personne n’a tranché la staffabilité ATTEND devant sa porte', async () => {
    const { service } = build({ needs: [need({ staffable: 'unknown', skill_count: 2, status: 'qualified' })] })
    const lanes = await service.board('w-1')
    const sourcing = lanes.find(lane => lane.chain.key === 'sourcing_matching')
    expect(sourcing?.awaitingDecision).toBe(1)
    expect(sourcing?.gates.find(gate => gate.afterPosition === 2)?.waiting).toBe(1)
  })

  it('un dossier qu’on ne sait pas placer est COMPTÉ et NOMMÉ, jamais rangé à l’étape 1', async () => {
    // C'est le garde-fou du §6 de #1507 : « si Bellum ne sait pas, il le dit ».
    // Le ranger à l'étape 1 remplirait la première colonne de dossiers dont
    // personne ne sait rien — un compteur juste sur un filtre faux.
    const { service } = build({ needs: [need({ status: 'inconnu_de_2019', skill_count: 0, opened_at: null })] })
    const lanes = await service.board('w-1')
    const sourcing = lanes.find(lane => lane.chain.key === 'sourcing_matching')
    expect(sourcing?.positions.find(position => position.position === 1)?.count).toBe(0)
    expect(sourcing?.undetermined).toEqual([{ reason: 'unmapped_status', count: 1 }])
  })

  it('« aucun dossier ici » n’est PAS « zéro jour d’attente »', async () => {
    const { service } = build({ needs: [need()] })
    const lanes = await service.board('w-1')
    const sourcing = lanes.find(lane => lane.chain.key === 'sourcing_matching')
    const empty = sourcing?.positions.find(position => position.count === 0)
    expect(empty?.medianDaysAtPosition).toBeNull()
  })

  it('regroupe les blocages par étape — « 2 besoins » plutôt que deux lignes', async () => {
    const old = new Date(Date.now() - 12 * DAY).toISOString()
    const { service } = build({
      needs: [
        need({ id: 'n-1', label: 'Data', staffable: 'unknown', moved_at: old, status: 'qualified' }),
        need({ id: 'n-2', label: 'Cloud', staffable: 'unknown', moved_at: old, status: 'qualified' }),
      ],
    })
    const blockers = await service.blockers('w-1')
    const sourcing = blockers.find(entry => entry.chainKey === 'sourcing_matching')
    expect(sourcing?.count).toBe(2)
    expect(sourcing?.gate).toBe('need_staffable')
    expect(sourcing?.oldestDays).toBeGreaterThanOrEqual(11)
    expect(sourcing?.sample.map(entry => entry.label)).toEqual(['Data', 'Cloud'])
  })

  it('un dossier qui avance normalement N’EST PAS un blocage', async () => {
    // Sans cette borne, « Aujourd'hui » annoncerait un blocage sur chaque
    // dossier vivant — et personne ne lirait plus le bloc.
    const { service } = build({ needs: [need({ moved_at: new Date().toISOString() })] })
    expect(await service.blockers('w-1')).toEqual([])
  })

  /**
   * LOT 15, ARBITRAGE A — « MES dossiers » doit vraiment être les miens.
   *
   * `get_chain_blockers` promet au modèle « où est-ce que MES dossiers
   * bloquent » ; sans `scope`, `blockers()` agrège tout l'espace. Ces trois
   * tests prouvent le FILTRAGE réel — pas seulement qu'un paramètre est reçu.
   */
  describe('le cloisonnement de portefeuille (D5) — un scope non nul ne garde QUE ce que je porte', () => {
    /**
     * Un mock à part : celui de `build()` répond à la même chose quel que soit
     * le paramètre, donc il ne peut pas distinguer « tous les besoins de
     * l'espace » de « les besoins que je porte ». Ici, la requête de
     * PORTEFEUILLE (`chains.service.ts` → `OWNER_SUBJECT_SQL.need`) se
     * reconnaît à `owner_id` dans son SQL — une colonne que la requête du
     * PROJECTEUR (`chain-projectors.ts` → `sourcingMatching`) ne lit jamais.
     */
    const buildWithOwnership = (allNeeds: Record<string, unknown>[], ownedIds: string[]) => {
      const query = jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('owner_id') && sql.includes('FROM project_needs')) {
          return Promise.resolve(ownedIds.map(id => ({ id })))
        }
        if (sql.includes('FROM project_needs')) return Promise.resolve(allNeeds)
        return Promise.resolve([])
      })
      const marks = {
        find: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue(undefined),
        manager: { query },
      }
      return { service: new ChainsService(marks as never), query }
    }

    const old = new Date(Date.now() - 12 * DAY).toISOString()
    const needs = [
      need({ id: 'n-mine', label: 'Data (moi)', staffable: 'unknown', moved_at: old, status: 'qualified' }),
      need({ id: 'n-colleague', label: 'Cloud (collègue)', staffable: 'unknown', moved_at: old, status: 'qualified' }),
    ]

    it('SANS scope (défaut) : les deux dossiers ressortent — comportement d’aujourd’hui, inchangé', async () => {
      const { service } = buildWithOwnership(needs, ['n-mine'])
      const blockers = await service.blockers('w-1')
      const sourcing = blockers.find(entry => entry.chainKey === 'sourcing_matching')
      expect(sourcing?.count).toBe(2)
    })

    it('AVEC scope : un blocage appartenant à un AUTRE utilisateur ne ressort PAS', async () => {
      const { service, query } = buildWithOwnership(needs, ['n-mine'])
      const blockers = await service.blockers('w-1', undefined, { ownerId: 'user-1', includeUnassigned: false })
      const sourcing = blockers.find(entry => entry.chainKey === 'sourcing_matching')
      // LIT vraiment quelque chose : un seul dossier, et c'est LE MIEN — pas
      // juste « la méthode a été appelée ».
      expect(sourcing?.count).toBe(1)
      expect(sourcing?.sample.map(entry => entry.label)).toEqual(['Data (moi)'])
      // La requête de portefeuille a bien été posée avec MON identifiant.
      expect(query).toHaveBeenCalledWith(expect.stringContaining('owner_id'), ['w-1', 'user-1', false])
    })

    it('AVEC scope mais AUCUN dossier à moi : la case se vide, elle ne garde pas tout l’espace', async () => {
      const { service } = buildWithOwnership(needs, [])
      const blockers = await service.blockers('w-1', undefined, { ownerId: 'user-2', includeUnassigned: false })
      const sourcing = blockers.find(entry => entry.chainKey === 'sourcing_matching')
      expect(sourcing).toBeUndefined()
    })
  })

  it('REFUSE de cocher une position du flux dérivé', async () => {
    // La porte est ici, pas dans l'écran : cocher l'étape 3 de « sourcing »
    // recréerait exactement la position écrite à la main que ce chantier
    // supprime, à côté de celle que les objets disent.
    const { service, marks } = build()
    await expect(service.toggleManualMark('w-1', 'u-1', 'onboarding_delivery', 's-1', 5, true)).rejects.toThrow(
      /hors outil/,
    )
    expect(marks.manager.query).not.toHaveBeenCalled()
  })

  it('accepte un geste RÉELLEMENT hors outil', async () => {
    const { service, marks } = build()
    const result = await service.toggleManualMark('w-1', 'u-1', 'onboarding_delivery', 's-1', 11, true)
    expect(result).toEqual({ position: 11, marked: true })
    const [sql] = marks.manager.query.mock.calls[0] as [string]
    expect(sql).toContain('INSERT INTO chain_manual_marks')
  })

  it('décocher SUPPRIME la marque plutôt que d’écrire un « non »', async () => {
    // Une marque absente et une marque « fausse » se compteraient différemment
    // dans la checklist ; une seule des deux est vraie.
    const { service, marks } = build()
    await service.toggleManualMark('w-1', 'u-1', 'onboarding_delivery', 's-1', 11, false)
    expect(marks.delete).toHaveBeenCalledWith(
      expect.objectContaining({ chain_key: 'onboarding_delivery', position: 11 }),
    )
  })
})
