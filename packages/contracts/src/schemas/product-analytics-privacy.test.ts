import { describe, expect, it } from 'vitest'
import { DOCTRINE_KEYS, DOCTRINE_REGISTRY } from './doctrine-registry.js'
import {
  MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
  SESSION_HASH_ROTATION_HOURS,
  hasEnoughSessionsToPublish,
  hashBehavioralSession,
} from './product-analytics-privacy.js'

/**
 * GA-241 — les deux nombres de l'analytique produit vivent à un seul endroit, et
 * le registre cite CELUI-LÀ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE, ET POURQUOI ELLE EST PETITE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le seuil d'agrégation minimale est le même principe écrit QUATRE fois dans les
 * issues du lot : cohortes sous 3 espaces masquées (#1658, #1686), parcours sous
 * 5 occurrences (#1684), « trop récent » sous 5 sessions (#1683), règle 1 de
 * #1681. Quatre recopies donnent quatre valeurs le jour où l'on en change une —
 * et un écran qui masque à 3 pendant qu'un autre publie à 5 désigne quelqu'un
 * sur le second. « Un réglage vit à un seul endroit » (GA-26).
 *
 * Cette garde ne prétend pas vérifier que les sept écrans APPLIQUENT le seuil :
 * ils n'existent pas encore, et une garde qui surveillerait leur absence serait
 * verte pour toujours (le défaut de la garde borgne, payé six fois par ce
 * dépôt). Elle tient les deux seules choses décidables aujourd'hui :
 *
 *  1. le comportement du seuil AU BORD — 4 refuse, 5 accepte, un compte inconnu
 *     refuse aussi, parce qu'on ne sait pas ce qu'on publierait ;
 *  2. le lien entre la CONSTANTE et le TEXTE du registre. C'est la leçon écrite
 *     dans `doctrine-registry.test.ts` (« le compte que c18 annonce ») : la
 *     seule affirmation d'un registre qu'une machine puisse lire est un CHIFFRE,
 *     et c'était précisément l'affirmation qui était fausse. Changer le seuil
 *     sans corriger la doctrine fait donc rougir la CI.
 */

describe('GA-241 — le seuil d’agrégation minimale', () => {
  it('lit un corpus non vide — la constante EXISTE et vaut un entier utilisable', () => {
    // Sans ceci, une constante supprimée ou passée à `undefined` laisserait tous
    // les contrôles ci-dessous parler dans le vide.
    expect(Number.isInteger(MIN_DISTINCT_SESSIONS_FOR_A_METRIC)).toBe(true)
    expect(MIN_DISTINCT_SESSIONS_FOR_A_METRIC).toBeGreaterThan(1)
    expect(Number.isInteger(SESSION_HASH_ROTATION_HOURS)).toBe(true)
    expect(SESSION_HASH_ROTATION_HOURS).toBeGreaterThan(0)
  })

  it('sait dire NON juste sous le seuil, et OUI juste dessus', () => {
    // Le bord est le seul endroit où une erreur d'inégalité se voit. Sous le
    // seuil, une « moyenne » désigne quelqu'un — c'est toute la règle.
    expect(hasEnoughSessionsToPublish(MIN_DISTINCT_SESSIONS_FOR_A_METRIC - 1)).toBe(false)
    expect(hasEnoughSessionsToPublish(MIN_DISTINCT_SESSIONS_FOR_A_METRIC)).toBe(true)
    expect(hasEnoughSessionsToPublish(MIN_DISTINCT_SESSIONS_FOR_A_METRIC + 1)).toBe(true)
    expect(hasEnoughSessionsToPublish(0)).toBe(false)
    expect(hasEnoughSessionsToPublish(1)).toBe(false)
  })

  it('refuse un compte INCONNU ou cassé — sans le confondre avec un petit compte', () => {
    // `false` veut dire « ne publie pas », jamais « zéro » : un compte absent
    // n'est pas un compte nul (invariant `unknown_is_not_zero`).
    expect(hasEnoughSessionsToPublish(null)).toBe(false)
    expect(hasEnoughSessionsToPublish(undefined)).toBe(false)
    expect(hasEnoughSessionsToPublish(Number.NaN)).toBe(false)
    expect(hasEnoughSessionsToPublish(-3)).toBe(false)
    // Un compte de sessions fractionnaire est un compte cassé (une jointure qui
    // a compté des lignes, pas des sessions) : il ne franchit pas par accident.
    expect(hasEnoughSessionsToPublish(4.5)).toBe(false)
    expect(hasEnoughSessionsToPublish(Number.POSITIVE_INFINITY)).toBe(false)
  })
})

