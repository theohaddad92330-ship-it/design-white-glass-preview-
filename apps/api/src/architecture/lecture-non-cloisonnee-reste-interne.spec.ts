import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/**
 * GA-379 — une lecture VOLONTAIREMENT non cloisonnée ne sort pas du pipeline
 * interne (#2671).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * `AccountsService.findByIdUnscoped` lit un compte PAR ID SEUL, sans borne
 * `user_id` ni `workspace_id` — délibérément : le backoffice opérateur doit
 * pouvoir arrêter l'analyse de n'importe quel client, et il lui faut le
 * propriétaire du dossier pour reconstruire le jobId. La revue de cloisonnement
 * du 21/09/2026 (#2671) a laissé cette quatrième lecture intacte, comme demandé,
 * parce que sa sécurité tient à UNE phrase de commentaire : « Never reachable
 * from an end-user JWT path ». Les trois autres lectures de la même revue ont
 * reçu leur borne (`accounts.service.ts:3456/3502/3554`, commit `bccb04c03`) ;
 * celle-ci ne peut pas en recevoir, donc c'est sa PORTÉE qui se garde.
 *
 * Une phrase de commentaire n'a jamais empêché personne d'appeler une méthode
 * publique. Le jour où un contrôleur la nomme, la doctrine du dépôt tombe :
 * « le coût d'accès ne s'agrège JAMAIS entre espaces — ce sont des
 * concurrents ». Cette garde fait rougir la CI ce jour-là.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS RÈGLES, ET CE QU'ELLES NE FONT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. AUCUN contrôleur ne nomme une lecture non cloisonnée — jamais, et aucune
 *    liste d'exceptions ne peut l'autoriser : une route est par construction
 *    atteignable depuis l'extérieur, et c'est exactement la question que
 *    l'issue #2671 posait (« est-ce qu'un identifiant venu du client peut
 *    arriver là ? »).
 * 2. Hors contrôleurs, seuls les PORTEURS DÉCLARÉS ci-dessous la nomment.
 *    Ajouter un porteur est un geste conscient, qui oblige à écrire sa raison.
 * 3. Le seul geste qui l'expose (`AnalysisService.cancelByAdmin`) ne s'atteint
 *    que par un contrôleur tenu par `InternalSecretGuard`. Sans cette règle,
 *    la garde vérifierait des NOMS pendant qu'une route ouverte appellerait
 *    l'appelant — le défaut « code juste, appelant faux » du dépôt.
 *
 * Elle ne juge PAS les lectures bornées voisines (`findById`, `findOne` scopé) :
 * une garde qui attrape ce qu'elle ne vise pas se fait désactiver, et la règle
 * redevient une opinion.
 */

const API_SRC = resolve(__dirname, '..')

type Fichier = { chemin: string; contenu: string }

/** Les lectures qui n'ont PAS de borne d'espace, et l'assument. */
const LECTURES_NON_CLOISONNEES = ['findByIdUnscoped'] as const

/**
 * Qui a le droit de les nommer, et pourquoi. Une entrée = une raison écrite ;
 * un contrôleur n'entre JAMAIS ici (règle 1, non contournable).
 */
const PORTEURS_DECLARES: { fichier: string; raison: string }[] = [
  {
    fichier: 'modules/accounts/accounts.service.ts',
    raison: 'la définition elle-même, avec son commentaire « Operator/admin backoffice only »',
  },
  {
    fichier: 'modules/analysis/analysis.service.ts',
    raison: 'cancelByAdmin — arrêt opérateur d’un run, derrière InternalSecretGuard',
  },
]

/** Le geste métier qui expose la lecture non cloisonnée, et sa garde attendue. */
const GESTE_EXPOSE = { methode: 'cancelByAdmin', gardeAttendue: 'InternalSecretGuard' }

const estControleur = (chemin: string) => chemin.endsWith('.controller.ts')
const estTest = (chemin: string) => /\.(spec|test)\.ts$/.test(chemin)

/** Règle 1 — aucun contrôleur ne nomme une lecture non cloisonnée. */
function controleursQuiNomment(fichiers: Fichier[]): string[] {
  const violations: string[] = []
  for (const fichier of fichiers) {
    if (!estControleur(fichier.chemin) || estTest(fichier.chemin)) continue
    for (const lecture of LECTURES_NON_CLOISONNEES) {
      if (fichier.contenu.includes(lecture)) {
        violations.push(
          `${fichier.chemin} nomme \`${lecture}\` : une lecture SANS borne d'espace ne s'appelle pas ` +
            `depuis une route. L'identifiant y vient du client — passe par la lecture cloisonnée ` +
            `(\`findOne({ where: { id, workspace_id } })\`), ou justifie un chemin interne (#2671).`,
        )
      }
    }
  }
  return violations
}

/** Règle 2 — hors contrôleurs, seuls les porteurs déclarés la nomment. */
function porteursNonDeclares(fichiers: Fichier[], porteurs: { fichier: string }[]): string[] {
  const autorises = new Set(porteurs.map(porteur => porteur.fichier))
  const violations: string[] = []
  for (const fichier of fichiers) {
    if (estControleur(fichier.chemin) || estTest(fichier.chemin)) continue
    if (autorises.has(fichier.chemin)) continue
    for (const lecture of LECTURES_NON_CLOISONNEES) {
      if (fichier.contenu.includes(lecture)) {
        violations.push(
          `${fichier.chemin} nomme \`${lecture}\` sans être un porteur déclaré. Ajoute-le à ` +
            `PORTEURS_DECLARES avec sa raison — ou borne la lecture (#2671).`,
        )
      }
    }
  }
  return violations
}

