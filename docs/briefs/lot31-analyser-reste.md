# Lot 31 — Analyser · reste (#4740)

Périmètre : apps/ia/app/services/site_credit_partners.py, apps/ia/tests/test_site_credit_partners.py

## Antériorité

- La borne des 15 ESN est déjà levée par #4769 (lot A Bedros) : `site_credit_partners.py` retient un prestataire hors référentiel sur son marqueur de crédit (certitude « moyenne »), sans marqueur aucune ligne. Critères 1, 2 (proximité) et 4 : déjà là, non recodés.
- Décisions touchées par `git blame` sur `_evidence` : garde #4731, garde #4751 (lot Bedros × Adel, #4769) — le texte de preuve change, leurs champs `qualification` restent intacts.

## Ce que fait le lot

- Critère 2 (« la page ET la phrase ») : la preuve citait le marqueur seul ; elle cite désormais la phrase de crédit de la page (jusqu'à la fin de la ligne de crédit).
- Critère 3 (société nommée) : quand le nom crédité est un lien vers le site du prestataire, l'hôte est ajouté à la preuve (« Site du prestataire : … ») ; un lien vers le site du compte lui-même n'est jamais retenu. La forme juridique écrite sur la ligne (SAS…) reste dans le nom (test ajouté).

## Ce que le lot ne fait pas

- Pas de résolution de raison sociale par Pappers/annuaire (appel réseau, hors périmètre).
- Pas de champ dédié ni de migration. Démo (critère 5) : non modifiée ; la ligne illustrative `Structura Web (exemple)` (demo-seed.service.ts ~8400) couvre le circuit `account_partners` → onglet Partenaires. Une ligne « crédit de pied de page » dédiée est une question pour Louis.
- Ne ferme pas #4740.
