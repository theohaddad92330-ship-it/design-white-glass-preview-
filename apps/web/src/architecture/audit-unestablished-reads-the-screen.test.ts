/**
 * GA-345 — « Ce qui n'a pas pu être établi » décrit l'ÉCRAN, pas le profil.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT, MESURÉ EN PRODUCTION LE 16/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * `/settings/profile/audit`, compte réel, API `4172ec196`. L'écran rendait, dans
 * cet ordre et sur la MÊME page :
 *
 *   Plan à 4 semaines            → « non mesuré »
 *   Paliers                      → « non mesuré »
 *   Ce que Laura pourra régler   → « non mesuré »
 *   Ce qui n'a pas pu être établi → « Tout ce que cet écran affiche a pu être
 *                                    établi. »
 *
 * Le bloc dont le métier est de NOMMER ce qui manque déclarait qu'il ne manquait
 * rien, trois blocs plus bas. La cause : `unestablished` ne dérivait que des
 * entrées du PROFIL (huit `if (!x) push(...)`), et les trois blocs ci-dessus
 * arrivent par le CONTRAT — ils n'y entraient jamais. C'est GA-18 / GA-19 pris à
 * revers : l'absence était nommée en place, puis démentie en bas de page.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE VÉRIFIE
 * ─────────────────────────────────────────────────────────────────────────────
 * La réparation est une FORME : un bloc ne s'ajoute plus à la liste, il déclare
 * son état dans `blockStates` (`features/commercial-audit/lib/build-audit.ts`),
 * et la liste lit cette table. Deux cliquets y sont tenus par le compilateur
 * (la table est un `Record` sur l'union des clés ; la liste est un `filter`,
 * plus un `push`). Le troisième ne l'est pas : rien n'empêche d'ÉCRIRE un
 * nouveau bloc « non mesuré » dans le JSX sans lui donner de clé du tout — et
 * c'est exactement ce qui s'était produit.
 *
 * Cette garde lit donc le JSX des composants de l'audit, relève chaque bloc qui
 * rend une absence (la clé i18n `<groupe>.unmeasured`), et exige que chacun
 * soit DÉCLARÉ dans la dérivation — mesuré en EXÉCUTANT `buildCommercialAudit`,
 * pas en relisant son texte.
 *
 * Ce qu'elle NE vérifie PAS : qu'un bloc déclaré dise VRAI sur son état. Un
 * `established: true` écrit à tort ne se lit pas dans le JSX ; c'est
 * `lib/build-audit.test.ts` qui le tient, sur la valeur rendue elle-même.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AuditActiveLoad, AuditSignalsInput, ProfileContext } from '@bellum/contracts'
import { buildCommercialAudit, type AuditOrigin } from '@/features/commercial-audit/lib/build-audit'

const WEB_SRC = join(__dirname, '..')
const AUDIT_FEATURE = join(WEB_SRC, 'features', 'commercial-audit')

/**
 * Chaque groupe i18n qui rend « non mesuré », et par quel chemin sa clé entre
 * dans la liste. Un groupe INCONNU fait rougir : écrire un nouveau bloc qui
 * nomme une absence est une décision, et elle se prend ici ET dans la
 * dérivation. Les deux formes du dépôt, relevées par cette garde le
 * 16/09/2026 :
 *
 *  - `fixed` : un bloc UNIQUE, dont l'absence est celle d'une source entière.
 *    Sa clé est un littéral, déclaré dans `blockStates`. Ce sont les trois que
 *    la production a pris en défaut.
 *  - `perOrigin` : un bloc rendu PAR ITEM, et chaque item porte son `origin`
 *    (typé `AuditOrigin`, donc garanti par le compilateur). Sa clé n'est pas
 *    un littéral : elle arrive avec la donnée, et se vérifie en EXÉCUTANT la
 *    dérivation — voir le test « par ITEM » plus bas.
 *  - `derived` : TROISIÈME forme, relevée à l'intégration de la vague 12 bis
 *    (16/09/2026). Cette garde est née sur une branche qui avait forké AVANT
 *    #2064/#2065/#2066/#2090 ; ces trois blocs-là n'existaient pas quand ses
 *    deux premières formes ont été écrites. Leur absence n'est PAS celle d'une
 *    source : ils sont calculés à la volée sur le MÊME `ProfileContext` que le
 *    reste de l'audit, et « non mesuré » y est un RÉSULTAT (« rien n'a pu être
 *    tranché »), pas un bloc qui n'est jamais arrivé. Ils ne peuvent donc pas
 *    porter de clé dans `blockStates` : il n'existe aucune source dont on
 *    pourrait dire qu'elle manque. ⚠️ Savoir s'ils doivent malgré tout entrer
 *    dans « Ce qui n'a pas pu être établi » est un arbitrage PRODUIT, pas un
 *    geste de fusion — il reste OUVERT. Chaque entrée `derived` DOIT écrire sa
 *    raison, et le test ci-dessous fait rougir celle qui se tait.
 */