/** Règle 3 — le geste qui l'expose n'est offert que derrière la garde interne. */
function gestesExposesSansGarde(fichiers: Fichier[], geste = GESTE_EXPOSE): string[] {
  const violations: string[] = []
  for (const fichier of fichiers) {
    if (!estControleur(fichier.chemin) || estTest(fichier.chemin)) continue
    if (!fichier.contenu.includes(`${geste.methode}(`)) continue
    if (!fichier.contenu.includes(geste.gardeAttendue)) {
      violations.push(
        `${fichier.chemin} expose \`${geste.methode}\` sans \`${geste.gardeAttendue}\` : ce geste lit un ` +
          `compte SANS borne d'espace (findByIdUnscoped). Une route utilisateur ne l'atteint jamais (#2671).`,
      )
    }
  }
  return violations
}

/** Le corpus réel : tous les `.ts` de `apps/api/src`, chemins relatifs à `src`. */
function corpusApi(): Fichier[] {
  const fichiers: Fichier[] = []
  const parcourir = (dossier: string): void => {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const complet = join(dossier, entree.name)
      if (entree.isDirectory()) {
        if (entree.name === 'node_modules' || entree.name === 'dist') continue
        parcourir(complet)
        continue
      }
      if (!entree.name.endsWith('.ts')) continue
      fichiers.push({ chemin: relative(API_SRC, complet), contenu: readFileSync(complet, 'utf8') })
    }
  }
  parcourir(API_SRC)
  return fichiers
}

describe('GA-379 — une lecture non cloisonnée reste dans le pipeline interne (#2671)', () => {
  const faux = (chemin: string, contenu: string): Fichier => ({ chemin, contenu })

  it('sait dire NON — un contrôleur qui nomme la lecture non cloisonnée fait rougir', () => {
    const violations = controleursQuiNomment([
      faux('modules/accounts/accounts.controller.ts', 'const compte = await this.accounts.findByIdUnscoped(id)'),
    ])
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('accounts.controller.ts')
    expect(violations[0]).toContain('findByIdUnscoped')
  })

  it('n’attrape pas ce qu’elle ne vise pas — une lecture BORNÉE dans un contrôleur passe', () => {
    const violations = controleursQuiNomment([
      faux('modules/accounts/accounts.controller.ts', 'const compte = await this.accounts.findById(id, workspaceId)'),
    ])
    expect(violations).toEqual([])
  })

  it('hors contrôleurs, un porteur NON déclaré fait rougir ; un porteur déclaré passe', () => {
    const corpus = [
      faux('modules/export/export.service.ts', 'this.accounts.findByIdUnscoped(id)'),
      faux('modules/analysis/analysis.service.ts', 'this.accountsService.findByIdUnscoped(accountId)'),
    ]
    const violations = porteursNonDeclares(corpus, PORTEURS_DECLARES)
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('export.service.ts')
  })

  it('sait dire NON sur l’APPELANT — le geste exposé sans la garde interne fait rougir', () => {
    const sansGarde = gestesExposesSansGarde([
      faux(
        'modules/admin/admin-analyses.controller.ts',
        '@UseGuards(JwtGuard)\nthis.analysisService.cancelByAdmin(id)',
      ),
    ])
    expect(sansGarde).toHaveLength(1)
    expect(sansGarde[0]).toContain('InternalSecretGuard')

    const avecGarde = gestesExposesSansGarde([
      faux(
        'modules/admin/admin-analyses.controller.ts',
        '@UseGuards(InternalSecretGuard)\nthis.analysisService.cancelByAdmin(id)',
      ),
    ])
    expect(avecGarde).toEqual([])
  })

  it('la garde LIT un corpus réel — et y retrouve la lecture non cloisonnée', () => {
    // Sans ce test, un chemin faux ou un filtre trop strict rendrait les trois
    // règles vertes pour toujours, sur zéro fichier.
    const corpus = corpusApi()
    expect(corpus.length).toBeGreaterThan(500)
    const porteurs = corpus.filter(fichier => !estTest(fichier.chemin) && fichier.contenu.includes('findByIdUnscoped'))
    expect(porteurs.map(fichier => fichier.chemin).sort()).toEqual(
      PORTEURS_DECLARES.map(porteur => porteur.fichier).sort(),
    )
  })

  it('aucun contrôleur ne nomme une lecture non cloisonnée, et son geste reste interne', () => {
    const corpus = corpusApi()
    const violations = [
      ...controleursQuiNomment(corpus),
      ...porteursNonDeclares(corpus, PORTEURS_DECLARES),
      ...gestesExposesSansGarde(corpus),
    ]
    if (violations.length > 0) {
      throw new Error(['Cloisonnement des espaces — #2671 :', ...violations.map(ligne => `  · ${ligne}`)].join('\n'))
    }
    expect(violations).toEqual([])
  })
})
