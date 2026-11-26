"""Le compilateur d'opportunité (#2324, chantier CHAT-3 — LAU-FINAL-065).

Mesuré le 18/09/2026 (registre `.claude/notes/registre-2026-09-18-chat-
opportunity-compiler.md`) : aucun des soixante outils de `chat_tools.py` ne
compile une opportunité. Les ingrédients existaient déjà — `PROJECT_STAGES`,
`primary_domain_code` (le "scope"), le formulaire `/projects?create=1` — mais
rien ne les assemblait pour une conversation.

Ce module ASSEMBLE, il n'invente rien de nouveau :

* **Laura ne crée JAMAIS d'opportunité.** `apps/api/.../project-creation-is-a-
  human-gesture.spec.ts` exige que `createForWorkspace` garde EXACTEMENT un
  appelant (le contrôleur `POST /projects`). Ce compilateur ouvre donc l'écran
  de création DÉJÀ EXISTANT (`CreateProjectDialog`), prérempli du seul FAIT
  connu (le compte) — jamais du reste, que l'humain tape ou corrige lui-même,
  exactement comme `CreateProjectDialog` le fait déjà pour un renouvellement.
* **Aucune probabilité.** Ni score de conversion, ni pondération : une
  opportunité se compile par des FAITS datés et ce qui MANQUE, jamais une
  espérance chiffrée (doctrine « refusé six fois »).
* **Un score n'est jamais nu.** `compiled_opportunity_gaps` NOMME ce qui
  manque parmi les quatre axes qui rendent une demande traitable (fit avec
  l'offre, périmètre, décideur, prochaine action — `opportunity-ontology.ts`,
  `EVIDENCE_REQUIREMENTS.opportunity`) ; jamais un pourcentage.
* **Une hypothèse reste une hypothèse.** `reasoning` est OBLIGATOIRE et
  toujours restitué préfixé « Hypothèse » — jamais présenté comme un fait
  déjà vérifié par un humain.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any
from urllib.parse import urlencode

#: #2324.1-.8 — les sept sources RETENUES (2324.6, "piste qualifiée", est déjà
#: servie par un mécanisme ÉCRAN, `POST /projects/:id/convert" — hors périmètre
#: de ce compilateur conversationnel).
OPPORTUNITY_COMPILE_SOURCES: tuple[str, ...] = (
    "echange_client",
    "note_crm",
    "email",
    "rendez_vous",
    "besoin",
    "appel_offres",
    "relation_partenaire",
)

_SOURCE_LABELS: dict[str, str] = {
    "echange_client": "un échange client",
    "note_crm": "une note CRM",
    "email": "un e-mail",
    "rendez_vous": "un rendez-vous",
    "besoin": "un besoin exprimé",
    "appel_offres": "un appel d'offres",
    "relation_partenaire": "une relation partenaire",
}

#: #2324.11/29 — les quatre manques nommés, jamais un score. Même vocabulaire
#: que `EVIDENCE_REQUIREMENTS.opportunity` (opportunity-ontology.ts) : fit
#: avec l'offre, périmètre, décideur, prochaine action — sans dupliquer son
#: modèle (GA-26), puisqu'ici rien n'est encore une ligne en base à évaluer.
COMPILE_OPPORTUNITY_GAPS: tuple[str, ...] = (
    "no_scope",
    "no_perimeter",
    "no_decision_maker",
    "no_next_action",
)

_GAP_LABELS: dict[str, str] = {
    "no_scope": "aucun domaine d'offre identifié (le périmètre métier)",
    "no_perimeter": "ni montant ni échéance espérée",
    "no_decision_maker": "aucun décideur identifié",
    "no_next_action": "aucune prochaine action",
}


def _clean(value: Any) -> str:
    return str(value or "").strip()


def compiled_opportunity_gaps(fields: Mapping[str, Any]) -> list[str]:
    """#2324.11/29 — ce qui manque pour que la demande soit TRAITABLE.

    Jamais un `False` nu : chaque manque est un des quatre axes NOMMÉS de
    `COMPILE_OPPORTUNITY_GAPS`, dans l'ORDRE fixe ci-dessus — append-only,
    comme `EVIDENCE_GAPS` côté contrats (GA-08).
    """
    gaps: list[str] = []
    if not _clean(fields.get("primary_domain_code")):
        gaps.append("no_scope")
    if not fields.get("amount_cents") and not _clean(fields.get("expected_close_on")):
        gaps.append("no_perimeter")
    if not _clean(fields.get("contact_id")):
        gaps.append("no_decision_maker")
    if not _clean(fields.get("next_action_title")):
        gaps.append("no_next_action")
    return gaps


def compile_opportunity_route(account_id: str) -> str:
    """#2324.29 — le SEUL véhicule vers l'écran de création, déjà existant
    (`CreateProjectDialog`, `ProjectsPage.tsx`). Ne préremplit QUE le compte :
    « rien n'est pré-rempli qu'on ne sache » (CreateProjectDialog.tsx) — le
    libellé, l'objectif et le montant restent la SAISIE de l'humain."""
    # ⚠️ `account_id`, PAS `accountId` : `projectsSearchSchema`
    # (apps/web/src/routes/projects/index.tsx) déclare `account_id` en
    # snake_case — le défaut « filtre fantôme » déjà payé deux fois ici
    # (missions, pipe) est un paramètre qui ne porte pas le nom que la route
    # LIT, jeté en silence par `validateSearch`.
    query = urlencode({"create": "1", "account_id": account_id})
    return f"/projects?{query}"


def _highlight(
    *,
    source: str,
    company_name: str,
    reasoning: str,
    objective: str,
    primary_domain_code: str,
    next_action_title: str,
    amount_cents: int | None,
    gaps: list[str],
) -> str:
    """La PREVIEW que #2324.29 exige — un texte lisible AVANT le clic, jamais
    une donnée qui ne voyage que dans un champ que personne n'affiche."""
    parts = [f"Depuis {_SOURCE_LABELS.get(source, source)} chez {company_name}."]
    parts.append(f"Hypothèse : {reasoning}")
    if objective:
        parts.append(f"Objectif pressenti : {objective}.")
    if primary_domain_code:
        parts.append(f"Domaine d'offre pressenti : {primary_domain_code}.")
    if next_action_title:
        parts.append(f"Prochaine action pressentie : {next_action_title}.")
    if isinstance(amount_cents, int) and amount_cents > 0:
        parts.append(f"Montant pressenti : {amount_cents / 100:.0f} €.")
    if gaps:
        named = ", ".join(_GAP_LABELS.get(gap, gap) for gap in gaps)
        parts.append(f"Manque encore : {named}.")
    parts.append("Rien n'est créé : le formulaire s'ouvre vide sur ces champs, à toi de les valider ou corriger.")
    return " ".join(parts)


