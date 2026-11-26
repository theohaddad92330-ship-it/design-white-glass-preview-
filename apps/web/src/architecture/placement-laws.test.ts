/**
 * GA-26 — les lois de placement (tome 7, partie A).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI EST VÉRIFIABLE, ET CE QUI NE L'EST PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Le tome pose quatre lois. Une seule se vérifie par une machine sans se
 * tromper : la **loi 1**, « un élément de configuration vit à un seul endroit ».
 * Un réglage éditable depuis deux écrans produit deux vérités et l'utilisateur
 * ne sait jamais laquelle gagne — et ça, un test peut le voir : deux écrans qui
 * ÉCRIVENT le même champ.
 *
 * Les lois 2, 3 et 4 ne sont pas gardées ici, et le dire vaut mieux que de
 * poser une garde approximative :
 * - la loi 2 (« partout ») est déjà tenue par GA-18 et GA-19, qui comptent les
 *   scores nus et les `?? 0` ;
 * - la loi 3 (« sept formes ») demande de reconnaître un objet métier dans du
 *   JSX, ce qu'aucune expression régulière ne fait honnêtement ;
 * - la loi 4 (« jamais deux fois à l'identique ») est un jugement de contenu.
 *
 * ⚠️ MISE À JOUR DU 30/08/2026 — la loi 3 n'est toujours pas gardée ICI, mais
 * elle n'est plus SANS ÉCRITURE. La table qui l'applique — les sept formes et
 * la matrice 17 objets × 7 formes de `T7.md:508-566`, 119 cellules — vit
 * désormais dans `packages/contracts/src/schemas/object-forms.ts`, avec ce que
 * `apps/web` en rend vraiment, et **GA-74** la tient : les comptes de la
 * recopie, l'existence de chaque porteur sur le disque, et le refus qu'une
 * forme se déclare livrée sans écran qui la rende.
 *
 * La distinction reste entière et vaut d'être relue avant d'ajouter une garde
 * ici : GA-74 vérifie ce qu'un INVENTAIRE affirme, jamais ce qu'un écran rend.
 * Personne ne sait encore lire « ceci est la mention d'un compte » dans du JSX,
 * et le volet web de GA-74 (`object-mention.test.ts`) ne le prétend pas — il ne
 * vérifie que la seule chose lisible sans interprétation : que la primitive de
 * mention a des appelants.
 *
 * Une garde qui prétend vérifier ce qu'elle ne sait pas lire passe au vert et
 * fait croire que la règle est tenue. C'est le défaut que ce dépôt a déjà
 * rencontré quatre fois.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ « LOI 3 » DÉSIGNE DEUX CHOSES SELON LA SOURCE — QUESTION OUVERTE
 * ─────────────────────────────────────────────────────────────────────────
 * Mesuré le 28/08/2026, non tranché, et écrit ici parce qu'un désaccord de
 * numérotation qui ne vit nulle part se re-découvre à chaque relecture.
 *
 *  · Le tome 7 (repris par `agent_docs/regles-design-2026-08-23.md:101-107`)
 *    numérote **loi 3 = « sept formes d'affichage »** et **loi 4 = « rien
 *    n'apparaît deux fois sous la même forme »**. C'est la numérotation du
 *    dépôt : trente fichiers citent « la loi 4 du tome 7 » dans ce sens.
 *  · Le PDF-02 §4.1 (PDF-02:263-267) appelle **« loi 3 »** la propagation du
 *    back-office : « une donnée apparaît partout où elle change une décision —
 *    et sous une forme différente à chaque fois ». Cette phrase FOND les deux :
 *    « partout, sous plusieurs formes » (loi 3 du tome) et « jamais deux fois à
 *    l'identique » (loi 4 du tome).
 *
 * Ce n'est donc pas une contradiction de fond — les deux sources veulent la
 * même chose — mais un NUMÉRO qui désigne deux règles, ce que GA-40 nomme déjà
 * pour les décisions : un numéro est unique DANS SON CHANTIER, jamais
 * globalement. Rien n'est renommé ici tant que Louis n'a pas tranché ; en
 * attendant, la règle à suivre est celle du dépôt, et l'on cite « la loi 4 du
 * tome 7 » ou « la loi 3 du PDF-02 », jamais « la loi 3 » seule.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROUTES = join(__dirname, '..', 'routes')
// #2065.20 — où un libellé visible s'écrit RÉELLEMENT (convention du dépôt :
// aucune chaîne concaténée, tout passe par l'i18n). Voir la garde plus bas.
const LOCALES = join(__dirname, '..', 'i18n', 'locales')

/**
 * Les points d'écriture de LOI 1 — un réglage, une porte.
 *
 * ⚠️ La première version de cette garde listait trois hooks (`useUpdate…`) qui
 * **n'existaient nulle part** : elle était verte sur du vide, exactement le
 * défaut qu'elle prétendait attraper. Vérifié : le dépôt tient déjà la loi 1,
 * mais autrement — chaque réglage a UN module d'API, et les écrans passent par
 * lui. C'est cette discipline-là qu'on fige.
 */