const UNMEASURED_BLOCKS: Record<
  string,
  | { shape: 'fixed'; key: string }
  | { shape: 'perOrigin' }
  | { shape: 'derived'; reason: string }
  | { shape: 'perQuantity'; keys: Readonly<Record<keyof AuditActiveLoad, string>> }
> = {
  // #2067.2 / .4 / .5 / .6 — QUATRIÈME forme (18/09/2026) : un bloc rendu PAR
  // GRANDEUR, chaque grandeur « non établie » portant SA clé dans la liste, et
  // la réponse qui lui manque. Vérifiée en EXÉCUTANT la dérivation, plus bas
  // (« GA-345 (#2067) »), jamais en relisant son texte.
  activeLoad: {
    shape: 'perQuantity',
    keys: {
      partners: 'activeLoadPartners',
      slots: 'activeLoadSlots',
      reserve: 'activeLoadReserve',
      deferred: 'activeLoadDeferred',
    },
  },
  plan: { shape: 'fixed', key: 'thirtyDayPlan' },
  milestones: { shape: 'fixed', key: 'milestones' },
  productConfiguration: { shape: 'fixed', key: 'productConfiguration' },
  // #2042.15 / #2043.10 / #2049.15 / #2050.14 / #2051.16 — QUATRIÈME bloc
  // `fixed`, et le seul des quatre qui ait déjà une source : les réponses du
  // questionnaire. Son absence se répare donc en RÉPONDANT (`profileMissing`),
  // pas en attendant un moteur — c'est pourquoi il n'est pas `derived`.
  declaredSignals: { shape: 'fixed', key: 'declaredSignals' },
  columns: { shape: 'perOrigin' },
  consequences: { shape: 'perOrigin' },
  strategyOptions: { shape: 'perOrigin' },
  verdict: {
    shape: 'derived',
    reason:
      "#2090 — `buildAuditVerdict` (`lib/audit-verdict.ts`) tranche sur les ruptures et le goulot DÉJÀ calculés ; aucune source ne lui est propre. « Rien n'a pu être tranché » est son résultat quand aucune règle ne s'est déclenchée.",
  },
  maturity: {
    shape: 'derived',
    reason:
      "#2065 — `maturity-axes.ts` rend TOUJOURS ses 12 axes nommés, mesurés ou non (un score n'est jamais nu). Le libellé « non mesuré » dit qu'il y a moins de 3 axes évaluables, donc pas de score GLOBAL — les axes, eux, sont nommés en place.",
  },
  priority: {
    shape: 'derived',
    reason:
      "#2090.36 — `buildAuditWeeklyPriority` (`lib/audit-priority.ts`) reprend la question à valider de la rupture la plus significative, ou le conseil clé du profil. Sans l'une ni l'autre, elle ne nomme rien plutôt que d'inventer une action.",
  },
  moves: {
    shape: 'derived',
    reason:
      "#2074.10-.15 / #2090.7 — `auditMovesFrom` (`packages/contracts/.../commercial-audit-moves.ts`) dérive AU PLUS trois mouvements des ruptures DÉJÀ calculées ; aucune source ne lui est propre. « Aucun mouvement ne peut être proposé » est son résultat quand aucune règle de tension ne s'est déclenchée — jamais un bloc qui ne serait pas arrivé.",
  },
  // #2010.10 — CINQUIÈME bloc dérivé, même nature que `moves` juste au-dessus :
  // `auditHypothesesFrom` (`packages/contracts/.../commercial-audit-hypotheses.ts`)
  // dérive une hypothèse par contradiction qui porte une explication possible,
  // sur les MÊMES ruptures DÉJÀ calculées ; aucune source ne lui est propre.
  // « Rien à relire » est son résultat quand aucune contradiction ne nomme
  // d'explication — jamais un bloc qui ne serait pas arrivé.
  hypotheses: {
    shape: 'derived',
    reason:
      "#2010.10 — `auditHypothesesFrom` (`packages/contracts/.../commercial-audit-hypotheses.ts`) dérive une hypothèse par contradiction qui porte une explication possible, sur les MÊMES ruptures DÉJÀ calculées ; aucune source ne lui est propre. « Rien à relire » est son résultat quand aucune contradiction n'en nomme une — jamais un bloc qui ne serait pas arrivé.",
  },
}

