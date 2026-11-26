/**
 * GA-313 — le compte de requêtes de `reconcileAccount` ne dérive pas SANS
 * qu'on le sache.
 *
 * Chemin chaud n°3 : `AccountEntitiesService.reconcileAccount`. Contrairement
 * aux deux premiers chemins (`sendEmailBulk`, corrigé ; `assignMany`, déjà
 * fixe), celui-ci avait un VRAI coût qui suivait N. #3473 (06/10/2026) le
 * corrige : les orphelins d'une même division s'écrivent en une requête. Le
 * cliquet FIGE : `1 (contacts.find) + 1 (entities.find) + D (contacts.update,
 * un par DIVISION touchée)` ; avec un libellé distinct par contact, D = N.
 *
 * Isolé pour ne mesurer QUE la boucle de rattachement : chaque orphelin porte
 * un libellé qui correspond déjà à une entité EXISTANTE (`missing.size ===
 * 0`), donc ni `entities.save` (création en lot) ni `ensureDefaultEntity`
 * n'entrent dans le compte — un test existant
 * (`account-entities.service.spec.ts`, « réconcilie : crée les divisions… »)
 * couvre déjà ce cas-là avec `toHaveBeenCalledTimes(3)` sur `contacts.update`
 * ; celui-ci l'étend à N=30 et le fige en formule.
 *
 * Le rôle du cliquet : empêcher le compte de DOUBLER sans qu'on le remarque
 * (par exemple deux `update` par orphelin au lieu d'un).
 */
import { AccountEntitiesService } from './account-entities.service'
import { AccountEntityRow } from '../../database/entities/account-entity.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { SiteEntity } from '../../database/entities/site.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { countQueries, QueryCounter } from '../../database/query-counter'

describe('AccountEntitiesService.reconcileAccount — cliquet de compte de requêtes (GA-313)', () => {
  let entities: MockRepository<AccountEntityRow>
  let sites: MockRepository<SiteEntity>
  let contacts: MockRepository<ContactEntity>
  let counter: QueryCounter
  let service: AccountEntitiesService

  const build = () => {
    entities = createMockRepository<AccountEntityRow>()
    sites = createMockRepository<SiteEntity>()
    contacts = createMockRepository<ContactEntity>()
    counter = new QueryCounter()
    service = new AccountEntitiesService(
      countQueries(entities, counter, 'AccountEntityRow') as never,
      countQueries(sites, counter, 'SiteEntity') as never,
      countQueries(contacts, counter, 'ContactEntity') as never,
    )
  }

  /**
   * N contacts orphelins, chacun avec un libellé qui matche DÉJÀ une entité
   * existante (même chaîne des deux côtés) — isole la boucle de rattachement
   * du reste (aucune création, aucun périmètre par défaut à poser).
   */
  const seedOrphans = (n: number) => {
    const labels = Array.from({ length: n }, (_, i) => `Div-${i}`)
    const existing = labels.map((name, i) => ({ id: `e-${i}`, name, is_default: false }) as AccountEntityRow)
    const orphans = labels.map(
      (label, i) => ({ id: `c-${i}`, entity: label, entity_id: null }) as unknown as ContactEntity,
    )
    contacts.find.mockResolvedValueOnce(orphans)
    entities.find.mockResolvedValueOnce(existing)
    return { labels }
  }

  it.each([3, 30])(
    'à N=%i : contacts.find=1, entities.find=1, contacts.update=N — aucune création (libellés déjà connus)',
    async n => {
      build()
      seedOrphans(n)

      await service.reconcileAccount('w-1', 'a-1')

      expect(counter.countByOp('find')).toBe(2) // 1 contacts.find + 1 entities.find
      expect(counter.countByOp('update')).toBe(n) // un rattachement par orphelin
      expect(counter.countFor('AccountEntityRow')).toBe(1) // find seulement — pas de save (rien à créer)
      expect(counter.countFor('ContactEntity')).toBe(1 + n) // find + N update
      expect(counter.count).toBe(2 + n)
    },
  )

  // #3473 — la lecture de l'onglet Accès réconcilie AVANT de rendre (X26) : sur
  // un compte à plusieurs centaines de contacts, un UPDATE par contact faisait
  // attendre l'écran (« Chargement… » 8 à 15 s en recette). Les orphelins d'une
  // MÊME division s'écrivent maintenant en une seule requête.
  it.each([
    [30, 3],
    [300, 3],
  ])(
    '#3473 — N=%i orphelins répartis sur %i divisions : un UPDATE par division, pas par contact',
    async (n, divisions) => {
      build()
      const existing = Array.from({ length: divisions }, (_, i) => ({
        id: `e-${i}`,
        name: `Div-${i}`,
        is_default: false,
      }))
      contacts.find.mockResolvedValueOnce(
        Array.from({ length: n }, (_, i) => ({
          id: `c-${i}`,
          entity: `Div-${i % divisions}`,
          entity_id: null,
        })) as never,
      )
      entities.find.mockResolvedValueOnce(existing as never)

      await service.reconcileAccount('w-1', 'a-1')

      expect(counter.countByOp('update')).toBe(divisions)
      // Chaque contact reçoit bien son entité : aucun orphelin oublié.
      const written = contacts.update.mock.calls.flatMap(([where]) => {
        const ids = (where as { id: { _value: string[] } }).id._value
        return ids
      })
      expect(new Set(written).size).toBe(n)
    },
  )

  it('sait dire NON : deux écritures par orphelin (régression simulée) double le compte figé', async () => {
    build()
    const { labels } = seedOrphans(3)
    contacts.find.mockResolvedValueOnce(
      labels.map((label, i) => ({ id: `c-${i}`, entity: label, entity_id: null }) as unknown as ContactEntity),
    )
    entities.find.mockResolvedValueOnce(
      labels.map((name, i) => ({ id: `e-${i}`, name, is_default: false }) as AccountEntityRow),
    )

    await service.reconcileAccount('w-1', 'a-1')
    // Régression simulée SANS toucher au fichier de production (hors
    // périmètre pour ce service) : une seconde écriture par orphelin, comme
    // le ferait un correctif malheureux qui poserait aussi une date sur une
    // ligne séparée.
    for (let i = 0; i < labels.length; i++) {
      await countQueries(contacts, counter, 'ContactEntity').update({ id: `c-${i}` }, { entity_id: `e-${i}` })
    }

    expect(counter.countByOp('update')).toBe(2 * labels.length)
    expect(() => expect(counter.countByOp('update')).toBe(labels.length)).toThrow()
  })

  it('ne rattache rien (et ne compte rien de plus) pour un contact déjà rattaché à la main', async () => {
    build()
    contacts.find.mockResolvedValueOnce([
      { id: 'c-1', entity: 'DSI Groupe', entity_id: 'e-choisie-a-la-main' } as unknown as ContactEntity,
    ])

    await service.reconcileAccount('w-1', 'a-1')

    expect(counter.countByOp('find')).toBe(1) // contacts.find seulement — pas d'orphelin, pas de entities.find
    expect(counter.countByOp('update')).toBe(0)
  })
})
