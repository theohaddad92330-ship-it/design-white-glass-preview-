import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA — AUCUN DÉBIT SUR LE PARCOURS D'ONBOARDING.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Décision de Louis du 15/09/2026 : **l'onboarding est GRATUIT de bout en bout**
 * — questionnaire, audit sur données déclarées, mémoire marché, corrections,
 * imports locaux et prévisualisations coûtent ZÉRO crédit. Seules la recherche
 * fraîche, l'enrichissement, l'analyse externe et la vérification payante
 * débitent, et elles annoncent coût + durée + périmètre + crédits restants
 * AVANT le clic.
 *
 * Cette décision a supprimé les trois scénarios de recette que #2003.22,
 * #2003.23 et #2004.16 décrivaient (utilisateur sans crédit bloqué en cours
 * d'onboarding, retour Stripe, abandon avant paiement, reprise après paiement).
 * Fermer trois lignes de registre sur une décision, c'est la confier à la
 * mémoire de ceux qui l'ont lue. Cette garde la confie à du CODE : le jour où
 * quelqu'un branche un débit sur une étape d'onboarding, la CI le NOMME.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE REFUSE AUSSI LA SIMPLE CONNAISSANCE DU SERVICE
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne se contente pas d'interdire les deux appels qui débitent
 * (`consumeAnalysisSlot`, `consumeEnrichmentCredit`) : elle interdit qu'un
 * fichier du parcours mentionne seulement `CreditsService`. Un service injecté
 * « pour lire le solde » aujourd'hui est un service qui débite dans six mois,
 * et la revue qui aurait dû le voir portera sur trois lignes au milieu d'un
 * diff de quatre cents. Ce qu'on ne connaît pas, on ne peut pas l'appeler par
 * mégarde.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE QU'ELLE NE PEUT PAS SAVOIR
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle lit du TEXTE, dans un périmètre NOMMÉ. Elle ne suit pas la chaîne
 * d'appels : un service d'onboarding qui appellerait un troisième service, qui
 * lui débiterait, lui échapperait. Ce n'est pas un oubli, c'est la limite de ce
 * qu'un balayage de sources sait faire honnêtement — et c'est écrit ici plutôt
 * que laissé à croire. Le périmètre ci-dessous est la seule chose qu'elle
 * garde, et il s'étend quand le parcours s'étend.
 */

const API_SRC = join(__dirname, '..')

/**
 * Le parcours d'onboarding, module par module, AVEC la raison de chacun.
 * Un chemin sans raison n'entre pas : on saurait quoi balayer, pas pourquoi.
 */
const ONBOARDING_PATH: Readonly<Record<string, string>> = {
  'modules/onboarding': 'le parcours lui-même — étapes, réponses, activation',
  'modules/esn-profile': 'les réponses DÉCLARÉES du questionnaire et le portefeuille d’offres',
  'modules/market-memory': 'la mémoire marché, lue pendant l’onboarding sur des données déjà là',
  'modules/import': 'les imports locaux, leurs prévisualisations et leur restitution',
}

/** Ce qui, dans une source, prouve qu'un débit est à portée de main. */
const DEBIT_MARKERS: Readonly<Record<string, string>> = {
  'consumeAnalysisSlot(': 'le débit d’un créneau d’analyse',
  'consumeEnrichmentCredit(': 'le débit d’un crédit d’enrichissement',
  CreditsService: 'le service qui débite — un fichier du parcours ne doit même pas le connaître',
}

/**
 * Retire commentaires de bloc et de ligne.
 *
 * Le `//` d'une URL (`https://…`) est épargné : il est toujours précédé d'un
 * `:`. Sans cette précaution, une garde qui compte des motifs se trompe — ce
 * dépôt a déjà payé deux comptages faux la même nuit pour l'avoir oublié.
 */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** Le cœur de la garde, isolé pour qu'on puisse lui faire dire NON. */
export function debitsOnPath(files: readonly { path: string; source: string }[]): string[] {
  const offences: string[] = []
  for (const file of files) {
    const code = stripComments(file.source)
    for (const [marker, why] of Object.entries(DEBIT_MARKERS)) {
      if (code.includes(marker)) offences.push(`${file.path} → ${marker} (${why})`)
    }
  }
  return offences.sort()
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts') || entry.endsWith('.d.ts')) continue
    out.push(full)
  }
  return out
}

function corpus(): { path: string; source: string }[] {
  return Object.keys(ONBOARDING_PATH).flatMap(relative =>
    sourceFiles(join(API_SRC, relative)).map(full => ({
      path: full.slice(API_SRC.length + 1),
      source: readFileSync(full, 'utf8'),
    })),
  )
}