/**
 * ⚠️ LES DEUX SEULS BLOCS PLUS ÉTROITS QUE LEUR ORIGINE, mesurés le 16/09/2026.
 *
 * Ils rendent « non mesuré » alors que leur bloc source EXISTE : ce qui manque
 * est un SOUS-CHAMP laissé vide (`coachingInsights.mainWeakness`,
 * `messagingStyle.valuePropositionAngle`). La liste les tait donc, et c'est un
 * défaut CONNU, plus étroit que celui réparé ici : l'écran ne se dément plus —
 * les trois blocs du contrat y sont toujours — mais ces deux absences-là ne
 * sont pas nommées. Les nommer demande un LIBELLÉ par bloc (« la règle de
 * message », « le goulot principal ») et non par origine : c'est un lot à part.
 *
 * Cette liste est ASSERTÉE exercée : si un troisième cas apparaît, la garde
 * rougit ; si l'un des deux disparaît, elle rougit aussi plutôt que de garder
 * une exception morte.
 */
const NARROWER_THAN_THEIR_ORIGIN = ['headline:bottleneck', 'consequence:messages']

/**
 * Un profil COMPLET — aucune entrée manquante, rien à nommer côté profil.
 *
 * ⚠️ 18/09/2026 — il porte désormais une RUPTURE réelle (quatre secteurs
 * prioritaires, au-dessus de `MAX_SIMULTANEOUS_MARKETS`). Un profil complet
 * n'est pas un profil sans tension : une tension naît de réponses complètes
 * qui se contredisent, pas d'une réponse manquante. C'est ce qui rend ce
 * témoin capable de vérifier le QUATRIÈME bloc dérivé (#2074.10-.15,
 * `moves`) : contrairement au verdict et à la priorité, qui ont un repli sur
 * le goulot et sur le conseil clé, un mouvement ne se dérive QUE d'une
 * rupture — sans rupture, il n'y a honnêtement aucun geste à proposer, et
 * inventer un repli serait la donnée fictive que ce dépôt refuse.
 */
const FULL: ProfileContext = {
  esnArchetype: 'boutiqueExpert',
  sellingPosture: 'expertiseRare',
  idealAccountProfile: {
    size: 'eti',
    sectorsPriority: ['Banque', 'Assurance', 'Industrie', 'Santé'],
    decisionLevel: 'manager',
    entryStrategy: 'bottomUp',
  },
  analysisParameters: {
    braveQueriesCount: 12,
    firecrawlPagesCount: 6,
    contactsTarget: 40,
    analysisDepth: 'standard',
    maxTokensResearch: 12000,
    focusAreas: ['Data'],
  },
  messagingStyle: {
    tone: 'consultative',
    messageLength: 'concise',
    valuePropositionAngle: 'La reprise de dette technique',
    differentiationPoints: ['Crédibilité technique'],
    avoid: ['Ouvrir dix fronts'],
  },
  coachingInsights: {
    mainWeakness: 'Les dossiers avancent sans responsable',
    keyAdvice: 'Rappeler les reprises datées',
    cadenceRecommendation: { analysesPerWeek: 3, messagesPerDay: 5, followUpsPerWeek: 4 },
    kpiTargets: { accountsPerMonth: 8, rdvPerMonth: 4, conversionRateTarget: '12 %' },
  },
  bellumPhrases: {
    welcome: 'On reprend là où tu en étais',
    firstAnalysisCta: 'Ouvre un premier compte',
    weeklySummaryIntro: 'Cette semaine',
    emptyState: 'Rien pour le moment',
    scoreContext: 'Décomposé par axe',
  },
}

