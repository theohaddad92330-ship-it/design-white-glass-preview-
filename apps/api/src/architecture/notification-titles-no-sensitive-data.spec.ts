import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #1938.12 — aucune donnée sensible excessive dans le TITRE d'une notification
 * (doctrine D65 : le corps d'un message ne sort jamais vers un humain qui n'y
 * a pas droit — et un titre l'expose plus largement encore qu'un corps, parce
 * qu'il apparaît dans un aperçu, une liste, et demain une notification
 * navigateur ou système où il est visible même verrouillé).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Ni un corps d'e-mail (une ADRESSE), ni un montant, ni des coordonnées
 * (téléphone, IBAN/BIC/RIB) dans le TEXTE d'un titre — littéral ou construit
 * par interpolation d'un champ qui porterait ce genre de donnée
 * (`${contact.email}`, `${amount}€`…). Le CORPS (`body`) n'est pas visé ici :
 * il porte déjà des données du dossier par construction (ex. le montant de
 * crédits restants dans `credit_low`), et n'apparaît jamais hors de l'écran
 * authentifié — c'est le TITRE, visible plus largement, que #1938.12 vise.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE FAIT — et pourquoi elle ne fait pas confiance à une seule couche
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux vérifications sur chaque site connu qui construit un `title` :
 *  1. le texte LITTÉRAL du titre (hors interpolations) ne contient ni un motif
 *     d'e-mail, ni un motif de montant (chiffres suivis de € / EUR / $), ni un
 *     motif de téléphone ;
 *  2. aucune EXPRESSION interpolée (`${...}`) ne référence un champ dont le
 *     NOM suggère une donnée sensible (email, téléphone, IBAN, montant…) —
 *     recopiée ici et non importée du code qu'elle garde, pour la même raison
 *     que `product-tracker-emits-no-content.spec.ts` : une liste qui vivrait
 *     à côté du code dériverait avec lui.
 *
 * Elle liste les fichiers ÉMETTEURS de titres par leur CHEMIN plutôt que de
 * chercher `createNotification(` dans tout le dépôt : un futur émetteur doit
 * s'AJOUTER ici pour être couvert, ce qui est voulu — sinon la garde
 * grossirait son périmètre sans que personne ne l'ait décidé.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')

const TITLE_FILES: readonly string[] = [
  'apps/api/src/modules/notifications/notifications.service.ts',
  'apps/api/src/modules/notifications/notifications.scheduler.ts',
  // #2082.4/.5/.6 — les trois annonces d'engagement. `client_reply` est la
  // raison même d'ajouter ce chemin : son titre annonce qu'une réponse est
  // ARRIVÉE, et ne doit jamais porter un expéditeur, un objet ni un extrait.
  'apps/api/src/modules/notifications/engagement-alerts.service.ts',
  'apps/api/src/modules/notifications/weekly-digest.service.ts',
  'apps/api/src/modules/notifications/daily-digest.service.ts',
  'apps/api/src/modules/auth/session-registry.service.ts',
  'apps/api/src/modules/credits/credits.service.ts',
  'apps/api/src/modules/playbooks/playbook-send.sweeper.ts',
  'apps/api/src/modules/routines/routine-executors.ts',
  // #2276.62 — le retour dans Laura réutilise le TEXTE déjà envoyé aux canaux
  // branchés (même accusé, #1952.29/#2276.61) comme titre de la cloche : les
  // deux fichiers construisent ce titre au même endroit que ce texte.
  'apps/api/src/modules/action-os/laura-job.executor.ts',
  'apps/api/src/modules/action-os/workflow-runner.service.ts',
]

/** Termes dont le nom, en interpolation, suggère une donnée sensible dans un
 *  titre — recopiés du docblock ci-dessus, jamais importés du code gardé. */
const FORBIDDEN_FIELD_NAMES: readonly string[] = [
  'email',
  'phone',
  'tel',
  'mobile',
  'iban',
  'bic',
  'rib',
  'montant',
  'amount',
  'prix',
  'price',
  'salaire',
  'tjm',
  'remuneration',
  'adresse',
  'address',
]

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i
// Pas de `\b` après `€`/`$` : ce ne sont pas des caractères de mot, donc une
// limite de mot n'existe jamais juste après eux (mesuré en écrivant cette
// garde — « 1 250,00 € » ne matchait pas avec un `\b` en bout de motif). Le
// mot « eur »/« usd », lui, GARDE son `\b` pour ne pas attraper « neurone ».
const CURRENCY_PATTERN = /\d[\d\s.,]*\s?(€|\$|\b(?:eur|usd)\b)/i
// Une séquence de type téléphone français ou international — au moins 8
// chiffres groupés par paires ou blocs, séparateurs optionnels.
const PHONE_PATTERN = /\b(?:\+?\d{1,3}[\s.-]?)?(?:\d[\s.-]?){8,}\b/

/** Retire les commentaires — un docblock qui CITE un motif en exemple ne doit
 *  pas se dénoncer lui-même (même piège que GA-08/GA-240/GA-264). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

type TitleSite = { file: string; line: number; raw: string }

/** Les valeurs de `title:` d'un fichier — template littéral, chaîne simple ou
 *  double, ou identifiant NU (passthrough : `title: summary.title`), avec le
 *  numéro de ligne pour un message d'échec exploitable. */
