"""#4071.2 — LAURA REÇOIT LES FAITS DU COMPTE (socle #4069), LES DATE, ET NE NOMME
JAMAIS LEUR PROVENANCE.

L'API NestJS lit, pour le compte ouvert, tout ce que l'espace sait de lui —
signaux de tout âge, affaires gagnées/perdues/en sommeil, missions, besoins,
notes, comptes rendus, corrections, observations de marché, documents
(`AccountFactsService`) — les pèse (décote par l'âge, bonus de récurrence,
#4069.2), en garde les plus pertinents et les rend en lignes datées
(`account-facts-context.ts`), envoyées ici via ``account_facts_context``.

Décisions Louis 12/10 (#4068) que ce bloc fait tenir au modèle :

* **toujours daté** — aucune coupure d'âge ; un fait ancien se dit AVEC son
  âge (« il y a 14 mois »), jamais comme s'il était d'hier ;
* **jamais nommé** — un fait se dit par sa nature et sa date ; aucune source
  nommée (renverse #2291.3). « Votre CRM » reste permis : c'est l'outil branché
  par le client (D354), pas un de nos fournisseurs ;
* aucune probabilité ; un besoin récurrent est un signal fort.

Contrat : contexte vide → ``""`` (prompt byte-identique à avant) ; sinon un bloc
ADDITIF, re-capé ici par défense en profondeur.
"""

from __future__ import annotations

# L'API borne à 30 lignes de ≤ 280 caractères ; on re-cape (un appelant non-API
# pourrait envoyer n'importe quoi).
_CONTEXT_MAX_CHARS = 6000


def account_facts_context_block(context: str | None) -> str:
    """Bloc « faits du compte » pour le prompt système, ou ``""`` sans fait."""
    text = (context or "").strip()[:_CONTEXT_MAX_CHARS]
    if not text:
        return ""
    return (
        "\n\n===== FAITS DU COMPTE (tout ce que l'espace sait de ce compte, les plus pertinents d'abord) =====\n"
        + text
        + "\nRègles : appuie-toi sur ces faits sans attendre qu'on te les demande — un besoin qui revient "
        "est un signal fort, une affaire perdue ou en sommeil se rappelle avant de proposer la même route. "
        "DATE tout fait ancien quand tu le cites, avec son âge tel qu'il est écrit entre crochets "
        "(« il y a 14 mois ») ; ne présente JAMAIS un fait ancien comme actuel. Dis un fait par sa NATURE "
        "et sa date, JAMAIS par sa provenance : ne nomme ni base, ni outil, ni fournisseur, ni système "
        "d'où il viendrait (seul « votre CRM » peut se dire, c'est l'outil du client). Aucune probabilité : "
        "l'ordre de ces lignes est un rang, pas une chance de gagner."
    )