/**
 * Les profils sur lesquels l'invariant se mesure. Les deux derniers sont les
 * cas où un bloc source EXISTE mais laisse son champ porteur vide — ce sont
 * eux qui produisent `NARROWER_THAN_THEIR_ORIGIN`.
 */
const PROFILES: (ProfileContext | null)[] = [
  null,
  FULL,
  { ...FULL, messagingStyle: { ...FULL.messagingStyle!, valuePropositionAngle: '   ' } },
  { ...FULL, coachingInsights: { ...FULL.coachingInsights!, mainWeakness: '  ' } },
]

/**
 * #2457 — LA QUATRIÈME QUESTION : UN BLOC DÉRIVÉ ARRIVE-T-IL VRAIMENT DANS LA
 * LISTE, AVEC UNE RAISON QUI DIT COMBIEN ?
 *
 * Décision Louis 16/09/2026 : `verdict`, `maturity` et `priority` ne
 * manquent pas d'une SOURCE — ils n'ont pas pu CONCLURE, faute d'assez
 * d'entrées mesurées. Jusqu'ici, `UNMEASURED_BLOCKS` ci-dessus les
 * DOCUMENTAIT (shape `derived`, une phrase de plus de 80 caractères) sans
 * qu'aucun test n'exécute `build-audit.ts` pour vérifier que l'entrée
 * atterrit VRAIMENT dans `unestablished`, ni qu'elle y porte autre chose
 * qu'une clé et un état — exactement le défaut que ce fichier corrige pour
 * les blocs FIXES depuis le 16/09/2026, un cran plus haut : une conclusion
 * non tirée qui ne dit pas COMBIEN il a manqué pour trancher.
 *
 * Un entier retourné dans le détail suffit à prouver la garde : la vraie
 * FIDÉLITÉ du texte (FR/EN, grammaire) est hors de portée d'un test qui lit
 * une STRUCTURE, pas une phrase — voir `AuditUnestablished.test.tsx` et
 * `commercialAudit.json` pour la formulation elle-même.
 */
function derivedEntryDetail(entry: { key: string; reason: string }): Record<string, unknown> {
  const { key, reason, ...detail } = entry as unknown as Record<string, unknown>
  return detail
}

describe('GA-345 (#2457) — un bloc DÉRIVÉ non conclu ARRIVE dans la liste, avec une raison NOMMÉE', () => {
  const files = sourceFiles(AUDIT_FEATURE)
  const groups = new Set<string>()
  for (const file of files)
    for (const group of unmeasuredGroups(stripComments(readFileSync(file, 'utf8')))) groups.add(group)
  const derived = [...groups].filter(group => UNMEASURED_BLOCKS[group]?.shape === 'derived')

  it('LIT un corpus de blocs dérivés qui n’est pas vide', () => {
    // Sans cette assertion, un renommage ferait cette garde verte en ne lisant
    // rien — le défaut le plus fréquent des gardes de ce dépôt.
    expect(derived.length).toBeGreaterThanOrEqual(3)
  })

  it('profil ABSENT : les trois n’ont rien pour conclure — les trois ARRIVENT, chacune avec un détail', () => {
    const entries = buildCommercialAudit(null, []).unestablished
    for (const group of derived) {
      const entry = entries.find(item => item.key === group)
      expect(
        entry,
        `« ${group} » ne rend pas « non mesuré » dans build-audit.ts alors que rien ne permet de conclure`,
      ).toBeDefined()
      const detail = derivedEntryDetail(entry!)
      expect(
        Object.keys(detail).length > 0,
        `« ${group} » entre dans la liste sans porter de détail — juste une clé et un état, pas de COMBIEN`,
      ).toBe(true)
    }
  })

  it('N’ATTRAPE PAS ce qu’elle ne vise pas — un bloc dérivé qui a CONCLU n’apparaît pas', () => {
    // `FULL` (plus bas dans ce fichier) a de quoi trancher les trois : une
    // contradiction ou un goulot pour le verdict, un conseil pour la
    // priorité, au moins 3 axes pour la maturité.
    const entries = buildCommercialAudit(FULL, []).unestablished
    for (const group of derived) {
      expect(
        entries.some(item => item.key === group),
        `« ${group} » a pu CONCLURE sur un profil complet mais apparaît quand même dans la liste`,
      ).toBe(false)
    }
  })

  it('SAIT DIRE NON — une entrée dérivée sans détail est celle que cette garde refuse', () => {
    // Témoin construit, pas une lecture de production : une entrée qui ne
    // porterait que { key, reason }, comme celle qu'un régression pourrait
    // pousser en oubliant le compte.
    const rogue = { key: 'verdict', reason: 'notConcluded' }
    expect(Object.keys(derivedEntryDetail(rogue)).length).toBe(0)
  })
})