COMPILE_OPPORTUNITY_TOOL: dict[str, Any] = {
    "name": "compile_opportunity",
    "description": (
        "Compile une opportunité potentielle depuis ce qui vient d'être dit — un échange "
        "client, une note CRM, un e-mail, un rendez-vous, un besoin exprimé, un appel "
        "d'offres ou une relation partenaire — et PROPOSE d'ouvrir le formulaire de création "
        "déjà existant, prérempli du compte. À utiliser quand la conversation fait ressortir "
        "une affaire possible sur un compte du portefeuille. "
        "N'ÉCRIT RIEN : ce n'est jamais toi qui crées l'opportunité, c'est le clic de "
        "l'utilisateur dans le formulaire qui s'ouvre — et le formulaire reste VIDE sur le "
        "libellé, l'objectif et le montant, qu'il tape ou corrige lui-même. `reasoning` est "
        "OBLIGATOIRE et restitué comme une HYPOTHÈSE, jamais comme un fait établi. "
        "AUCUNE probabilité de signature, aucun score de conversion : dis ce qui manque "
        "(domaine d'offre, périmètre, décideur, prochaine action), jamais une chance chiffrée. "
        "Ne propose JAMAIS ceci pour un simple signal de recrutement ou une actualité sans "
        "demande exprimée — compile seulement ce qu'un humain a réellement dit ou écrit."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "source": {
                "type": "string",
                "enum": list(OPPORTUNITY_COMPILE_SOURCES),
                "description": "D'où vient cette compilation — jamais devinée si ambiguë.",
            },
            "account_id": {"type": "string", "description": "Le compte du portefeuille concerné."},
            "reasoning": {
                "type": "string",
                "description": "Pourquoi tu proposes cette compilation — restitué comme hypothèse, jamais comme fait.",
            },
            "objective": {"type": "string", "description": "Ce que le client cherche à obtenir, tel qu'il l'a dit."},
            "primary_domain_code": {
                "type": "string",
                "description": (
                    "La famille de prestation ACHETÉE (le périmètre métier) — jamais déduite de ce que l'ESN vend."
                ),
            },
            "next_action_title": {"type": "string", "description": "La prochaine action évoquée, si une l'a été."},
            "expected_close_on": {"type": "string", "description": "Échéance espérée, AAAA-MM-JJ, si elle a été dite."},
            "amount_cents": {"type": "integer", "description": "Montant pressenti EN CENTIMES, seulement s'il a été chiffré."},
            "contact_id": {"type": "string", "description": "Le décideur identifié, si un contact du compte a été cité."},
        },
        "required": ["source", "account_id", "reasoning"],
    },
}


