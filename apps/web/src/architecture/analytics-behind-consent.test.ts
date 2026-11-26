import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-46 — aucun traceur ne se monte hors de la porte du consentement.
 *
 * « Traceur » ici ne veut pas dire « mesure d'audience » : `<SpeedInsights />`
 * mesure les performances de CHARGEMENT, pas le comportement du visiteur, et il
 * passe quand même par la porte. Ce qui déclenche la règle, c'est qu'un script
 * tiers se charge dans le navigateur du visiteur — pas la nature de la mesure.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Mesuré le 28/08/2026, EN PRODUCTION : la bannière de consentement du site
 * enregistrait un choix que PERSONNE ne lisait. `getCookieConsent()` n'avait
 * aucun appelant hors de son propre dossier, pendant que `/cookies` promettait
 * mot pour mot que les cookies analytiques « sont soumis à votre consentement
 * préalable ». Cinq montages de traceurs partaient sans condition :
 * trois `<Analytics />` (Vercel) et deux scripts Plausible.
 *
 * Le défaut n'était pas dans le calcul du consentement — il était juste. Il
 * était dans l'ABSENCE d'appelant. C'est le motif qui revient dans tout ce
 * dépôt : du code juste, testé, que rien n'appelle. Un test unitaire ne peut
 * pas le voir : il vérifie la fonction, et le défaut est précisément qu'elle
 * n'est appelée nulle part.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE EXIGE
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Un traceur ne s'importe que dans un fichier NOMMÉ ci-dessous.
 * 2. Dans ces fichiers, chaque balise de traceur est DANS le bloc de
 *    `<AnalyticsConsentGate>` — entre son ouverture et sa fermeture. Et TOUTES
 *    ses occurrences : la garde compte les balises situées à l'intérieur des
 *    blocs de porte et les compare au total du fichier. Un `<Analytics />`
 *    orphelin posé à côté d'un autre bien encadré fait donc toujours rougir.
 * 3. Le seul traceur non-JSX (`apps/web/src/lib/analytics.ts`, qui injecte
 *    Plausible à la main) consulte la porte lui-même.
 *
 * ⚠️ POURQUOI LA RÈGLE 2 A CHANGÉ — 28/08/2026, faux positif mesuré.
 * La première version exigeait que le traceur soit l'enfant UNIQUE de la porte :
 * elle cherchait le motif `<Gate><Tag /></Gate>`, ouverture et fermeture collées
 * autour d'une seule balise. Le jour où la PR #1184 a monté un DEUXIÈME traceur
 * légitime (`<SpeedInsights />`) DANS la porte, à côté du premier, le motif ne
 * s'est plus reconnu et la garde a déclaré `<Analytics>` non gardé :
 *   `expected [ 'web/src/App.tsx → <Analytics>' ] to deeply equal []`
 * Elle cassait donc en faisant exactement ce qu'elle protège — mettre un traceur
 * derrière le consentement. Une garde qui punit la bonne conduite finit
 * désactivée, et c'est la règle qui meurt avec elle.
 * La préoccupation d'origine, elle, RESTE tenue : ce n'est pas « la porte existe
 * quelque part dans le fichier », c'est un COMPTE — total des balises moins
 * celles qui tombent à l'intérieur d'un bloc de porte. Deux montages dont un
 * seul est encadré donnent 1, et la garde rougit (test « un dedans, un dehors »).
 *
 * ⚠️ Elle regarde les TROIS apps. La porte est partagée (`@bellum/consent`) ;
 * une garde qui ne lirait qu'`apps/web` laisserait deux tiers du produit
 * dehors — et c'est exactement la forme du défaut d'origine.
 *
 * ⚠️ La console d'exploitation (`dashboard-manager`) est toujours BALAYÉE, mais
 * elle n'a plus d'exception : depuis la décision de Louis du 28/08/2026, elle
 * ne porte plus aucun traceur. Un back-office d'opérateur n'est pas un produit
 * dont on mesure l'audience, et son traceur était de toute façon derrière une
 * porte qui ne pouvait jamais s'ouvrir — pas de bannière, adresse déclarée
 * nulle part. La garder dans `SCANNED` est ce qui fait que l'y remettre en
 * douce échoue : sans entrée dans `ALLOWED`, le premier import la fait rougir.
 */

