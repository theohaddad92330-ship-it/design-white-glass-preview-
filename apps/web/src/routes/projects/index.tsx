import { PIPELINE_STAGES } from '@bellum/contracts'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { PlanFeatureRoute } from '@/features/plan-features/PlanFeatureRoute'
import { ProjectsPage } from '@/features/projects/view/ProjectsPage'

/**
 * Lot X41 (02/10), #2958 — un drapeau d'ouverture de formulaire (`?create=1`).
 *
 * Le routeur ANALYSE la recherche d'une URL : `1` y devient le NOMBRE 1, et la
 * chaîne « 1 » n'existe que sous la forme `"1"` qu'il écrit lui-même. Le
 * littéral `'1'` seul refusait donc tout lien écrit à la main, collé, ou rendu
 * par Laura (`/projects?create=1&account_id=…`) — avalé en silence par
 * `.catch(undefined)`, le formulaire ne s'ouvrait jamais. Les deux lectures
 * rendent le NOMBRE 1 (le routeur écrit `create=1`, jamais `create=%221%22`) : tout le reste de l'écran est inchangé.
 */
const openFlag = z.union([z.literal('1'), z.literal(1)]).transform(() => 1 as const)

/**
 * `?stage=` — LA BARRE DU PIPE DU COCKPIT (§2.1 du dossier du 26/08).
 *
 * La source dit de chaque barre : « nombre et montant, cliquable vers la liste
 * FILTRÉE ». Les barres portaient bien un lien, vers `/projects` NU : le clic
 * ouvrait le pipe entier, c'est-à-dire un lien qui montre autre chose que ce
 * qu'il annonce.
 *
 * ⚠️ Poser le paramètre sur le lien n'aurait rien changé : **sans
 * `validateSearch`, TanStack Router jette la recherche avant que l'écran la
 * voie.** C'est mot pour mot le défaut corrigé le 28/08 sur `/missions`
 * (`missionsOfAccount` construisait `/missions?accountId=…` que la route
 * jetait), et le commentaire de `PipelineBoard` en gardait la trace : « le geste
 * est LOCAL, jamais une route : `/projects` ne déclare aucun `validateSearch` ».
 * Il en déclare un maintenant, et c'est ce fichier.
 *
 * **Les CINQ étapes du pipe, et pas les huit du cycle.** `detected`,
 * `potential`, `lost` et `dormant` n'ont aucune colonne au tableau : un lien qui
 * les porterait ouvrirait un pipe sans colonne, sans rien pour dire pourquoi.
 * L'énumération est LUE dans le contrat (`PIPELINE_STAGES`) et non recopiée —
 * une sixième colonne un jour ne doit pas devenir un filtre muet.
 *
 * `.catch(undefined)` : une valeur abîmée dans un lien collé ouvre le pipe
 * entier plutôt qu'une page en erreur — le choix déjà fait pour les missions et
 * pour le board. Ce qui rend le repli honnête, c'est que l'écran n'affiche alors
 * AUCUNE mention de filtre : il n'affirme un périmètre que quand il en tient un.
 */