async def execute_compile_opportunity(
    tool_input: Mapping[str, Any],
    *,
    resolve_account: Any,
) -> dict[str, Any]:
    """`resolve_account(account_id) -> {"account_id", "company_name"} | None`,
    scopé au caller — voir `_owned_account_dossiers` (chat_tools.py) : un
    identifiant qui n'appartient pas au portefeuille de l'appelant ne doit
    JAMAIS produire de proposition.
    """
    source = _clean(tool_input.get("source"))
    if source not in OPPORTUNITY_COMPILE_SOURCES:
        return {
            "error": (
                f"Source inconnue pour compiler une opportunité : {source or '(vide)'}. "
                f"Les sources valables sont : {', '.join(OPPORTUNITY_COMPILE_SOURCES)}."
            )
        }
    account_id = _clean(tool_input.get("account_id"))
    if not account_id:
        return {"error": "Il me faut le compte sur lequel compiler cette opportunité."}
    reasoning = _clean(tool_input.get("reasoning"))
    if not reasoning:
        return {
            "error": (
                "Dis pourquoi tu proposes cette compilation — c'est ce qui sera montré comme "
                "hypothèse avant tout clic."
            )
        }

    account = await resolve_account(account_id)
    if not account:
        return {"error": "Ce compte est introuvable dans votre portefeuille."}

    objective = _clean(tool_input.get("objective"))
    primary_domain_code = _clean(tool_input.get("primary_domain_code"))
    next_action_title = _clean(tool_input.get("next_action_title"))
    expected_close_on = _clean(tool_input.get("expected_close_on"))
    contact_id = _clean(tool_input.get("contact_id"))
    amount_cents_raw = tool_input.get("amount_cents")
    amount_cents = amount_cents_raw if isinstance(amount_cents_raw, int) and not isinstance(amount_cents_raw, bool) else None

    fields = {
        "primary_domain_code": primary_domain_code,
        "amount_cents": amount_cents,
        "expected_close_on": expected_close_on,
        "contact_id": contact_id,
        "next_action_title": next_action_title,
    }
    gaps = compiled_opportunity_gaps(fields)
    company_name = _clean(account.get("company_name")) or "ce compte"

    payload: dict[str, Any] = {
        "action": "open_screen",
        "route": compile_opportunity_route(account_id),
        "label": f"Créer l'affaire — {company_name}",
        "cost_credits": 0,
        "highlight": _highlight(
            source=source,
            company_name=company_name,
            reasoning=reasoning,
            objective=objective,
            primary_domain_code=primary_domain_code,
            next_action_title=next_action_title,
            amount_cents=amount_cents,
            gaps=gaps,
        ),
        # #2324.11/29 — les axes NOMMÉS, pour que le modèle puisse les redire
        # sans les recalculer, et pour qu'un test puisse les vérifier un par un
        # sans reparser `highlight`.
        "compiled_source": source,
        "compiled_gaps": gaps,
    }
    return payload


# ── #2324.40/43/44/46/47/48 — le diagnostic de pipe, sans redirection forcée ──

