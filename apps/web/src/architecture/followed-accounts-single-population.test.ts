import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-70 — « comptes suivis » est UNE population, définie UNE fois.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Recette live du 29/08/2026, même espace, même minute :
 *
 *   /dashboard, cockpit ............... « 27 Comptes suivis »
 *   /accounts, bandeau ................ « 23 suivis »
 *   Laura, sélecteur de portée ........ « Tout le portefeuille · 23 comptes »
 *
 * Le réflexe est de croire à une erreur d'arithmétique. Il n'y en avait pas :
 * les trois nombres sont JUSTES, et ils comptent trois populations
 * différentes.
 *
 *   - `/accounts` applique `ACCOUNT_HYGIENE_PREDICATES.followedAccounts` —
 *     `commercial_status IN ('watching','opportunity','opening','customer')`. C'est LA
 *     définition de « suivi » dans ce produit, et `/pilotage` la lit aussi.
 *   - le cockpit compte les comptes que J'AI CRÉÉS (`accounts.user_id`), sans
 *     aucun filtre de `commercial_status` — et son propre commentaire de
 *     service dit « mes comptes ». Le nombre était bon, le MOT était faux.
 *   - Laura comptait les comptes dont l'ANALYSE est terminée
 *     (`status = 'completed'`), sous un libellé qui promettait « tout le
 *     portefeuille ».
 *
 * La leçon, et c'est elle que cette garde tient : **quand deux écrans
 * affichent deux nombres sous le même mot, ce n'est pas toujours le nombre
 * qu'il faut corriger.** Ici il fallait corriger deux libellés et n'toucher à
 * aucun calcul — sauf un, le cockpit, qui lisait le `.length` d'une liste
 * bornée à 200 et se serait figé au 201e compte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE, ET CE QU'ELLE NE PEUT PAS VÉRIFIER
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne sait pas lire un SQL depuis un écran. Ce qu'elle sait faire, et qui
 * aurait suffi à attraper le défaut : prendre les composants qui affichent un
 * COMPTEUR DE COMPTES, résoudre les libellés qu'ils affichent RÉELLEMENT, et
 * exiger que le vocabulaire « comptes suivis » ne soit employé que par un
 * compteur dont la dérivation est déclarée ici — et dont la déclaration est
 * vérifiée sur le disque.
 *
 * C'est le motif de GA-45 : garder l'i18n RÉELLEMENT consommé par un écran, et
 * non le fichier de traduction en vrac. Le mot « suivi » est courant en
 * français — il apparaît dans une trentaine de libellés de prose qui ne
 * comptent rien. Garder le catalogue entier aurait produit une garde criarde,
 * donc désactivée.
 */

const WEB_SRC = join(__dirname, '..')
const LOCALES = join(WEB_SRC, 'i18n/locales')
const API_SRC = join(__dirname, '../../../api/src')

/**
 * Les écrans qui affichent un COMPTEUR DE COMPTES.
 *
 * ⚠️ Liste mesurée, pas devinée : ce sont les quatre surfaces où un nombre de
 * comptes est présenté comme un indicateur. Un cinquième écran s'ajoute ici le
 * jour où il en affiche un — et la garde le dira, parce que chaque entrée
 * déclare son espace de noms et qu'un test vérifie que le fichier l'emploie
 * VRAIMENT.
 */
const COUNTER_SCREENS: ReadonlyArray<{ file: string; ns: string; why: string }> = [
  {
    file: 'features/dashboard/components/personal/PersonalKpiRow.tsx',
    ns: 'dashboard',
    why: "Le cockpit personnel — c'est lui qui affichait « 27 Comptes suivis » pendant que /accounts en affichait 23.",
  },
  {
    file: 'features/chat/scope/ScopeButton.tsx',
    ns: 'chat',
    why: 'Le sélecteur de portée de Laura — il annonçait « Tout le portefeuille » en comptant les seuls comptes analysés.',
  },
]

/**
 * Les clés de libellé dont le nombre vient VRAIMENT de la population « suivis ».
 *
 * Une seule aujourd'hui. Cette liste ne grandit qu'avec un compteur qui lit la
 * même dérivation, et `derivedBy` dit où la vérifier.
 */
// #4127 revient sur #4087.1 (bandeau compacté), délibérément — Louis 13/10 : le bandeau
// « État du portefeuille » de /accounts (seul porteur légitime de `counters.followed`)
// est supprimé. Plus aucun compteur n'emploie le mot : la liste est vide, et le
// jour où un compteur le reprend il s'y déclare avec sa dérivation.
const FOLLOWED_POPULATION_LABELS: ReadonlyArray<{ key: string; derivedBy: string; why: string }> = []

