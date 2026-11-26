import { launcherTypeOf, runsOfType, type LauncherTypeKey } from '@bellum/contracts'
import { Button, TooltipButton } from '@bellum/ui'
import { Zap } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePlanFeature } from '@/features/plan-features/usePlanFeature'
import { LAUNCH_SURFACES } from './launch-surfaces'

/**
 * Le lancement d'un travail DEPUIS LA LISTE de l'objet concerné.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA PRIMITIVE, ET POURQUOI ELLE EST UNE
 * ─────────────────────────────────────────────────────────────────────────
 * Louis, 29/08/2026 : « tous les "Lancer :" il faut qu'on puisse les faire dans
 * chaque onglet si on veut ». Cinq lancements, cinq listes — donc exactement la
 * situation où l'on écrit cinq boutons qui divergent au premier changement de
 * grille tarifaire.
 *
 * Ce composant est le SEUL. Il ne sait rien d'un compte ni d'un contact : il
 * lit le CATALOGUE (`packages/contracts/src/schemas/launcher.ts`) — le libellé
 * du run dominant, le palier qui l'ouvre — et délègue le reste à la surface du
 * type (`launch-surfaces.ts`). Monter le geste sur une sixième liste demain,
 * c'est une entrée de registre, pas un sixième bouton.
 *
 * ⚠️ **Le prix ne passe pas par ici.** On pourrait croire qu'un bouton de
 * lancement doit afficher « 8 crédits » : il ne le fait pas, et c'est
 * délibéré. Le coût est annoncé DANS la surface, par le composant qui l'annonce
 * déjà ailleurs (`LaunchPlanNote` pour l'analyse), à partir de `creditCostOf`.
 * Un chiffre affiché sur le bouton serait une seconde dérivation du prix — la
 * chose même que le préambule du catalogue interdit, et qui a déjà produit un
 * écran annonçant 1 crédit pendant que 8 partaient.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE REND PAS
 * ─────────────────────────────────────────────────────────────────────────
 *  · un type inconnu du catalogue (clé abîmée) — rien plutôt qu'une exception ;
 *  · un type sans run — il n'y aurait rien à lancer ;
 *  · un type SANS SURFACE en place — « ne rien montrer qui ne fasse rien ». Les
 *    raisons, type par type, sont écrites dans `LAUNCH_SURFACES_INTENTIONALLY_
 *    ABSENT` et gardées par GA-87 ;
 *  · un type que l'offre en cours ne comprend pas. Un bouton qui mène à un
 *    écran verrouillé est PIRE qu'un bouton absent. **Le doute n'interdit
 *    pas** : `usePlanFeature` laisse ouvert tant qu'il ne sait pas, et c'est le
 *    serveur qui tranche — sinon un réseau lent afficherait un verrou à un
 *    client qui a la fonction.
 */
export function ListLauncher({ typeKey }: { typeKey: LauncherTypeKey }) {
  const { t } = useTranslation('launcher')
  const [open, setOpen] = useState(false)
  const type = launcherTypeOf(typeKey)
  // Les hooks se lisent INCONDITIONNELLEMENT — les retours ci-dessous viennent
  // après. `usePlanFeature` accepte `null` : « ce type n'est derrière aucun
  // palier », qui est le cas du compte.
  const feature = usePlanFeature(type?.feature ?? null)

  const runs = type ? runsOfType(type.key) : []
  // Le run DOMINANT du type : le premier du catalogue. Son ordre est une
  // décision (sur un compte, analyser passe avant actualiser), pas un tri.
  const run = runs[0]
  const Surface = LAUNCH_SURFACES[typeKey]

  if (!type || !run || !Surface || !feature.allowed) return null

  /* #1414 — « c'est une des actions centrales de Bellum mais le bouton paraît
     secondaire ». Il l'était par la TAILLE, pas par la couleur : `size="sm"`
     (32 px) le mettait à la hauteur exacte de la bascule fantôme qui le suit et
     du lien de texte qui le précède — trois contrôles de même gabarit se lisent
     comme trois contrôles de même poids, quelle que soit la couleur du premier.
     `size="lg"` fait 40 px en souris et 44 au doigt (`pointer-coarse:min-h-11`,
     GA-30) : c'est la cible demandée, sans sortir des cinq tailles du système. */
  const hint = run.hintKey ? t(run.hintKey) : null

  return (
    <>
      {hint ? (
        <TooltipButton
          type="button"
          size="lg"
          icon={Zap}
          tooltip={hint}
          tooltipSide="bottom"
          onClick={() => setOpen(true)}
          className="shrink-0"
        >
          {t(run.labelKey)}
        </TooltipButton>
      ) : (
        <Button type="button" size="lg" icon={Zap} onClick={() => setOpen(true)} className="shrink-0">
          {t(run.labelKey)}
        </Button>
      )}
      {/* Montée EN PERMANENCE, pas « quand c'est ouvert » : la surface détient
          l'abonnement temps réel du run (et, en démonstration, ses minuteurs),
          que son démontage désarmerait. C'est le `<Dialog>` interne qui monte et
          démonte le contenu. */}
      <Surface open={open} onOpenChange={setOpen} />
    </>
  )
}
