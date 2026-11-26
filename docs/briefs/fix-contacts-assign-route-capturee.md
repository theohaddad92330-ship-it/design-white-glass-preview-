# Fix — `PATCH /contacts/assign` captée par `PATCH /contacts/:id` (#2160.9, #4504.3)

Branche : `fix/contacts-assign-route-capturee`

## Compris

« Attribuer » un contact → 400 `Unrecognized keys: "contact_ids", "assigned_to"`. `PATCH /contacts/assign` était capté par `@Patch(':id')` de `ContactRecordController` (corps `.strict()`), car CrmCoreModule est importé par une dizaine de modules enregistrés avant AssignmentModule. Masqué depuis b73ec24542 (#944). Revient sur b93fb9c698 (#2160) : diagnostic incomplet.

## Fait

1. E2E `contact-assign-route-order.e2e.spec.ts` (vrai `ZodValidationPipe`, deux contrôleurs) : ordre corrigé → 200 et `assignMany` appelé ; ordre CrmCore d'abord → 400 (la preuve que l'ordre compte).
2. Correctif : `AssignmentModule` en tête des `imports` d'`app.module.ts`.
3. GA-178 suit les imports transitifs (parcours en profondeur pré-ordre, comme Nest) avec un cas qui sait dire NON.

## Écart au brief

La contrainte UUID par regex (`:id([0-9a-fA-F-]{36})`) est IMPOSSIBLE : Express 5 / path-to-regexp 8 refuse la syntaxe (« Unexpected ( », vérifié). Le `ParseUUIDPipe` existant reste la ceinture ; l'ordre des modules est le correctif.

## Droits

inchangés (`records:write` requis, test du refus viewer conservé).

Périmètre : apps/api/src/modules/crm-core/**, apps/api/src/modules/assignment/**, apps/api/src/architecture/**, changes/**
(+ `apps/api/src/app.module.ts` : l'ordre des imports est le correctif, `docs/briefs/*`)
