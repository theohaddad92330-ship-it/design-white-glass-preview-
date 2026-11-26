/**
 * GA-58 — LE RANG D'ENTRÉE D'UNE ENTITÉ NE S'AFFICHE JAMAIS NU.
 *
 * ⚠️⚠️ #4016.L9.a revient sur GA-58, délibérément — Louis 13/10. Un score
 * s'affiche dès DEUX axes évaluables (le 11/10, un seul fait suffisait), et il
 * dit TOUJOURS son nombre d'axes (« 2 axes sur 4 évalués »). La garde DIT NON à
 * un score à un seul axe et à un score nu sans nombre d'axes (bloc
 * « #4016.L9.a » en fin de fichier).
 *
 * ⚠️⚠️ RENVERSEMENT DATÉ du 11/10/2026 (Louis, épopée #4016 lot L9 : « score des
 * filiales et BU affiché avec ses axes », `c48_score_entite`). Le texte
 * d'origine ci-dessous refusait que le NOMBRE s'affiche ; il s'affiche désormais,
 * mais SEULEMENT décomposé : `entityScoreLine` (`entityScoreLine.ts`) est le
 * seul lecteur du champ, il pose avec le total les points de chaque axe et
 * NOMME les axes non évaluables, et il rend `null` (aucune ligne) quand aucun
 * axe n'a de fait ou que la somme ne retombe pas sur le total. Ce qui reste
 * interdit, et que cette garde tient toujours : `TabAccess.tsx` ne lit JAMAIS
 * `.score` lui-même — un `{entity.score}` posé dans le JSX est un nombre nu.
 *
 * ── Texte d'origine (avant le renversement) ──
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * `rankAccessEntities` (`packages/contracts/src/schemas/access-entities.ts`)
 * calcule un nombre par entité — 25 points pour une entité nommée, 6 par
 * contact, 8 par site, 5 pour un rang 1 connu — et s'en sert pour ORDONNER la
 * liste de l'onglet Accès. Ce nombre voyage jusqu'au client : il est dans la
 * réponse de `GET /accounts/:id/access` et dans le type `Landscape` de
 * `TabAccess.tsx`.
 *
 * La source du dossier du 26 août refuse nommément « un second score d'entité
 * concurrent — deux nombres qui divergeraient au premier ajustement »
 * (PDF-04:331-333). Le compte a déjà son score, décomposé, avec ses axes ; un
 * second nombre affiché à côté, calculé sur d'autres points, se lirait comme
 * une contradiction dès que l'un des deux barèmes bouge — et personne ne
 * saurait lequel croire.
 *
 * ⚠️ Jusqu'ici, ce refus n'était tenu que par une OMISSION : personne n'avait
 * écrit `{entity.score}`. Une omission n'est pas une règle. Elle ne se relit
 * pas, elle ne se cite pas, et elle tombe le jour où quelqu'un trouve dommage
 * qu'un classement ne montre pas ses points — de bonne foi, en une ligne.
 * Ce qui EST affiché, et qui doit le rester, est la RAISON du rang
 * (« vous avez trois contacts chez elle ») : elle dit la même chose sans
 * poser un nombre en face d'un autre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Elle ne retire pas le champ de la réponse — ce serait plus fort, et c'est un
 * chantier d'API, pas une garde. Elle ne refuse pas non plus le CALCUL : le
 * classement est utile, c'est son rendu qui est refusé. Et elle ne surveille
 * qu'un écran, celui qui reçoit le champ ; une garde qui balaierait tout
 * `features/` attraperait cinquante `score` étrangers et se ferait désarmer au
 * premier faux positif.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import i18next from 'i18next'
import { ACCOUNT_SCORE_MIN_EVALUATED_AXES, rankAccessEntities } from '@bellum/contracts'
import type { AccessEntityReasonFact } from '@bellum/contracts'
import accessFr from '@/i18n/locales/fr/access.json'
import { entityScoreLine } from '@/features/accounts/view/account-detail/tabs/entityScoreLine'

const WEB_SRC = join(__dirname, '..')

/** Le seul écran qui reçoit le rang d'entrée. */
const TAB_ACCESS = join(WEB_SRC, 'features', 'accounts', 'view', 'account-detail', 'tabs', 'TabAccess.tsx')

