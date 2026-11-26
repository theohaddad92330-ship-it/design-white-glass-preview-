import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { gestureIdempotency } from './gesture-idempotency'

/**
 * #1952.38 / #1959.18 — la clé d'idempotence du routeur d'actions.
 *
 * Ces tests savent dire NON. Chacun casse sur une manière précise de se
 * tromper, et les trois manières ont été MESURÉES dans ce dépôt :
 *
 *  1. une clé tirée à chaque rendu (`crypto.randomUUID()` dans un `useMemo`) —
 *     un remontage ou un rafraîchissement en fabrique une seconde, donc deux
 *     effets pour un seul geste ;
 *  2. une clé dérivée du seul CONTENU (« même cible, même type d'action ») —
 *     deux gestes légitimes séparés dans le temps n'en feraient qu'un, et le
 *     second envoi VOULU serait bloqué pour toujours ;
 *  3. une clé qu'on relâche sur n'importe quelle issue, `unknown` compris —
 *     rejouer un envoi qui a PEUT-ÊTRE abouti est la seule erreur irréversible
 *     de ce mécanisme.
 */
describe('gestureIdempotency — une clé par GESTE, pas par rendu', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
  })
  afterEach(() => {
    sessionStorage.clear()
    localStorage.clear()
  })

  /**
   * #1959.20 — LE PIÈGE DE CE LOT.
   *
   * Mesuré le 18/09 : `PendingActions.tsx` appelle bien `gestureIdempotency`
   * sur les trois chemins câblés (export CRM, brouillon mail, rappel), mais le
   * jeton était gardé dans `sessionStorage` — propre à CET onglet. Un second
   * onglet ouvert sur la MÊME conversation démarre avec un `sessionStorage`
   * VIDE (c'est la seule différence physique entre deux onglets de la même
   * origine ; `localStorage`, lui, leur est commun) : il tirait donc un jeton
   * NEUF pour le même geste, et le serveur voyait deux tentatives — deux
   * brouillons, deux rappels. Ce test simule ce second onglet en ne vidant
   * QUE `sessionStorage`.
   */
  it('le MÊME geste, réclamé depuis un AUTRE onglet (sessionStorage vide, comme un onglet neuf), porte la MÊME clé', () => {
    const first = gestureIdempotency('chat-card.prepare_mail_draft', ['a@b.com', 'Objet', 'Corps'])
    sessionStorage.clear()
    const second = gestureIdempotency('chat-card.prepare_mail_draft', ['a@b.com', 'Objet', 'Corps'])

    expect(second.key).toBe(first.key)
  })

  /**
   * #1959.20 — DEUX UTILISATEURS (deux machines, deux navigateurs) : la limite
   * HONNÊTE de ce mécanisme, pas un troisième cas qu'il fermerait aussi.
   *
   * Aucun stockage n'est commun à deux navigateurs — ni `sessionStorage` ni
   * `localStorage`. Ce test le DIT plutôt que de prétendre le contraire : les
   * deux machines tirent chacune leur propre jeton pour le même geste. Ce
   * n'est PAS un doublon pour autant sur les chemins mesurés dans ce lot —
   * `export_contact_to_crm` upserte par contact+fournisseur (résultat
   * `created`/`updated`, jamais deux fiches) et `pin_memory_fact` refuse tout
   * texte déjà épinglé (`findDuplicateFact`, `memory.service.ts:645-654`) :
   * les deux gestes convergent au niveau MÉTIER, pas au niveau de la clé.
   * `prepare_mail_draft` et `schedule_reminder` n'ont pas cette convergence et
   * restent un risque résiduel documenté (voir la doc du module) — GA-26
   * interdit d'inventer ici un second système pour le fermer côté client.
   */
  it('deux MACHINES différentes tirent deux clés différentes pour le même geste — limite du client, pas un doublon caché', () => {
    const machineA = gestureIdempotency('chat-card.schedule_reminder', ['contact-1', '2026-10-01T09:00:00.000Z', ''])
    // Une seconde machine ne voit RIEN de ce que la première a écrit : on le
    // simule en vidant les deux stockages, comme le ferait un navigateur vierge.
    sessionStorage.clear()
    localStorage.clear()
    const machineB = gestureIdempotency('chat-card.schedule_reminder', ['contact-1', '2026-10-01T09:00:00.000Z', ''])

    expect(machineB.key).not.toBe(machineA.key)
  })

  it('le MÊME geste, réclamé deux fois (deux montages), porte la MÊME clé', () => {
    // Casse si la clé redevient aléatoire par rendu.
    const first = gestureIdempotency('action-os.run', ['crm_hygiene'])
    const second = gestureIdempotency('action-os.run', ['crm_hygiene'])

    expect(second.key).toBe(first.key)
  })

  it('la clé est ÉCRITE dans le stockage de l’origine — c’est ce qui la fait survivre à un rafraîchissement ET à un autre onglet', () => {
    // Un jeton gardé en mémoire de module survivrait à un remontage mais pas à
    // un F5, ni à `sessionStorage` à un autre onglet : la moitié du défaut
    // resterait. On lit donc le stockage partagé de l'origine lui-même — par
    // `key(i)`, pas `Object.keys`, que le polyfill de test (`localstorage-
    // polyfill.ts`) ne rend pas énumérable comme un vrai `Storage`.
    const { key } = gestureIdempotency('action-os.run', ['crm_hygiene'])

    const stored = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).map(name =>
      name ? localStorage.getItem(name) : null,
    )
    expect(stored).toContain(key)
  })

  it('deux gestes distincts ne partagent JAMAIS une clé', () => {
    // Casse si la dérivation oublie une coordonnée : sans elle, deux gestes
    // légitimes se dédoublonneraient l'un l'autre.
    const workflowA = gestureIdempotency('action-os.run', ['crm_hygiene']).key
    const workflowB = gestureIdempotency('action-os.run', ['relance_dormants']).key
    const otherScope = gestureIdempotency('chat-card.schedule_reminder', ['crm_hygiene']).key
    const otherDate = gestureIdempotency('chat-card.schedule_reminder', ['contact-1', '2026-09-01T07:00:00.000Z']).key
    const laterDate = gestureIdempotency('chat-card.schedule_reminder', ['contact-1', '2026-09-22T07:00:00.000Z']).key

    expect(new Set([workflowA, workflowB, otherScope, otherDate, laterDate]).size).toBe(5)
  })

  it('les coordonnées ne se confondent pas quand un séparateur apparaît dans une valeur', () => {
    // `['a|b', 'c']` et `['a', 'b|c']` sont deux gestes, pas un — une note
    // saisie par l'utilisateur peut contenir n'importe quoi.
    const left = gestureIdempotency('chat-card.schedule_reminder', ['a|b', 'c']).key
    const right = gestureIdempotency('chat-card.schedule_reminder', ['a', 'b|c']).key

    expect(left).not.toBe(right)
  })

  it('une valeur absente et une chaîne vide sont le MÊME geste', () => {
    // « pas de note » et « note vide » décrivent la même décision ; en faire
    // deux gestes rouvrirait la porte au doublon sur un simple `?? ''`.
    const absent = gestureIdempotency('chat-card.schedule_reminder', ['contact-1', undefined]).key
    const empty = gestureIdempotency('chat-card.schedule_reminder', ['contact-1', '']).key

    expect(empty).toBe(absent)
  })

  it('un geste RELÂCHÉ (son issue a été rendue) repart sur une clé neuve', () => {
    // Sans ce relâchement, un deuxième envoi VOULU serait bloqué pour toujours
    // par la ligne écrite lors du premier.
    const first = gestureIdempotency('action-os.run', ['crm_hygiene'])
    first.release()
    const second = gestureIdempotency('action-os.run', ['crm_hygiene'])

    expect(second.key).not.toBe(first.key)
  })

  it('relâcher un geste n’en relâche aucun autre', () => {
    const kept = gestureIdempotency('action-os.run', ['relance_dormants'])
    const released = gestureIdempotency('action-os.run', ['crm_hygiene'])
    released.release()

    expect(gestureIdempotency('action-os.run', ['relance_dormants']).key).toBe(kept.key)
  })

  it('la clé respecte les bornes du contrat (8 à 120 caractères), même sur des coordonnées longues', () => {
    // `actionDispatchIdempotencyKeySchema` borne à 200, `POST /action-os/runs`
    // à 120 : une clé trop longue serait refusée par le serveur, donc aucun
    // dédoublonnage — le défaut d'origine, par un autre chemin.
    const { key } = gestureIdempotency('chat-card.schedule_reminder', ['x'.repeat(4000), 'y'.repeat(4000)])

    expect(key.length).toBeGreaterThanOrEqual(8)
    expect(key.length).toBeLessThanOrEqual(120)
  })

  it('un stockage refusé (navigation privée) ne jette pas, et la clé reste stable dans la page', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage blocked')
      },
    })
    try {
      const first = gestureIdempotency('action-os.run', ['stockage_refuse'])
      const second = gestureIdempotency('action-os.run', ['stockage_refuse'])

      expect(second.key).toBe(first.key)
    } finally {
      if (descriptor) Object.defineProperty(window, 'localStorage', descriptor)
      else Reflect.deleteProperty(window, 'localStorage')
    }
  })
})
