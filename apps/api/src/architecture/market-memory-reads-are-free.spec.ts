import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { MARKET_MEMORY_FREE_READS } from '@bellum/contracts'

/**
 * GA-286 — LIRE CE QU'ON SAIT DÉJÀ NE DÉBITE AUCUN CRÉDIT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE, ET CE QU'ELLE N'A PAS EU À CORRIGER
 * ─────────────────────────────────────────────────────────────────────────────
 * Mesuré le 11/09/2026, AVANT d'écrire cette garde : les quatre dossiers du
 * corpus ci-dessous ne contenaient pas une seule occurrence du mot « credit ».
 * Le comportement était donc déjà juste, et rien n'a été recodé — cette garde
 * ne CORRIGE rien, elle EMPÊCHE.
 *
 * Ce qu'elle empêche est précis : qu'un débit apparaisse un jour sur une
 * lecture, « pour être cohérent avec le reste ». Le dépôt a déjà payé la
 * version voisine de cette faute (`refresh:<dimension>` retombait sur le poids
 * d'un enrichissement de contact, si bien que le prix annoncé et le prix
 * débité venaient de deux sources différentes, égales par coïncidence). Une
 * lecture facturée, elle, ne se découvre pas en CI : elle se découvre sur le
 * relevé d'un client qui a payé deux fois une donnée déjà acquise.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LE CORPUS EST DÉRIVÉ DU CONTRAT, ET PAS ÉCRIT ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * `MARKET_MEMORY_FREE_READS` (`@bellum/contracts`) NOMME les sept lectures. Si
 * cette garde tenait sa propre liste de dossiers, les deux dériveraient — et
 * c'est très exactement le défaut que GA-258 a subi le 09/09 : sa liste écrite
 * à la main portait quatre entités sur cinq, elle est restée VERTE en cessant
 * de voir un cinquième de son sujet. Le test « le contrat et le corpus se
 * répondent » ci-dessous fait tomber la garde si une clé du contrat cesse
 * d'avoir un dossier, ou l'inverse.
 *
 * ⚠️ Elle ne regarde QUE le débit. Qu'une lecture soit gratuite ne dit rien de
 * ce qu'elle a le droit de lire — c'est GA-258 (une seule porte vers les
 * tables partagées) et GA-16 (le cloisonnement) qui tiennent cette part-là.
 */

const MODULES = join(__dirname, '..', 'modules')

/**
 * Les DEUX seules méthodes qui débitent, relevées à la source le 11/09/2026
 * (`credits.service.ts:1348` et `:1426`). Toute méthode de débit neuve s'ajoute
 * ICI dans le même commit que sa création — un contrôle positif ci-dessous
 * vérifie qu'elles existent toujours sous ces noms exacts, sans quoi un
 * renommage rendrait cette garde aveugle sans la faire rougir.
 */
const DEBIT_METHODS = ['consumeAnalysisSlot', 'consumeEnrichmentCredit'] as const

const CREDITS_SERVICE = join(MODULES, 'credits', 'credits.service.ts')

/**
 * Où vit chacune des sept lectures gratuites du contrat, dans `modules/`.
 *
 * Plusieurs clés partagent un dossier (le contexte d'intelligence de compte et
 * la consultation du contexte marché sont deux gestes, une seule maison), et
 * c'est voulu : la garde surveille des CHEMINS, le contrat nomme des GESTES.
 */
const FREE_READ_DIRECTORIES: Readonly<Record<string, readonly string[]>> = {
  market_memory_filters: ['market-memory'],
  search_market_memory: ['market-memory'],
  account_intelligence_context: ['account-intelligence'],
  // #2288.2 (18/09/2026) — `consultants/verification` a été AJOUTÉ le jour où
  // le plan de vérification est né. Il rend gratuitement les états de
  // conservation de la prospection inversée, et il vivait hors du corpus que
  // cette garde balaie : elle serait restée verte sans jamais l'ouvrir. Une
  // garde aveugle n'est pas une exemption.
  reverse_market_structural: ['consultants/matching', 'consultants/verification'],
  onboarding: ['onboarding'],
  local_affinity: ['market-memory'],
  market_context_read: ['account-intelligence', 'zero-layer'],
}

/** Retire les commentaires AVANT lecture — une garde qui lit le récit du défaut
 *  écrit dans un docblock compare du bruit à du bruit, et reste verte pendant
 *  que la cible réelle a bougé. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Un appel de débit trouvé dans du code réel (commentaires déjà retirés). */
function debitCallFound(source: string): string | null {
  return DEBIT_METHODS.find(method => new RegExp(`\\.\\s*${method}\\s*\\(`).test(source)) ?? null
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) out.push(full)
  }
  return out
}

/** Les dossiers du corpus, dédoublonnés — le contrat en est la seule source. */
const CORPUS_DIRECTORIES = [...new Set(Object.values(FREE_READ_DIRECTORIES).flat())].sort()

const CORPUS_FILES = CORPUS_DIRECTORIES.flatMap(dir => sourceFiles(join(MODULES, dir)))

