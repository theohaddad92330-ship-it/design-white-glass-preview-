import { describe, expect, it } from 'vitest'
import { RUN_QUERY_MAX_CHARS, isQuestionForLaura, launcherIntent } from './launcher-intent'

describe('ce que fait Entrée', () => {
  it('ne fait RIEN sur un champ vide et sans type', () => {
    // Ouvrir une conversation vide n'est pas une réponse : ça consomme un tour
    // du plafond quotidien pour un message que personne n'a écrit.
    expect(launcherIntent({ typeKey: null, runKey: null, text: '   ' })).toEqual({ kind: 'idle' })
  })

  it('part chez Laura quand aucun type n’est choisi', () => {
    // La voie par défaut est celle qui ne peut coûter aucun crédit ni rien
    // écrire. C'est le seul défaut acceptable pour une boîte qu'on ouvre sans
    // réfléchir.
    expect(launcherIntent({ typeKey: null, runKey: null, text: '  pourquoi Stellantis ne répond pas ?  ' })).toEqual({
      kind: 'laura',
      ask: 'pourquoi Stellantis ne répond pas ?',
    })
  })

  it('ne tronque JAMAIS une question posée à Laura', () => {
    // Couper la question de quelqu'un pour tenir dans une URL rendrait une
    // réponse à côté, sans dire pourquoi.
    const long = 'a'.repeat(RUN_QUERY_MAX_CHARS * 3)
    const intent = launcherIntent({ typeKey: null, runKey: null, text: long })
    expect(intent).toEqual({ kind: 'laura', ask: long })
  })

  it('emmène sur la destination du run, le texte en paramètre', () => {
    expect(launcherIntent({ typeKey: 'contact', runKey: 'contact.enrich', text: 'Marie Dupont' })).toEqual({
      kind: 'run',
      runKey: 'contact.enrich',
      to: '/contacts',
      search: { q: 'Marie Dupont' },
    })
  })

  it('emploie le paramètre que la ROUTE attend, pas un nom générique', () => {
    // `/search` lit `company`, les listes lisent `q`. Un nom inventé serait
    // écarté en silence par TanStack Router, et la destination s'ouvrirait non
    // filtrée — ce qui se lit « aucun résultat » alors qu'on n'a rien cherché.
    expect(launcherIntent({ typeKey: 'account', runKey: 'account.analysis', text: 'Airbus' })).toEqual({
      kind: 'run',
      runKey: 'account.analysis',
      to: '/search',
      search: { company: 'Airbus' },
    })
  })

  it('prend le PREMIER run du type quand aucun n’est choisi', () => {
    // L'ordre du catalogue est une décision : sur un compte, analyser est le
    // geste dominant. Faire échouer Entrée après un clic sur un chip donnerait
    // un lanceur qui a l'air cassé.
    expect(launcherIntent({ typeKey: 'need', runKey: null, text: 'Java' })).toEqual({
      kind: 'run',
      runKey: 'need.match',
      to: '/projects/needs',
      search: { q: 'Java' },
    })
  })

  it('ouvre quand même la destination quand le champ est vide', () => {
    // Un type choisi est déjà une intention. La liste non filtrée est une
    // réponse honnête ; refuser le geste n'en serait pas une.
    expect(launcherIntent({ typeKey: 'talent', runKey: null, text: '' })).toEqual({
      kind: 'run',
      runKey: 'talent.cvRewrite',
      to: '/consultants',
      search: {},
    })
  })

  // #2149.27 — le seul run à `queryParam: null` (`territory.snapshot`, qui
  // « ignorait le texte pour un run qui ne se cherche pas au clavier ») a
  // quitté le catalogue le 23/09/2026 : sa destination `/discover/territoire`
  // n'a jamais existé sur le disque, puis il ne faisait plus qu'ouvrir
  // `/discover` nu depuis que le panneau Territoire a quitté Découvrir
  // (#2486, Louis 16/09/2026). La branche `if (run.queryParam && trimmed)` de
  // `launcherIntent` n'a donc plus d'exemple RÉEL à tester ici sans fabriquer
  // une clé de catalogue qui n'existe pas — voir `launcher-arm.test.ts`
  // (`NO_KEYBOARD_RUN`) pour la même règle testée sur un `LauncherRun` fabriqué.

  it('borne le texte envoyé à une LISTE, et seulement lui', () => {
    // Au-delà, c'est un collage accidentel : la liste rendrait zéro résultat à
    // coup sûr, et l'URL deviendrait impartageable.
    const colle = 'x'.repeat(RUN_QUERY_MAX_CHARS + 50)
    const intent = launcherIntent({ typeKey: 'contact', runKey: 'contact.enrich', text: colle })
    expect(intent).toEqual({
      kind: 'run',
      runKey: 'contact.enrich',
      to: '/contacts',
      search: { q: 'x'.repeat(RUN_QUERY_MAX_CHARS) },
    })
  })

  it('retombe chez Laura si le type venu de l’URL n’existe pas', () => {
    // Une clé de type peut arriver d'un lien collé ou d'un état abîmé. Le repli
    // est la voie gratuite : elle ne peut rien casser, et elle RÉPOND.
    expect(launcherIntent({ typeKey: 'licorne' as never, runKey: null, text: 'salut' })).toEqual({
      kind: 'laura',
      ask: 'salut',
    })
  })

  it('retombe sur le premier run si la clé de run n’existe pas', () => {
    expect(launcherIntent({ typeKey: 'contact', runKey: 'contact.inventé', text: 'Marie' })).toEqual({
      kind: 'run',
      runKey: 'contact.enrich',
      to: '/contacts',
      search: { q: 'Marie' },
    })
  })
})

