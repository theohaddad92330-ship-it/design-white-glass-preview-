import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-207 — LE MOIS DE FACTURATION SE LIT, IL NE S'AFFICHE PAS EN ISO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CETTE GARDE EMPÊCHE
 * ─────────────────────────────────────────────────────────────────────────────
 * Mesuré à l'œil le 30/08/2026 : l'onglet « Conditions commerciales » d'une
 * mission affichait « Facturation — 2026-07 » — un mois ISO BRUT, alors que
 * chaque autre date de la même fiche (démarrage, fin, affectations) passe déjà
 * par un formateur de `lib/locale.ts`.
 *
 * Le correctif fait passer ce mois par `formatMonth` (D782, `lib/locale.ts`) —
 * une dérivation qui vit à un seul endroit (GA-26), pas un second
 * `Intl.DateTimeFormat` réécrit dans le composant.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ POURQUOI CETTE GARDE A ÉTÉ ÉLARGIE LE MÊME JOUR — LA LEÇON
 * ─────────────────────────────────────────────────────────────────────────────
 * Sa première version ne surveillait QUE `MissionDetailTabs.tsx`, parce que
 * c'est là que le défaut avait été vu. La recette live de l'après-midi a
 * trouvé le MÊME « Facturation — 2026-07 » sur `/missions/facturation`, rendu
 * par `InvoiceReadinessPanel.tsx` — un SECOND appelant de la même clé
 * `readiness.title`, resté en ISO brut pendant que la garde était verte.
 *
 * C'est le motif maison « la garde protège la FORME qu'elle a vue, pas la
 * RÈGLE ». La règle n'est pas « ce fichier-ci formate son mois » mais
 * **« aucun écran n'affiche `readiness.title` avec un mois ISO brut »**.
 *
 * D'où le troisième bloc ci-dessous, qui est le vrai apport : il BALAIE
 * `apps/web/src` à la recherche des appelants de `readiness.title` et échoue
 * si l'un d'eux n'est pas dans `PROTECTED`. Un troisième écran ajouté demain
 * fera rougir cette garde tant qu'il n'aura pas été soit corrigé, soit
 * explicitement inscrit — la garde s'étend donc toute seule, au lieu de rester
 * aveugle sur ce qu'elle n'a jamais vu.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE, ET POURQUOI CE N'EST PAS UNE APPROXIMATION
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne devine pas un JSX rendu : elle lit les fichiers en SOURCE et vérifie
 * que la valeur passée à `month` dans l'appel `readiness.title` traverse
 * `formatMonth(…)`, plutôt que d'être `data?.month` / `data.month` telle
 * quelle. Une régression revient FORCÉMENT à réécrire `month: data?.month`
 * (ou à renommer la clé sans réintroduire `formatMonth`), ce que le détecteur
 * ci-dessous reproduit et refuse sur des extraits ADVERSARIAUX — pas seulement
 * sur les fichiers réels.
 *
 * ⚠️ Les COMMENTAIRES sont retirés du corpus AVANT lecture : ce docblock, et
 * ceux des composants, citent eux-mêmes `data?.month` et `formatMonth(` en
 * toutes lettres. Une garde qui compterait une citation compterait un fait qui
 * n'existe pas dans le code EXÉCUTÉ — le piège déjà payé sur GA-121.
 *
 * ⚠️ Ce que cette garde NE dit PAS : quel mois doit s'afficher. `/missions/cra`
 * et `/missions/facturation` gardent volontairement le défaut serveur
 * `previousMonth(now)` — « le 5 du mois, la question n'est pas où en est le
 * mois en cours, mais qu'est-ce qui bloque encore le mois qu'on aurait dû
 * facturer » (D781). Seule la FORME est gardée ici, jamais le CHOIX du mois.
 */

const WEB_SRC = join(__dirname, '..')
const VIEW_DIR = join(WEB_SRC, 'features', 'missions', 'view')

/** Les écrans qui affichent `readiness.title`. Le troisième bloc prouve que
 *  cette liste est EXHAUSTIVE — elle ne se maintient pas à la main. */
const PROTECTED = [
  { label: 'MissionDetailTabs.tsx', path: join(VIEW_DIR, 'MissionDetailTabs.tsx'), minBytes: 20_000 },
  { label: 'InvoiceReadinessPanel.tsx', path: join(VIEW_DIR, 'InvoiceReadinessPanel.tsx'), minBytes: 10_000 },
]

/** ⚠️ Un commentaire cite ; il ne rend rien. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** L'appel qui affiche le mois de facturation — un objet SANS accolade
 *  imbriquée, donc capturable par un `[^}]*` non gourmand. */
