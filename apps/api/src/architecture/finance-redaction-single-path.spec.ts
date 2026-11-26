import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { REDACTED_FINANCE_FIELDS } from '@bellum/contracts'

/**
 * La rédaction financière vit à UN seul endroit — `redactFinance` (D45, 28/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ AVANT D'ÉCRIRE CETTE GARDE
 * ─────────────────────────────────────────────────────────────────────────────
 * Quatre rédactions écrites à la main, et elles avaient DÉJÀ divergé :
 *
 *  · `delivery.service.ts`     — `...(canReadFinance ? { marginPercent } : {})` → clé RETIRÉE
 *  · `mission-board.service.ts`— la même ligne, sur la même clé              → clé RETIRÉE
 *  · `staffing.service.ts`     — `if (!canReadFinance) return { terms: null, margin: null }` → `null`
 *  · le contrat portait `redactFinance`, juste, testé, et que PERSONNE n'appelait.
 *
 * La forme de la réponse dépendait donc de la route ET du rôle du lecteur. Un
 * client qui teste `data.margin === undefined` sur une route et `=== null` sur
 * l'autre finit par écrire `?? 0` — et « 0 % de marge » est une information
 * fausse là où l'absence de droit ne dit rien du tout.
 *
 * D45 tranche : un seul comportement, `redactFinance`, qui met le champ à
 * `null`. Cette garde empêche la cinquième rédaction à la main.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE GARDE PAS, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ Le prix de VENTE. Deux fausses alertes financières ont déjà été levées
 * dans ce dépôt là-dessus : le TJM facturé (`dailyRateCents`, `daily_rate`) sort
 * SANS `finance:read` — le board le rend inconditionnellement, et les agrégats
 * de colonne se calculent dessus. Ce qui se garde, c'est ce qui laisse remonter
 * au COÛT : le coût, la marge, et l'objet qui contient le coût. Une garde qui
 * élargirait la rédaction au TJM masquerait un chiffre que le produit montre
 * exprès — elle inventerait une règle au lieu d'en protéger une.
 *
 * D'où l'exception NOMMÉE ci-dessous : `shortlist.service.ts` met bien un champ
 * à `null` selon `canReadFinance`, mais ce champ est le TJM du profil, et ce
 * qu'il décide n'est pas la forme d'une réponse — c'est le contenu du SNAPSHOT
 * figé en base. Deux raisons distinctes de ne pas le verser ici.
 */

const MODULES = join(__dirname, '..', 'modules')

/**
 * Les fichiers de PRODUCTION du dossier `modules`.
 *
 * Les `.spec.ts` sont écartés : un test a le droit de DÉCRIRE la forme fautive
 * pour prouver qu'elle est refusée, et les compter ferait rougir la garde sur
 * la garde elle-même.
 */
function productionSources(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      out.push(...productionSources(path))
      continue
    }
    if (!name.endsWith('.ts')) continue
    if (name.endsWith('.spec.ts') || name.endsWith('.test.ts')) continue
    out.push(path)
  }
  return out
}

/** Le droit financier, sous toutes ses écritures : `canReadFinance`, `options.canReadFinance`, `input.canReadFinance`. */
const RIGHT = String.raw`[\w.]*canReadFinance`

/** Un champ qui porte un coût ou une marge, tel qu'il s'écrit dans un objet littéral. */
const FIELD = `(?:${REDACTED_FINANCE_FIELDS.join('|')})`

/**
 * Les trois formes de rédaction à la main qui ont réellement existé ici.
 *
 * Chacune est écrite contre le code qu'elle a trouvé, pas contre une forme
 * imaginée — une garde qui surveille une syntaxe que personne n'écrit est
 * borgne par construction.
 */
const HAND_WRITTEN_REDACTIONS: { name: string; pattern: RegExp }[] = [
  {
    // `...(canReadFinance ? { marginPercent: … } : {})` — la clé DISPARAÎT.
    name: 'diffusion conditionnelle gardée par le droit financier',
    pattern: new RegExp(String.raw`\.\.\.\(\s*${RIGHT}\s*\?`),
  },
  {
    // `if (!canReadFinance) return { terms: null, margin: null }`.
    name: 'sortie anticipée qui vide un champ financier à la main',
    pattern: new RegExp(String.raw`if\s*\(\s*!\s*${RIGHT}\s*\)[^\n]*return[^\n]*\b${FIELD}\b`),
  },
  {
    // `margin: canReadFinance ? … : null` — le ternaire posé sur le champ lui-même.
    name: 'ternaire sur le droit financier posé directement sur un champ de coût ou de marge',
    pattern: new RegExp(String.raw`\b${FIELD}\s*:\s*[^\n]*${RIGHT}\s*\?`),
  },
]

/**
 * Ce qui met un champ financier à `null` sans passer par `redactFinance`, et
 * qui est TENU pour légitime.
 *
 * Une exception se nomme et se justifie ; une exception muette est une fuite
 * qu'on a oublié de refermer.
 */