function extractTitleSites(file: string, source: string): TitleSite[] {
  const pattern = /title:\s*(`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|[A-Za-z_][\w.]*)/g
  const sites: TitleSite[] = []
  for (const match of source.matchAll(pattern)) {
    const raw = match[1] as string
    const line = source.slice(0, match.index).split('\n').length
    sites.push({ file, line, raw })
  }
  return sites
}

/** Le texte littéral d'un site (hors quotes/backticks et hors `${...}`), et
 *  la liste des expressions interpolées trouvées à l'intérieur. */
function analyzeSite(raw: string): { literalText: string; interpolations: string[] } {
  const isTemplateOrString = /^[`'"]/.test(raw)
  if (!isTemplateOrString) return { literalText: '', interpolations: [] }
  const body = raw.slice(1, -1)
  const interpolations = [...body.matchAll(/\$\{([^}]*)\}/g)].map(m => m[1] as string)
  const literalText = body.replace(/\$\{[^}]*\}/g, ' ')
  return { literalText, interpolations }
}

function forbiddenFieldIn(expression: string): string | null {
  for (const name of FORBIDDEN_FIELD_NAMES) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(expression)) return name
  }
  return null
}

describe('#1938.12 — un titre de notification ne porte ni e-mail, ni montant, ni coordonnées', () => {
  const sitesByFile = TITLE_FILES.map(file => {
    const source = stripComments(readFileSync(join(REPO_ROOT, file), 'utf8'))
    return { file, sites: extractTitleSites(file, source) }
  })
  const allSites = sitesByFile.flatMap(entry => entry.sites)

  it('lit un corpus non vide — au moins 40 sites `title:` sur les 8 fichiers émetteurs connus', () => {
    expect(allSites.length).toBeGreaterThanOrEqual(40)
    // Chaque fichier de la liste contribue au moins un site : une liste qui
    // en contiendrait un mort (renommé, déplacé) resterait verte sur du vide.
    for (const entry of sitesByFile) expect(entry.sites.length).toBeGreaterThan(0)
  })

  it('aucun titre RÉEL ne porte, en texte littéral, un motif d’e-mail, de montant ou de téléphone', () => {
    const violations = allSites
      .map(site => {
        const { literalText } = analyzeSite(site.raw)
        if (EMAIL_PATTERN.test(literalText)) return `${site.file}:${site.line} — motif d'e-mail`
        if (CURRENCY_PATTERN.test(literalText)) return `${site.file}:${site.line} — motif de montant`
        if (PHONE_PATTERN.test(literalText)) return `${site.file}:${site.line} — motif de téléphone`
        return null
      })
      .filter((entry): entry is string => entry !== null)
    expect(violations).toEqual([])
  })

  it('aucune expression interpolée d’un titre ne référence un champ au nom sensible', () => {
    const violations = allSites.flatMap(site => {
      const { interpolations } = analyzeSite(site.raw)
      return interpolations
        .map(expr => {
          const field = forbiddenFieldIn(expr)
          return field ? `${site.file}:${site.line} — \${${expr}} porte le champ « ${field} »` : null
        })
        .filter((entry): entry is string => entry !== null)
    })
    expect(violations).toEqual([])
  })

  it('SAIT DIRE NON — un titre fabriqué avec un e-mail littéral est détecté', () => {
    const { literalText } = analyzeSite('`Relancer jean.dupont@example.com`')
    expect(EMAIL_PATTERN.test(literalText)).toBe(true)
  })

  it('SAIT DIRE NON — un titre fabriqué avec un montant littéral est détecté', () => {
    const { literalText } = analyzeSite('`Facture de 1 250,00 €`')
    expect(CURRENCY_PATTERN.test(literalText)).toBe(true)
  })

  it('SAIT DIRE NON — un titre fabriqué avec un numéro de téléphone littéral est détecté', () => {
    const { literalText } = analyzeSite('`Appeler le 06 12 34 56 78`')
    expect(PHONE_PATTERN.test(literalText)).toBe(true)
  })

  it('SAIT DIRE NON — une interpolation sur un champ email/montant/téléphone est détectée', () => {
    expect(forbiddenFieldIn('contact.email')).toBe('email')
    expect(forbiddenFieldIn('invoice.amount')).toBe('amount')
    expect(forbiddenFieldIn('contact.phone')).toBe('phone')
  })

  it('N’ATTRAPE PAS ce qu’elle ne vise pas — les identifiants légitimes du corpus réel passent', () => {
    for (const innocent of ['company', 'companyName', 'count', 'rows.length', 'summary.title', 'external.length']) {
      expect(forbiddenFieldIn(innocent)).toBeNull()
    }
    // Et un compte de crédits restants (un ENTIER, pas un motif de devise) ne
    // déclenche pas le motif de montant : `12` seul n'est pas suivi d'un
    // symbole monétaire.
    expect(CURRENCY_PATTERN.test('Il te reste 12 crédits sur 100 ce cycle')).toBe(false)
  })

  it('retire bien les commentaires avant de chercher — une citation en docblock ne se dénonce pas elle-même', () => {
    const withComment = '// jamais jean@example.com dans un titre\ntitle: `${count} action en retard`'
    const stripped = stripComments(withComment)
    expect(stripped).not.toContain('jean@example.com')
    expect(extractTitleSites('temoin.ts', stripped)).toEqual([
      { file: 'temoin.ts', line: 2, raw: '`${count} action en retard`' },
    ])
  })
})