const SETTINGS_ENDPOINTS: readonly string[] = [
  '/notifications/preferences',
  '/profile-context/me',
  '/settings/catalogues',
  '/profiles/me',
  // Qui voit quels comptes (décision D5). Réglage d'ESPACE, propriétaire
  // uniquement : deux écrans qui l'écriraient donneraient deux vérités sur ce
  // que TOUTE l'équipe voit. Sa porte unique est `teamApi.setPortfolioVisibility`.
  '/workspaces/portfolio-visibility',
]

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry)) continue
    if (entry.includes('.test.') || entry === 'routeTree.gen.ts') continue
    out.push(full)
  }
  return out
}

/** #2065.20 — les fichiers i18n (FR + EN), récursivement, TOUS namespaces. */
function localeFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...localeFiles(full))
      continue
    }
    if (entry.endsWith('.json')) out.push(full)
  }
  return out
}

function routeFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...routeFiles(full))
      continue
    }
    if (entry.endsWith('.tsx')) out.push(full)
  }
  return out
}

describe('GA-26 — loi 1 : un réglage vit à un seul endroit', () => {
  const files = sourceFiles(join(__dirname, '..'))

  it('chaque réglage n’a qu’UNE porte d’écriture', () => {
    const offenders: string[] = []
    for (const endpoint of SETTINGS_ENDPOINTS) {
      const callers = files.filter(file => readFileSync(file, 'utf8').includes(`path: '${endpoint}'`))
      // Deux modules qui écrivent le même réglage produisent deux vérités, et
      // l'utilisateur ne sait jamais laquelle gagne. Le rappel ailleurs est
      // permis — en LECTURE, avec un lien vers l'emplacement unique.
      if (callers.length > 1) {
        offenders.push(`${endpoint} écrit depuis ${callers.length} modules`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('la garde voit bien les portes qu’elle surveille — sinon elle est verte sur du vide', () => {
    // La leçon de sa propre première version : elle listait trois hooks qui
    // n'existaient pas et passait au vert.
    for (const endpoint of SETTINGS_ENDPOINTS) {
      const callers = files.filter(file => readFileSync(file, 'utf8').includes(`path: '${endpoint}'`))
      expect(callers.length, `${endpoint} n'est appelé nulle part`).toBeGreaterThan(0)
    }
  })
})

describe('ce qui n’apparaît nulle part (tome 7 §8)', () => {
  const files = sourceFiles(ROUTES)
  const bodies = files.map(file => readFileSync(file, 'utf8'))
  const PROBABILITY = /chance de clos|probabilit[ée] de (clos|gagner|signature)|closing probability/i

  it('aucun écran n’affiche une probabilité de closing', () => {
    // Septième application de l'arbitrage n°4. Elle n'existe pas, donc elle ne
    // s'affiche pas — et ce qui n'est pas construit ne doit pas être imité par
    // un libellé.
    const offenders = files.filter((_file, index) => PROBABILITY.test(bodies[index] as string))
    expect(offenders).toEqual([])
  })

  /**
   * #2065.20 — décision Louis 15/09/2026, SEPTIÈME refus (`c26_probabilite`) :
   * l'issue demandait de séparer un 4e axe « probabilité de signature » sur
   * `CommercialAuditScreen` (complétude / maturité / potentiel / probabilité).
   * Refusé : on garde les trois premiers, nommés, décomposés — la probabilité
   * ne s'affiche jamais.
   *
   * ⚠️ GARDE ÉLARGIE ICI, ET C'EST LE POINT : la vérification ci-dessus ne lit
   * QUE `apps/web/src/routes` — des wrappers de quelques lignes qui importent
   * l'écran (voir `settings/profile/audit.tsx`). Un libellé réel ne s'y écrit
   * jamais : la convention du dépôt (i18n obligatoire, aucune chaîne
   * concaténée) veut qu'il vive dans `apps/web/src/i18n/locales/{fr,en}/*.json`
   * — là où cette garde ne regardait PAS. Une garde verte qui ne lit pas
   * l'endroit où le texte s'écrit ne garde rien (même défaut que GA-33,
   * `CLAUDE.md` § Doctrine). Corrigée pour tout le produit, pas seulement
   * l'écran visé par #2065.20 : la même co-occurrence protège N'IMPORTE quel
   * futur écran qui tenterait de la réintroduire.
   */
  describe('#2065.20 — élargie aux libellés i18n, où un texte visible s’écrit RÉELLEMENT', () => {
    const locales = localeFiles(LOCALES)
    const localeBodies = locales.map(file => readFileSync(file, 'utf8'))

    it('lit un corpus non vide, FR et EN', () => {
      expect(locales.length).toBeGreaterThan(10)
      expect(locales.some(f => f.includes(`${sep}fr${sep}`))).toBe(true)
      expect(locales.some(f => f.includes(`${sep}en${sep}`))).toBe(true)
    })

    it('aucun libellé i18n n’affiche une probabilité de signature', () => {
      const offenders = locales.filter((_file, index) => PROBABILITY.test(localeBodies[index] as string))
      expect(offenders).toEqual([])
    })

    it('SAIT DIRE NON — la même expression détecte la formule dans un texte témoin', () => {
      expect(PROBABILITY.test('"cta": "Probabilité de signature : 62 %"')).toBe(true)
      expect(PROBABILITY.test('"cta": "Closing probability: 62%"')).toBe(true)
    })

    it('N’ATTRAPE PAS ce qu’elle ne vise pas — un refus explicite de probabilité n’est pas une offense', () => {
      // Témoin réel du dépôt (`fr/billing.json`) : dit qu'AUCUNE probabilité ne
      // s'affiche, sans porter « de closing/gagner/signature ».
      expect(PROBABILITY.test('Ce calculateur ne prédit rien : aucune probabilité, aucune projection de revenu.')).toBe(
        false,
      )
    })
  })

  /**
   * ⚠️ RÉÉCRITE LE 11/10/2026 — RENVERSEMENT DATÉ de `c26_probabilite` (décision
   * Louis, épopée #4016, lot L1). Une probabilité de signature s'AFFICHE
   * désormais — mais jamais NUE. La règle tenue ici devient :
   *  1. un libellé i18n ne porte JAMAIS un chiffre de probabilité écrit en dur
   *     (« Probabilité de signature : 62 % ») — le chiffre vient du calcul, pas
   *     d'un texte ;
   *  2. tout libellé qui PARLE de probabilité vit dans UN seul bloc,
   *     `projects.json › probability`, celui que lit
   *     `CalibratedProbabilityView` — la vue qui PARSE l'enveloppe calibrée et
   *     ne rend rien d'une probabilité nue (méthode, intervalle, axes, axes non
   *     évaluables nommés) ;
   *  3. ce bloc nomme sa méthode, ses axes et ses axes non évaluables, et dit
   *     « non mesuré » — sinon l'enveloppe s'afficherait sans ses mots.
   * Les tests qui précèdent restent : un écran de `routes/` n'écrit toujours
   * aucune probabilité, et hors du bloc calibré la formule reste refusée.
   */
  describe('#4016 L1 (11/10/2026) — une probabilité s’affiche CALIBRÉE, jamais nue', () => {
    const NAKED = /(probabilit[ée]|probability|chance)[^.%{}]{0,40}?\d+\s?%/i
    const SPEAKS = /probabilit[ée]|probability|chance de (clos|sign|gagn)/i
    const leaves = (value: unknown, path: string): Array<[string, string]> =>
      typeof value === 'string'
        ? [[path, value]]
        : value && typeof value === 'object'
          ? Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => leaves(v, `${path}.${k}`))
          : []
    const allLeaves = localeFiles(LOCALES).flatMap(file =>
      leaves(JSON.parse(readFileSync(file, 'utf8')), file.slice(file.indexOf(`${sep}locales${sep}`) + 9)),
    )
    const CALIBRATED_BLOCK = /^(fr|en)[\\/]projects\.json\.probability\./

    it('aucun libellé ne porte un chiffre de probabilité écrit en dur', () => {
      expect(allLeaves.filter(([, text]) => NAKED.test(text)).map(([path]) => path)).toEqual([])
    })

    it('un libellé qui parle de probabilité vit dans le seul bloc calibré — ou dit qu’il n’en affiche pas', () => {
      const offenders = allLeaves
        .filter(([path, text]) => SPEAKS.test(text) && !CALIBRATED_BLOCK.test(path))
        // Un refus explicite (« aucune probabilité ») n'affiche rien.
        .filter(
          ([, text]) =>
            !/aucune probabilit|no probabilit|not a probabilit|never a probabilit|n.est pas une probabilit|jamais une probabilit|jamais pond[ée]r[ée]s? par une probabilit|never weighted by a probabilit/i.test(
              text,
            ),
        )
        .map(([path]) => path)
      expect(offenders).toEqual([])
    })

    it('le bloc calibré existe, FR et EN, et nomme méthode, axes, axes non évaluables et « non mesuré »', () => {
      for (const lang of ['fr', 'en']) {
        const keys = allLeaves
          .filter(([path]) => path.startsWith(`${lang}${sep}projects.json.probability.`))
          .map(([p]) => p)
        for (const needed of [
          'method',
          'interval',
          'axes.workspace_history',
          'unevaluable.shared_base',
          'notMeasured.insufficient_history',
        ]) {
          expect(keys).toContain(`${lang}${sep}projects.json.probability.${needed}`)
        }
      }
    })

    it('SAIT DIRE NON — un chiffre nu est vu, un libellé hors du bloc aussi', () => {
      expect(NAKED.test('Probabilité de signature : 62 %')).toBe(true)
      expect(NAKED.test('Chance of closing 70%')).toBe(true)
      expect(NAKED.test('{{value}} %')).toBe(false)
      expect(CALIBRATED_BLOCK.test(`fr${sep}projects.json.probability.method`)).toBe(true)
      expect(CALIBRATED_BLOCK.test(`fr${sep}dashboard.json.kpi.closing`)).toBe(false)
    })
  })

  it('aucun écran ne classe les membres entre eux', () => {
    // Non-goal explicite du produit.
    const banned = /classement des (membres|commerciaux)|leaderboard/i
    const offenders = files.filter((_file, index) => banned.test(bodies[index] as string))
    expect(offenders).toEqual([])
  })
})

/**
 * GA-27 — `<Navigate>` de TanStack Router est interdit.
 *
 * Il compare l'identité de l'objet props, que JSX recrée à chaque rendu : sur
 * la seule transition `/` → `/dashboard`, il produisait **106 erreurs React
 * #185** avant que la transition ne commite. L'écran arrivait quand même,
 * c'est ce qui a rendu le défaut invisible pendant des mois.
 *
 * `<RedirectTo>` compare la DESTINATION, une chaîne stable.
 */
describe('GA-27 — une redirection part une seule fois', () => {
  const files = sourceFiles(join(__dirname, '..'))

  it('aucun composant n’importe `Navigate` de TanStack Router', () => {
    const offenders = files.filter(file => {
      if (file.includes('RedirectTo')) return false
      const source = readFileSync(file, 'utf8')
      return /import \{[^}]*\bNavigate\b[^}]*\} from '@tanstack\/react-router'/.test(source)
    })
    expect(offenders).toEqual([])
  })

  it('la garde voit le remplaçant — sinon plus personne ne redirige', () => {
    const users = files.filter(file => readFileSync(file, 'utf8').includes('<RedirectTo'))
    expect(users.length).toBeGreaterThan(3)
  })
})
