/**
 * Les routes réelles qui n'ont VOLONTAIREMENT aucune spec — chacune avec sa
 * raison. `route-coverage.test.ts` échoue sur toute route qui n'est ni ici,
 * ni couverte par une `PageSpec.route` : une route qui n'est dans AUCUNE des
 * deux listes n'existe pour personne, et c'est exactement ce que cette garde
 * refuse de laisser passer en silence.
 *
 * Trois familles seulement :
 * - une REDIRECTION pure (`redirect(...)`, aucun écran propre) — #4359 (20/10/2026) :
 *   les alias d'adresse n'ont plus de fichier de route (table `lib/legacy-addresses.ts`),
 *   il n'en reste que de conditionnels ;
 * - une route TECHNIQUE de routeur (layout pathless, racine, catch-all qui ne
 *   fait que déléguer) — rien à dessiner, ce n'est pas un écran ;
 * - un OUTIL de dev interne hors du produit livré au client.
 *
 * Ajouter une entrée ici est un aveu qu'on écrit consciemment, jamais un
 * raccourci pour faire taire la garde : une route qui gagne un vrai écran
 * sort de cette liste et gagne sa spec.
 */
interface RouteException {
  /** Chemin du fichier de route, relatif à la racine du dépôt — exactement comme `PageSpec.route`. */
  route: string
  /** Pourquoi cette route n'a pas de maquette, citée avec sa décision quand il y en a une. */
  reason: string
}