/**
 * #2067.2 / .4 / .5 / .6 — LA QUATRIÈME FORME, MESURÉE EN EXÉCUTANT LA DÉRIVATION.
 *
 * Une grandeur de l'arbitrage que l'écran rend « Non établi » (`answerMissing`,
 * `notAsked`) doit ARRIVER dans la liste sous SA clé ; une grandeur établie ne
 * doit PAS y être. Rend les grandeurs où l'écran et la liste se contredisent.
 */
function quantitiesAtOdds(
  audit: Pick<ReturnType<typeof buildCommercialAudit>, 'activeLoad' | 'unestablished'>,
  keys: Readonly<Record<keyof AuditActiveLoad, string>>,
): string[] {
  const listed = new Set<string>(audit.unestablished.map(entry => entry.key))
  return (Object.keys(keys) as (keyof AuditActiveLoad)[]).filter(name => {
    const rendersAbsence = audit.activeLoad[name].kind === 'answerMissing'
    return rendersAbsence !== listed.has(keys[name])
  })
}

describe('GA-345 (#2067) — chaque grandeur « non établie » de l’arbitrage ARRIVE dans la liste, sous sa clé', () => {
  const block = UNMEASURED_BLOCKS.activeLoad
  const keys = block?.shape === 'perQuantity' ? block.keys : null
  const COMPLETE: AuditSignalsInput = {
    weekly_sales_time_protected: '10 à 20 heures par semaine',
    weekly_sales_time_slots: ['Tôt le matin, avant 9 h'],
    go_to_market_channels: ['Direct client final'],
  }
  const CASES: (AuditSignalsInput | undefined)[] = [
    undefined,
    {},
    COMPLETE,
    { ...COMPLETE, go_to_market_channels: ['Rang 2', 'Mixte'] },
    // #2067.2 — une porte partenaire AVEC le nombre déclaré : établie.
    { ...COMPLETE, go_to_market_channels: ['Rang 2'], partners_regular_count: '2' },
  ]

  it('LIT : le bloc est rendu par l’écran, et le corpus couvre les deux états', () => {
    const groups = new Set<string>()
    for (const file of sourceFiles(AUDIT_FEATURE))
      for (const group of unmeasuredGroups(stripComments(readFileSync(file, 'utf8')))) groups.add(group)
    expect(groups.has('activeLoad')).toBe(true)
    expect(keys).not.toBeNull()
    const kinds = CASES.flatMap(answers => Object.values(buildCommercialAudit(FULL, [], answers).activeLoad))
    expect(kinds.some(q => q.kind === 'answerMissing')).toBe(true)
    expect(kinds.some(q => q.kind !== 'answerMissing')).toBe(true)
    expect(kinds.some(q => q.kind === 'regularPartners')).toBe(true)
  })

  it('aucune grandeur ne se tait, aucune grandeur établie n’est accusée', () => {
    for (const answers of CASES) expect(quantitiesAtOdds(buildCommercialAudit(FULL, [], answers), keys!)).toEqual([])
  })

  it('SAIT DIRE NON — une liste qui oublie la réserve non établie est refusée', () => {
    const audit = buildCommercialAudit(FULL, [], {})
    const rogue = { ...audit, unestablished: audit.unestablished.filter(entry => entry.key !== 'activeLoadReserve') }
    expect(quantitiesAtOdds(rogue, keys!)).toEqual(['reserve'])
  })
})

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry)) out.push(full)
  }
  return out
}

