import { useCallback, useMemo, useState } from 'react'
import { toFormAnswerValue, type EsnAnswers } from '@bellum/contracts'

type ProfileValue = string | string[]
export type ProfileValues = Record<string, ProfileValue>

function seed(answers: EsnAnswers): ProfileValues {
  const out: ProfileValues = {}
  for (const [key, value] of Object.entries(answers)) {
    // Même règle que `onboardingStore` : une valeur structurée n'est pas une
    // valeur de formulaire, et se saute au lieu de se déformer.
    const forForm = toFormAnswerValue(value)
    if (forForm !== null) out[key] = forForm
  }
  return out
}

/**
 * Form state for the Profile editor, seeded from the loaded ESN answers via
 * `useState(initialiser)` — no `useEffect` syncing, since the component using
 * this hook mounts only *after* the answers have loaded.
 */
export function useProfileAnswers(answers: EsnAnswers) {
  const initial = useMemo(() => seed(answers), [answers])
  // #3923 — on ne garde que les champs que la personne a TOUCHÉS ; tout le
  // reste suit les réponses chargées. Avant, `values` était une copie figée au
  // montage : une autre carte de l'écran (« Métiers que tu places ») enregistrait
  // `placed_roles`, la cache se rafraîchissait, mais ce formulaire renvoyait ses
  // valeurs d'AVANT par l'auto-save — le second toast « Profil enregistré »
  // effaçait le premier. Un toast de succès ne doit jamais mentir.
  const [edits, setEdits] = useState<ProfileValues>({})
  const values = useMemo<ProfileValues>(() => ({ ...initial, ...edits }), [initial, edits])

  const setField = useCallback((key: string, value: ProfileValue) => {
    setEdits(prev => ({ ...prev, [key]: value }))
  }, [])

  /**
   * Le formulaire est-il modifié ?
   *
   * ⚠️ On compare l'UNION des clés, pas seulement celles de `initial`.
   *
   * Trouvé en recette le 26/08 : une réponse OPTIONNELLE jamais donnée est
   * absente des réponses chargées, donc absente d'`initial`. La boucle ne la
   * regardait pas, le formulaire ne devenait jamais « modifié », et le clic ne
   * déclenchait AUCUNE requête. Rien ne le signalait — pas d'erreur, pas de
   * toast, la ligne se sélectionnait à l'écran et disparaissait au rechargement.
   *
   * Le piège vise TOUTE réponse ajoutée au questionnaire sans valeur stockée,
   * pas seulement celle qui l'a révélé : c'est pour ça que la correction est
   * ici et pas dans un schéma.
   */
  const dirty = useMemo(() => {
    for (const key of new Set([...Object.keys(initial), ...Object.keys(values)])) {
      const a = initial[key]
      const b = values[key]
      if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length || a.some(v => !b.includes(v))) return true
      } else if (Array.isArray(a) !== Array.isArray(b)) {
        // Une clé qui n'existait pas d'un côté : un tableau face à `undefined`
        // n'est pas « égal », et le `!==` seul le raterait sur deux tableaux
        // vides fabriqués à des moments différents.
        return true
      } else if (a !== b) {
        return true
      }
    }
    return false
  }, [values, initial])

  return { values, setField, dirty }
}