export const projectsSearchSchema = z.object({
  stage: z.enum(PIPELINE_STAGES).optional().catch(undefined),
  /**
   * #3295.r42 — `?view=lost` : l'onglet « Perdus » du pipe, ouvert. Le compteur « perdues » de Pilotage y
   * mène ; les autres vues (kanban, tableau, archivés) restent un geste local, sans lien distant.
   */
  view: z.literal('lost').optional().catch(undefined),
  /**
   * #2195.33 — `?create=1&account_id=…&mission_id=…` : LE FORMULAIRE DE
   * CRÉATION, OUVERT ET PRÉ-REMPLI.
   *
   * Le bouton « construire la proposition » du panneau de renouvellement
   * NAVIGUE ici : il n'écrit rien, il amène un humain devant un formulaire dont
   * le compte et la mission sont déjà connus. C'est le clic sur « créer » qui
   * est la décision, jamais la navigation.
   *
   * Même leçon que `stage` juste au-dessus : **sans `validateSearch`, TanStack
   * Router jette la recherche avant que l'écran la voie** — un lien pré-rempli
   * serait alors arrivé vide, et le formulaire aurait redemandé ce que la
   * mission savait déjà.
   *
   * `.catch(undefined)` partout : un lien collé de travers ouvre le pipe entier
   * plutôt qu'une page en erreur, et le formulaire ne s'ouvre pas — jamais un
   * formulaire de création ouvert sur des valeurs abîmées.
   */
  create: openFlag.optional().catch(undefined),
  account_id: z.string().guid().optional().catch(undefined),
  mission_id: z.string().guid().optional().catch(undefined),
  /**
   * #2124.11/#2124.13 — l'étape D'ENTRÉE du formulaire, jamais son filtre.
   *
   * `?stage=` juste au-dessus RESTE ce que le lien de la barre du cockpit
   * pose — un filtre affiché, sur un pipe déjà peuplé. Le réutiliser ici
   * aurait fait porter DEUX intentions au même paramètre : ouvrir le
   * formulaire ET filtrer le tableau derrière lui, avec le risque qu'un lien
   * de création filtre aussi la liste sous le formulaire qu'il ouvre.
   *
   * Nom distinct, même énumération LUE dans `PIPELINE_STAGES` : le dossier
   * de compte (`TabProjects.tsx`) pose `create_stage: 'confirmed'` pour
   * « Créer un besoin confirmé » — l'affaire s'ouvre directement à l'étape
   * où le pipe la range, sans étape supplémentaire pour l'y faire glisser.
   * Absent, le formulaire garde le défaut serveur (`DEFAULT_ENTRY_STAGE`,
   * « qualifiée ») — le cas « Créer une opportunité ».
   */
  create_stage: z.enum(PIPELINE_STAGES).optional().catch(undefined),
  /**
   * #2169.9 — LA FILE « PISTES À QUALIFIER », OUVERTE DE L'EXTÉRIEUR.
   *
   * L'issue demande la file accessible « depuis le Pipe ET Découvrir ». Le
   * Pipe l'ouvrait déjà (`onOpenIntake`, un `useState` local) ; rien ne
   * permettait à un lien EXTÉRIEUR à cet écran de l'ouvrir directement — et
   * sans `validateSearch`, TanStack Router aurait jeté le paramètre avant que
   * l'écran le voie (même défaut que `?stage=` et `?create=`, ci-dessus).
   *
   * `.catch(undefined)` : un lien collé de travers ouvre le Pipe (le défaut),
   * jamais une page en erreur.
   */
  // #4341 — `rfp` : l'espace des appels d'offres, monté DANS le pipe (ex-onglet `/rfp`).
  lens: z.enum(['pipeline', 'portfolio', 'rfp']).optional().catch(undefined),
  /**
   * #2942, #2152.17 — `?create_need=1` : LE CRÉATEUR DE BESOIN, OUVERT DE
   * L'EXTÉRIEUR, avec `provenance: 'model'`.
   *
   * La carte « besoin compilé » (#2322, `compile_need`) ouvrait jusqu'ici
   * `?create=1` — le créateur d'OPPORTUNITÉ (`CreateProjectDialog`,
   * `POST /projects`), pas celui de BESOIN (`CreateNeedDialog`,
   * `POST /projects/needs`) que son propre commentaire annonçait. Le
   * `provenance: 'model'` du besoin compilé ne pouvait donc jamais s'écrire :
   * l'écran ouvert ne créait pas le bon objet. Nom distinct de `create` pour
   * la même raison que `create_stage` plus haut — deux formulaires, deux clés.
   *
   * `.catch(undefined)` : un lien collé de travers ouvre le Pipe (le défaut),
   * jamais une page en erreur.
   */
  create_need: openFlag.optional().catch(undefined),
  /**
   * #2942 — LE TITRE ET LE CONTEXTE COMPILÉS PAR LAURA, portés jusqu'au
   * formulaire de besoin.
   *
   * `create_need=1` seul ouvrait la bonne porte sans rien lui donner à
   * afficher : la provenance voyageait, pas la matière qui la justifie. Ces
   * deux champs sont du texte LU depuis la carte `compile_need` (jamais
   * inventé) — `NeedWizard` ne les applique qu'à un brouillon NEUF, jamais à
   * une reprise (`localStorage`) qui porterait déjà une saisie humaine.
   *
   * `.catch(undefined)` : un lien collé de travers ouvre le formulaire vide,
   * jamais une page en erreur.
   */
  need_title: z.string().optional().catch(undefined),
  need_context: z.string().optional().catch(undefined),
  /**
   * #2942 — LES COMPÉTENCES ET LE TJM COMPILÉS PAR LAURA, même voyage que le
   * titre et le contexte ci-dessus.
   *
   * `need_skills` porte la liste JOINTE par virgules — la même forme que
   * `needField(action, 'skills')` affiche déjà dans l'aperçu de la carte
   * (`PendingActions.tsx`) : aucune structure nouvelle à inventer, un terme par
   * virgule devient une compétence NON éliminatoire côté assistant
   * (`requiredSkillSchema` : `required` par défaut à `true`, mais rien ici
   * n'affirme un niveau qu'on n'a pas). `need_tjm_cents` est le TJM tel que
   * Laura l'a compilé, en CENTIMES comme partout dans le produit — jamais
   * reconverti, jamais arrondi.
   */
  need_skills: z.string().optional().catch(undefined),
  need_tjm_cents: z.coerce.number().int().positive().optional().catch(undefined),
  /**
   * #2942 (recette écran 27/09/2026) — LE COMPTE VISÉ, même voyage que le
   * titre ci-dessus.
   *
   * La carte « besoin compilé » (#2322) porte déjà `compiled.account_id`
   * (le compte RAPPROCHÉ, #2322.16) et `compiled.company_hint` (le nom lu
   * dans la source tant qu'aucun rapprochement n'a tranché) — la recette du
   * 27/09 a trouvé le formulaire ouvert sans l'un ni l'autre : `create_need=1`
   * ouvrait la bonne porte, mais la recherche de compte/projet (étape 1)
   * restait vide, comme si Laura n'avait rien dit du client.
   *
   * `need_account_id` (compte déjà résolu, un identifiant réel — jamais créé
   * ici, seulement choisi) et `need_account_name` (simple texte de recherche
   * quand aucun compte n'a pu être rapproché) sont deux clés distinctes, même
   * raison que `create_need` face à `create` : deux portes, deux noms, jamais
   * un paramètre qui porterait deux formes différentes. `.catch(undefined)` :
   * un lien collé de travers ouvre le formulaire vide, jamais une page en
   * erreur.
   */
  need_account_id: z.string().guid().optional().catch(undefined),
  need_account_name: z.string().optional().catch(undefined),
  /**
   * #4545 (Louis 25/10/2026) — LE PANNEAU DES PISTES DU PIPE, ouvert par l'URL (même patron que `create`).
   * C'est la destination de `/projects/pistes`, de `/mes-cibles#pistes`, du bouton du Pipe vide, du bandeau de
   * décision de Pilotage et de la ligne « N pistes à revoir » : un lien profond, jamais une page de plus.
   */
  pistes: openFlag.optional().catch(undefined),
})