// #3648 — une QUESTION part chez Laura, jamais en recherche ni en panneau payant.
describe('une question ou une phrase part chez Laura (#3648)', () => {
  const questions = [
    'Quelles sont mes opportunités en cours ?',
    'quelles sont mes opportunités en cours',
    'Qui est le DSI de Stellantis',
    'Comment relancer Marie',
    'Pourquoi ce compte est froid',
    'Est-ce que BPCE recrute',
    'What are my open deals',
    'Who is the CTO',
    'Which accounts are cold',
    'Marie Dupont ?',
  ]
  it.each(questions)('« %s » : pas une recherche d’entité', text => {
    expect(isQuestionForLaura(text)).toBe(true)
    for (const [typeKey, runKey] of [
      ['contact', 'contact.enrich'],
      ['contact', null],
      ['account', null],
    ] as const) {
      expect(launcherIntent({ typeKey, runKey, text })).toEqual({ kind: 'laura', ask: text.trim() })
    }
  })

  it.each(['Marie Dupont', 'Société Générale', 'BPCE', 'Jean-Pierre Martin'])('« %s » reste un nom', text => {
    expect(isQuestionForLaura(text)).toBe(false)
    expect(launcherIntent({ typeKey: 'contact', runKey: 'contact.enrich', text }).kind).toBe('run')
  })

  it('sans chip armé, une phrase de plus de 4 mots part chez Laura', () => {
    const text = 'résume : mon mois d’opportunités'
    expect(isQuestionForLaura(text)).toBe(true)
    expect(launcherIntent({ typeKey: null, runKey: null, text })).toEqual({ kind: 'laura', ask: text })
  })

  it('un chip ARMÉ garde le run pour un nom d’entreprise long (> 4 mots)', () => {
    const text = 'Société Générale Corporate Banking France'
    expect(isQuestionForLaura(text, { armed: true })).toBe(false)
    expect(launcherIntent({ typeKey: 'account', runKey: 'account.analysis', text }).kind).toBe('run')
  })

  it('un chip armé renvoie quand même à Laura sur « ? » ou mot interrogatif en tête', () => {
    expect(launcherIntent({ typeKey: 'account', runKey: 'account.analysis', text: 'BPCE Banque ?' }).kind).toBe('laura')
    expect(
      launcherIntent({ typeKey: 'account', runKey: 'account.analysis', text: 'Quelle est la taille de BPCE' }).kind,
    ).toBe('laura')
  })

  it('un champ vide n’est pas une question (run sans saisie)', () => {
    expect(isQuestionForLaura('  ')).toBe(false)
  })
})