const NAMED_EXCEPTIONS: { file: string; reason: string }[] = [
  {
    file: 'consultants/matching/shortlist.service.ts',
    reason:
      "le champ est le TJM du profil — un prix de VENTE, visible par design — et ce qui est décidé n'est pas la forme d'une réponse mais le contenu du snapshot figé en base",
  },
  {
    file: 'delivery/staffing.service.ts',
    reason:
      "#2407.4 — `dailyRateCents` d'une affectation est lui-même NULLABLE en base (taux non encore saisi) : le rédiger à `null` (comme `redactFinance`) collerait « pas le droit de voir » et « rien saisi », deux faits que l'écran doit distinguer. La clé reste donc ABSENTE sans `finance:read`, jamais présente-et-vide — hors du champ que `redactFinance` couvre (`REDACTED_FINANCE_FIELDS` ne le liste pas), et le fichier appelle bien le helper par ailleurs pour la marge (D45).",
  },
]

/** Les services qui rédigent réellement, et qui doivent donc APPELER le helper. */
const MUST_CALL_HELPER = [
  'delivery/delivery.service.ts',
  'delivery/mission-board.service.ts',
  'delivery/staffing.service.ts',
  // La marge MOYENNE par consultant (PDF 2 §4.3), servie sur la fiche du vivier :
  // elle porte le nom `marginPercent` exprès, parce que c'est celui que
  // `redactFinance` connaît. Une quatrième rédaction écrite à la main ici aurait
  // rouvert la divergence que D45 vient de refermer.
  'delivery/propagation.service.ts',
  // « Prêt à facturer » (29/08/2026). Il ne rédigeait RIEN — ni à la main, ni
  // par le helper — et cette garde était verte parce que son corpus l'ignorait :
  // les trois motifs ne cherchent que des rédactions FAUTIVES, si bien qu'un
  // service qui n'en fait aucune passe pour propre. C'est la garde borgne du
  // dépôt dans sa forme la plus pure — verte sur ce qu'elle ne regarde pas.
  //
  // Le montant préparé, facturé et encaissé de chaque mois sortait donc à tout
  // membre authentifié, `viewer` et `recruiter` compris, sur une route sans
  // `@RequirePermission`.
  'delivery/invoice-readiness.service.ts',
]

