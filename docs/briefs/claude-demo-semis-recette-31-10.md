## Ce que je fais — 6 écrans VIDES mesurés dans la salle de démo en prod (cfe0fedab2, passe D2)

Uniquement des données FICTIVES de la salle de démo (apps/api/src/modules/demo/demo-dataset.ts + DemoSeedService), jamais l'espace réel. Chaque ajout est classé dans demo-coverage.ts (seedé) et prouvé par une spec de couverture qui sait dire NON.

1. #4556.4 + #4432.4 — fiche démo Airbus ?tab=contacts : 10 contacts « Hors zone » SANS nom de zone, 0 « Occitanie ». ATTENDU : dossier démo cadré sur une région (Occitanie) : contacts de la zone d'abord, les autres marqués « hors zone (<Zone>) » avec la zone nommée. Si le libellé sans zone vient du CODE (pas du semis), corrige le rendu pour nommer la zone partout, pas seulement en démo.
2. #4195.5 — /projects (liste, 75 lignes) : 0 « Négociation », pas d'affaire « Renfort régie » SNCF (pourtant citée par une carte SNCF de /actions). ATTENDU : affaire SNCF « Renfort régie » au stade Négociation avec 2 positionnements retenus, cohérente avec la carte /actions qui la cite.
3. #4193.6 — missions démo à J-12/18/25/28 et J-41/47/55, aucune à J-61..90, 0 « Orange ». ATTENDU : au moins une mission finissant dans CHAQUE fenêtre 30 / 60 / 90 j, sur SNCF ET sur Orange (dates re-datées à aujourd'hui comme le reste de la salle, jamais figées).
4. #4290.12 — /contacts démo : 0 contact « a quitté ». ATTENDU : un contact démo marqué « a quitté l'entreprise » (#4055.8), affiché comme tel.
5. #4295.11 — /contacts démo : 0 « Privé », 0 « Ne pas contacter », filtre « Ne pas solliciter » vide. ATTENDU : un contact « Privé » et un contact « Ne pas contacter » (#4158.70) ; le filtre « Ne pas solliciter » en montre au moins un.

## Je ne fais PAS

Rien dans l'espace réel ; aucune migration ; aucun droit ; rien sur Laura ni sur Découvrir. Ne jamais déplacer une entrée de demo-coverage vers « vide à dessein » pour faire passer un test. Rien sous .claude/.

## Je défais

Rien. Garde #4291 J (comptes fictifs : aucune finance fabriquée), #4744.6/#4745.8 (Stratégie financière vide à dessein, Louis 31/10).

## Droits

Aucun accès modifié.

Périmètre : apps/api/src/modules/demo/** · apps/web/src/** (seulement si le libellé « hors zone » sans zone vient du rendu) · locales FR+EN · docs/briefs/**
