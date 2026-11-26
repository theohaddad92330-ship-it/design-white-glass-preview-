/**
 * Compteur de requêtes SQL pour les tests — GA-312.
 *
 * Le profil du dépôt (`.claude/projet.md` §13) liste ce cliquet comme
 * « absent — le plus rentable à poser » : le compte de requêtes est un
 * meilleur budget que la durée sur un chemin chaud, parce qu'il ne dépend ni
 * de la machine, ni du cache, ni du jour. Une page qui passe de 20 à 400
 * requêtes se voit dans un test ; la même dérive en durée se noie dans le
 * bruit tant que la base est petite.
 *
 * ── Pourquoi cette coupure, et pas un logger TypeORM ──────────────────────
 *
 * TypeORM offre trois coutures pour observer les requêtes : un `Logger`
 * personnalisé posé sur `DataSourceOptions.logger`, un `afterQuery` de
 * subscriber, ou l'instrumentation directe du `DataSource`. Les TROIS
 * exigent un `QueryRunner` RÉELLEMENT attaché à un driver — c'est lui qui
 * appelle `logQuery()` après avoir parlé au serveur. Ce lot interdit toute
 * connexion à une base réelle ET tout appel réseau, et aucun driver
 * embarqué (`better-sqlite3`, `sqlite3`) n'est installé dans ce monorepo —
 * ils ne figurent que dans les `peerDependenciesMeta` OPTIONNELS de TypeORM
 * (`pnpm-lock.yaml`), jamais matérialisés sous `node_modules`, et `pnpm
 * install` est interdit dans ce lot. Un logger TypeORM n'a donc personne
 * pour l'appeler ici.
 *
 * La coupure retenue instrumente à la place le MÊME point d'entrée que le
 * code de production appelle réellement : les méthodes de `Repository<T>`
 * (`findOne`, `find`, `findBy`, `save`, `update`, `query`…) et les méthodes
 * TERMINALES d'un `SelectQueryBuilder` (`getMany`, `getOne`, `execute`…).
 * Sur un Repository connecté à un vrai Postgres, chacun de ces appels
 * correspond à EXACTEMENT un aller-retour SQL — `In(ids)` compris : un
 * tableau de 30 identifiants dans une seule clause `IN` reste UN SELECT, pas
 * trente. C'est ce qui rend le compte fidèle à ce qu'on veut mesurer : le
 * nombre de requêtes émises, pas le nombre de lignes traitées.
 *
 * ⚠️ Un compteur qui ne compte rien est vert pour toujours — c'est le
 * défaut n°1 des gardes de ce dépôt. Le contrôle positif obligatoire vit
 * dans `query-counter.spec.ts` : il provoque volontairement N appels et
 * vérifie que l'instrument en voit N, AVANT qu'aucun test ne s'appuie sur
 * lui pour juger un vrai chemin de service.
 */

/**
 * Une entrée du journal : quelle opération, sur quel repository/entité.
 * Non exportée délibérément — seul `QueryCounter` la construit et la lit ;
 * l'exporter sans qu'aucun test ne la nomme violerait la règle du dépôt
 * (`pnpm lint:exports:types` / knip : jamais un type consommé uniquement
 * dans son propre fichier).
 */
interface QueryLogEntry {
  readonly op: string
  readonly entity: string
}

/**
 * Méthodes de `Repository<T>` qui, connectées à un vrai driver, émettent
 * chacune EXACTEMENT une requête SQL. Liste volontairement plate (pas de
 * regex) : une méthode absente d'ici est un événement qui ne compte pas
 * PLUTÔT QU'un faux positif — voir « ne pas attraper ce qu'elle ne vise
 * pas » dans le rapport du lot.
 */
const REPOSITORY_QUERY_METHODS = [
  'find',
  'findOne',
  'findBy',
  'findOneBy',
  'findAndCount',
  'findAndCountBy',
  'count',
  'countBy',
  'save',
  'insert',
  'upsert',
  'update',
  'delete',
  'remove',
  'softDelete',
  'restore',
  'increment',
  'decrement',
  'query',
] as const