/**
 * #1681.4 — `hashBehavioralSession` est le premier APPELANT de
 * `SESSION_HASH_ROTATION_HOURS`. Avant cette fonction, la constante existait et
 * rien ne la lisait : la règle 4 de la doctrine (« hash de session, jamais
 * d'utilisateur, tourné toutes les {@link SESSION_HASH_ROTATION_HOURS} h »)
 * n'était vraie que par la prose. Ce test tient les trois choses qu'une
 * fonction PURE de rotation doit prouver : elle IDENTIFIE (même germe, même
 * fenêtre → même hash — sinon compter des sessions distinctes est impossible),
 * elle ROTATIONNE (la fenêtre change → le hash change, sans qu'aucune
 * discipline d'appelant ne soit nécessaire), et elle refuse un germe absent
 * plutôt que de fabriquer une session qui n'existe pas.
 */
describe('#1681.4 — hashBehavioralSession', () => {
  const ROTATION_MS = SESSION_HASH_ROTATION_HOURS * 60 * 60 * 1000

  it('lit un corpus non vide — la fonction EXISTE et rend une chaîne non triviale', () => {
    const hash = hashBehavioralSession('seed-1', new Date(0))
    expect(typeof hash).toBe('string')
    expect(hash.length).toBeGreaterThanOrEqual(16)
  })

  it('est DÉTERMINISTE dans la même fenêtre de rotation — sinon compter des sessions distinctes est impossible', () => {
    const bucketStart = new Date(42 * ROTATION_MS)
    const bucketEnd = new Date(43 * ROTATION_MS - 1)
    expect(hashBehavioralSession('seed-A', bucketStart)).toBe(hashBehavioralSession('seed-A', bucketEnd))
  })

  it('TOURNE au franchissement de la fenêtre — la rotation est structurelle, pas laissée à la discipline de l’appelant', () => {
    const lastMsOfBucket = new Date(10 * ROTATION_MS - 1)
    const firstMsOfNextBucket = new Date(10 * ROTATION_MS)
    const before = hashBehavioralSession('seed-B', lastMsOfBucket)
    const after = hashBehavioralSession('seed-B', firstMsOfNextBucket)
    expect(before).not.toBe(after)
  })

  it('deux germes différents, à la même heure, ne se confondent pas', () => {
    const at = new Date(1000 * ROTATION_MS)
    expect(hashBehavioralSession('seed-C', at)).not.toBe(hashBehavioralSession('seed-D', at))
  })

  it('refuse un germe VIDE ou cassé — jamais un hash « par défaut » qui inventerait une session', () => {
    expect(hashBehavioralSession('', new Date())).toBe('')
    expect(hashBehavioralSession('   ', new Date())).toBe('')
    expect(hashBehavioralSession(null as unknown as string, new Date())).toBe('')
    expect(hashBehavioralSession(undefined as unknown as string, new Date())).toBe('')
  })

  it('sait dire NON — un germe presque identique ne produit pas le même hash', () => {
    // Le témoin qui prouve que la fonction lit vraiment le germe et ne rend pas
    // une constante déguisée.
    const at = new Date(7 * ROTATION_MS)
    expect(hashBehavioralSession('seed-E', at)).not.toBe(hashBehavioralSession('seed-E2', at))
  })
})

/**
 * Les EXCEPTIONS NOMMÉES d'une entrée de doctrine, telles que le registre les
 * écrit : un marqueur ordonné, puis le numéro de la décision qui la porte —
 * `(a) #1946.22 …`, `(b) #1949.23 …`.
 *
 * Isolée pour qu'on puisse lui donner un texte FABRIQUÉ et vérifier qu'elle
 * sait dire non. ⚠️ `matchAll` sur une expression régulière LITTÉRALE, neuve à
 * chaque appel : le drapeau `g` d'une expression réutilisée est STATEFUL, et ce
 * piège a déjà rendu une garde de ce dépôt aveugle une ligne sur deux.
 */