const APPS = join(__dirname, '../../..')

/** Les racines de source balayées. Une app qui manque ici n'est pas gardée. */
const SCANNED = ['web/src', 'website/src', 'dashboard-manager/src']

/**
 * Ce qui trahit un traceur dans un fichier source.
 *
 * ⚠️ Un traceur qui n'est PAS dans cette liste est INVISIBLE pour la garde —
 * elle ne le voit ni pour l'autoriser, ni pour le refuser. C'est la forme du
 * défaut mesuré le 28/08/2026 : « un cinquième traceur, rendu côté serveur, que
 * l'audit n'avait pas vu ». Ajouter un traceur au produit commence donc ici.
 */
const TRACKER_SIGNALS: { name: string; pattern: RegExp }[] = [
  { name: 'Vercel Analytics', pattern: /from '@vercel\/analytics/ },
  { name: 'Vercel Speed Insights', pattern: /from '@vercel\/speed-insights/ },
  { name: 'Plausible', pattern: /plausible\.io/ },
]

/**
 * Les fichiers autorisés à toucher un traceur, et pourquoi.
 *
 * ⚠️ Y ajouter une entrée demande de répondre d'abord à « que voit un visiteur
 * qui n'a pas encore répondu à la bannière ? ». La bonne réponse est « rien ».
 */
const ALLOWED: Record<string, string> = {
  'web/src/App.tsx':
    'Les deux montages Vercel de l’application (mesure d’audience et mesure des performances de chargement), tous deux DANS la porte — vérifié plus bas, balise par balise.',
  'web/src/lib/analytics.ts':
    'Le seul traceur injecté à la main (Plausible) : il ne peut pas être encadré par du JSX, alors il consulte la porte lui-même — `isAnalyticsAllowed()`, vérifié plus bas.',
  'website/src/app/[locale]/layout.tsx':
    'Les deux montages du site (Vercel et Plausible), chacun encadré par la porte — vérifié plus bas, balise par balise.',
  'website/src/features/analytics/PlausibleScript.tsx':
    'Le script Plausible du site. Il n’est JAMAIS rendu ailleurs que dans la porte du layout, et il est `use client` : rendu côté serveur, il partirait dans le HTML avant que la question soit posée.',
}

/**
 * Les montages JSX, et la balise de traceur à encadrer dans chacun.
 *
 * ⚠️ Cette liste est aussi le CORPUS de la garde : le premier test vérifie que
 * chacun de ces fichiers existe et contient bien sa balise. Une entrée périmée
 * (fichier renommé, balise disparue) fait rougir la garde au lieu de la rendre
 * silencieusement aveugle.
 */
const GATED_MOUNTS: { file: string; tag: string }[] = [
  { file: 'web/src/App.tsx', tag: 'Analytics' },
  { file: 'web/src/App.tsx', tag: 'SpeedInsights' },
  { file: 'website/src/app/[locale]/layout.tsx', tag: 'Analytics' },
  { file: 'website/src/app/[locale]/layout.tsx', tag: 'PlausibleScript' },
]

const GATE = 'AnalyticsConsentGate'

function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) out.push(full)
    }
  }
  for (const root of SCANNED) walk(join(APPS, root))
  return out
}

function relative(file: string): string {
  return file.slice(APPS.length + 1)
}

/**
 * Retire les commentaires — ce fichier-ci en est la preuve vivante : son propre
 * docblock cite `@vercel/analytics` et `plausible.io`, et une garde qui les
 * compterait s'accuserait elle-même. Les commentaires JSX (`{/* … *␀/}`) partent
 * en entier, sinon il resterait `{}` entre la porte et sa balise.
 */
