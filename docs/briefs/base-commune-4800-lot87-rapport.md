# Lot 87 — Base commune entre espaces · P1 (#4800, détaché de #4286.15)

Périmètre : packages/contracts/src/schemas/shared-person-fields.ts, packages/contracts/src/index.ts, apps/api/src/architecture/ga-418-fait-public-trace-jamais.spec.ts, apps/api/src/modules/contacts/contacts.service.spec.ts, agent_docs/base-commune-carte-2026-10-19.md, docs/briefs/base-commune-4800-lot87-rapport.md

## Antériorité

#3971 / #3989 / #4268 (a–e) / #4286.15 (a–c) livrés : base commune des personnes (c94), coordonnées (c99), anciens,
effacement propagé, `market_pattern` (c127, GA-416), GA-415. Rien de cela n'est recodé.

## Les 4 points de #4800

1. **Inventaire fait / trace + garde** — NOUVEAU : `shared-person-fields.ts` + GA-418 (test d'abord, cas plantés).
2. **Effacement RGPD traverse** — DÉJÀ LÀ, prouvé fichier:ligne dans la carte § 6.
3. **Correction humaine gagne** — déjà là pour la coordonnée ; NOUVEAU test pour le poste (#4800.3), deux sens.
4. **Tendances sans remontée à un espace** — DÉJÀ LÀ (c127, GA-416), cité § 6.

## Ce que le lot ne fait pas / ne défait pas

Aucun changement de comportement, de migration, de route, de rôle, d'écran : pas de `## Droits`, pas de démo à semer
(rien de visible). Ne touche pas le registre de doctrine. Garde #4268.c, #4268.d, #4286.15.b. Ne ferme aucune issue.
Le registre `doctrine-registry.ts` n'a pas de nouvelle clé : la décision du 29/10 est écrite dans #4800 ; l'y inscrire
(c-nouvelle, holders GA-418) est laissé à Louis/clôture.