describe('#1639 — les lectures de la mémoire marché ne débitent rien', () => {
  it('lit un corpus non vide, dans chacun des dossiers déclarés', () => {
    // Preuve n°1 : un chemin faux rendrait cette garde verte en ne lisant rien
    // — le pire des faux verts, parce qu'il se lit comme une victoire.
    expect(CORPUS_FILES.length).toBeGreaterThan(20)
    // Un tableau plutôt qu'une boucle d'assertions : jest n'accepte pas de
    // message sur `expect`, et un rouge doit NOMMER le dossier vide.
    const empty = CORPUS_DIRECTORIES.filter(dir => !CORPUS_FILES.some(file => file.includes(`/modules/${dir}/`)))
    expect(empty).toEqual([])
  })

  it('le contrat et le corpus se répondent — aucune lecture sans maison', () => {
    // Le garde-fou contre la dérive silencieuse : une huitième lecture ajoutée
    // au contrat sans dossier ici passerait inaperçue, et la garde surveillerait
    // sept huitièmes de son sujet en restant verte.
    const contractKeys = MARKET_MEMORY_FREE_READS.map(read => read.key).sort()
    expect(Object.keys(FREE_READ_DIRECTORIES).sort()).toEqual(contractKeys)
  })

  it('contrôle positif — les deux méthodes de débit existent toujours sous ces noms', () => {
    // Sans cette ligne, un renommage de `consumeAnalysisSlot` ferait que plus
    // personne ne le trouve nulle part, donc « aucun coupable », donc une garde
    // verte qui n'a rien comparé. Six gardes borgnes en deux jours dans ce
    // dépôt, dont une exactement sur ce motif.
    const source = readFileSync(CREDITS_SERVICE, 'utf8')
    const missing = DEBIT_METHODS.filter(method => !new RegExp(`async\\s+${method}\\s*\\(`).test(source))
    expect(missing).toEqual([])
  })

  it('SAIT DIRE NON — un débit glissé dans une lecture est détecté', () => {
    // Preuve n°2, sur les deux méthodes et sur les deux formes d'appel réelles
    // du dépôt (directe, et optionnelle `?.` comme dans analysis-ondemand).
    const fautif = `
      const consume = await this.credits.consumeEnrichmentCredit(userId, { reason: 'market_memory_read' })
      if (!consume.ok) return null
    `
    expect(debitCallFound(stripComments(fautif))).toBe('consumeEnrichmentCredit')

    const fautifOptionnel = `await this.credits?.consumeAnalysisSlot(userId, { accountId })`
    expect(debitCallFound(stripComments(fautifOptionnel))).toBe('consumeAnalysisSlot')
  })

  it("n'attrape PAS ce qu'elle ne vise pas — trois témoins", () => {
    // Preuve n°3.
    //
    // Témoin 1 : un débit LÉGITIME, lu sur le vrai fichier. `analysis-refresh`
    // vérifie un axe contre le web d'aujourd'hui — c'est du travail nouveau, il
    // se facture, et il est hors du corpus. Si ce témoin cessait de débiter, ce
    // test tomberait : la garde serait alors en train de surveiller un dépôt où
    // plus rien ne débite, ce qui n'est pas le monde qu'elle décrit.
    const refresh = stripComments(readFileSync(join(MODULES, 'analysis', 'analysis-refresh.service.ts'), 'utf8'))
    expect(debitCallFound(refresh)).toBe('consumeEnrichmentCredit')
    expect(CORPUS_FILES.some(file => file.includes('analysis-refresh.service.ts'))).toBe(false)

    // Témoin 2 : un COMMENTAIRE qui nomme la méthode — comme celui de cette
    // garde, ou ceux de `accounts.controller.ts` qui renvoient au débit voisin.
    // Le nommer n'est pas l'appeler.
    const commentaire = `
      // Aucun débit ici : consumeEnrichmentCredit est appelé plus loin.
      /* La lecture ne passe jamais par consumeAnalysisSlot. */
    `
    expect(debitCallFound(stripComments(commentaire))).toBeNull()

    // Témoin 3 : une LECTURE du solde n'est pas un débit. Une lecture gratuite
    // a parfaitement le droit de savoir combien il reste — pour l'afficher.
    const lectureDeSolde = `const remaining = await this.credits.hasEnrichmentCredit(userId)`
    expect(debitCallFound(stripComments(lectureDeSolde))).toBeNull()
  })

  it('AUCUNE lecture gratuite n’appelle une méthode de débit', () => {
    const offenders = CORPUS_FILES.map(file => ({ file, source: stripComments(readFileSync(file, 'utf8')) }))
      .map(({ file, source }) => ({ file, method: debitCallFound(source) }))
      .filter((entry): entry is { file: string; method: string } => entry.method !== null)
      .map(({ file, method }) => `${file.slice(file.indexOf('modules'))} — ${method}`)

    // ⚠️ Si cette liste cesse d'être vide : un crédit paie du TRAVAIL NOUVEAU,
    // jamais une lecture. Le geste qui coûte est celui qui va vérifier
    // aujourd'hui — il vit hors de ces dossiers, et il annonce son prix avant
    // le clic (`MARKET_MEMORY_PAID_VERIFICATIONS`).
    expect(offenders.sort()).toEqual([])
  })
})