GET_PIPELINE_HEALTH_TOOL: dict[str, Any] = {
    "name": "get_pipeline_health",
    "description": (
        "Le diagnostic du pipe commercial : quelles opportunités MÉRITENT du temps, chacune "
        "avec ses raisons NOMMÉES (vieillissement, absence de prochaine action, besoin sans "
        "aucun profil, profil déjà soumis sans retour client) ; lesquelles sont RECOMMANDÉES "
        "à la clôture (jamais clôturées automatiquement) ; et combien de signaux de "
        "recrutement sont exclus faute de porteur ET de prochaine action — ce ne sont pas des "
        "opportunités actives tant qu'un humain ne les a pas adoptées des deux mains. "
        "À utiliser pour « qu'est-ce qui mérite mon temps aujourd'hui », « qu'est-ce que je "
        "devrais clôturer », « quels besoins n'ont aucun profil », « quelles affaires méritent "
        "mon temps », « quelle est la santé de mon pipe d'opportunités », « quelles affaires "
        "prioriser » (#2325.7). Une AFFAIRE — une opportunité du pipe — n'est pas un COMPTE : "
        "cette question n'est JAMAIS un classement de portefeuille, même quand elle porte le mot "
        "« prioriser » — ce classement de comptes répond à « priorise mes comptes », pas à ceci. "
        "RÉPONDS DIRECTEMENT avec ce diagnostic — ne renvoie JAMAIS l'utilisateur vers l'écran "
        "Pipe comme seule réponse, et ne bascule JAMAIS vers un classement de comptes. "
        "AUCUN score, aucune pondération, aucune probabilité de signature n'existe ici — "
        "n'en invente pas. Une recommandation de clôture reste une recommandation : rien ici "
        "ne clôture, ne relance ni ne modifie quoi que ce soit tout seul. "
        "`priority_deals` (au plus CINQ) et `deals_to_watch` (au plus TROIS, un sous-ensemble à "
        "recommander pour la clôture ou la mise de côté) classent par PLUSIEURS signaux à la fois — "
        "jamais par le seul montant, la seule date ou le seul stage, qui n'existent même pas "
        "ici. Chaque affaire porte NEUF axes (`axes`) — réalité du besoin, timing, accès, "
        "capacité à répondre, décision attendue, économie, risque, VIEILLISSEMENT (depuis quand "
        "l'affaire traîne, #2325.11) et CONFIANCE (qualité des données déjà connues sur "
        "l'affaire, #2325.13) —, chacun soit mesuré (`measured: true`, avec une étiquette), soit "
        "explicitement NON mesuré (`measured: false`) — dis-le, "
        "n'invente jamais une valeur pour un axe non mesuré. Chaque affaire porte aussi une "
        "`decision` parmi six noms fixes (valider le budget / confirmer le must-have / obtenir "
        "le retour shortlist / sécuriser le consultant / fixer l'entretien / décider de fermer) "
        "— jamais une relance générique —, l'`owner` déjà connu (ou `null`, jamais deviné), et "
        "`recommendedBy` : une DATE RECOMMANDÉE de relance, pas une échéance mesurée. "
        "`staffing_collisions` (#2325.34) nomme les consultants OUVERTS sur DEUX besoins distincts "
        "en même temps — jamais une comparaison entre commerciaux, seulement entre besoins d'un "
        "même consultant. `contact_solicitation_collisions` (#2325.35) fait de même pour les "
        "CONTACTS : un même contact visé par DEUX séquences d'outreach ACTIVES à la fois — jamais "
        "une comparaison entre commerciaux non plus. `duplicate_opportunities` (#2325.33) nomme les "
        "affaires ACTIVES du MÊME compte qui portent EXACTEMENT le même titre — jamais une "
        "ressemblance devinée, jamais une fusion : PROPOSE seulement, un humain décide. "
        "`multi_owner_opportunities` (#2325.32) nomme les affaires dont le PROPRIÉTAIRE diverge des "
        "porteurs de ses tâches ouvertes — un défaut de coordination sur UNE affaire, jamais une "
        "comparaison entre commerciaux. `contradictory_action_opportunities` (#2325.36) nomme les "
        "affaires dont l'ISSUE est CONNUE (gagnée/perdue) mais qui portent encore une tâche "
        "OUVERTE — le pipe dit fini, une tâche dit le contraire ; aucune autre forme de "
        "contradiction n'est devinée ici. Une liste vide veut dire aucune collision PARMI CE QUI "
        "EST LU, jamais aucune collision dans l'espace."
    ),
    "input_schema": {"type": "object", "properties": {}, "required": []},
}
