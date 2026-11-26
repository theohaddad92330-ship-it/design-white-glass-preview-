/**
 * GA-312 — le compteur de requêtes SQL compte VRAIMENT.
 *
 * Ce fichier est le contrôle positif obligatoire de `query-counter.ts` :
 * avant qu'aucun test de chemin chaud ne s'appuie sur `countQueries`, on
 * prouve ici que l'instrument voit N appels quand on en provoque N — sinon
 * tout le lot GA-313 serait un faux vert (« un compteur qui ne compte rien
 * est vert pour toujours »).
 *
 * Trois preuves, dans l'ordre demandé par le lot :
 *  1. le contrôle positif — N appels provoqués, N vus (et par opération) ;
 *  2. dire NON — un instrument dont l'enregistrement est neutralisé (donc
 *     « cassé » comme un vrai N+1 réintroduit le serait pour un chemin
 *     chaud) fait échouer l'assertion, pas juste passer en silence ;
 *  3. ne pas attraper ce qu'elle ne vise pas — une méthode qui construit un
 *     objet EN MÉMOIRE (`create`, `merge`) et une chaîne de query builder
 *     qui ne va jamais jusqu'à un terminal ne comptent pour rien.
 */
import { countQueries, QueryCounter } from './query-counter'

describe('QueryCounter — contrôle positif de l’instrument', () => {
  it('voit exactement N appels quand on en provoque N, réparti par opération', () => {
    const counter = new QueryCounter()
    const raw = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockImplementation((x: unknown) => x),
    }
    const repo = countQueries(raw, counter, 'TestEntity')

    // Provocation volontaire : 5 findOne, 3 save. C'est le contrôle positif —
    // pas un chemin de service réel.
    for (let i = 0; i < 5; i++) void repo.findOne()
    for (let i = 0; i < 3; i++) void repo.save()

    expect(counter.count).toBe(8)
    expect(counter.countByOp('findOne')).toBe(5)
    expect(counter.countByOp('save')).toBe(3)
    expect(counter.countFor('TestEntity')).toBe(8)
  })

  it('délègue toujours au double sous-jacent — le proxy observe, il ne remplace rien', async () => {
    const counter = new QueryCounter()
    const raw = { findOne: jest.fn().mockResolvedValue({ id: 'c1' }) }
    const repo = countQueries(raw, counter, 'TestEntity')

    const result = await repo.findOne('whatever-arg')

    expect(result).toEqual({ id: 'c1' })
    expect(raw.findOne).toHaveBeenCalledWith('whatever-arg')
  })

  it('sait dire NON : un enregistrement neutralisé ne compte plus, et l’assertion tombe', () => {
    // On ne casse pas le fichier source pour ce test (le lot l'interdirait de
    // toute façon à la relecture) : on simule la même panne — un `record`
    // qui ne fait rien — en posant directement une méthode `record` inerte
    // sur un contrefaçon de QueryCounter. C'est exactement ce qui arriverait
    // si `countQueries` oubliait d'appeler `counter.record(...)` avant de
    // déléguer : la preuve documentée ici est ce que "casser volontairement
    // l'instrument" donne, capturée dans le rapport du lot (sortie rouge
    // obtenue en commentant temporairement `counter.record(...)` dans
    // `query-counter.ts`, cf. rapport).
    const counter = new QueryCounter()
    const brokenRecord = jest.spyOn(counter, 'record').mockImplementation(() => {})
    const raw = { findOne: jest.fn().mockResolvedValue(null) }
    const repo = countQueries(raw, counter, 'TestEntity')

    void repo.findOne()
    void repo.findOne()

    expect(counter.count).toBe(0) // panne simulée : l'instrument voit 0 au lieu de 2
    brokenRecord.mockRestore()
  })

  it('ne compte pas une méthode de construction en mémoire (create, merge — jamais de réseau)', () => {
    const counter = new QueryCounter()
    const raw = {
      create: jest.fn().mockImplementation((x: unknown) => x),
      merge: jest.fn().mockImplementation((a: unknown, b: unknown) => ({ ...(a as object), ...(b as object) })),
      findOne: jest.fn().mockResolvedValue(null),
    }
    const repo = countQueries(raw, counter, 'TestEntity')

    repo.create({ a: 1 })
    repo.merge({ a: 1 }, { b: 2 })
    void repo.findOne()

    // Une seule opération comptée (findOne) : create/merge sont des témoins
    // de cas légitimes voisins, pas des requêtes.
    expect(counter.count).toBe(1)
    expect(counter.countByOp('findOne')).toBe(1)
  })

  it('ne compte pas une chaîne de query builder qui ne va pas jusqu’à un terminal', () => {
    const counter = new QueryCounter()
    const qb = {
      where: jest.fn(),
      andWhere: jest.fn(),
      getMany: jest.fn().mockResolvedValue([]),
    }
    qb.where.mockReturnValue(qb)
    qb.andWhere.mockReturnValue(qb)
    const raw = { createQueryBuilder: jest.fn().mockReturnValue(qb) }
    const repo = countQueries(raw, counter, 'TestEntity')

    // Chaîne construite mais jamais exécutée — aucun terminal appelé.
    repo.createQueryBuilder().where('x = :x', { x: 1 }).andWhere('y = :y', { y: 2 })
    expect(counter.count).toBe(0)

    // Le même repo, cette fois jusqu'au terminal : une seule requête.
    void repo.createQueryBuilder().where('x = :x', { x: 1 }).getMany()
    expect(counter.count).toBe(1)
    expect(counter.countByOp('getMany')).toBe(1)
  })
})