/**
 * LA définition, telle qu'elle est écrite côté serveur.
 *
 * ⚠️ `'opening'` (« En cours d'ouverture ») s'y est ajouté le 15/09/2026 avec
 * #2117.16-.21, qui a renommé les statuts commerciaux et ajouté deux valeurs en
 * FIN d'enum. Un compte en cours d'ouverture EST suivi : l'oublier ici aurait
 * fait diverger la garde de la population qu'elle désigne.
 */
const FOLLOWED_PREDICATE = `a.commercial_status IN ('watching', 'opportunity', 'opening', 'customer')`

/**
 * Le vocabulaire qui DÉSIGNE la population, dans les deux langues.
 *
 * ⚠️ Volontairement resserré sur « compte(s) suivi(s) » et le mot « suivis »
 * employé seul comme étiquette de compteur. « suivi de mission », « relance
 * suivie » ne désignent pas des comptes ; les attraper rendrait la garde
 * bruyante pour rien.
 */
const FOLLOWED_VOCABULARY: ReadonlyArray<RegExp> = [
  /\bcomptes?\s+suivis?\b/i,
  // Le libellé du compteur peut NOMMER ce qu'il compte entre parenthèses (« suivis (hors « À trier ») », recette 05/10/2026).
  /^suivis?(?:\s*\([^)]*\))?$/i,
  /\b(?:accounts?\s+followed|followed\s+accounts?|tracked\s+accounts?)\b/i,
  /^followed(?:\s*\([^)]*\))?$/i,
  /^tracked$/i,
]

function screenSource(file: string): string {
  return readFileSync(join(WEB_SRC, file), 'utf8')
}

/**
 * Les clés d'i18n qu'un écran affiche RÉELLEMENT.
 *
 * Deux sources, et la seconde n'est pas un luxe :
 *   - les littéraux `t('…')` / `t("…")` ;
 *   - les commentaires `// i18n keys: a | b | c`, la convention du dépôt pour
 *     une clé COMPOSÉE (`t(\`counters.${key}\`)`). Sans eux, la garde serait
 *     aveugle sur `AccountsCountersBand` — c'est-à-dire sur le seul écran qui
 *     emploie le mot légitimement, donc sur son propre témoin positif.
 */
function translationKeys(source: string): string[] {
  const keys = new Set<string>()
  for (const m of source.matchAll(/\bt\(\s*'([^'\n]+)'|\bt\(\s*"([^"\n]+)"/g)) {
    const key = m[1] ?? m[2] ?? ''
    if (key && !key.includes('${')) keys.add(key)
  }
  for (const m of source.matchAll(/i18n keys?\s*:([^\n]+)/g)) {
    for (const raw of (m[1] ?? '').split('|')) {
      const key = raw.trim()
      if (/^[\w.]+$/.test(key)) keys.add(key)
    }
  }
  return [...keys]
}

function catalogue(lang: string, ns: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(LOCALES, lang, `${ns}.json`), 'utf8')) as Record<string, unknown>
}

/** Toutes les traductions d'une clé — pluriels compris (`_one` / `_other`). */
function resolve(lang: string, ns: string, key: string): string[] {
  const parts = key.split('.')
  let node: unknown = catalogue(lang, ns)
  for (const part of parts.slice(0, -1)) {
    if (!node || typeof node !== 'object') return []
    node = (node as Record<string, unknown>)[part]
  }
  if (!node || typeof node !== 'object') return []
  const leaf = parts[parts.length - 1] as string
  const parent = node as Record<string, unknown>
  const out: string[] = []
  for (const suffix of ['', '_one', '_other', '_zero', '_many']) {
    const value = parent[`${leaf}${suffix}`]
    if (typeof value === 'string') out.push(value)
  }
  return out
}

function namesTheFollowedPopulation(text: string): boolean {
  return FOLLOWED_VOCABULARY.some(re => re.test(text.trim()))
}

/** Ce que les compteurs de comptes affichent aujourd'hui, langue par langue. */
function counterLabels(): Array<{ key: string; lang: string; text: string }> {
  const out: Array<{ key: string; lang: string; text: string }> = []
  for (const screen of COUNTER_SCREENS) {
    for (const key of translationKeys(screenSource(screen.file))) {
      for (const lang of ['fr', 'en']) {
        for (const text of resolve(lang, screen.ns, key)) {
          out.push({ key: `${screen.ns}:${key}`, lang, text })
        }
      }
    }
  }
  return out
}

const DECLARED = new Set(FOLLOWED_POPULATION_LABELS.map(e => e.key))

