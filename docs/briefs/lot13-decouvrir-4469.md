# Lot 13 — Découvrir · #4469 (reste), #4632 et #4574 en question

Périmètre : apps/ia/app/services/discover_skill_offers.py, apps/ia/tests/test_4469_ou_le_mot_a_ete_trouve.py, packages/contracts/src/schemas/discover-skill-evidence.ts, apps/web/src/features/discover/view/SkillSearch.tsx, apps/web/src/features/discover/view/SkillSearch.test.tsx, apps/web/src/i18n/locales/fr/discoverSkill.json, apps/web/src/i18n/locales/en/discoverSkill.json

## #4469 — ce qui reste

Le symptôme est éteint (recette lot 22, 29/10). Reste le critère « N offres cloud ne compte que des offres métier » :
la carte ne dit pas où le mot a été trouvé quand l'intitulé ne le porte pas. On ajoute `latestOffer.foundIn`
(`title` | `description` | null), calculé sur le texte MÉTIER (lieu, employeur, toponyme retirés), et la carte écrit
« mot trouvé dans la description ». Aucune source nommée. Garde #4469 (lignes `offer_trade_text`, `_reject_reason`).

## #4632 et #4574 — non livrés, QUESTION

Refonte de Discover.tsx/FilterRail.tsx avec arbitrages de produit ouverts (cohabitation d'un résultat sans SIREN,
reconnaissance d'un nom dans le texte libre côté apps/ia) et séquencement imposé avec #4493/#4634. Non faits ici.

Garde #4568 : simple bump fastapi, seul commit de blame sur discoverSkill.json (aucune décision de fond).
