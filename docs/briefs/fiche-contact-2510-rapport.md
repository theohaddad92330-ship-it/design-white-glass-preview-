# Rapport — lot FICHE-CONTACT (claude/fiche-contact-2510)

Constat : les 5 points étaient DÉJÀ livrés sur `origin/main` (f3b199c1) par des lots précédents. Aucun code modifié ici.

- #4523 (largeur fiche, rangées pleines selon C5) : ed2e269e ; rapport `fiche-contact-4522-4523-2410-rapport.md`.
- #4522 (badges courts, sans « enrichir pour révéler ») : c88da7ca ; libellés FR « Email disponible » / « Téléphone disponible ».
- #4474 (icône « Contacter » vs libellé) : 46683ecd ; rapport `fix-bugs-prod-2510-rapport.md`.
- #4527 (tuiles Répertoire) : 2d7c6106 (comptage serveur), 7d1a7193 (web), a611f7e3 (démo semée) ; rapport `contacts-c-4527-2410-rapport.md`.
- #4470 (badge verdict déborde) : d20db469 + 50edb22a (+ 97bc26e5).

Vérifié : les 5 commits sont ancêtres de HEAD. vitest `ContactDetail.layout.test.ts` : 11 verts ; `ContactKeyInfo.test.tsx` non relancé
(transform en échec, `@bellum/contracts` non construit sur cette VM — pas de build lourd).
Non fait : toute re-livraison (doublon). Arbitrage : le plus simple = ne rien recoder. Les issues #4523/#4522/#4474/#4527/#4470 sont
encore OUVERTES : à clore ou à rouvrir avec un constat prod précis si un écart subsiste.
