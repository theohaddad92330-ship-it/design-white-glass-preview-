# #4994 — NAF/SIREN dans « Les entités à explorer » et « Lectures du dossier »

- Branche `fix/4994-c-naf-entites` (depuis origin/main). Pas de PR.
- `BriefEntitiesList` (TabCommercialBrief.tsx) : nom, nature et note passent par `stripRegistryJargon` ; texte vidé = aucune ligne.
- `stripRegistryJargonDeep` (lib/strip-registry-jargon.ts, `stripRegistryJargon` réutilisée) nettoie chaque chaîne d'une donnée imbriquée ; appliquée dans `TabOverview` à pains, enjeux, implications, signaux, offres, stratégie concurrentielle, risque principal, chemin d'accès (le contenu de `knowledge-more-reading`).
- « NAF 90.01Z, arts du spectacle » → « arts du spectacle » : déjà géré par la fonction, cas de test ajouté.
- Tests (rouge → vert) : strip-registry-jargon.test.ts, TabCommercialBrief.test.tsx ; verts aussi : TabOverview.collapsed, AccountKnowledgeScreen (84 tests).
- Non fait : `EntityResolutionCard` affiche volontairement « SIREN … » (garde existante, test dédié) — laissé tel quel ; je n'ai pas pu localiser la source exacte du « NAF 92.3B (ABCD…) » sans les données Cartier, d'où le filtre à l'entrée de TabOverview.
- tsc : `tsc -p apps/web` inutilisable ici (contracts non buildé, bruit TS6305) ; aucune erreur sur les fichiers touchés.
