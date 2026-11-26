# Lot 97 — #4753 Démo /chat · l'amorce phare reste dans les six visibles

Périmètre : apps/web/src/features/demo/demo-chat-script.ts, apps/web/src/features/chat/view/Chat.tsx, apps/web/src/architecture/GA-4753-\*.test.ts

## Fait

- `DEMO_PINNED_STARTERS` (un seul endroit, GA-26) + `pinnedStartersBeyondCap` + `DEMO_MAX_VISIBLE_SUGGESTIONS` déplacé dans le script (Chat.tsx l'importe : zéro doublon).
- Garde GA-4753 : lit le script réel, dit NON si l'amorce est 7e ou absente, OUI si elle est dans les six.

## Garde

#1321.2 (plafond de six — INCHANGÉ), #1914, #4610.5, #4565 (garde : la ligne d'import de Chat.tsx ne change que par l'ajout de la constante).

## Ne fait pas

Aucun nouveau plafond, aucun changement d'ordre du script, aucune surface d'accès.