/**
 * Les groupes i18n qui rendent une absence de bloc. `RegExp` RECRÉÉE à chaque
 * appel : `exec` en boucle sur une instance partagée est STATEFUL avec le
 * drapeau `g`, et le dépôt a déjà produit une garde borgne par ce chemin.
 */
function unmeasuredGroups(source: string): string[] {
  const pattern = /t\(\s*'([A-Za-z0-9_]+)\.unmeasured'\s*\)/g
  const found = new Set<string>()
  let match = pattern.exec(source)
  while (match !== null) {
    found.add(match[1])
    match = pattern.exec(source)
  }
  return [...found]
}

describe('GA-345 — la liste des non-établis lit l’écran', () => {
  const files = sourceFiles(AUDIT_FEATURE)
  const groups = new Set<string>()
  for (const file of files)
    for (const group of unmeasuredGroups(stripComments(readFileSync(file, 'utf8')))) groups.add(group)

  it('LIT un corpus qui n’est pas vide', () => {
    // Sans cette assertion, un renommage de dossier rendrait la garde verte en
    // ne lisant rien — le défaut le plus fréquent des gardes de ce dépôt.
    expect(files.length).toBeGreaterThanOrEqual(5)
    expect(files.some(file => file.endsWith('AuditPlanAndMilestones.tsx'))).toBe(true)
    expect(groups.size).toBeGreaterThanOrEqual(3)
  })

  it('chaque bloc FIXE qui rend « non mesuré » est DÉCLARÉ dans la dérivation', () => {
    // Profil vide : tout ce que la dérivation sait nommer y est nommé.
    const everything = buildCommercialAudit(null, []).unestablished.map(entry => entry.key)
    expect(everything.length).toBeGreaterThanOrEqual(3)

    for (const group of groups) {
      const block = UNMEASURED_BLOCKS[group]
      expect(
        block,
        `Le bloc « ${group} » rend une absence mais n'est pas déclaré. Donne-lui une clé dans blockStates (build-audit.ts) et déclare sa forme dans UNMEASURED_BLOCKS.`,
      ).toBeDefined()
      if (block?.shape === 'fixed') {
        expect(everything, `« ${group} » rend « non mesuré » sans entrer dans la liste`).toContain(block.key)
      }
    }
    // Le témoin de lecture : les blocs fixes ont bien été RENCONTRÉS
    // dans le JSX — sinon ce test serait vert sans rien avoir vérifié.
    // `declaredSignals` s'y ajoute le 16/09/2026 (#2042.15 → #2051.16).
    const fixed = [...groups].filter(group => UNMEASURED_BLOCKS[group]?.shape === 'fixed')
    expect(fixed.sort()).toEqual(['declaredSignals', 'milestones', 'plan', 'productConfiguration'])
    // Même témoin pour la troisième forme : les trois blocs DÉRIVÉS de la
    // vague 12 sont bien rendus, et aucun ne se tait sur sa raison — une
    // exception muette est une exception que personne ne peut relire.
    const derived = [...groups].filter(group => UNMEASURED_BLOCKS[group]?.shape === 'derived')
    // `moves` s'y ajoute le 18/09/2026 (#2074.10-.15 / #2090.7) : quatrième
    // bloc DÉRIVÉ, même source que `priority` (les ruptures déjà calculées).
    // `hypotheses` s'y ajoute le 22/09/2026 (#2010.10) : cinquième bloc DÉRIVÉ,
    // même source que `moves`.
    expect(derived.sort()).toEqual(['hypotheses', 'maturity', 'moves', 'priority', 'verdict'])
    for (const group of derived) {
      const block = UNMEASURED_BLOCKS[group]
      expect(
        block?.shape === 'derived' && block.reason.length > 80,
        `« ${group} » est déclaré DÉRIVÉ sans dire pourquoi son absence n'est pas celle d'une source.`,
      ).toBe(true)
    }
  })

  it('chaque bloc PAR ITEM entre dans la liste par son `origin`, sauf les deux cas nommés', () => {
    const seen = new Set<string>()
    let rendered = 0
    for (const profile of PROFILES) {
      const audit = buildCommercialAudit(profile, [])
      const keys = new Set(audit.unestablished.map(entry => entry.key))
      const unmeasured: readonly (readonly [string, AuditOrigin])[] = [
        ...audit.headlines
          .filter(item => item.value === null)
          .map(item => [`headline:${item.key}`, item.origin] as const),
        ...audit.columns.filter(item => item.items === null).map(item => [`column:${item.key}`, item.origin] as const),
        ...audit.consequences
          .filter(item => item.rule === null)
          .map(item => [`consequence:${item.key}`, item.origin] as const),
      ]
      rendered += unmeasured.length
      for (const [label, origin] of unmeasured) {
        if (keys.has(origin)) continue
        seen.add(label)
        expect(NARROWER_THAN_THEIR_ORIGIN, `« ${label} » rend « non mesuré » sans que rien ne le nomme`).toContain(
          label,
        )
      }
    }
    // Le corpus n'est pas vide : un profil complet n'en rend aucun, le profil
    // absent les rend tous — si ce compte tombait à zéro, la boucle ci-dessus
    // serait verte sans avoir rien lu.
    expect(rendered).toBeGreaterThanOrEqual(10)
    // Aucune exception morte : les deux cas connus se produisent vraiment.
    expect([...seen].sort()).toEqual([...NARROWER_THAN_THEIR_ORIGIN].sort())
  })

  it('SAIT DIRE NON — un bloc « non mesuré » sans clé est refusé', () => {
    const rogue = `<Text>{t('common:unknownValue')}</Text><Text>{t('nouveauBloc.unmeasured')}</Text>`
    const found = unmeasuredGroups(rogue)
    expect(found).toEqual(['nouveauBloc'])
    expect(UNMEASURED_BLOCKS[found[0]]).toBeUndefined()
  })

  it('N’ATTRAPE PAS ce qu’elle ne vise pas — les voisins légitimes', () => {
    const witness = [
      // Une valeur absente DANS un bloc présent : ce n'est pas un bloc « non
      // mesuré », c'est une case vide d'une ligne mesurée (#2068.32).
      "<Text>{`${parameter.key} : ${parameter.value ?? t('common:unknownValue')}`}</Text>",
      // Une liste mesurée et VIDE : le bloc existe et ne nomme rien.
      "<Text>{t('plan.noPriority')}</Text>",
      "<Text>{t('productConfiguration.noParameter')}</Text>",
      // Le mot dans un commentaire, et un identifiant qui lui ressemble.
      '// un jour ce bloc ne sera plus unmeasured',
      'const unmeasured = blocks.filter(isNull).length',
      "t('milestones.title')",
    ].join('\n')
    expect(unmeasuredGroups(stripComments(witness))).toEqual([])

    // Et le témoin de l'écran RÉEL : un bloc PAR ITEM n'est pas un bloc fixe,
    // il ne doit donc exiger AUCUNE clé littérale dans la dérivation.
    expect(UNMEASURED_BLOCKS.columns?.shape).toBe('perOrigin')
    expect(UNMEASURED_BLOCKS.consequences?.shape).toBe('perOrigin')
  })

  it('la phrase de secours ne sort que sur une liste VIDE', () => {
    const component = readFileSync(join(AUDIT_FEATURE, 'components', 'AuditUnestablished.tsx'), 'utf8')
    const body = stripComments(component)
    expect(body).toMatch(/entries\.length === 0 \?/)
    // `unestablished.none` est la SEULE phrase de ce bloc qui puisse mentir :
    // les autres nomment une absence, celle-ci en nie une.
    expect(body.match(/unestablished\.none/g)).toHaveLength(1)
  })
})