/**
 * Retire les commentaires avant de lire — sans quoi la phrase qui EXPLIQUE la
 * règle la ferait tomber. `TabAccess.tsx` en porte une : « Il ne touche pas au
 * score : une entreprise en redressement est souvent très joignable. »
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/**
 * La DÉCLARATION de type du champ — `score: number`. C'est la seule forme
 * tolérée : le champ arrive du serveur, le type doit le dire, sinon TypeScript
 * ment sur ce que la route rend.
 *
 * ⚠️ Aucun drapeau `g` : `RegExp.test()` avec `g` est STATEFUL et rend un
 * résultat sur deux (défaut payé six fois dans ce dépôt).
 */
const TYPE_DECLARATION = /\bscore\??\s*:\s*(?:number|string)\b/i

/** La LECTURE du champ — `entity.score`, `e?.score`, `row['score']`. */
const FIELD_ACCESS = /\.\s*score\b|\[\s*['"`]score['"`]\s*\]/i

/**
 * LES HOMONYMES TOLÉRÉS — deux, et seulement deux.
 *
 * `raw_analysis.access_barrier` porte un champ `score` : la barrière d'achat
 * estimée du tome 3, sur 10, décomposée en six proxies nommés. Elle n'est PAS
 * un second classement d'entité — elle ne classe rien, elle décrit comment
 * une organisation achète — et elle s'affiche sur ce même écran depuis
 * qu'elle a cessé d'être calculée pour personne.
 *
 * `addressability` (manque A du 30/08) porte aussi un `score` : les cinq axes
 * d'adressabilité du tome 1 §6 — verrou, proportion, chemin, relation, coût
 * d'accès —, décomposés en facteurs nommés, sur 20. Elle non plus ne classe
 * aucune entité : elle répond à « peux-tu ENTRER chez ce compte », une
 * question distincte du score d'intérêt ET du rang d'une entité (§6.4 : « un
 * compte peut être parfait et hors de portée », deux nombres qui NE SE FONDENT
 * JAMAIS l'un dans l'autre — voir `addressabilitySchema` dans
 * `packages/contracts/src/schemas/discover.ts`).
 *
 * ⚠️ L'exemption est nominative et EXACTE : seul un `score` lu SUR un objet
 * nommé `barrier` OU `addressability` sort du corpus. `entity.score` sur la
 * même ligne reste vu — c'est ce que prouvent les cas « voit un rang caché
 * derrière un homonyme » plus bas, un par homonyme. Une exemption plus large
 * (« toute ligne qui contient barrier ou addressability ») aurait désarmé la
 * garde exactement comme le docblock le craint.
 *
 * Le drapeau `g` est ici sans danger : il n'est stateful que sur `.test()`,
 * jamais sur `.replace()`.
 */
const APPROVED_SCORE_HOMONYMS =
  /\b(?:barrier|addressability)\s*(?:\?\.|\.)\s*score\b|\b(?:barrier|addressability)\s*\[\s*['"`]score['"`]\s*\]/gi

/**
 * Les lignes qui font sortir le rang d'entrée de son rôle interne.
 *
 * Une ligne est fautive si elle parle de `score` ET qu'elle le LIT, ou qu'elle
 * n'est pas une déclaration de type. Les deux moitiés comptent : la première
 * attrape `{entity.score}` posé sur la même ligne que le type, la seconde
 * attrape une clé de traduction (`t('entities.score')`) qui ne lit aucun champ
 * mais promet un libellé pour lui.
 */
export function entityScoreLeaks(source: string): string[] {
  return withoutComments(source)
    .split('\n')
    .map(line => line.trim())
    .filter(line => /\bscore\b/i.test(line.replace(APPROVED_SCORE_HOMONYMS, '')))
    .filter(line => FIELD_ACCESS.test(line.replace(APPROVED_SCORE_HOMONYMS, '')) || !TYPE_DECLARATION.test(line))
}

describe('GA-58 — la garde LIT vraiment quelque chose', () => {
  it('l’écran surveillé existe, et il reçoit bien un rang d’entrée', () => {
    expect(existsSync(TAB_ACCESS), `écran surveillé introuvable : ${TAB_ACCESS}`).toBe(true)
    const source = readFileSync(TAB_ACCESS, 'utf8')
    expect(source.length).toBeGreaterThan(2000)
    // Le champ EXISTE dans le type de la réponse : sans cette assertion, la
    // garde surveillerait un champ disparu et resterait verte pour toujours.
    expect(withoutComments(source)).toMatch(TYPE_DECLARATION)
    // Et ce qui est affiché à sa place — la raison — est bien là.
    expect(source).toContain('entity.reason')
    // Les DEUX HOMONYMES existent vraiment sur cet écran : la barrière
    // d'achat et l'adressabilité y sont rendues avec leur score. Sans ces
    // assertions, l'exemption ci-dessus serait du code mort qui ne
    // protégerait plus rien le jour où quelqu'un retire une des deux cartes —
    // et personne ne s'en apercevrait.
    expect(withoutComments(source)).toMatch(/\bbarrier\s*(?:\?\.|\.)\s*score\b/)
    expect(withoutComments(source)).toMatch(/\baddressability\s*(?:\?\.|\.)\s*score\b/)
  })

  it('le rang d’entrée est bien un NOMBRE calculé, pas un champ mort', () => {
    // Preuve que le sujet de la garde existe côté contrat. Une garde posée sur
    // un calcul supprimé ne dit plus rien, et rien ne le signalerait.
    const ranked = rankAccessEntities([
      { id: 'a', name: 'Alpha', kind: 'subsidiary', rank1Incumbent: null, contactCount: 3, siteCount: 0 },
      { id: 'b', name: 'Beta', kind: 'unknown', rank1Incumbent: null, contactCount: 0, siteCount: 0 },
    ])
    expect(ranked).toHaveLength(2)
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score)
    // Et il porte sa raison — c'est elle qu'on affiche.
    expect(ranked[0].reason.length).toBeGreaterThan(0)
  })
})

describe('GA-58 — le détecteur sait dire NON', () => {
  it('voit un rang rendu dans le JSX', () => {
    expect(entityScoreLeaks(`<Text size="sm">{entity.score}</Text>`)).toEqual(['<Text size="sm">{entity.score}</Text>'])
    expect(entityScoreLeaks(`<Badge>{entity.score} pts</Badge>`)).toHaveLength(1)
    expect(entityScoreLeaks(`{fmt(entity?.score)}`)).toHaveLength(1)
  })

  it('voit un libellé promis au rang, même sans lecture du champ', () => {
    expect(entityScoreLeaks(`{t('entities.score')}`)).toEqual([`{t('entities.score')}`])
  })

  it('voit un rang caché SUR la ligne de la déclaration', () => {
    // La forme qui désarmerait une garde purement « la ligne ressemble-t-elle à
    // un type ? » : la déclaration est là, et la lecture aussi, sur la même
    // ligne. C'est la seconde moitié du détecteur qui l'attrape.
    expect(entityScoreLeaks(`type L = { score: number }; const s = entity.score`)).toHaveLength(1)
    expect(entityScoreLeaks(`  const s: number = entity.score`)).toHaveLength(1)
    // …et un commentaire de fin de ligne ne suffit évidemment pas à faire une
    // fuite : il est retiré avant lecture.
    expect(entityScoreLeaks(`  entities: { id: string; score: number }[] // {entity.score}`)).toEqual([])
  })

  it('laisse passer la DÉCLARATION du champ — le type doit dire ce que la route rend', () => {
    expect(
      entityScoreLeaks(
        `entities: { id: string; name: string; rank1_incumbent: string; score: number; reason: string }[]`,
      ),
    ).toEqual([])
  })

  it('ne prend pas un commentaire pour du code', () => {
    expect(entityScoreLeaks(`/* Il ne touche pas au score : une entreprise en redressement… */`)).toEqual([])
    expect(entityScoreLeaks(`// on affichait {entity.score} ici avant`)).toEqual([])
  })

  it('ne confond pas un AUTRE score avec celui de l’entité', () => {
    // La garde est volontairement scopée à un écran ; ces formes n'y sont pas,
    // mais le détecteur doit rester honnête sur ce qu'il voit.
    expect(entityScoreLeaks(`const label = 'aucun rapport'`)).toEqual([])
  })

  it('laisse passer le score de la BARRIÈRE d’achat — un homonyme, pas un classement', () => {
    expect(entityScoreLeaks(`{formatDecimal(data.barrier.score, i18n.language)}`)).toEqual([])
    expect(entityScoreLeaks(`data.barrier.score !== null && data.barrier.access_class`)).toEqual([])
    expect(entityScoreLeaks(`const s = barrier?.score ?? null`)).toEqual([])
  })

  it('laisse passer le score de l’ADRESSABILITÉ — un second homonyme, pas un classement', () => {
    // Le manque A du 30/08 : les cinq axes d'adressabilité, rendus sur ce même
    // écran. Ni le score d'intérêt ni le rang d'une entité — la doctrine les
    // garde délibérément séparés (§6.4).
    //
    // ⚠️ La clé d'interpolation s'appelle `value`, PAS `score` — comme pour la
    // barrière : `{ score: data.addressability.score }` laisserait un mot
    // « score » NU sur la ligne (la clé de l'objet), même une fois la
    // LECTURE `.score` reconnue comme homonyme. C'est cette même forme,
    // trouvée sur `TabAccess.tsx`, que ce test aurait laissée passer avant
    // la correction — la garde a raison de la refuser, elle n'est pas
    // borgne : c'est `TabAccess.tsx` qui suit maintenant la convention déjà
    // posée pour la barrière.
    expect(entityScoreLeaks(`{t('addressability.badge', { value: data.addressability.score, max })}`)).toEqual([])
    expect(entityScoreLeaks(`data.addressability.score !== null && data.addressability.max > 0`)).toEqual([])
    expect(entityScoreLeaks(`const s = addressability?.score ?? null`)).toEqual([])
  })

  it('voit un rang caché DERRIÈRE un homonyme — l’exemption ne s’étend pas à la ligne', () => {
    // La forme qui désarmerait une exemption paresseuse (« la ligne parle de
    // barrière, donc je passe ») : les deux scores sur la même ligne. Un cas
    // par homonyme — l'un ne doit pas couvrir l'autre.
    expect(entityScoreLeaks(`{data.barrier.score} · {entity.score}`)).toHaveLength(1)
    expect(entityScoreLeaks(`{data.addressability.score} · {entity.score}`)).toHaveLength(1)
  })
})

describe('GA-58 — l’onglet Accès n’affiche aucun rang d’entrée', () => {
  it('TabAccess.tsx ne rend jamais le nombre, seulement la raison', () => {
    const leaks = entityScoreLeaks(readFileSync(TAB_ACCESS, 'utf8'))
    if (leaks.length > 0) {
      throw new Error(
        [
          'L’onglet Accès affiche le rang d’entrée d’une entité :',
          ...leaks.map(line => `  · ${line}`),
          '',
          'C’est le « second score d’entité concurrent » que la source refuse',
          '(PDF-04:331-333, `c48_score_entite` au registre de doctrine) : le',
          'compte a déjà son score décomposé, et deux nombres calculés sur deux',
          'barèmes divergent au premier ajustement — sans que personne sache',
          'lequel croire.',
          '',
          'Le rang ORDONNE la liste, il ne s’affiche pas. Ce qui se montre est',
          'sa RAISON (`entity.reason`) : « vous avez trois contacts chez elle »',
          'dit la même chose, et se vérifie.',
        ].join('\n'),
      )
    }
    expect(leaks).toEqual([])
  })
})

describe('GA-58 (renversement du 11/10/2026) — le nombre ne sort que par `entityScoreLine`, décomposé', () => {
  const ENTITY_SCORE_LINE = join(
    __dirname,
    '..',
    'features',
    'accounts',
    'view',
    'account-detail',
    'tabs',
    'entityScoreLine.ts',
  )

  it('LIT quelque chose — l’écran appelle `entityScoreLine` avec l’entité entière, et le module existe', () => {
    const screen = withoutComments(readFileSync(TAB_ACCESS, 'utf8'))
    expect(screen).toMatch(/entityScoreLine\(\s*entity\s*,/)
    expect(existsSync(ENTITY_SCORE_LINE)).toBe(true)
  })

  it('le seul lecteur du nombre consulte AUSSI les faits par axe et les axes manquants', () => {
    const reader = withoutComments(readFileSync(ENTITY_SCORE_LINE, 'utf8'))
    expect(reader).toMatch(/entity\.score\b/)
    expect(reader).toContain('reason_facts')
    expect(reader).toContain('missing_axes')
    // Et il sait se taire : sans fait, pas de ligne.
    expect(reader).toMatch(/facts\.length === 0[\s\S]*return null/)
  })

  it('SAIT DIRE NON — un écran qui lirait `entity.score` à côté de l’appel est refusé', () => {
    const fautif = `const scoreLine = entityScoreLine(entity, t)\n<Text>{entity.score} pts</Text>`
    expect(entityScoreLeaks(fautif)).toEqual(['<Text>{entity.score} pts</Text>'])
  })
})

/**
 * #4016.L9.a — le prédicat : une ligne de score DIT-elle son nombre d'axes, et
 * ce nombre atteint-il le plancher du contrat ? Rend la liste des fautes,
 * NOMMÉES — vide quand la ligne est conforme.
 */
function scoreLineFaults(line: string): string[] {
  const counted = line.match(/(\d+) axes? sur (\d+) évalués?/)
  if (!counted) return ['score nu : aucun nombre d’axes']
  const evaluated = Number(counted[1])
  return evaluated < ACCOUNT_SCORE_MIN_EVALUATED_AXES
    ? [`score à ${evaluated} axe : sous le plancher de ${ACCOUNT_SCORE_MIN_EVALUATED_AXES}`]
    : []
}

describe('GA-58 (#4016.L9.a, Louis 13/10) — un score dès DEUX axes, qui dit TOUJOURS son nombre d’axes', () => {
  async function tFr() {
    const instance = i18next.createInstance()
    await instance.init({
      lng: 'fr',
      resources: { fr: { access: accessFr } },
      defaultNS: 'access',
      interpolation: { escapeValue: false },
    })
    return instance.t.bind(instance)
  }
  const deux: AccessEntityReasonFact[] = [
    { code: 'kind', kind: 'subsidiary', points: 25 },
    { code: 'contacts', count: 3, points: 18 },
  ]

  it('LIT quelque chose — le seul lecteur du nombre consulte le plancher du CONTRAT', () => {
    const reader = withoutComments(
      readFileSync(
        join(WEB_SRC, 'features', 'accounts', 'view', 'account-detail', 'tabs', 'entityScoreLine.ts'),
        'utf8',
      ),
    )
    expect(reader).toContain('accountScoreIsShowable(')
    expect(reader).toContain('entities.scoreAxesCount')
  })

  it('deux axes évaluables : la ligne existe et dit « 2 axes sur 4 évalués »', async () => {
    const line = entityScoreLine({ score: 43, reason_facts: deux, missing_axes: ['sites', 'rank1'] }, await tFr())
    expect(line).not.toBeNull()
    expect(scoreLineFaults(line ?? '')).toEqual([])
  })

  it('SAIT DIRE NON — un score à UN seul axe ne sort pas', async () => {
    const line = entityScoreLine(
      { score: 25, reason_facts: deux.slice(0, 1), missing_axes: ['contacts', 'sites', 'rank1'] },
      await tFr(),
    )
    expect(line).toBeNull()
    // …et le prédicat, devant le coupable factice, le NOMME.
    expect(scoreLineFaults('25 points, 1 axe sur 4 évalué : filiale identifiée +25.')).toEqual([
      'score à 1 axe : sous le plancher de 2',
    ])
  })

  it('SAIT DIRE NON — un score nu, sans nombre d’axes, est refusé', () => {
    // La ligne du 11/10, telle qu'elle sortait : les points, mais pas le nombre d'axes.
    expect(scoreLineFaults('43 points : filiale identifiée +25 · 3 contacts déjà identifiés +18.')).toEqual([
      'score nu : aucun nombre d’axes',
    ])
  })
})
