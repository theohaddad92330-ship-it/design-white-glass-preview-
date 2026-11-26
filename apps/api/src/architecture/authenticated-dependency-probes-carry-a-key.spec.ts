import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-282 — une sonde vers un service qui EXIGE une authentification porte
 * son en-tête. #1840.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * La sonde Supabase de la page Santé appelait `/auth/v1/health` SANS aucune
 * authentification. Kong — la passerelle devant GoTrue — refuse alors la
 * requête : 401 « No API key found in request ». `fetchOk` lit tout non-2xx
 * comme une panne, donc ce 401 devenait « SUPABASE (AUTHENTIFICATION) EN
 * PANNE » — alors que le service, mesuré sans authentification, répondait en
 * 0,46 s. Une sonde qui ne peut STRUCTURELLEMENT jamais réussir crie au loup
 * en continu, et un opérateur qui la voit rouge en permanence apprend à
 * ignorer la page.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE, EXACTEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * `DependencyProbeService.probe()` n'a qu'une seule porte vers le réseau HTTP :
 * `this.fetchOk(url, headers?)`. La garde repère CHAQUE appel de cette forme
 * dans le fichier, l'associe au `case '<id>':` qui le contient, et exige que
 * TOUS portent un second argument (l'en-tête), SAUF une dépendance nommée dans
 * `OPEN_SERVICE_EXEMPTIONS` avec sa raison — un service authentiquement OUVERT
 * n'a pas besoin de porter de clé.
 *
 * Elle ne recopie PAS « Supabase a un en-tête » en dur : ce serait garder le
 * cas d'hier, pas la règle. La forme qui SCALE est « la liste des sondes HTTP
 * sans en-tête doit être vide, ou nommée » — elle attrape la PROCHAINE
 * dépendance authentifiée qu'on ajoutera sans sa clé, pas seulement celle-ci.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE VISE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Postgres (`SELECT 1`), Redis (`ping`) et le worker (son registre de
 * vivacité) sont des sondes tout aussi réelles, mais elles ne passent PAS par
 * `fetchOk` — il n'existe littéralement aucun en-tête HTTP à leur poser. La
 * garde ne les voit jamais, ce qui est le bon comportement : elle ne doit pas
 * exiger un en-tête d'une sonde qui n'en a pas la forme.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS PREUVES, PAS DEUX
 * ─────────────────────────────────────────────────────────────────────────────
 * Une garde doit savoir dire NON (un extrait fabriqué, IDENTIQUE à l'ancien
 * code Supabase, est détecté), LIRE quelque chose (son corpus — les appels
 * `fetchOk` réels du fichier — n'est pas vide), et NE PAS attraper ce qu'elle
 * ne vise pas (Postgres/Redis/worker, qui n'appellent jamais `fetchOk`, restent
 * hors de portée). Six gardes borgnes en deux jours dans ce dépôt : celle-ci
 * est testée sur les trois axes, pas seulement sur le cas qui l'a motivée.
 */

const PROBE_FILE = join(__dirname, '..', 'modules', 'health', 'dependency-probe.service.ts')

/**
 * Les sondes HTTP dont l'authentification est FACULTATIVE — un service
 * ouvert n'a pas besoin de porter de clé, et ce n'est pas un oubli.
 *
 * Vide aujourd'hui : les deux seules sondes HTTP du dépôt (Supabase, Stripe)
 * visent chacune un service qui EXIGE une authentification. Une entrée future
 * doit nommer le service et pourquoi il est ouvert — sinon elle est un défaut,
 * pas une exception.
 */
const OPEN_SERVICE_EXEMPTIONS: Readonly<Record<string, string>> = {}

type FetchOkCallSite = { id: string; args: string }

/** Chaque `case '<id>':` du fichier, avec sa position — pour associer un
 *  appel `fetchOk` au bloc qui le contient. */
function caseLabels(source: string): { id: string; index: number }[] {
  const labels: { id: string; index: number }[] = []
  const re = /case '([a-z]+)':/g
  let match: RegExpExecArray | null
  while ((match = re.exec(source)) !== null) {
    labels.push({ id: match[1] as string, index: match.index })
  }
  return labels
}

function enclosingCaseId(labels: { id: string; index: number }[], index: number): string {
  let current = 'inconnu'
  for (const label of labels) {
    if (label.index <= index) current = label.id
    else break
  }
  return current
}

/**
 * Chaque appel `this.fetchOk(...)`, avec le texte BRUT de ses arguments.
 *
 * Le découpage compte les PARENTHÈSES plutôt que de s'arrêter à la première
 * fermante : l'appel réel de Supabase est `new URL('/x', requireEnv('Y'))`,
 * qui porte lui-même une virgule et une parenthèse imbriquées. S'arrêter tôt
 * couperait l'argument en deux et rendrait la garde borgne sur l'appel même
 * qu'elle doit lire.
 */
function fetchOkCallSites(source: string): FetchOkCallSite[] {
  const labels = caseLabels(source)
  const sites: FetchOkCallSite[] = []
  const call = /this\.fetchOk\s*\(/g
  let match: RegExpExecArray | null
  while ((match = call.exec(source)) !== null) {
    let depth = 1
    let i = match.index + match[0].length
    const start = i
    while (i < source.length && depth > 0) {
      const ch = source[i]
      if (ch === '(') depth += 1
      else if (ch === ')') depth -= 1
      i += 1
    }
    sites.push({ id: enclosingCaseId(labels, match.index), args: source.slice(start, i - 1) })
  }
  return sites
}

/**
 * Une virgule de PREMIER NIVEAU dans le texte d'arguments — donc un second
 * argument à `fetchOk`, quel que soit son contenu.
 *
 * Les guillemets sont neutralisés en les SAUTANT : sans ça, une virgule DANS
 * une chaîne (une URL, une valeur d'en-tête) compterait comme une frontière
 * d'argument — le même piège que `no-blind-record-writes.spec.ts` a payé sur
 * du SQL entre guillemets.
 */
function hasSecondArgument(args: string): boolean {
  let depth = 0
  let i = 0
  while (i < args.length) {
    const ch = args[i] as string
    if (ch === '(' || ch === '[' || ch === '{') depth += 1
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1
    else if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch
      i += 1
      while (i < args.length && args[i] !== quote) {
        if (args[i] === '\\') i += 1
        i += 1
      }
    } else if (ch === ',' && depth === 0) {
      return true
    }
    i += 1
  }
  return false
}

function headerlessCallSites(source: string): string[] {
  return fetchOkCallSites(source)
    .filter(site => !hasSecondArgument(site.args))
    .map(site => site.id)
}

describe('GA-282 — une sonde authentifiée porte sa clé (#1840)', () => {
  const source = readFileSync(PROBE_FILE, 'utf8')

  it('LIT quelque chose — le corpus des appels fetchOk du fichier réel n’est pas vide', () => {
    const sites = fetchOkCallSites(source)
    expect(sites.length).toBeGreaterThanOrEqual(2)
    expect(sites.map(s => s.id).sort()).toEqual(['stripe', 'supabase'])
  })

  it('aucune sonde HTTP n’est envoyée sans en-tête, sauf un service OUVERT nommé ici', () => {
    const headerless = headerlessCallSites(source).filter(id => !(id in OPEN_SERVICE_EXEMPTIONS))
    expect(headerless).toEqual([])
  })

  it('la liste des exemptions — vide aujourd’hui — reste justifiée si elle se remplit un jour', () => {
    for (const reason of Object.values(OPEN_SERVICE_EXEMPTIONS)) {
      expect(reason.length).toBeGreaterThan(20)
    }
  })

  it('sait dire NON — l’ANCIEN appel Supabase (#1840), sans en-tête, est détecté', () => {
    const brokenLikeTheOldCode = `
      case 'supabase':
        await this.fetchOk(new URL('/auth/v1/health', requireEnv('SUPABASE_URL')).toString())
        return true
      case 'stripe':
        await this.fetchOk('https://api.stripe.com/v1/balance', {
          Authorization: \`Bearer \${requireEnv('STRIPE_SECRET_KEY')}\`,
        })
        return true
    `
    expect(headerlessCallSites(brokenLikeTheOldCode)).toEqual(['supabase'])
  })

  it('n’attrape pas ce qu’elle ne vise pas — Postgres, Redis et le worker ne passent pas par fetchOk', () => {
    const legitimateWithoutFetch = `
      case 'postgres':
        await this.dataSource.query('SELECT 1')
        return true
      case 'redis':
        await this.pingRedis()
        return true
      case 'worker':
        if (!this.workers.isLive(ANALYSIS_WORKER_NAME)) throw new Error('analysis worker is not live')
        return false
    `
    expect(fetchOkCallSites(legitimateWithoutFetch)).toEqual([])
    expect(headerlessCallSites(legitimateWithoutFetch)).toEqual([])
  })

  it('ne se laisse pas piéger par une virgule NICHÉE — l’appel Supabase réel en porte une, dans `new URL(a, b)`', () => {
    // Témoin positif : sur le fichier RÉEL, corrigé, l'appel Supabase a bien un
    // second argument à `fetchOk` — mais sa PREMIÈRE virgule appartient à
    // `new URL(...)`, imbriquée. Une regex qui s'arrêterait à la première
    // virgule confondrait les deux et déclarerait « pas d'en-tête » à tort.
    const supabaseSite = fetchOkCallSites(source).find(site => site.id === 'supabase')
    expect(supabaseSite).toBeDefined()
    expect(supabaseSite?.args).toContain("new URL('/auth/v1/health'")
    expect(hasSecondArgument(supabaseSite?.args ?? '')).toBe(true)
  })

  it('le fichier réel porte bien les deux clés attendues — supabase `apikey`, stripe `Authorization`', () => {
    const supabaseSite = fetchOkCallSites(source).find(site => site.id === 'supabase')
    const stripeSite = fetchOkCallSites(source).find(site => site.id === 'stripe')
    expect(supabaseSite?.args).toContain('apikey')
    expect(supabaseSite?.args).toContain('SUPABASE_ANON_KEY')
    // Jamais la clé de service dans une sonde — c'est un privilège
    // d'administration, pas un contrôle de vivacité.
    expect(supabaseSite?.args).not.toMatch(/service.?role/i)
    expect(stripeSite?.args).toContain('Authorization')
  })
})
