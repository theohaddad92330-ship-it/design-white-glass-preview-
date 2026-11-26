# Rapport — #4748, la liste de Laura (3 lignes montrées, ~100 annoncées, export à 3)

**Cause mesurée (web, pas `chat_tools.py`).**

- `reply-blocks/ReplyCard.tsx:33,111` — `TopThenRest` replie TOUTE liste de cartes sur `TOP_COUNT = 3`, sans dire combien le bloc en porte : 3 lignes à l'écran, le total seulement dans un bouton. Le « ~100 » vient de la prose du modèle (plafond IA nominal 20, `chat_tools.py:714`, non touché).
- `AccountRankingCard.tsx` : « Exporter en CSV » / « Enregistrer la sélection » ne disaient pas combien de lignes partent — un export de la sélection (3 cases) ressemblait à un export de la liste.
- `packages/contracts/.../reply-blocks.ts:296` — `account_ranking.items.max(20)` : au-delà de 20 le bloc est REFUSÉ et ressort en texte replié (« Voir les 47 autres »), rien n'est perdu ni inventé (test MESURE). `file_export` rend tout (≤ 200 lignes).
- `chat_tools.py` : rien à y corriger pour ce lot ; le plafond 20 est un réglage de coût, non modifié.

**Maintenant.** Carte : « 20 comptes dans cette liste » ; repliée « 3 sur 20 affichés » ; boutons « Exporter les 20 comptes en CSV » / « Enregistrer les 3 sélectionnés » / « Télécharger les 25 lignes » (singulier géré). FR + EN (tutoiement inchangé). Aucune mention d'écart pour 2 comptes.

**Tests (rouge → vert).** `AccountRankingCard.longList.test.tsx` (liste de 20 = plafond, 25 = hors contrat, file_export de 25 lignes, contrôle négatif 2 comptes) : 6 rouges / 1 vert avant, 8/8 après. `demo-chat-script.4748.test.tsx`, `demo-laura-liste-longue-coverage.spec.ts` (jest). Verts : reply-blocks (6 fichiers, 139), i18n parity/keys/plural, ui-tutoie, demo-coverage, demo-chat-script parity/i02/capture. Anciens libellés mis à jour dans `AccountRankingCard.results.test.tsx` et `ReplyBlocks.test.tsx` (même intention).

**Démo.** Amorce `p-liste-longue` (24 lignes fictives « (démo) ») dans `demo-chat-script.ts`, classée seedée (`DEMO_LAURA_LONG_LIST_COVERAGE`).

**Non fait / à savoir.** Le « 100 » annoncé par la prose du modèle n'est pas corrigeable côté web (aucun total déclaré dans le bloc) ; si on veut « 20 sur 100 remontés », il faut un champ `total` posé par l'outil — côté `chat_tools.py` (lot HIST-H). `tsc --noEmit -p apps/web` : sortie code 0, 0 ligne `error TS` (8 Go alloués).