describe('la rédaction financière passe par `redactFinance`, et par lui seul (D45)', () => {
  const files = productionSources(MODULES)
  const sources = new Map(files.map(path => [path, readFileSync(path, 'utf8')]))

  /* ---------------------------------------------------------------------- */
  /*  La garde LIT quelque chose                                            */
  /* ---------------------------------------------------------------------- */

  it('a un corpus — sinon elle serait verte sur du vide', () => {
    // Le faux zéro silencieux : un chemin qui n'existe pas rend zéro fichier,
    // zéro faute, et un test vert. Ce test-ci dit que la lecture a eu lieu.
    expect(files.length).toBeGreaterThan(200)
    expect([...sources.values()].every(source => source.length > 0)).toBe(true)
  })

  it('surveille une liste de champs NON VIDE, importée du contrat', () => {
    // `FIELD` se construit sur cette liste : vide, la regex `(?:)` filerait
    // tout. La liste vient du contrat pour qu'un champ ajouté là-bas soit
    // surveillé ici sans recopie — une clé recopiée à la main dérive.
    expect(REDACTED_FINANCE_FIELDS.length).toBeGreaterThanOrEqual(4)
    expect(REDACTED_FINANCE_FIELDS).toContain('margin')
    expect(REDACTED_FINANCE_FIELDS).toContain('marginPercent')
  })

  it('voit bien les appels au helper — la garde n’est pas branchée sur un nom mort', () => {
    const callers = files.filter(path => /\bredactFinance\s*\(/.test(sources.get(path) ?? ''))
    expect(callers.length).toBeGreaterThanOrEqual(MUST_CALL_HELPER.length)
  })

  /* ---------------------------------------------------------------------- */
  /*  La garde sait dire NON                                                */
  /* ---------------------------------------------------------------------- */

  it('reconnaît les trois formes fautives sur du code écrit exprès', () => {
    // Preuve que les motifs mordent : le code d'AVANT D45, tel qu'il était
    // écrit dans les trois services, doit être détecté par au moins un motif.
    const avant = [
      '...(canReadFinance ? { marginPercent: dailyMarginPercent(mission) } : {}),',
      '...(options.canReadFinance ? { marginPercent: marginPercent(rateCents, costCents) } : {}),',
      'if (!canReadFinance) return { terms: null, margin: null }',
      'margin: canReadFinance ? computeMargin(row) : null,',
    ]
    const missed = avant.filter(line => !HAND_WRITTEN_REDACTIONS.some(rule => rule.pattern.test(line)))
    expect(missed).toEqual([])
  })

  it('ne mord PAS sur ce qui n’est pas une rédaction', () => {
    // Une garde qui refuse tout ne protège rien : on vérifie qu'elle laisse
    // passer le passage du droit, et la phrase d'un axe qui change de FORMULE
    // sans rien retirer.
    const legitimes = [
      'const run = await this.matching.matchNeed(id, ws, user, { canReadFinance: false })',
      'const amounts = canReadFinance ? `${rate} €` : `écart de ${percent} %`',
      'return redactFinance({ margin: computeMargin(row) }, canReadFinance)',
      'dailyRateCents: input.canReadFinance ? rate : null,',
    ]
    const falsePositives = legitimes.filter(line => HAND_WRITTEN_REDACTIONS.some(rule => rule.pattern.test(line)))
    expect(falsePositives).toEqual([])
  })

  /* ---------------------------------------------------------------------- */
  /*  Le verdict                                                            */
  /* ---------------------------------------------------------------------- */

  it('n’a AUCUNE rédaction écrite à la main hors des exceptions nommées', () => {
    const offenders: string[] = []
    for (const [path, source] of sources) {
      const relative = path.slice(MODULES.length + 1)
      if (NAMED_EXCEPTIONS.some(exception => relative === exception.file)) continue
      for (const rule of HAND_WRITTEN_REDACTIONS) {
        // ⚠️ Pas de drapeau `g` : `RegExp.test()` avec `g` est STATEFUL et
        // saute une occurrence sur deux. Défaut déjà commis ici.
        if (rule.pattern.test(source)) offenders.push(`${relative} — ${rule.name}`)
      }
    }
    if (offenders.length > 0) {
      throw new Error(
        [
          'Rédaction financière écrite à la main. Passe par `redactFinance(objet, canReadFinance)`',
          '(packages/contracts/src/schemas/staffing.ts) : il met le champ à `null`, PRÉSENT et vide,',
          'jamais retiré et jamais à zéro. Rends aussi `canReadFinance` avec la réponse, sinon',
          '« pas le droit » et « pas mesuré » deviennent le même `null`.',
          ...offenders.map(offender => `  ${offender}`),
        ].join('\n'),
      )
    }
    expect(offenders).toEqual([])
  })

  /**
   * ⚠️ LE CLIQUET, ajouté le 29/08/2026 après un contrôle négatif qui a ÉCHOUÉ
   * à échouer.
   *
   * En retirant `invoice-readiness.service.ts` de `MUST_CALL_HELPER`, la garde
   * est restée VERTE : la liste ne se surveillait pas elle-même, si bien que la
   * façon la plus simple de faire taire cette garde était d'en retirer une
   * ligne — sans rien casser, et sans que personne le voie en relecture.
   *
   * Une liste de surveillance qui peut rétrécir en silence ne surveille rien.
   * Ces deux tests sont donc la garde DE la garde : le nombre ne redescend pas,
   * et chaque service déjà couvert le reste NOMMÉMENT.
   */
  it('la liste des services couverts ne RÉTRÉCIT pas', () => {
    expect(MUST_CALL_HELPER.length).toBeGreaterThanOrEqual(5)
  })

  it('chaque service déjà couvert le reste — retirer une ligne doit se VOIR', () => {
    for (const file of [
      'delivery/delivery.service.ts',
      'delivery/mission-board.service.ts',
      'delivery/staffing.service.ts',
      'delivery/propagation.service.ts',
      'delivery/invoice-readiness.service.ts',
    ]) {
      expect(MUST_CALL_HELPER).toContain(file)
      // Et le fichier existe : une entrée qui pointe un fichier disparu
      // surveillerait du vide (même règle que GA-38).
      expect(sources.has(join(MODULES, file))).toBe(true)
    }
  })

  it('les services qui rédigent APPELLENT le helper', () => {
    // L'autre moitié : ne pas rédiger à la main peut vouloir dire ne plus
    // rédiger du tout. Le motif du dépôt est « du code juste que personne
    // n'appelle » — `redactFinance` en était l'exemple avant D45.
    const missing = MUST_CALL_HELPER.filter(
      file => !/\bredactFinance\s*\(/.test(sources.get(join(MODULES, file)) ?? ''),
    )
    expect(missing).toEqual([])
  })

  it('chaque exception porte sa RAISON écrite', () => {
    // Une exception qui pointe un fichier disparu ne protège plus rien : elle
    // ouvre une porte sur du vide. GA-38 tient la même règle sur le registre
    // de doctrine.
    const dangling = NAMED_EXCEPTIONS.filter(exception => !sources.has(join(MODULES, exception.file)))
    expect(dangling).toEqual([])
    const unexplained = NAMED_EXCEPTIONS.filter(exception => exception.reason.length <= 40)
    expect(unexplained).toEqual([])
  })
})