export const ROUTE_EXCEPTIONS: readonly RouteException[] = [
  // ─── apps/web (TanStack Router, file-based) ──────────────────────────────
  {
    route: 'apps/web/src/routes/__root.tsx',
    reason: 'Racine technique du routeur (coque, providers globaux) — aucun écran propre à dessiner.',
  },
  {
    route: 'apps/web/src/routes/analyse.tsx',
    reason:
      'Redirection pure vers `/search` (#4658) : l’adresse française du verbe principal se tape de mémoire et se met en favori, elle redirige au lieu de rendre « Page introuvable » — aucun écran propre à dessiner.',
  },
  {
    route: 'apps/web/src/routes/talents.tsx',
    reason:
      'Redirection pure vers `/consultants` (#4668) : le nom de la section « Talents » se tape de mémoire, il redirige au lieu de rendre « Page introuvable » — aucun écran propre à dessiner.',
  },
  {
    route: 'apps/web/src/routes/accounts/$id_.analyze.tsx',
    reason:
      'Redirection pure vers la fiche compte (#4789) : l’adresse `/accounts/<id>/analyze` rendait « Page introuvable », elle renvoie au dossier du compte où le geste vit — aucun écran propre à dessiner.',
  },
  {
    route: 'apps/web/src/routes/analyze.tsx',
    reason:
      'Redirection pure vers `/search` (#4658) : ancienne adresse du verbe principal, gardée parce qu’on archive sans supprimer — aucun écran propre à dessiner.',
  },
  {
    route: 'apps/web/src/routes/accounts/$id_.analyse.tsx',
    reason:
      'Redirection pure (`beforeLoad` → `/accounts/$id`, GA-27) (#4789) : la forme AVEC identifiant du verbe principal rendait « Page introuvable » sur un compte ouvert — l’analyse se relance depuis le dossier, maquetté par sa propre spec. Aucun écran propre à dessiner.',
  },
  {
    route: 'apps/web/src/routes/accounts/$id_.analyze.tsx',
    reason:
      'Redirection pure (`beforeLoad` → `/accounts/$id`, GA-27) (#4789) : variante anglaise de `/accounts/<id>/analyse`, même raison — aucun écran propre à dessiner.',
  },
  {
    route: 'apps/web/src/routes/onboarding/$id/$stage/index.tsx',
    reason: 'Redirection technique : calcule le premier slug de l’étape puis redirige, aucun écran propre.',
  },
  {
    route: 'apps/web/src/routes/onboarding/$id/$stage/route.tsx',
    reason: 'Layout pathless (`Outlet` seul) — aucun écran propre, ses enfants sont maquettés séparément.',
  },
  {
    route: 'apps/web/src/routes/settings/profile/route.tsx',
    reason: 'Layout pathless (`Outlet` seul) — aucun écran propre, ses enfants sont maquettés séparément.',
  },
  {
    route: 'apps/web/src/routes/actions/automatisations.tsx',
    reason:
      '#4167 (lot D, 14/10/2026) — onglet Automatisations de /actions, livré sans maquette : la spec Figma de la barre /actions (À traiter · Séquences · Automatisations) reste à tirer au prochain passage design.',
  },
  {
    route: 'apps/web/src/routes/expenses/index.tsx',
    reason:
      'Théo C missions-notes-de-frais.N1 (22/10/2026) — REDIRECTION pure vers `/missions/notes-de-frais` : la page est devenue un onglet de Missions, sa maquette (`app/expenses-index`) suit la nouvelle route. L’adresse survit pour les liens déjà partis (routines de Laura, notifications).',
  },
  {
    route: 'apps/web/src/routes/privacy/index.tsx',
    reason:
      '#4295.15 (19/10/2026) — page Confidentialité & registre, livrée sans maquette dans le cadre des réglages (`SettingsPage`) : la spec Figma reste à tirer au prochain passage design.',
  },
  {
    route: 'apps/web/src/routes/settings/routines.tsx',
    reason:
      'Théo C automations-bibliotheque (22/10/2026) — REDIRECTION vers `/actions/automatisations/bibliotheque` : la bibliothèque de routines a quitté les Réglages. L’adresse survit pour ses liens entrants ; l’écran est maquetté par `app/automations-library`.',
  },
  {
    route: 'apps/web/src/routes/settings/routines_.$key.tsx',
    reason:
      'Théo C automations-bibliotheque.R2 (22/10/2026) — REDIRECTION vers la bibliothèque, fenêtre « Voir le fonctionnement » ouverte sur la routine (`?routine=<clé>`) : la fiche pleine page est devenue une fenêtre.',
  },
  {
    route: 'apps/web/src/routes/settings/billing.tsx',
    reason:
      'Théo (23/10/2026) — REDIRECTION pure (`beforeLoad` → `/billing`, GA-27) : la facturation a quitté les Réglages. L’adresse survit pour les liens déjà partis ; l’écran est maquetté par `app/billing`.',
  },
  {
    route: 'apps/web/src/routes/accounts/$id_.analyze.tsx',
    reason:
      '#4789 (lot 94, 29/10/2026) — REDIRECTION pure (`beforeLoad` → `/accounts/$id`, GA-27) : relancer l’analyse d’un compte est un geste de son dossier (menu d’actualisation de l’en-tête), pas un écran — l’adresse y renvoie au lieu de rendre « Page introuvable ». L’écran d’arrivée est maquetté par `app/accounts-detail`.',
  },
  {
    route: 'apps/web/src/routes/vivier.tsx',
    reason:
      '#4710 (lot 94, 29/10/2026) — REDIRECTION pure vers `/consultants` (`beforeLoad`, jamais `<Navigate>`, GA-27) : « Vivier » est le nom que la navigation AFFICHE, il se tape de mémoire et se met en favori — aucun écran propre à dessiner, celui de `/consultants` l’est déjà.',
  },
  {
    route: 'apps/web/src/routes/affaires.tsx',
    reason:
      '#4710 (lot 94, 29/10/2026) — REDIRECTION pure vers `/projects` (`beforeLoad`, jamais `<Navigate>`, GA-27) : « Affaires » est le nom que la navigation AFFICHE, il se tape de mémoire et se met en favori — aucun écran propre à dessiner, celui de `/projects` l’est déjà.',
  },
  {
    route: 'apps/web/src/routes/signaux.tsx',
    reason:
      '#4710 (lot 94, 29/10/2026) — REDIRECTION pure vers `/signals` (`beforeLoad`, jamais `<Navigate>`, GA-27) : « Signaux » est le nom que la navigation AFFICHE, il se tape de mémoire et se met en favori — aucun écran propre à dessiner, celui de `/signals` l’est déjà.',
  },
  {
    route: 'apps/web/src/routes/comptes.tsx',
    reason:
      '#4710 (lot 94, 29/10/2026) — REDIRECTION pure vers `/accounts` (`beforeLoad`, jamais `<Navigate>`, GA-27) : « Comptes » est le nom que la navigation AFFICHE, il se tape de mémoire et se met en favori — aucun écran propre à dessiner, celui de `/accounts` l’est déjà.',
  },
  {
    route: 'apps/web/src/routes/decouvrir.tsx',
    reason:
      '#4710 (lot 94, 29/10/2026) — REDIRECTION pure vers `/discover` (`beforeLoad`, jamais `<Navigate>`, GA-27) : « Découvrir » est le nom que la navigation AFFICHE, il se tape de mémoire et se met en favori — aucun écran propre à dessiner, celui de `/discover` l’est déjà.',
  },
  {
    route: 'apps/web/src/routes/equipe.tsx',
    reason:
      'Redirection pure vers `/team` (#4710) : le nom français que la navigation affiche se tape de mémoire, il redirige au lieu de rendre « Page introuvable » — aucun écran propre à dessiner, la maquette est celle de la destination (`app/team`).',
  },
  {
    route: 'apps/web/src/routes/facturation.tsx',
    reason:
      '#4710 (lot 94, 29/10/2026) — REDIRECTION pure vers `/billing` (`beforeLoad`, jamais `<Navigate>`, GA-27) : « Facturation » est le nom que la navigation AFFICHE, il se tape de mémoire et se met en favori — aucun écran propre à dessiner, celui de `/billing` l’est déjà.',
  },
  // ─── apps/website (Next.js App Router) ───────────────────────────────────
  {
    route: 'apps/website/src/app/[locale]/[...rest]/page.tsx',
    reason:
      'Catch-all technique : ne fait qu’appeler `notFound()`. L’écran qui s’affiche réellement (`not-found.tsx`) est maquetté par `site/not-found`.',
  },
  // ─── apps/dashboard-manager (Next.js App Router) ─────────────────────────
  {
    route: 'apps/dashboard-manager/src/app/esn/page.tsx',
    reason:
      'La liste des ESN a fusionné dans l’écran « Clients ». La route redirige vers `/clients?view=esn` pour ne pas casser un lien existant ; le détail `/esn/[id]` reste inchangé et maquetté par `dm/esn-detail`.',
  },
  {
    route: 'apps/dashboard-manager/src/app/produit/laura-tours/page.tsx',
    reason:
      '#3391 (04/10/2026) — outil interne d’observation : liste les tours de Laura pour l’équipe Bellum, hors du produit livré au client.',
  },
  {
    route: 'apps/dashboard-manager/src/app/produit/drive-interne/page.tsx',
    reason:
      '#3586 (05/10/2026) — outil interne : inventaire de la synchro du Drive interne pour l’équipe Bellum, hors du produit livré au client.',
  },
  {
    route: 'apps/dashboard-manager/src/app/produit/rex/page.tsx',
    reason:
      '#3544.4 (04/10/2026) — outil interne de diagnostic : lit l’auteur des REX et marque les doublons pour l’équipe Bellum, hors du produit livré au client.',
  },
] as const
