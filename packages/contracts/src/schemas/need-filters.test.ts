import { describe, expect, it } from 'vitest'
import {
  NEED_FILTERS_UNAVAILABLE,
  NEED_FILTER_KEYS,
  activeNeedFilterCount,
  emptyNeedFilters,
  needFiltersToQuery,
  type NeedFilters,
} from './need-filters.js'
import { openNeedsQuerySchema } from './open-needs.js'

describe('needFiltersToQuery', () => {
  it("n'envoie AUCUN critère quand rien n'est choisi — sinon la liste complète devient un filtre", () => {
    const query = needFiltersToQuery(emptyNeedFilters(), { offset: 0, limit: 50 })
    expect(Object.keys(query).sort()).toEqual(['limit', 'offset'])
  })

  it('omet une chaîne vide ou blanche plutôt que de la transmettre', () => {
    // `?skill=` remonterait au serveur comme un critère, et un `WHERE skill = ''`
    // vide la liste sans que rien à l'écran ne dise pourquoi.
    const query = needFiltersToQuery({ ...emptyNeedFilters(), skill: '   ', location: '' }, { offset: 0, limit: 50 })
    expect(query.skill).toBeUndefined()
    expect(query.location).toBeUndefined()
  })

  it('omet un booléen à FAUX — « sans shortlist : non » n’est pas un critère', () => {
    const query = needFiltersToQuery(
      { ...emptyNeedFilters(), without_shortlist: false, deadline_passed: false, include_closed: false },
      { offset: 0, limit: 50 },
    )
    expect(query.without_shortlist).toBeUndefined()
    expect(query.deadline_passed).toBeUndefined()
    expect(query.include_closed).toBeUndefined()
  })

  it('produit une requête que le schéma serveur ACCEPTE, tous critères posés', () => {
    // La garantie qui compte : l'écran ne peut pas composer une requête que le
    // serveur refuserait. `.strict()` côté serveur ferait tomber un champ inventé.
    const full: NeedFilters = {
      q: 'java',
      account_id: '3f1c9d5e-9f5a-4c3e-8d21-0b4a7e6c1234',
      skill: 'Java',
      seniority: 'senior',
      location: 'Toulouse',
      urgency: 'haute',
      status: 'to_match',
      contract_kind: 'regie',
      source: 'job_posting',
      starting_within_days: 30,
      without_shortlist: true,
      deadline_passed: true,
      include_closed: true,
      with_interview: true,
      ready_to_close: true,
      closed_lost_or_cancelled: true,
    }
    const query = needFiltersToQuery(full, { offset: 100, limit: 50 })
    expect(() => openNeedsQuerySchema.parse(query)).not.toThrow()
    expect(query.offset).toBe(100)
  })

  it("transmet l'origine du besoin, et l'omet quand elle n'est pas choisie", () => {
    // `source` est la colonne que le serveur RENDAIT déjà sur chaque ligne sans
    // qu'aucun critère ne permette de s'en servir : « montre-moi seulement ce
    // qui vient d'un e-mail client » n'avait pas de réponse.
    const chosen = needFiltersToQuery({ ...emptyNeedFilters(), source: 'client_email' }, { offset: 0, limit: 50 })
    expect(chosen.source).toBe('client_email')
    expect(needFiltersToQuery(emptyNeedFilters(), { offset: 0, limit: 50 }).source).toBeUndefined()
  })

  it('refuse une fenêtre de démarrage hors bornes plutôt que de la tronquer en silence', () => {
    // Le serveur borne à 1..365. Envoyer 0 ou 900 ferait un 400 sur un écran de
    // liste, c'est-à-dire un tableau vide sans explication.
    const low = needFiltersToQuery({ ...emptyNeedFilters(), starting_within_days: 0 }, { offset: 0, limit: 50 })
    const high = needFiltersToQuery({ ...emptyNeedFilters(), starting_within_days: 900 }, { offset: 0, limit: 50 })
    expect(low.starting_within_days).toBeUndefined()
    expect(high.starting_within_days).toBeUndefined()
  })
})

