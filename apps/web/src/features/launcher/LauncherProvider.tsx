import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { LAUNCHER_TYPES, type LauncherRun, type LauncherType, type LauncherTypeKey } from '@bellum/contracts'
import { usePlanFeature } from '@/features/plan-features/usePlanFeature'
import { armedRunOf } from './launcher-arm'
import { launcherIntent } from './launcher-intent'

/**
 * Le lanceur, monté AUTOUR du copilote et consommé DANS son composer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN CONTEXTE ET PAS UN HOOK APPELÉ DANS `Chat`
 * ─────────────────────────────────────────────────────────────────────────
 * Le lanceur lit le PALIER (`usePlanFeature` → `useCredits` → react-query) :
 * un chip qui mène à un écran verrouillé est pire qu'un chip absent. Appeler
 * ce hook dans `Chat` tirerait react-query dans les tests unitaires du
 * copilote, qui n'ont pas de `QueryClientProvider` — c'est exactement pour
 * cette raison que la bande était montée dans la ROUTE, et cette raison n'a
 * pas changé en descendant dans le composer.
 *
 * D'où le contexte, avec une propriété qui porte tout le reste : **son défaut
 * est `null`, et `null` veut dire « composer d'avant ».** Un test qui rend
 * `Chat` nu ne monte aucun fournisseur, ne touche pas react-query, et obtient
 * le composer inchangé. Ce n'est pas une commodité de test — c'est ce qui rend
 * le déplacement sûr : la voie qui ne peut rien coûter est celle sur laquelle
 * on retombe quand quelque chose manque.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE FOURNISSEUR N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────
 * **Il ne possède pas le texte.** C'est tout l'objet du chantier : l'écran
 * portait deux zones de saisie à 550 px l'une de l'autre, et personne ne
 * trouvait la bonne. Le texte appartient au composer ; `go(text)` le reçoit.
 * Lui en donner une copie ici recréerait les deux champs, à un état près.
 *
 * **Il n'exécute rien.** Il navigue vers l'objet avec le run ARMÉ, et c'est la
 * confirmation déjà présente sur l'écran de destination qui débite — aucun
 * second chemin d'écriture, aucun risque de double débit, et le prix affiché
 * ne peut pas diverger de celui qui sera prélevé. Voir le préambule du
 * catalogue, `packages/contracts/src/schemas/launcher.ts`.
 */
type LauncherArm = {
  /** Les types que l'offre en cours ouvre. Le doute n'interdit pas. */
  types: readonly LauncherType[]
  typeKey: LauncherTypeKey | null
  /** Les runs du type armé — vide tant qu'aucun type n'est choisi. */
  runs: readonly LauncherRun[]
  /** Le run réellement armé : celui choisi, sinon le premier du type. */
  armedRun: LauncherRun | null
  /** Clique un chip. Recliquer le chip actif DÉSARME. */
  pickType: (key: LauncherTypeKey) => void
  pickRun: (key: string) => void
  /** Repasse sur la voie Laura sans rien lancer. */
  disarm: () => void
  /** Ouvre l'écran de l'objet avec le run armé. Ne débite rien ici. */
  go: (text: string) => void
  /**
   * Ouvre l'écran du travail dominant de ce type, SANS passer par le champ.
   *
   * Il existe pour une surface dont la saisie est désactivée — la salle de
   * démonstration. Y armer un run n'a aucune sortie : la seule qui existe est
   * le bouton du composer, et il n'y en a pas. Mesuré le 29/08/2026, les cinq
   * chips y étaient les seuls éléments cliquables de l'écran et ne menaient
   * nulle part.
   *
   * ⚠️ Il ne redécide RIEN : il passe par le même {@link launcherIntent} que
   * `go`, avec un texte vide. Deux dérivations de « sur quelle voie part-on ? »
   * divergeraient au premier ajout — c'est ce que GA-26 interdit, et c'est déjà
   * écrit noir sur blanc dans le préambule du catalogue.
   */
  openType: (key: LauncherTypeKey) => void
}

const LauncherContext = createContext<LauncherArm | null>(null)

/**
 * Le lanceur du composer, ou `null`.
 *
 * `null` n'est pas une panne : c'est « cette surface n'a pas de lanceur », et
 * le composer doit alors se rendre exactement comme avant. Lever ici forcerait
 * chaque test de copilote à monter un fournisseur pour une fonctionnalité
 * qu'il ne teste pas.
 */
export function useLauncherArm(): LauncherArm | null {
  return useContext(LauncherContext)
}

export function LauncherProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [typeKey, setTypeKey] = useState<LauncherTypeKey | null>(null)
  const [runKey, setRunKey] = useState<string | null>(null)

  // Les paliers se lisent un par un : `usePlanFeature` est un hook, une boucle
  // sur le catalogue violerait les règles des hooks.
  const needs = usePlanFeature('needs')
  const talent = usePlanFeature('talent_pool')
  const discover = usePlanFeature('discover')

  const value = useMemo<LauncherArm>(() => {
    const allowedFeature: Record<string, boolean> = {
      needs: needs.allowed,
      talent_pool: talent.allowed,
      discover: discover.allowed,
    }
    /* Un chip qui mène à un écran verrouillé est PIRE qu'un chip absent : la
       première fois on croit s'être trompé, la deuxième on cesse de regarder.
       Le doute n'interdit pas — `usePlanFeature` laisse ouvert tant qu'il ne
       sait pas, et le serveur tranche. */
    const types = LAUNCHER_TYPES.filter(type => type.feature === null || allowedFeature[type.feature] !== false)
    const armedRun = armedRunOf(typeKey, runKey)

    const disarm = () => {
      setTypeKey(null)
      setRunKey(null)
    }

    return {
      types,
      typeKey,
      runs: typeKey ? (types.find(type => type.key === typeKey)?.runs ?? []) : [],
      armedRun,
      pickType: key => {
        // Recliquer le chip actif DÉSARME. Sans cela, l'ouvrir par erreur
        // laisserait le composer en mode run — donc un bouton « Ouvrir » et un
        // marque-place qui parlent d'autre chose que ce qu'on voulait taper.
        setTypeKey(previous => (previous === key ? null : key))
        setRunKey(null)
      },
      pickRun: setRunKey,
      disarm,
      go: text => {
        const intent = launcherIntent({ typeKey, runKey, text })
        if (intent.kind !== 'run') return
        disarm()
        void navigate({ to: intent.to, search: intent.search })
      },
      openType: key => {
        const intent = launcherIntent({ typeKey: key, runKey: null, text: '' })
        if (intent.kind !== 'run') return
        disarm()
        void navigate({ to: intent.to, search: intent.search })
      },
    }
  }, [typeKey, runKey, needs.allowed, talent.allowed, discover.allowed, navigate])

  return <LauncherContext.Provider value={value}>{children}</LauncherContext.Provider>
}
