import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Les hooks de mutation ont un appelant — la version WEB de
 * `wired-write-paths.spec.ts`.
 *
 * Le défaut qu'elle ferme, trouvé le 20/08 : `useCreateSubmission` existait,
 * avec son client HTTP, son invalidation de cache, son toast et son endpoint
 * côté serveur — et AUCUN composant ne l'appelait. On ne pouvait donc pas
 * positionner un consultant sur un besoin depuis l'interface, alors que c'est
 * le geste central d'un ATS. Les tests étaient verts des deux côtés du fil :
 * un test appelle toujours la fonction qu'il teste.
 *
 * La règle est la même que côté serveur : ce qui figure ici est le genre de
 * geste dont l'absence est INVISIBLE — un écran qui affiche « aucun
 * positionnement » a exactement l'air d'un espace où personne n'en a créé.
 */

const SRC = join(__dirname, '..')

const MUST_BE_CALLED: { hook: string; definedIn: string; why: string }[] = [
  {
    hook: 'useCreateSubmission',
    definedIn: 'submissions/api.ts',
    why: 'sans appelant, aucun profil ne peut être positionné sur un besoin',
  },
  {
    hook: 'useTalentSearch',
    definedIn: 'consultants/hooks.ts',
    why: 'sans appelant, le vivier recharge tout sans filtre et la disponibilité dérivée n’atteint aucun écran',
  },
  {
    hook: 'useCvIntake',
    definedIn: 'consultants/hooks.ts',
    why: 'sans appelant, déposer un CV redevient impossible et le vivier n’accepte que du texte collé',
  },
  {
    hook: 'useCommitCvParse',
    definedIn: 'consultants/hooks.ts',
    why: 'sans appelant, la revue d’un CV ne pourrait jamais être validée',
  },
  {
    hook: 'useDecideSkillAlias',
    definedIn: 'catalogues/api.ts',
    why: 'sans appelant, la file d’enrichissement du catalogue ne peut jamais être tranchée',
  },
  {
    hook: 'useTalentDeletionPreview',
    definedIn: 'consultants/hooks.ts',
    why: 'sans appelant, la suppression d’un talent redevient muette sur ce qu’elle emporte',
  },
]

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    // Les tests sont exclus, pour la même raison que côté serveur.
    if (!/\.tsx?$/.test(entry)) continue
    if (/\.(test|spec)\.tsx?$/.test(entry)) continue
    if (entry.endsWith('.gen.ts')) continue
    out.push(full)
  }
  return out
}

describe('les mutations livrées ont un appelant', () => {
  const files = sourceFiles(SRC)

  it.each(MUST_BE_CALLED)('$hook — $why', ({ hook, definedIn }) => {
    const callers = files.filter(file => {
      if (file.endsWith(definedIn)) return false
      return new RegExp(`\\b${hook}\\s*\\(`).test(readFileSync(file, 'utf8'))
    })
    expect(callers.length).toBeGreaterThan(0)
  })

  it('la liste n’est pas vide — une garde qui ne surveille rien passe au vert pour toujours', () => {
    expect(MUST_BE_CALLED.length).toBeGreaterThan(0)
  })
})

/**
 * Une case cochée à l'écran doit ARRIVER au serveur.
 *
 * Le défaut du 20/08 est d'une autre famille que les hooks orphelins : ici le
 * hook, l'endpoint et le schéma existaient tous, et le champ était perdu dans
 * la couche du milieu — `onConfirm({ reason })` déstructurait le motif et
 * laissait tomber les actions. Tout était vert : le panneau a ses tests, le
 * serveur a les siens, et personne ne teste le trajet.
 */
describe('les cases du panneau d’effets arrivent jusqu’au serveur', () => {
  const read = (relative: string) => readFileSync(join(SRC, relative), 'utf8')

  it('le client HTTP envoie bien `accepted_actions`', () => {
    expect(read('features/projects/api.ts')).toContain('accepted_actions')
  })

  it('les deux écrans qui déplacent un projet transmettent les cases cochées', () => {
    for (const screen of [
      'features/projects/view/ProjectsPage.tsx',
      // le sélecteur d'étape délègue le panneau d'effets à son hook (fiche affaire r22-ecran-c6)
      'features/projects/hooks/useProjectStageMove.tsx',
    ]) {
      expect(read(screen)).toContain('acceptedActions')
    }
  })

  it('le panneau distingue ce que Bellum fait de ce qui reste à faire', () => {
    // Sans cette distinction, toutes les cases se ressemblent et cocher un
    // simple rappel se lit comme un déclenchement.
    expect(read('features/projects/view/StageMovePanel.tsx')).toContain('performedBy')
  })
})

/**
 * Le bandeau de capacité a un APPELANT.
 *
 * Livré par le chantier du PDF 1, testé, et monté nulle part pendant deux
 * jours : `CapabilityBanner` et `resolveRouteAccess` étaient exactement le
 * « livré mais jamais appelé » que ce dépôt traque ailleurs, laissé dans le
 * code qui servait à le traquer.
 */
describe('le bandeau de capacité est monté quelque part', () => {
  it('CapabilityBanner a au moins un appelant hors de sa définition', () => {
    const callers = sourceFiles(SRC).filter(file => {
      if (file.endsWith('CapabilityBanner.tsx')) return false
      return /<CapabilityBanner\b/.test(readFileSync(file, 'utf8'))
    })
    expect(callers.length).toBeGreaterThan(0)
  })

  it('ConnectorDiagnostics est monté sur les cartes de connecteur', () => {
    // Un panneau de diagnostic livré et jamais monté est exactement le défaut
    // que le PDF 7 corrige : quelque chose d'écrit, de testé, et que rien
    // n'appelle. La carte continuerait de dire « Connecté » et rien d'autre.
    const callers = sourceFiles(SRC).filter(file => {
      if (file.endsWith('ConnectorDiagnostics.tsx')) return false
      return /<ConnectorDiagnostics\b/.test(readFileSync(file, 'utf8'))
    })
    expect(callers.length).toBeGreaterThan(0)
  })

  it('useRouteAccess est réellement utilisé', () => {
    const callers = sourceFiles(SRC).filter(file => {
      if (file.endsWith('useRouteAccess.ts')) return false
      return /useRouteAccess\s*\(/.test(readFileSync(file, 'utf8'))
    })
    expect(callers.length).toBeGreaterThan(0)
  })
})