/** Méthodes TERMINALES d'un query builder — les seules qui parlent au serveur. */
const QUERY_BUILDER_TERMINAL_METHODS = ['getMany', 'getOne', 'getRawMany', 'getRawOne', 'getCount', 'execute'] as const

/**
 * Journal des requêtes vues pendant l'exécution d'un bloc. Un test lit
 * `count` (ou `countFor`) APRÈS avoir appelé le code mesuré — jamais avant,
 * jamais en même temps qu'un autre test (une instance par test, jamais
 * partagée, sinon les comptes de deux specs se mélangent).
 */
export class QueryCounter {
  private readonly log: QueryLogEntry[] = []

  record(op: string, entity: string): void {
    this.log.push({ op, entity })
  }

  /** Le nombre total de requêtes vues depuis la création (ou le dernier `reset`). */
  get count(): number {
    return this.log.length
  }

  /** Le nombre de requêtes vues pour une entité donnée (ex. `'ContactEntity'`). */
  countFor(entity: string): number {
    return this.log.filter(entry => entry.entity === entity).length
  }

  /** Le nombre de requêtes vues pour une opération donnée (ex. `'findOne'`), toutes entités confondues. */
  countByOp(op: string): number {
    return this.log.filter(entry => entry.op === op).length
  }

  /** Copie en lecture seule du journal — utile pour un message d'échec qui montre le détail. */
  entries(): readonly QueryLogEntry[] {
    return [...this.log]
  }

  reset(): void {
    this.log.length = 0
  }
}

/**
 * Enveloppe un repository (le double de test utilisé par les specs de ce
 * dépôt, ou un vrai `Repository<T>`) pour compter, dans `counter`, chaque
 * appel qui émettrait une requête SQL. `entityName` est un simple libellé
 * (le nom de l'entité) : il sert à distinguer, dans le journal, QUEL
 * repository a été sollicité, pas à valider quoi que ce soit.
 *
 * Ne modifie ni ne remplace le comportement du repository enveloppé — la
 * valeur de retour de chaque appel est celle du double sous-jacent,
 * inchangée. Le proxy ne fait qu'observer.
 */
export function countQueries<T extends object>(repo: T, counter: QueryCounter, entityName: string): T {
  return new Proxy(repo, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (typeof prop !== 'string' || typeof value !== 'function') return value

      if ((REPOSITORY_QUERY_METHODS as readonly string[]).includes(prop)) {
        return (...args: unknown[]) => {
          counter.record(prop, entityName)
          return value.apply(target, args)
        }
      }

      if (prop === 'createQueryBuilder') {
        return (...args: unknown[]) => wrapQueryBuilder(value.apply(target, args), counter, entityName)
      }

      // Toute autre méthode (create, merge — de la construction d'objet en
      // mémoire, jamais du réseau) passe sans être comptée.
      return value.bind(target)
    },
  })
}

/**
 * Même principe pour un `SelectQueryBuilder` : seules les méthodes
 * TERMINALES (`getMany`, `execute`…) sont comptées. Les méthodes de chaîne
 * (`where`, `andWhere`, `select`…) renvoient le proxy lui-même quand le
 * double sous-jacent renvoie le query builder d'origine, pour qu'un
 * terminal appelé plus loin dans la chaîne reste compté.
 */
function wrapQueryBuilder<T extends object>(qb: T, counter: QueryCounter, entityName: string): T {
  const proxy: T = new Proxy(qb, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (typeof prop !== 'string' || typeof value !== 'function') return value

      if ((QUERY_BUILDER_TERMINAL_METHODS as readonly string[]).includes(prop)) {
        return (...args: unknown[]) => {
          counter.record(prop, entityName)
          return value.apply(target, args)
        }
      }

      return (...args: unknown[]) => {
        const result = value.apply(target, args)
        return result === target ? proxy : result
      }
    },
  })
  return proxy
}
