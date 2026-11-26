# Correctif de recette #5107.7 — périmètre lisible des partenaires de la démo BPCE

Recette prod du 01/11 (PR #5115, merge `53507b10f1`) : les cartes Écosystème du compte démo BPCE affichaient
le jeton brut « ESN_et_conseil — rapporte_par_presse » comme périmètre (et en « Preuve » dans les voies d'accès).

Périmètre : `apps/api/src/modules/demo/bpce-csv-mapping.ts`, `apps/api/src/modules/demo/bpce-csv-mapping.spec.ts`, `docs/briefs/**`

## Je fais

- `scope` d'un prestataire = libellé du `niveau` (« ESN et conseil », « Cabinet de conseil »…).
- La nature de la preuve (`statut`) passe en fin de `note` (« Rapporté par la presse. »).
- Famille : le statut des 230 entités juridiques (`IDENTIFIE_DANS_PERIMETRE_COMPTABLE_2025`) se lit
  « identifiée dans le périmètre comptable 2025 ».

## Je ne fais pas

- Aucune ligne du CSV retirée (« aucune ligne perdue », 30/09) ; aucun code web.

## Droits

Inchangés : données de démo seulement.