export const Route = createFileRoute('/projects/')({
  validateSearch: projectsSearchSchema,
  /**
   * #4197 (L6) — `/projects?lens=portfolio` → les Pistes. #4340 (19/10) les avait mises dans Signaux ;
   * #4545 (Louis 25/10) revient dessus : le panneau des pistes du Pipe, `/projects?pistes=1`.
   *
   * Aucune route neuve : le panneau s'ouvre par ce paramètre. Le reste de la recherche (`?stage=`, `?create=`…)
   * ne concerne que le Pipe : il n'est pas transporté. `replace: true` — sinon
   * « précédent » reboucle. `beforeLoad`, jamais `<Navigate>` (GA-27).
   */
  beforeLoad: ({ search }) => {
    if (search.lens === 'portfolio') {
      throw redirect({ to: '/projects', search: { pistes: 1 }, replace: true })
    }
  },
  component: GatedPage,
})

/** L'écran reste atteignable quel que soit le palier : s'il n'est pas inclus, il
 *  dit ce qu'il fait, quelle offre l'ouvre et à quel prix. */
function GatedPage() {
  const { t } = useTranslation('nav')
  return (
    <PlanFeatureRoute feature="needs" withShell pageTitle={t('items.projects')}>
      <ProjectsPage />
    </PlanFeatureRoute>
  )
}