const TITLE_CALL = /t\(\s*['"]readiness\.title['"]\s*,\s*\{[^}]*\}\s*\)/

/**
 * Le mois de facturation traverse-t-il ENCORE l'écran sans passer par
 * `formatMonth(…)` ?
 *
 * Deux signaux, chacun suffisant seul :
 *  - `month: data?.month` / `month: data.month` — la clé d'interpolation
 *    alimentée DIRECTEMENT par la réponse serveur : la forme EXACTE du défaut
 *    du 30/08/2026 ;
 *  - un appel `t('readiness.title', …)` qui existe mais dont l'objet ne
 *    contient PAS `formatMonth(` — au cas où la clé serait renommée sans que
 *    la panne le soit.
 *
 * Un appel ABSENT (le titre supprimé) n'est pas ce que cette garde surveille —
 * ce serait une régression fonctionnelle différente, pas un retour à l'ISO
 * brut.
 */
function showsUnformattedMonth(source: string): boolean {
  const clean = stripComments(source)
  if (/month:\s*data\??\.month\b/.test(clean)) return true
  const call = clean.match(TITLE_CALL)
  if (call && !call[0].includes('formatMonth(')) return true
  return false
}

/** Tous les `.tsx` / `.ts` de `apps/web/src`, hors gardes d'architecture (qui
 *  CITENT la clé sans la rendre) et hors tests de composants. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'architecture' || entry === 'node_modules') continue
      sourceFiles(full, out)
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

describe('GA-207 — la garde lit bien quelque chose', () => {
  it.each(PROTECTED)('$label existe et n’est pas vidé', ({ path, minBytes }) => {
    // Un chemin faux rendrait `readFileSync` bruyant, mais un fichier VIDE
    // rendrait la garde verte sur rien — le faux zéro silencieux.
    expect(readFileSync(path, 'utf8').length).toBeGreaterThan(minBytes)
  })

  it.each(PROTECTED)('$label contient bien le titre à garder', ({ path }) => {
    expect(TITLE_CALL.test(stripComments(readFileSync(path, 'utf8')))).toBe(true)
  })

  it('le balayage du dépôt voit un corpus non vide', () => {
    expect(sourceFiles(WEB_SRC).length).toBeGreaterThan(500)
  })
})

describe('GA-207 — la garde sait dire NON', () => {
  it('repère la forme EXACTE du défaut du 30/08/2026 — le mois passé nu', () => {
    const faulty = `
      <Text element="p" size="sm" weight="medium">
        {t('readiness.title', { month: data?.month ?? '' })}
      </Text>
    `
    expect(showsUnformattedMonth(faulty)).toBe(true)
  })

  it('repère la variante SANS optional chaining — `data.month`', () => {
    const faulty = `{t('readiness.title', { month: data.month })}`
    expect(showsUnformattedMonth(faulty)).toBe(true)
  })

  it('repère un titre qui existe mais ne traverse JAMAIS `formatMonth(` — clé renommée, panne inchangée', () => {
    const faulty = `{t('readiness.title', { month: readiness?.month ?? monthFromQuery })}`
    expect(showsUnformattedMonth(faulty)).toBe(true)
  })

  it('laisse passer la forme corrigée — le mois traverse `formatMonth(…)`', () => {
    const fixed = `{t('readiness.title', { month: formatMonth(data?.month) ?? '' })}`
    expect(showsUnformattedMonth(fixed)).toBe(false)
  })

  it('lit les commentaires comme des commentaires — une citation du défaut ne rougit pas la garde', () => {
    const commented = `
      // Avant le 30/08/2026, ce fichier écrivait :
      // {t('readiness.title', { month: data?.month ?? '' })}
      {t('readiness.title', { month: formatMonth(data?.month) ?? '' })}
    `
    expect(showsUnformattedMonth(commented)).toBe(false)
  })
})

describe('GA-207 — le mois de facturation ne s’affiche plus en ISO brut', () => {
  it.each(PROTECTED)('$label importe `formatMonth` depuis `lib/locale` (GA-26)', ({ path }) => {
    expect(readFileSync(path, 'utf8')).toMatch(/import\s*\{[^}]*\bformatMonth\b[^}]*\}\s*from\s*['"]@\/lib\/locale['"]/)
  })

  it.each(PROTECTED)('$label fait traverser `formatMonth(…)` au titre', ({ path }) => {
    expect(showsUnformattedMonth(readFileSync(path, 'utf8'))).toBe(false)
  })
})

/**
 * LE BLOC QUI EMPÊCHE LA GARDE DE REDEVENIR BORGNE.
 *
 * Sans lui, un troisième écran qui afficherait `readiness.title` en ISO brut
 * passerait inaperçu — exactement ce qui vient d'arriver à
 * `InvoiceReadinessPanel.tsx`.
 */
describe('GA-207 — la liste des écrans gardés est EXHAUSTIVE', () => {
  it('aucun appelant de `readiness.title` n’échappe à `PROTECTED`', () => {
    const covered = new Set(PROTECTED.map(entry => entry.path))
    const callers = sourceFiles(WEB_SRC).filter(file => TITLE_CALL.test(stripComments(readFileSync(file, 'utf8'))))

    // Le témoin positif : si ce balayage ne trouve plus personne, c'est la
    // recherche qui est cassée, pas le dépôt qui est devenu sain.
    expect(callers.length).toBeGreaterThanOrEqual(PROTECTED.length)

    const unguarded = callers.filter(file => !covered.has(file))
    expect(unguarded.map(file => file.replace(`${WEB_SRC}/`, ''))).toEqual([])
  })
})
