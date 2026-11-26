# #4994 — NAF/SIREN bruts dans « Lectures du dossier » : filtré à l'AFFICHAGE

- Branche : `fix/4994-naf-brut-lectures`. Décision : correctif côté web sans attendre le champ exact (texte venu des DONNÉES).
- Fonction pure : `apps/web/src/lib/strip-registry-jargon.ts` (`stripRegistryJargon`). Retire `NAF <code>` (rév. 1 et 2), `SIREN`/`SIRET` (avec espaces), codes collés `32.12Z`, et les `,` `·` `;` orphelins. `NAF 90.01Z (arts du spectacle)` → `arts du spectacle`.
- Branchements : `tabs/sections/BellumReadCard.tsx` (verdict/titre, pourquoi, manque, prochaine action, contexte) ; `tabs/sections/DossierReadBlocks.tsx` (`TextBlock`, `LabelledList`) ; `tabs/TabOverview.tsx` (description des angles).
- Texte devenu vide : rien n'est rendu (carte sans titre → null, item de liste/section masqué).
- Tests : `strip-registry-jargon.test.ts` (10 cas, dont texte sans jargon à l'identique) + 2 cas de rendu dans `BellumReadCard.test.tsx`. Lancés : 4 fichiers, 86 verts (avec `DossierReadBlocks.test.tsx`, `TabOverview.collapsed.test.tsx`).
- Limites : un code NU sans mot « NAF » (`64.19 Z`) n'est pas retiré (ambigu avec un nombre) ; `64.19Z` collé l'est. Autres textes de TabOverview (stratégie, signaux) non filtrés : seuls les rendus de lecture/verdict le sont.
