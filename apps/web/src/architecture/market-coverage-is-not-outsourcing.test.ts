import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-259 — #1633.2 / #1635.3 — UN TAUX DE COUVERTURE N'EST PAS UN FAIT DE MARCHÉ.
 *
 * Numéro attribué à l'intégration du 08/09/2026 — à vérifier à la fusion,
 * plusieurs lots parallèles posent des gardes le même jour. GA-258 était le
 * plus haut existant (`apps/api/src/architecture/market-memory-single-source-of-truth.spec.ts`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET QUI L'A ÉCRITE
 * ─────────────────────────────────────────────────────────────────────────────
 * Les deux issues qui demandent ce bloc portent le même garde-fou, chacune de
 * son côté, ce qui n'est pas un hasard : c'est la lecture que TOUT LE MONDE
 * fait spontanément d'un pourcentage de couverture.
 *
 * · #1633 : « "72 % de couverture" signifie : 72 % des comptes ont un contexte
 *   Market Memory exploitable. Jamais : 72 % externalisent. »
 * · #1635 : « Ne jamais traduire cela en : "39 % de vos comptes
 *   n'externalisent pas." »
 *
 * Un taux de couverture mesure CE QUE NOUS SAVONS. Le traduire en un fait sur
 * le comportement d'achat des comptes, c'est la faute de « non mesuré rendu
 * zéro » d'un cran plus haut : au lieu d'un chiffre faux sur une ligne, une
 * phrase fausse sur tout un portefeuille. Et elle est plus dangereuse, parce
 * qu'un commercial peut la répéter en rendez-vous.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LA NÉGATION EST INTERDITE AUSSI
 * ─────────────────────────────────────────────────────────────────────────────
 * « Ce taux ne dit pas qu'ils externalisent » est vrai, et pourtant refusé ici.
 * Deux raisons, toutes deux mesurées ailleurs dans ce dépôt :
 *
 * 1. **Un libellé se lit hors de son contexte** — dans une infobulle, dans un
 *    lecteur d'écran, dans un export. La négation se perd, le mot reste.
 * 2. **Une négation est à un remaniement de devenir une affirmation.** C'est
 *    exactement ce qui est arrivé au fragment « Recours à des externes », dont
 *    l'absence d'observation avait fini par se lire « n'externalise pas ».
 *
 * La formulation POSITIVE suffit, et c'est celle que les deux issues demandent :
 * « ces comptes ont un contexte exploitable ». `coverage.meaning` la porte, et
 * ce test vérifie qu'elle EXISTE et qu'elle est RENDUE — une garde protège une
 * règle, elle ne se contente pas d'en interdire le contraire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE VISE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le mot est parfaitement légitime AILLEURS : `market_company_signal.
 * externalization_score` est une colonne réelle du corpus, et
 * `packages/contracts/src/schemas/market-memory-scoring.ts` explique en toutes
 * lettres pourquoi elle ne s'affiche pas. La garde n'ancre donc rien sur le
 * corpus entier : elle porte sur le BLOC de couverture du portefeuille et sur
 * SON espace de noms, et un test ci-dessous prouve sur le fichier réel que le
 * voisin légitime n'est pas attrapé.
 *
 * Elle retire aussi les COMMENTAIRES avant de lire : le fichier
 * `MarketStructuralFitCard.tsx` explique pourquoi il ne gradue pas, et il le
 * fait en nommant le score d'externalisation. Une garde qui lit sa propre
 * justification compare du bruit à du bruit.
 */

const WEB_SRC = join(__dirname, '..')
const FEATURE_DIR = join(WEB_SRC, 'features', 'market-memory')
const LOCALES = join(WEB_SRC, 'i18n', 'locales')
const FR_LABELS = join(LOCALES, 'fr', 'marketMemory.json')
const EN_LABELS = join(LOCALES, 'en', 'marketMemory.json')
const COVERAGE_CARD = join(FEATURE_DIR, 'view', 'MarketMemoryCoverageCard.tsx')
/** Le voisin LÉGITIME : il nomme le score, et c'est sa raison d'être. */
const SCORING_FLAG = join(
  WEB_SRC,
  '..',
  '..',
  '..',
  'packages',
  'contracts',
  'src',
  'schemas',
  'market-memory-scoring.ts',
)

/**
 * Le vocabulaire du recours à des prestataires, dans les deux langues.
 *
 * Des RACINES et non des mots entiers : « externalisent », « externalisation »,
 * « externalisé » sont la même faute conjuguée. ⚠️ « externe » n'y est PAS —
 * « Recours à des externes » est le libellé légitime du dossier de compte, où
 * il qualifie une OBSERVATION et non un taux.
 */
const OUTSOURCING_ROOTS: readonly string[] = ['externalis', 'externaliz', 'sous-trait', 'outsourc']

/** Retire les commentaires AVANT de lire — une garde ne lit pas sa propre justification. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function outsourcingRootFound(text: string): string | null {
  const folded = text.toLowerCase()
  return OUTSOURCING_ROOTS.find(root => folded.includes(root)) ?? null
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** Toutes les valeurs de chaînes d'un catalogue, à plat. */
function labelValues(path: string): string[] {
  const out: string[] = []
  const walk = (node: unknown) => {
    if (typeof node === 'string') {
      out.push(node)
      return
    }
    if (node && typeof node === 'object') for (const value of Object.values(node)) walk(value)
  }
  walk(JSON.parse(readFileSync(path, 'utf8')))
  return out
}

describe('GA-259 — la garde LIT vraiment quelque chose', () => {
  it('les deux catalogues et le bloc existent, et ils ne sont pas vides', () => {
    for (const path of [FR_LABELS, EN_LABELS, COVERAGE_CARD]) {
      expect(existsSync(path), `disparu : ${path}`).toBe(true)
    }
    expect(labelValues(FR_LABELS).length).toBeGreaterThan(20)
    expect(labelValues(EN_LABELS).length).toBeGreaterThan(20)
    expect(sourceFiles(FEATURE_DIR).length).toBeGreaterThanOrEqual(3)
  })

  it('contrôle positif — le corpus gardé parle BIEN de couverture', () => {
    // Sans cette ligne, un fichier renommé viderait la garde en silence : elle
    // ne trouverait plus rien nulle part, donc aucun coupable, donc vert.
    const fr = labelValues(FR_LABELS).join(' ').toLowerCase()
    expect(fr).toContain('couverture')
    const en = labelValues(EN_LABELS).join(' ').toLowerCase()
    expect(en).toContain('coverage')
  })
})

describe('GA-259 — le détecteur sait dire NON', () => {
  it('attrape la phrase exacte que #1633 refuse', () => {
    expect(outsourcingRootFound('72 % de vos comptes externalisent')).toBe('externalis')
  })

  it('attrape la phrase exacte que #1635 refuse, négation comprise', () => {
    expect(outsourcingRootFound("39 % de vos comptes n'externalisent pas")).toBe('externalis')
  })

  it('attrape la version anglaise, dans les deux orthographes', () => {
    expect(outsourcingRootFound('39% of your accounts do not outsource')).toBe('outsourc')
    expect(outsourcingRootFound('accounts that externalize their IT')).toBe('externaliz')
  })

  it('attrape « sous-traitance », qui dit la même chose autrement', () => {
    expect(outsourcingRootFound('38 comptes en sous-traitance')).toBe('sous-trait')
  })
})

describe('GA-259 — elle n’attrape pas ce qu’elle ne vise pas', () => {
  it('laisse « externe », qui qualifie une OBSERVATION et non un taux', () => {
    expect(outsourcingRootFound('Recours à des externes — Observé')).toBeNull()
    expect(outsourcingRootFound('des consultants externes ont été observés')).toBeNull()
  })

  it('ne prend pas un COMMENTAIRE pour un libellé', () => {
    const commentaire = "// on ne dit jamais qu'un compte externalise\n const label = 'Comptes couverts'"
    expect(outsourcingRootFound(stripComments(commentaire))).toBeNull()
  })

  it('laisse le voisin LÉGITIME, qui nomme le score et explique pourquoi il ne s’affiche pas', () => {
    // Lu sur le VRAI fichier, pas une paraphrase : c'est lui qui prouve que la
    // garde ne s'ancre pas sur le corpus entier.
    const source = readFileSync(SCORING_FLAG, 'utf8')
    expect(source.toLowerCase()).toContain('externalis')
    expect(sourceFiles(FEATURE_DIR)).not.toContain(SCORING_FLAG)
  })
})

describe('GA-259 — le bloc de couverture ne traduit jamais un taux en fait de marché', () => {
  it('aucun libellé du catalogue FR ni EN ne porte ce vocabulaire', () => {
    for (const [langue, path] of [
      ['fr', FR_LABELS],
      ['en', EN_LABELS],
    ] as const) {
      const coupables = labelValues(path)
        .map(value => ({ value, root: outsourcingRootFound(value) }))
        .filter((entry): entry is { value: string; root: string } => entry.root !== null)
        .map(entry => `${langue} — « ${entry.value} » (${entry.root})`)
      // ⚠️ Si cette liste cesse d'être vide : la formulation POSITIVE suffit,
      // et c'est celle que les deux issues demandent. « Ces comptes ont un
      // contexte exploitable », jamais ce qu'ils font de leurs achats.
      expect(coupables).toEqual([])
    }
  })

  it('aucun composant du bloc ne l’écrit non plus, commentaires retirés', () => {
    const coupables = sourceFiles(FEATURE_DIR)
      .map(file => ({ file, root: outsourcingRootFound(stripComments(readFileSync(file, 'utf8'))) }))
      .filter((entry): entry is { file: string; root: string } => entry.root !== null)
      .map(entry => `${entry.file.slice(entry.file.indexOf('features'))} — ${entry.root}`)
    expect(coupables).toEqual([])
  })

  it('et il DIT ce que le taux mesure — la règle positive, pas seulement son interdit', () => {
    for (const path of [FR_LABELS, EN_LABELS]) {
      const catalogue = JSON.parse(readFileSync(path, 'utf8')) as { coverage?: Record<string, unknown> }
      expect(typeof catalogue.coverage?.meaning, `coverage.meaning manque dans ${path}`).toBe('string')
    }
    // Et la phrase est RENDUE, pas seulement traduite : une clé qu'aucun écran
    // ne monte est une règle qui n'atteint personne.
    expect(readFileSync(COVERAGE_CARD, 'utf8')).toContain("t('coverage.meaning')")
  })
})