function namedExceptionsIn(text: string): string[] {
  return [...text.matchAll(/\(([a-z])\)\s+#(\d+\.\d+)/g)].map(match => `${match[1]}:${match[2]}`)
}

describe('GA-241 — la doctrine cite le seuil qu’on applique VRAIMENT', () => {
  const entry = DOCTRINE_REGISTRY.find(item => item.key === 'c64_analytique_produit')

  it('l’entrée existe, et rien n’a été inséré AVANT elle (GA-08)', () => {
    expect(entry).toBeDefined()
    // ⚠️ Cette ligne vérifiait « c64 est la DERNIÈRE clé », et elle a rougi le
    // 08/09/2026 à l'ajout parfaitement légitime de `c65` — une clé APPENDÉE,
    // ce que GA-08 demande précisément. La règle n'a jamais été « c64 est la
    // dernière » : c'est « aucune clé ne s'insère au MILIEU », c'est-à-dire que
    // les clés déjà là gardent leur index. Une garde qui ancre une position
    // ABSOLUE là où la règle porte sur un ORDRE se met à refuser ce qu'elle
    // devait protéger — et le seul geste qui la calme est d'aller réécrire
    // l'assertion, donc de ne plus rien garder.
    //
    // ⚠️ Et le 18/09/2026, la même erreur une seconde fois : la ligne était
    // devenue `index === DOCTRINE_KEYS.length - 2` — encore une position
    // ancrée sur la FIN, qui a rougi à l'ajout parfaitement légitime de `c66`,
    // appendée en queue. L'invariant de GA-08 se mesure depuis le DÉBUT : une
    // clé insérée au milieu décale c64 vers la droite, une clé appendée ne la
    // déplace pas. On fige donc l'index de c64 depuis le début (63), et ses
    // deux voisines — ce qui refuse toute insertion avant ou juste après elle,
    // et laisse passer ce que GA-08 demande : un ajout en fin de liste.
    const index = DOCTRINE_KEYS.indexOf('c64_analytique_produit')
    expect(index).toBe(63)
    // Le contrôle qui rend la ligne ci-dessus sensible : les clés qui la
    // précédaient la précèdent toujours, dans le même ordre, et celle qui la
    // suivait la suit toujours.
    expect(DOCTRINE_KEYS[index - 1]).toBe('c63_organigramme_verdict')
    expect(DOCTRINE_KEYS[index + 1]).toBe('c65_couverture_nest_pas_un_fait_de_marche')
  })

  it('le registre écrit les DEUX nombres, et ce sont ceux de la constante', () => {
    // L'aiguille est CONSTRUITE à partir du code : le jour où le seuil change,
    // c'est la doctrine qui rougit, pas seulement le code.
    expect(entry?.canonical).toContain(`${MIN_DISTINCT_SESSIONS_FOR_A_METRIC} sessions distinctes`)
    expect(entry?.canonical).toContain(`toutes les ${SESSION_HASH_ROTATION_HOURS} h`)
  })

  it('la garde sait dire NON — un AUTRE nombre ne se trouverait pas dans le texte', () => {
    // Preuve que le contrôle ci-dessus est SENSIBLE au chiffre et ne se contente
    // pas de trouver le mot « sessions ». Sans elle, un `toContain` sur une
    // sous-chaîne trop courte serait vert quel que soit le seuil.
    expect(entry?.canonical.includes(`${MIN_DISTINCT_SESSIONS_FOR_A_METRIC + 1} sessions distinctes`)).toBe(false)
    expect(entry?.canonical.includes(`toutes les ${SESSION_HASH_ROTATION_HOURS + 1} h`)).toBe(false)
  })

  it('les CINQ règles sont nommées — aucune ne se perd dans une reformulation', () => {
    // Quatre règles sur cinq resteraient une doctrine cohérente à la lecture, et
    // c'est exactement ce qui la rendrait dangereuse : celle qui manque serait
    // celle qu'on n'a pas su tenir.
    for (const rule of [
      "UNITÉ D'ANALYSE",
      'AGRÉGATION MINIMALE',
      'AUCUN CONTENU',
      'AUCUN ENREGISTREMENT DE SESSION',
      'HASH DE SESSION',
      'PAR ESPACE CLIENT NOMMÉ',
    ]) {
      expect(`${rule} → ${entry?.canonical.includes(rule)}`).toBe(`${rule} → true`)
    }
  })

  it('#1946 — l’union d’écriture peut s’ÉLARGIR ; les exceptions NOMMÉES sont TROIS depuis le 11/10/2026 (#2442.10)', () => {
    // Le 14/09/2026, Louis a débloqué #1946 en élargissant l'union fermée du
    // traceur de neuf à dix-neuf événements, contre la recommandation et sans
    // que la relecture juridique soit faite. Un élargissement n'est PAS une
    // exception : les cinq règles continuent de s'appliquer aux dix formes
    // ajoutées. La manière dont ce lot aurait pu déraper est de se déclarer
    // troisième exception en passant — c'est cette ligne qui l'en empêche.
    //
    // ⚠️ 11/10/2026 (décision Louis, lot W9, #2879 / #2442.10) : une TROISIÈME
    // exception est NOMMÉE et DATÉE — l'agrégat des contestations/corrections
    // des réponses de Laura, par fonction/écran/outil, JAMAIS par personne. Le
    // compte monte à trois PAR DÉCISION écrite, pas par glissement : la garde
    // reste la même, c'est son attendu qui porte la date.
    expect(namedExceptionsIn(entry?.canonical ?? '')).toEqual(['a:1946.22', 'b:1949.23', 'c:2442.10'])
    expect(entry?.canonical).toContain('TROIS EXCEPTIONS NOMMÉES, ET AUCUNE AUTRE')
    expect(entry?.canonical).toContain('Une quatrième exception est refusée')
    expect(entry?.canonical).toContain('JAMAIS par personne')
  })

  it('la garde des exceptions sait dire NON, et n’attrape pas ce qu’elle ne vise pas', () => {
    // SAIT DIRE NON : une troisième exception glissée dans le texte se compte.
    expect(namedExceptionsIn('(a) #1946.22 x (b) #1949.23 y (c) #2442.10 z (d) #2000.1 w')).toEqual([
      'a:1946.22',
      'b:1949.23',
      'c:2442.10',
      'd:2000.1',
    ])
    // N'ATTRAPE PAS CE QU'ELLE NE VISE PAS : une parenthèse ordinaire du texte
    // de doctrine, une référence d'issue SANS marqueur, et un numéro de
    // décision sans point ne sont pas des exceptions.
    expect(namedExceptionsIn('le score de santé d’espace (#1652) suffit au suivi client')).toEqual([])
    expect(namedExceptionsIn('la règle 5 (voir GA-266) et #1946.22 dans la même phrase')).toEqual([])
  })

  it('la relecture juridique est déclarée EN ATTENTE, pas cochée à la place de quelqu’un', () => {
    // L'auteur du cadre écrit lui-même « je pose le cadre technique, pas l'avis
    // juridique ». Une entrée qui trancherait l'intérêt légitime fermerait un
    // débat qui n'a jamais eu lieu — une case cochée vaut moins qu'une case vide.
    expect(entry?.canonical).toContain('RELECTURE JURIDIQUE EN ATTENTE')
    expect(entry?.gap).toContain('RELECTURE JURIDIQUE')
  })

  it('l’entrée dit ce qui n’est PAS tenu — nommément, et sans épingler un ÉTAT périmé', () => {
    // Une doctrine qui se déclarerait tenue le jour où elle est écrite est le
    // pire état possible du registre : on s'y fie pour ne pas rouvrir un débat.
    //
    // ⚠️ CE QUE CE TEST A APPRIS LE 09/09/2026. Il épinglait littéralement
    // « `session_id` … AUCUN écrivain » — c'est-à-dire un ÉTAT du code à une
    // date, pas une RÈGLE. Le jour où #1681.4 a donné un écrivain à cette
    // colonne, la garde est devenue rouge en refusant une AMÉLIORATION : elle
    // exigeait que le dépôt reste cassé pour rester verte. Une garde protège
    // une règle, elle ne fige pas un constat.
    //
    // Ce qu'elle épingle désormais : que l'entrée reste `partial` tant qu'une
    // règle manque, qu'elle NOMME les règles non tenues, et qu'elle cite la
    // garde qui tient celle qui l'est. Aucune de ces trois affirmations ne
    // devient fausse quand le code s'améliore — elles deviennent fausses quand
    // le registre se met à mentir, et c'est exactement ce qu'on veut voir.
    expect(entry?.codeState).toBe('partial')
    expect(entry?.gap).toContain('no-session-replay.spec.ts')
    // Les règles NON tenues, chacune nommée avec son verdict.
    for (const nonTenue of ['Règle 1', 'Règle 2', 'Règle 5']) {
      expect(`${nonTenue} → ${entry?.gap.includes(nonTenue)}`).toBe(`${nonTenue} → true`)
    }
    // …et le témoin : une règle TENUE se dit tenue, sinon le registre sous-estime
    // le code et personne ne s'y fie plus.
    expect(entry?.gap).toContain('Règle 4')
    expect(entry?.gap).toContain('TENUE')
  })
})