describe('GA — aucun débit sur le parcours d’onboarding (décision Louis 15/09/2026)', () => {
  const files = corpus()

  it('le corpus n’est pas vide — la garde LIT bien quelque chose', () => {
    // `n: 0` est un relevé nul, jamais un vert. Les quatre modules du parcours
    // existent, et chacun porte des sources.
    expect(Object.keys(ONBOARDING_PATH)).toHaveLength(4)
    for (const relative of Object.keys(ONBOARDING_PATH)) {
      const inModule = files.filter(file => file.path.startsWith(relative))
      expect({ module: relative, n: inModule.length }).toEqual({ module: relative, n: inModule.length })
      expect(inModule.length).toBeGreaterThan(0)
    }
    expect(files.length).toBeGreaterThanOrEqual(20)
    expect(files.map(file => file.source.length).reduce((a, b) => a + b, 0)).toBeGreaterThan(20000)
  })

  it('aucun fichier du parcours ne débite ni ne connaît le service qui débite', () => {
    expect(debitsOnPath(files)).toEqual([])
  })

  it('elle sait dire NON — un débit posé sur une étape d’onboarding est NOMMÉ', () => {
    // On casse volontairement : un débit arrive dans le service d'onboarding.
    const broken = files.map(file =>
      file.path === 'modules/onboarding/onboarding.service.ts'
        ? { ...file, source: `${file.source}\n// oups\nawait this.credits.consumeAnalysisSlot(userId)\n` }
        : file,
    )
    expect(debitsOnPath(broken)).toEqual([
      'modules/onboarding/onboarding.service.ts → consumeAnalysisSlot( (le débit d’un créneau d’analyse)',
    ])
  })

  it('elle sait dire NON aussi quand le service est seulement INJECTÉ', () => {
    const broken = [
      { path: 'modules/import/import.service.ts', source: 'constructor(private readonly credits: CreditsService) {}' },
    ]
    expect(debitsOnPath(broken)).toEqual([
      'modules/import/import.service.ts → CreditsService (le service qui débite — un fichier du parcours ne doit même pas le connaître)',
    ])
  })

  it('le prédicat reconnaît un VRAI débit du dépôt — il ne cherche pas un motif inexistant', () => {
    // Contrôle positif : les marqueurs sont ceux que le produit écrit vraiment.
    // Un prédicat comparé à des valeurs que le code ne produit pas est toujours
    // vert, et son vert ne prouve rien.
    const real = readFileSync(join(API_SRC, 'modules', 'accounts', 'need-play.service.ts'), 'utf8')
    expect(debitsOnPath([{ path: 'modules/accounts/need-play.service.ts', source: real }])).toEqual([
      'modules/accounts/need-play.service.ts → CreditsService (le service qui débite — un fichier du parcours ne doit même pas le connaître)',
      'modules/accounts/need-play.service.ts → consumeEnrichmentCredit( (le débit d’un crédit d’enrichissement)',
    ])
  })

  it('elle n’attrape pas ce qu’elle ne vise pas — un débit LÉGITIME hors onboarding passe', () => {
    // Témoin du cas voisin : la recherche fraîche, l'enrichissement et l'analyse
    // externe débitent, et c'est la décision du 15/09 elle-même qui le dit. Ces
    // fichiers ne sont pas sur le parcours, donc ils ne sont pas dans le corpus.
    const outside = ['modules/accounts/need-play.service.ts', 'modules/analysis/analysis.service.ts']
    for (const path of outside) {
      expect(files.map(file => file.path)).not.toContain(path)
    }
    expect(debitsOnPath(files)).toEqual([])
  })

  it('elle n’attrape pas non plus un COMMENTAIRE qui cite la règle', () => {
    // Un fichier du parcours a le droit d'EXPLIQUER pourquoi il ne débite pas.
    // Une garde qui punit sa propre documentation se fait contourner en la
    // supprimant, et on perd les deux.
    const documented = [
      {
        path: 'modules/onboarding/onboarding.service.ts',
        source: [
          '// Onboarding gratuit (Louis 15/09/2026) : aucun appel à CreditsService,',
          '// donc jamais de consumeAnalysisSlot( ni de consumeEnrichmentCredit( ici.',
          '/* Voir la garde onboarding-never-debits.spec.ts — CreditsService reste hors du parcours. */',
          'export class OnboardingService {}',
        ].join('\n'),
      },
    ]
    expect(debitsOnPath(documented)).toEqual([])
  })
})