function stripComments(source: string): string {
  return source
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * Les occurrences d'une balise qui ne sont PAS dans le bloc de la porte.
 *
 * Elle compte, elle ne reconnaît pas un motif : total des `<Tag` du fichier,
 * moins ceux qui tombent entre l'ouverture et la fermeture d'un
 * `<AnalyticsConsentGate>`. C'est ce COMPTE qui tient les deux exigences à la
 * fois — plusieurs traceurs peuvent cohabiter dans la porte (le motif d'enfant
 * unique de la première version l'interdisait, cf. le faux positif expliqué en
 * tête de fichier), et un orphelin resté dehors reste compté, donc signalé.
 *
 * ⚠️ Le découpage des blocs est NON GOURMAND (`[\s\S]*?`) : sans cela, deux
 * portes successives n'en feraient qu'une seule et tout ce qui traîne ENTRE
 * elles passerait pour gardé.
 *
 * Extraite en fonction pure — c'est elle qu'on met à l'épreuve dans le test
 * « elle sait dire NON », sur une source fabriquée exprès.
 */
function ungatedTagCount(source: string, tag: string): number {
  const clean = stripComments(source)
  // ⚠️ Pas de drapeau `g` avec `.test()` : il est STATEFUL et rendrait un
  // résultat sur deux. Ici on ne compte que via `match`, qui l'exige — et
  // l'expression est RECONSTRUITE à chaque comptage, pour qu'aucun `lastIndex`
  // partagé ne puisse jamais entrer dans le calcul.
  const openings = (text: string): number => text.match(new RegExp(`<${tag}\\b`, 'g'))?.length ?? 0
  const blocks = clean.match(new RegExp(`<${GATE}>[\\s\\S]*?</${GATE}>`, 'g')) ?? []
  const inside = blocks.reduce((count, block) => count + openings(block), 0)
  return openings(clean) - inside
}

function read(path: string): string {
  return readFileSync(join(APPS, path), 'utf8')
}

describe('GA-46 — les traceurs ne se montent que derrière le consentement', () => {
  it('LIT quelque chose — le corpus des trois apps n’est pas vide', () => {
    const files = sourceFiles()
    expect(files.length).toBeGreaterThan(500)
    // Et il couvre bien les TROIS apps, pas seulement celle où vit la garde.
    for (const root of SCANNED) {
      expect(files.filter(file => relative(file).startsWith(root)).length).toBeGreaterThan(0)
    }
  })

  it('trouve bien les traceurs qu’elle connaît — preuve qu’elle sait voir', () => {
    // Si elle n'en trouvait aucun, son silence sur les autres ne vaudrait rien.
    const carriers = sourceFiles().filter(file => {
      const source = stripComments(readFileSync(file, 'utf8'))
      return TRACKER_SIGNALS.some(signal => signal.pattern.test(source))
    })
    expect(carriers.map(relative).sort()).toEqual(Object.keys(ALLOWED).sort())
  })

  it('aucun fichier ne touche un traceur hors des exceptions nommées', () => {
    const outsiders = sourceFiles()
      .filter(file => {
        const source = stripComments(readFileSync(file, 'utf8'))
        return TRACKER_SIGNALS.some(signal => signal.pattern.test(source))
      })
      .map(relative)
      .filter(path => !(path in ALLOWED))
      .sort()
    expect(outsiders).toEqual([])
  })

  it('la console d’exploitation ne porte AUCUN traceur — décision du 28/08/2026', () => {
    // Le cliquet de la décision, et pas seulement son constat : sans lui, la
    // façon la plus simple de remettre un traceur sur la console serait de lui
    // rouvrir une ligne dans `ALLOWED`. Ici il n'y a pas de ligne à rouvrir.
    const files = sourceFiles().filter(file => relative(file).startsWith('dashboard-manager/src'))
    // Elle LIT quelque chose : une app retirée de `SCANNED` rendrait ce filtre
    // vide, et « aucun traceur » serait vrai pour la mauvaise raison.
    expect(files.length).toBeGreaterThan(0)

    const carriers = files.filter(file =>
      TRACKER_SIGNALS.some(signal => signal.pattern.test(stripComments(readFileSync(file, 'utf8')))),
    )
    expect(carriers.map(relative)).toEqual([])
  })

  it('chaque exception porte une raison écrite, pas une case cochée', () => {
    const tooShort = Object.entries(ALLOWED)
      .filter(([, reason]) => reason.trim().length <= 40)
      .map(([path]) => path)
    expect(tooShort).toEqual([])
  })

  it('les exceptions déclarées existent toutes — pas d’entrée périmée', () => {
    const real = new Set(sourceFiles().map(relative))
    expect(Object.keys(ALLOWED).filter(path => !real.has(path))).toEqual([])
  })

  it('chaque montage déclaré CONTIENT bien sa balise — sinon la garde surveille du vide', () => {
    const missing = GATED_MOUNTS.filter(({ file, tag }) => !new RegExp(`<${tag}\\b`).test(stripComments(read(file))))
    expect(missing).toEqual([])
  })

  it('chaque balise de traceur est encadrée par la porte', () => {
    const ungated = GATED_MOUNTS.filter(({ file, tag }) => ungatedTagCount(read(file), tag) > 0).map(
      ({ file, tag }) => `${file} → <${tag}>`,
    )
    expect(ungated).toEqual([])
  })

  it('le traceur non-JSX consulte la porte lui-même', () => {
    const source = stripComments(read('web/src/lib/analytics.ts'))
    expect(source).toContain("from '@bellum/consent'")
    expect(source).toContain('isAnalyticsAllowed()')
  })

  it('le script Plausible du site est rendu côté CLIENT — le serveur ne voit pas le cookie', () => {
    expect(read('website/src/features/analytics/PlausibleScript.tsx')).toMatch(/^'use client'/)
  })

  it('ELLE SAIT DIRE NON — un montage sorti de la porte est signalé', () => {
    // La preuve en code, doublée d'une preuve manuelle consignée au rapport du
    // lot : le montage réel a été décadenassé à la main, la garde a rougi, puis
    // il a été remis en état.
    const gated = `<${GATE}>\n  <Analytics />\n</${GATE}>`
    const ungated = `<Analytics />`

    expect(ungatedTagCount(gated, 'Analytics')).toBe(0)
    expect(ungatedTagCount(ungated, 'Analytics')).toBe(1)
    expect(ungatedTagCount(`${gated}\n${ungated}`, 'Analytics')).toBe(1)
    // Un commentaire ne fait pas office de porte.
    expect(ungatedTagCount(`{/* <${GATE}> */}\n<Analytics />`, 'Analytics')).toBe(1)
  })

  it('DEUX traceurs dans la MÊME porte sont tous les deux gardés — le faux positif du 28/08', () => {
    // Le cas que la version « enfant unique » ratait : elle cherchait
    // `<Gate><Tag /></Gate>` collé, donc l'arrivée d'un second traceur DANS la
    // porte faisait passer le premier pour non gardé. Si ce test repasse au
    // rouge, c'est que quelqu'un a réintroduit le motif d'enfant unique.
    const both = `<${GATE}>\n  <Analytics />\n  <SpeedInsights />\n</${GATE}>`

    expect(ungatedTagCount(both, 'Analytics')).toBe(0)
    expect(ungatedTagCount(both, 'SpeedInsights')).toBe(0)
  })

  it('UN DEDANS, UN DEHORS reste ROUGE — la porte n’absout pas ses voisins', () => {
    // L'exigence que la correction ne devait PAS perdre : ce n'est pas « la
    // porte existe dans le fichier », c'est un compte. Un traceur bien encadré
    // ne blanchit pas son jumeau resté dehors.
    const oneOutside = `<${GATE}>\n  <Analytics />\n</${GATE}>\n<SpeedInsights />`
    expect(ungatedTagCount(oneOutside, 'Analytics')).toBe(0)
    expect(ungatedTagCount(oneOutside, 'SpeedInsights')).toBe(1)

    // Même balise, deux montages, un seul encadré.
    const twin = `<${GATE}>\n  <Analytics />\n</${GATE}>\n<Analytics />`
    expect(ungatedTagCount(twin, 'Analytics')).toBe(1)

    // Et l'orphelin coincé ENTRE deux portes n'est pas avalé par un découpage
    // gourmand qui n'en ferait qu'un seul bloc.
    const between = `<${GATE}>\n  <Analytics />\n</${GATE}>\n<SpeedInsights />\n<${GATE}>\n  <PlausibleScript />\n</${GATE}>`
    expect(ungatedTagCount(between, 'SpeedInsights')).toBe(1)
    expect(ungatedTagCount(between, 'Analytics')).toBe(0)
    expect(ungatedTagCount(between, 'PlausibleScript')).toBe(0)
  })
})
