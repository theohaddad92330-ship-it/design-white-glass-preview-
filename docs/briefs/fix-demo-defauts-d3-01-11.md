# Défauts de la recette démo D3 (01/11/2026)

Périmètre : apps/api/src/modules/demo/**, apps/web/src/features/accounts/view/account-detail/tabs/contacts/CompactContactRow.tsx, apps/web/src/features/contacts/view/contacts-list/ContactTableRow.tsx

## Diagnostic

Journal : `.claude/notes/outils-recette-31-10/journal-d3.md`. Contrat validé par Louis (01/11) : remplir la démo de ce que la passe a trouvé vide ou faux.

## Ce qu'on fait

- #4290.12 : la ligne de contact du compte affiche le motif d'un contact écarté (`exclusion_reason`), le motif seedé ne s'affichait nulle part sur cet écran.
- #4295.11 : la relation d'un contact de la liste « ne pas contacter » dit l'interdit, jamais « À contacter » (espace réel aussi).
- #4556.4 : le lieu des contacts d'un siège en région Occitanie (code postal 31…) nomme « Occitanie », comme l'Île-de-France.
- #4107.4 : l'unique e-mail vérifié SMTP passe sur une fiche SNCF.
- #2616.1 : sources APEC / Welcome to the Jungle / ATS (domaines réservés `.example`) et CDI sur des signaux de recrutement.
- #2128.19 : un run `analyzing` d'un collègue (Léa, Naval Group) nourrit le bandeau de collaboration.
- #4116.5 : l'appel d'offres public démo se dit « européen » (UE) dans son détail.
- Vu en passant : le nom de clé `entities_exhaustive` ne s'affiche plus dans le texte d'une fiche contact (garde ajoutée).

## Ce qu'on ne fait pas

- #4195.5 : la frise du pipe n'a pas de colonne « Négociation » par décision (`project-frieze.ts` : l'étape stockée `negotiation` se lit « Proposition »). Aucune étape inventée ; c'est une décision produit.
- « Privé » : la démo porte déjà « Mes contacts personnels (2) » (visibles par toi seul) ; aucun libellé « Privé » n'existe dans le produit.

## Droits

aucun changement