describe('Théo C projects-besoins.R3 — filtre par statut affiché', () => {
  it('transmet theo_status et le serveur l’accepte', () => {
    const query = needFiltersToQuery({ ...emptyNeedFilters(), theo_status: 'covered' }, { offset: 0, limit: 50 })
    expect(query.theo_status).toBe('covered')
    expect(openNeedsQuerySchema.safeParse(query).success).toBe(true)
  })
  it('le filtre « périmé » est transmis, et omis à faux', () => {
    expect(needFiltersToQuery({ ...emptyNeedFilters(), stale: true }, { offset: 0, limit: 5 }).stale).toBe(true)
    expect(needFiltersToQuery(emptyNeedFilters(), { offset: 0, limit: 5 }).stale).toBeUndefined()
  })
  it('SAIT DIRE NON : un statut hors des trois est refusé par le schéma', () => {
    expect(openNeedsQuerySchema.safeParse({ theo_status: 'matching' }).success).toBe(false)
  })
})

describe('activeNeedFilterCount', () => {
  it('compte zéro sur un filtre vide', () => {
    expect(activeNeedFilterCount(emptyNeedFilters())).toBe(0)
  })

  it('compte ce qui est RÉELLEMENT posé, pas ce qui est déclaré', () => {
    expect(
      activeNeedFilterCount({
        ...emptyNeedFilters(),
        skill: 'Java',
        without_shortlist: true,
        location: '  ',
        include_closed: false,
      }),
    ).toBe(2)
  })
})

describe('ce que le serveur ne sait PAS filtrer', () => {
  it('est NOMMÉ, pas passé sous silence', () => {
    // La source (PDF-03 §1.3) demande un tiroir qui filtre aussi sur le tarif,
    // la durée, les langues, les habilitations, l'origine, le canal et le
    // propriétaire. Le serveur n'en expose aucun. Livrer les contrôles quand
    // même produirait des cases qui ne filtrent rien — la version « tiroir » du
    // « bouton qui ne fait rien » que cet écran s'est déjà interdit.
    expect(NEED_FILTERS_UNAVAILABLE.length).toBeGreaterThan(0)
    for (const entry of NEED_FILTERS_UNAVAILABLE) {
      expect(entry.reason.trim().length).toBeGreaterThan(0)
    }
  })

  it("ne nomme jamais un filtre que le serveur expose — ce serait s'excuser d'un travail fait", () => {
    const exposed = new Set<string>(NEED_FILTER_KEYS)
    for (const entry of NEED_FILTERS_UNAVAILABLE) {
      expect(exposed.has(entry.key)).toBe(false)
    }
  })

  /**
   * Les clés de la requête qui ne sont PAS des critères de la liste.
   *
   * `offset` et `limit` sont la pagination : elles disent COMBIEN on lit, pas
   * QUOI. `id` est l'identité — la lecture qui porte la FICHE d'un besoin
   * (`useOpenNeed`, `/projects/needs/:needId`), et non un filtre du tableau.
   *
   * ⚠️ Une exception nommée, et pas un assouplissement : la liste ci-dessous
   * est FERMÉE et vérifiée ligne à ligne juste en dessous. Sans ça, elle
   * deviendrait le tiroir où l'on range les clés qu'on n'a pas envie de
   * brancher — c'est-à-dire l'inverse de ce que cette garde existe pour
   * obtenir. Poser un contrôle « identifiant du besoin » dans le tiroir de
   * filtres n'aurait aucun sens : personne ne cherche un besoin en tapant son
   * UUID, il s'atteint en cliquant sur sa ligne.
   */
  const NOT_A_LIST_CRITERION = ['offset', 'limit', 'id'] as const

  it('couvre TOUTES les clés du serveur, sans en inventer une de plus', () => {
    // Le contrat serveur est la référence. Une clé ajoutée là-bas et oubliée
    // ici, c'est un filtre livré que l'écran n'atteindra jamais.
    const server = Object.keys(openNeedsQuerySchema.shape).filter(
      key => !(NOT_A_LIST_CRITERION as readonly string[]).includes(key),
    )
    expect([...NEED_FILTER_KEYS].sort()).toEqual(server.sort())
  })

  it('les trois clés hors-critère EXISTENT — une exception sur une clé disparue ne garde rien', () => {
    // Le faux zéro silencieux, version liste d'exceptions : si `id` était
    // renommé côté serveur, l'exception continuerait d'exister et couvrirait
    // pour toujours une clé qui n'est plus là — pendant que la vraie clé
    // neuve, elle, échapperait à la garde.
    const shape = Object.keys(openNeedsQuerySchema.shape)
    for (const key of NOT_A_LIST_CRITERION) expect(shape).toContain(key)
  })
})
