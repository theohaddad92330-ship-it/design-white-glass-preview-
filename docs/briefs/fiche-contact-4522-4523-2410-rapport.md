# Rapport — fiche-contact-2410 (#4522, #4523)

1. **#4522 badges courts** — FAIT. `keyInfo.emailAvailable` / `phoneAvailable` : « Email disponible » / « Téléphone disponible » (FR), « Email available » / « Phone available » (EN, seules locales : fr et en). Défait #3724. Test : `ContactKeyInfo.test.tsx`.
2. **#4522 badge dans sa colonne** — FAIT. `AvailabilityRow` : `min-w-0 max-w-full` (plus `shrink-0`). Test de classe dans `ContactKeyInfo.test.tsx`.
3. **#4523 rangées pleine largeur** — FAIT. Nouveau bloc `data-testid="contact-rows"` (`md:col-span-full`, `lg:row-start-2`) sous les trois colonnes : Prochaines actions en `1.1fr 1.5fr 1fr` (Tâches | Appel | Rendez-vous, puis Plan), Historique & notes en `1fr 1.4fr` (Notes | fil), Données & protections en `1fr 1fr` (preuves/corriger | journal/protections). Tests : `ContactDetail.layout.test.ts` (3 nouveaux), `ContactDetail.test.tsx` (marge bulle Laura sur les rangées).
4. **Aucune section perdue** — liste identique avant/après (voir ci-dessous) ; seul l'emplacement change. Tests d'ordre inchangés et verts.
5. **Mobile / thèmes / démo** — mobile : `order-1` sur les rangées (juste après le travail), puis informations (2), dossiers (3) = même ordre qu'avant. Aucune couleur ajoutée. Démo : mêmes composants, aucune donnée nouvelle à seeder.

## Sections avant → après

Avant (colonne centre) : Pourquoi préparer · Résumé de relation · Prochaines actions (Tâches, Appel, Rendez-vous, Plan) · Historique & notes (barre de gestes, Notes, fil) · Données & protections (Corriger, Preuves, Journal, Protections).
Après : centre = Pourquoi + Résumé ; rangées pleine largeur = les trois autres sections, toutes leurs cartes. Gauche (Infos clés, Rôle, Rôle & périmètre) et droite (Dossiers associés, Travail en cours, Relations, Parcours, Signaux) inchangées.

## Écart à signaler

La maquette C5 garde ces sections dans `.contact-work` (colonne centre) ; les grilles `1.1fr 1.5fr 1fr`, `1fr 1fr`, `1fr 1.4fr` y servent d'autres blocs (guide, formulaires). J'ai suivi le contrat du brief (rangées pleine largeur) en réutilisant ces grilles. Non fait : mesure Chrome à 1440 px avant/après et capture côte à côte (pas de navigateur/app lancés ici) — à relever en recette.

## Vérifs

`tsc --noEmit -p apps/web` : 0 error TS. `vitest run src/features/contacts src/architecture` : 400 fichiers, 3305 tests verts. Changelog `2026-10-24-fiche-contact-rangees` (FR/EN), tests changelog 36 verts.