describe('GA-70 — « comptes suivis » désigne une seule population', () => {
  it('LIT quelque chose — les écrans existent et leurs libellés se résolvent', () => {
    // Un chemin faux, un espace de noms faux, ou un extracteur cassé rendraient
    // la garde verte sur du vide. Les trois sont vérifiés séparément.
    for (const screen of COUNTER_SCREENS) {
      const source = screenSource(screen.file)
      expect(source.length).toBeGreaterThan(500)
      // L'espace de noms DÉCLARÉ est celui que le fichier emploie vraiment.
      expect(source, screen.file).toContain(`useTranslation('${screen.ns}')`)
      expect(translationKeys(source).length, screen.file).toBeGreaterThan(0)
      expect(screen.why.length).toBeGreaterThan(60)
    }
    const labels = counterLabels()
    expect(labels.length).toBeGreaterThan(20)
    expect(labels.some(l => l.lang === 'fr')).toBe(true)
    expect(labels.some(l => l.lang === 'en')).toBe(true)
  })

  it('le bandeau « État du portefeuille » n’existe plus — #4127', () => {
    expect(() => screenSource('features/accounts/view/accounts-list/AccountsCountersBand.tsx')).toThrow()
    const keys = new Set(counterLabels().map(l => l.key))
    expect(keys.has('accounts:counters.followed')).toBe(false)
  })

  it('aucun compteur n’emploie le mot sans déclarer sa dérivation', () => {
    const offenders = counterLabels()
      .filter(l => namesTheFollowedPopulation(l.text) && !DECLARED.has(l.key))
      .map(l => `${l.key} [${l.lang}] → « ${l.text} »`)
    if (offenders.length > 0) {
      throw new Error(
        `Un compteur de comptes emploie le vocabulaire « comptes suivis » sans lire la population qui porte ce nom :\n  ${offenders.join('\n  ')}\n` +
          `« Suivi » veut dire ${FOLLOWED_PREDICATE} — c'est ce que comptent /accounts et /pilotage.\n` +
          `Soit le compteur lit cette dérivation et se déclare dans FOLLOWED_POPULATION_LABELS,\n` +
          `soit son libellé dit ce qu'il compte VRAIMENT (« Mes comptes », « comptes analysés »…).`,
      )
    }
    expect(offenders).toEqual([])
  })

  it('chaque dérivation déclarée existe, et contient bien LA définition', () => {
    // Une déclaration qui pointe vers un fichier disparu est une déclaration
    // qui s'élargit toute seule.
    for (const { key, derivedBy, why } of FOLLOWED_POPULATION_LABELS) {
      expect(why.length).toBeGreaterThan(60)
      expect(DECLARED.has(key)).toBe(true)
      const source = readFileSync(join(API_SRC, derivedBy), 'utf8')
      expect(source, derivedBy).toContain(FOLLOWED_PREDICATE)
    }
  })

  it('sait dire NON — un libellé qui reprend le mot sans la dérivation est refusé', () => {
    // Les libellés EXACTS vus en recette, et ceux qui les remplacent.
    expect(namesTheFollowedPopulation('Comptes suivis')).toBe(true)
    expect(namesTheFollowedPopulation('Accounts followed')).toBe(true)
    expect(namesTheFollowedPopulation('Tracked accounts')).toBe(true)
    expect(namesTheFollowedPopulation('suivis')).toBe(true)
    expect(namesTheFollowedPopulation('suivis (hors « À trier »)')).toBe(true)
    expect(namesTheFollowedPopulation('Suivi de mission (hors contrat)')).toBe(false)
    expect(namesTheFollowedPopulation('Mes comptes')).toBe(false)
    expect(namesTheFollowedPopulation('My accounts')).toBe(false)
    expect(namesTheFollowedPopulation('Tout le portefeuille · {{count}} comptes analysés')).toBe(false)
    expect(namesTheFollowedPopulation('Comptes avec un signal')).toBe(false)
    // …et le mot « suivi » hors du sens « compte » ne réveille pas la garde :
    // une garde criarde est une garde qu'on désactive.
    expect(namesTheFollowedPopulation('Suivi de mission')).toBe(false)
    expect(namesTheFollowedPopulation('Already followed up')).toBe(false)
  })

  it('sait dire NON — l’extracteur voit une clé COMPOSÉE via le commentaire du dépôt', () => {
    // Un écran qui compose `t(`counters.${key}`)` ne se lit que par le commentaire.
    const synthetic = '// i18n keys: counters.followed | counters.title\nt(`counters.${key}`)'
    const keys = translationKeys(synthetic)
    expect(keys).toContain('counters.followed')
    expect(keys).toContain('counters.title')
    // …et il ne ramasse pas la clé à trous elle-même.
    expect(keys.some(k => k.includes('$'))).toBe(false)
  })
})
