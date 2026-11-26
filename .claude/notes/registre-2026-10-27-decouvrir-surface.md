# Registre — lot DECOUVRIR-SURFACE (vague L, 27/10/2026)

Lu sur `origin/main` 8b6d99fc. Chaque point : état · chaîne route → écran → composant · preuve en recette.
Specs liées relancées au vert : `Discover.zoneLabel`, `Discover.personNameRail`, `Discover.maCible`, `LauraDock.modal`, garde `rien-ne-flotte-au-dessus-des-actions-d-un-dialogue` (16 + 10 tests).

| Point | État | Appelant (chaîne prouvée) | Preuve en recette |
| --- | --- | --- | --- |
| #4632.1 une seule surface | déjà là | `MarketContextPanel` n'existe plus (aucun import) ; `MarketObservedSection` rendu depuis `Discover.tsx`, lit le rail ; « Famille de rôles observée » dans `FilterRail.tsx:616` | `/discover` : aucun bouton « Contexte marché », aucun second « Rechercher » ; « Tous les filtres » porte la famille de rôles |
| #4623 dock sur dialogue | déjà là | `Dialog` (`packages/ui/src/components/dialog.tsx:90`) → `ModalOpenRegistrar` → `useAnyModalOpen` → `LauraDock.tsx:133` ; `FilterRail.tsx:920` est un `Dialog` | « Cadrer la recherche » ouvert : dock absent, « Appliquer et explorer » reçoit un vrai clic |
| #4574 nom dans le rail | déjà là | `PersonNameSearchPanel` supprimé ; `Discover.tsx:883` lit le nom du champ libre → `ProjectionResults.tsx:236,299` → `PersonNameResults` | vue personnes : aucune carte « Chercher une personne par nom » ; « Marion Sagnard chez Bedrock » + « Lancer la recherche » rend les homonymes |
| #4572 zone ≠ carte cliquée | déjà là | `Discover.tsx:2377` `withSingleRegion` → `presetTrack('territory')` → `applyPreset` ; `FilterRail.tsx:1107` nomme la zone en entier | carte « Île-de-France » : URL `region=11`, puce « Île-de-France » |
| #4530 « Ma cible » bascule | déjà là | `MyTargetToggle` ← `Discover.tsx:1085` ; `StartingPoint`/`SurfaceContextChip` retirés de Découvrir | bouton `aria-pressed`, 44 px ; panneau « TA CIBLE » absent |
| #4529 arrivée neutre | déjà là | plus d'appel à `nextSeededZone`/`applyProfileZone`/`applyProfileSize` hors tests | `/discover` nu : Neutre, « Tous les filtres » sans pastille |
| #4516 aucune taille d'office | déjà là | `proposeProfileSize` (proposée, jamais appliquée) ← `Discover.tsx:699-807` | modale Taille vide ; `profileSize=off` valide |

Reste : `headcountFromIdealSize` (`discover-autopilot-profile.ts:93`) n'a plus d'appelant hors tests (code mort, à purger par un lot dette).
Ouverts côté recette 26/10 (non code) : #4530.4 résultat à 0 avec les critères du profil (« Trop de filtres empilés ») — à re-mesurer en prod sur la version actuelle.
