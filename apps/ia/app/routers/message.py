from __future__ import annotations

import logging
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.knowledge.channel_length import CHANNEL_MAX_CHARS
from app.knowledge.persona import PERSONAS
from app.models.outputs.outreach import OutreachDraftOutput
from app.prompts.bellum_outreach import build_system_prompt, build_user_prompt, contact_full_name
from app.services.alternative_hook_repair import enforce_only_opening_changed, resolve_placeholders
from app.services.claude_service import call_claude
from app.services.evidence_gate import (
    assert_claims_are_grounded,
    assert_context_is_not_vague,
    assert_draft_is_clean,
    ungrounded_claims,
)
from app.services.message_grounding import MessageGrounding, apply_grounding
from app.services.message_approach_preference import apply_message_approach_preference, load_message_approach_bag
from app.services.message_brief import (
    MESSAGE_CTAS,
    MESSAGE_OBJECTIVES,
    RELATIONSHIP_STATES,
    derive_message_brief,
    tone_options,
)
from app.services.message_context import (
    knowledge_block,
    lexicon_violations,
    regeneration_note,
    retrieval_query,
    retrieve_message_knowledge,
    seller_voice_block,
    ungrounded_retry_note,
)
from app.services.method_consumers import method_block_for
from app.services.model_policy import model_for
from app.services.ownership import fetch_owned_account, fetch_owned_contact
from app.services.rag_knowledge import retrieve_drive_context
from app.services.recommendation_specificity import assess_specificity, registry_from_inputs
from app.services.relationship_playbook import relationship_state_from_context
from app.services.seller_context import resolve_seller_context
from app.services.shared_message_learning import fetch_shared_message_learning, shared_message_learning_block
from app.services.supabase_client import get_supabase
from app.services.workspace_scope import resolve_workspace_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/message", tags=["Message"])

# #2123.72 — `task` : la tâche de prise de contact, qui ne s'envoie pas.
# Théo B C5.A24 / C7.A3 — SMS, WhatsApp et message vocal ne se génèrent plus (historique en lecture seule).
# #2947/#2204.40 — `recommendation` : le texte d'appui qui recommande le contact.
# #2370 (épopée #2947) — les huit canaux préparés, même liste que `bellum_outreach.Channel`
# (parité testée par `test_outreach_channel_contract.py`, qui lit aussi le contrat TS).
Channel = Literal[
    "email",
    "linkedin",
    "phone",
    "task",
    "recommendation",
    "introduction_request",
    "partner_message",
    "follow_up_email",
    "profile_push",
    "linkedin_connection_note",
]

#: Les canaux dont la sortie porte un objet (#2123.72 tâche ; #2370 suivi et push de profil).
_CHANNELS_WITH_SUBJECT = ("email", "task", "follow_up_email", "profile_push")


# #2123.61-.68 — les paramètres du message CHOISIS dans le formulaire du composer.
# Chaque code est validé contre le moteur (un code inconnu = 422, jamais un
# objectif deviné) ; les trois textes viennent du navigateur et finissent dans
# un prompt, d'où leurs bornes serrées.
_PARAMETER_CODES: dict[str, tuple[str, ...]] = {
    "objective": tuple(MESSAGE_OBJECTIVES),
    "relationship": RELATIONSHIP_STATES,
    "persona": PERSONAS,
    "cta": MESSAGE_CTAS,
}


class MessageParameters(BaseModel):
    objective: str | None = None
    relationship: str | None = None
    persona: str | None = None
    signal: str | None = Field(default=None, max_length=300)
    offer: str | None = Field(default=None, max_length=160)
    proof: str | None = Field(default=None, max_length=300)
    cta: str | None = None
    # #2204.7 — le PÉRIMÈTRE visé (entité, BU, site) ; #2204.15 — les CONTRAINTES
    # de forme que le commercial pose (longueur, mots à éviter). Bornes serrées :
    # le texte vient du navigateur et finit dans un prompt.
    scope: str | None = Field(default=None, max_length=160)
    # #3418.8 — le PROBLÈME à adresser : une donnée du commercial, à citer.
    problem: str | None = Field(default=None, max_length=300)
    constraints: str | None = Field(default=None, max_length=300)
    # #3892.6 (Louis 15/10) — champs FACULTATIFS repliés : type de prestation, période, expérience passée
    # (une donnée du commercial, jamais un fait du dossier). Vides = ignorés (`chosen()`).
    service: str | None = Field(default=None, max_length=160)
    period: str | None = Field(default=None, max_length=160)
    experience: str | None = Field(default=None, max_length=300)

    @field_validator("objective", "relationship", "persona", "cta")
    @classmethod
    def _known_code(cls, value: str | None, info) -> str | None:
        if value is None:
            return None
        if value not in _PARAMETER_CODES[info.field_name]:
            raise ValueError(f"unknown {info.field_name} code")
        return value

    def chosen(self) -> dict[str, str]:
        """Les seuls paramètres renseignés — un texte blanc n'est pas un choix."""
        return {
            key: value.strip() for key, value in self.model_dump().items() if isinstance(value, str) and value.strip()
        }


class MessageRevision(BaseModel):
    """#3419.3 — la consigne « accroche alternative » : réécrire l'OUVERTURE d'un message déjà là.

    `current_body` est le texte que le commercial a sous les yeux ; `previous_hooks`
    les ouvertures déjà proposées (à ne pas resservir). Un seul genre de révision
    existe : un genre inconnu est refusé (422), jamais deviné.
    """

    kind: Literal["alternative_hook"]
    current_body: str = Field(max_length=4000)
    previous_hooks: list[str] = Field(default_factory=list, max_length=5)

    @field_validator("current_body")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("current_body is blank")
        return value.strip()

    @field_validator("previous_hooks")
    @classmethod
    def _clean_hooks(cls, value: list[str]) -> list[str]:
        return [hook.strip()[:400] for hook in value if hook and hook.strip()]


class MessageRequest(BaseModel):
    contact_id: str
    user_id: str
    channel: Channel
    # Free-text angle typed by the seller in the composer ("Décris l'angle à
    # générer…"). When present it drives the message; empty = start from the
    # account's strongest recent signal.
    context: str | None = None
    # ESN seller profile resolved server-side by the API (companyName / offers…).
    # When absent the endpoint falls back to the legacy `profiles` row.
    profile_data: dict | None = None
    # #2123.61-.68 — absent = le cadrage dérivé d'avant, à l'octet près.
    parameters: MessageParameters | None = None
    # #3752 — l'espace dont on relit les documents ; absent = résolu côté IA depuis l'utilisateur.
    workspace_id: str | None = None
    # #3419.3 — absent = la génération d'avant, à l'octet près.
    revision: MessageRevision | None = None
    # #4524.2 — « Sur quoi Laura s'appuie » : les faits cochés (ou « angle libre »). Absent = paquet d'avant.
    grounding: MessageGrounding | None = None


async def fetch_last_loss(sb: Any, account_id: str) -> dict[str, str | None] | None:
    """#3405.6 — le motif de la DERNIÈRE perte motivée du compte, ou ``None``.

    Lecture de `projects.loss_reason` (la même donnée que lit le matching
    consultant). Le compte est déjà vérifié comme appartenant à l'appelant
    (`fetch_owned_account`) avant d'arriver ici. Un échec de lecture est
    journalisé et rend ``None`` : le message se rédige comme avant, sans motif
    — jamais un motif inventé, jamais un message bloqué pour une donnée
    d'appoint."""
    try:
        res = (
            await sb.table("projects")
            .select("loss_reason, closed_at")
            .eq("account_id", account_id)
            .eq("stage", "lost")
            # `TableQuery` n'a ni `.not_` ni `.filter` ni `order(desc=)` (AttributeError avalé par
            # le try → le motif n'arrivait jamais au message, #4478) : son API réelle.
            .not_is("loss_reason", "null")
            .order("closed_at", ascending=False)
            .limit(1)
            .aexecute()
        )
    except Exception:
        logger.warning("Lecture du motif de la dernière perte impossible (account=%s)", account_id, exc_info=True)
        return None
    rows = getattr(res, "data", None) or []
    if not rows:
        return None
    reason = str(rows[0].get("loss_reason") or "").strip()
    if not reason:
        return None
    closed_at = rows[0].get("closed_at")
    return {"reason": reason, "closed_on": str(closed_at)[:10] if closed_at else None}


async def _retrieve_knowledge(
    sb: Any,
    req: MessageRequest,
    contact: dict,
    account: dict,
    raw_analysis: dict,
    brief: dict,
    parameters: dict[str, str],
    angle: str,
    account_id: str | None,
) -> tuple[str, list[dict[str, Any]]]:
    """#3752.1 — documents de l'espace pour ce message, ``("", [])`` à défaut."""
    query = retrieval_query(contact, account, brief, parameters, angle)
    if not query:
        return "", []
    workspace_id = req.workspace_id
    if not workspace_id:
        try:
            workspace_id = await resolve_workspace_id(req.user_id, sb)
        except Exception:  # noqa: BLE001 — portée utilisateur, comme avant l'espace
            workspace_id = None
    sector = account.get("sector") or raw_analysis.get("sector")
    return await retrieve_message_knowledge(
        query,
        req.user_id,
        sector=str(sector) if sector else None,
        workspace_id=workspace_id,
        account_id=account_id,
    )


# #4334.1 — ce que la requête au Drive interne cherche, par canal : la trame d'appel n'est pas celle d'un e-mail.
_DRIVE_CHANNEL_TERMS: dict[str, str] = {
    "phone": "pitch d'appel script objections",
    "email": "trame e-mail de prospection",
    "linkedin": "message LinkedIn trame",
}
_DRIVE_TEMPLATE_RULE = (
    "Si un document de ce savoir interne décrit une trame pour ce canal (script d'appel, objections à "
    "traiter, structure d'e-mail ou de message), suis sa trame et réponds aux objections qu'elle nomme ; "
    "ne cite jamais ce document comme une preuve."
)


async def _draft(system_prompt: str, user_prompt: str) -> OutreachDraftOutput:
    try:
        result, _usage = await call_claude(
            system_prompt,
            user_prompt,
            response_model=dict,
            max_tokens=1200,
            prompt_name="bellum_outreach",
            model=model_for("bellum_outreach"),
            domain_knowledge=True,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    draft = OutreachDraftOutput.model_validate(result if isinstance(result, dict) else {})
    if not draft.body:
        raise HTTPException(status_code=502, detail="empty draft")
    return draft


@router.post("/generate")
async def generate_message(req: MessageRequest) -> dict:
    """Generate one ready-to-send outreach draft for a contact on a channel."""
    sb = get_supabase()

    if req.profile_data:
        profile = req.profile_data
    else:
        # #3752 — le contexte vendeur RÉSOLU (profil canonique de l'espace + surcharge
        # personnelle), la même source que l'analyse ; vide ⇒ la ligne `profiles` d'avant.
        profile = await resolve_seller_context(sb, req.user_id)
        if not profile:
            profile_res = await sb.table("profiles").select("*").eq("user_id", req.user_id).maybe_single().aexecute()
            profile = getattr(profile_res, "data", None) or {}

    # #4609.2 — la portée de lecture est l'ESPACE (comme l'API) : le contact d'un collègue ne répond plus 404.
    scope_workspace_id = req.workspace_id
    if not scope_workspace_id:
        try:
            scope_workspace_id = await resolve_workspace_id(req.user_id, sb)
        except Exception:  # noqa: BLE001 — portée utilisateur, comme avant l'espace
            scope_workspace_id = None

    contact = await fetch_owned_contact(
        sb,
        req.contact_id,
        req.user_id,
        workspace_id=scope_workspace_id,
        # #1926.4 — le persona se tire du TITRE (`classify_hierarchy_level`, calculé
        # au cadrage). `hierarchy_level` n'est PAS une colonne de `contacts` : la
        # demander faisait répondre 400 à PostgREST, donc « contact introuvable »
        # (#3418, garde : tests/test_message_contact_columns.py).
        # #2861 (#2437.11) — `locale` : la langue déclarée du destinataire
        # (`contacts.locale`, #2437.2), lue ici pour porter le message dans la
        # bonne langue — jamais devinée depuis `entity`/`countryCode`.
        # #219.8 (#3231) — `declared_person_company_relation` : pilote la
        # prudence du message (voir `bellum_outreach.build_user_prompt`).
        columns=(
            "full_name, title, decision_role, entity, linkedin_url, account_id, locale, "
            "declared_person_company_relation, email, phone"
        ),
    )

    account: dict = {}
    last_loss: dict[str, str | None] | None = None
    account_id = contact.get("account_id")
    if account_id:
        account = await fetch_owned_account(sb, account_id, req.user_id, workspace_id=scope_workspace_id)
        # #3405.6 — le motif de la dernière perte du compte, nommé au rédacteur.
        last_loss = await fetch_last_loss(sb, account_id)

    raw_analysis: dict = account.get("raw_analysis") or {}
    recent_signals: list = raw_analysis.get("recent_signals", [])
    # #4524.2 — le choix du commercial borne le paquet : faits non cochés retirés du dossier lu par le modèle.
    prompt_raw_analysis, recent_signals, grounding_block = apply_grounding(
        raw_analysis, recent_signals, req.grounding, channel=req.channel
    )
    context = (req.context or "").strip()
    # Relation au compte (annexe méthodo p6) : le kanban commercial du compte a été
    # lu à l'analyse et vit dans `raw_analysis.salesContext`. Sans lui, le composer
    # proposait la même prise de contact à froid sur un client actif que sur un
    # inconnu. Compte froid / dossier antérieur au contrat → bloc vide.
    relationship_state = relationship_state_from_context(raw_analysis.get("salesContext"))
    # #2123.62 — une relation CHOISIE par le commercial gagne sur celle lue au dossier.
    parameters = req.parameters.chosen() if req.parameters else {}
    # #4060 — la préférence « approche directe » enregistrée vaut objectif quand aucun n'est choisi.
    if not parameters.get("objective"):
        parameters = apply_message_approach_preference(parameters, await load_message_approach_bag(sb, req.user_id))
    relationship_state = parameters.get("relationship") or relationship_state
    # #1926.2-.5 / .8 — le cadrage est fixé AVANT l'appel : objectif, niveau
    # hiérarchique, tu/vous et appel à l'action, chacun avec sa provenance.
    brief = derive_message_brief(
        contact=contact,
        relationship_state=relationship_state,
        angle=context,
        parameters=parameters,
        channel=req.channel,
    )

    # #2368.2 / #2368.12 — packet de contexte : construit et jugé AVANT tout
    # appel modèle. Nom, poste et entreprise seuls ne suffisent jamais — zéro
    # coût, zéro message inventé sur un dossier vide.
    contact_name = contact_full_name(contact)
    research = dict(raw_analysis)
    if not research.get("companyName"):
        research["companyName"] = account.get("company_name") or ""
    context_registry = registry_from_inputs(
        profile=profile,
        research=research,
        contacts=[{"fullName": contact_name, "entity": contact.get("entity")}],
    )
    assert_context_is_not_vague(context_registry, context=context, parameters=parameters)

    system_prompt = build_system_prompt(profile, req.channel)
    # #3670.5 — la méthode validée choisit l'approche (premier message, reprise de
    # relation…) ; elle n'est PAS une preuve : le bloc part au modèle, jamais dans le
    # texte contre lequel `assert_claims_are_grounded` vérifie les affirmations.
    method_block = await method_block_for(
        "approches",
        situation_terms=f"approche {req.channel}",
        user_id=req.user_id,
        sector=raw_analysis.get("sector") or account.get("sector"),
        relationship_state=relationship_state,
    )
    # #3752.1/.2 — les documents de l'espace pertinents pour CE contact (rôle + secteur
    # du compte + objectif) et la voix déclarée du vendeur. Les deux blocs sont vides
    # quand l'espace n'a ni document ni contexte : le prompt est alors celui d'avant.
    # Le CORPS des messages reçus n'est lu nulle part ici (#3752.4, doctrine).
    knowledge_text, knowledge_sources = await _retrieve_knowledge(
        sb, req, contact, account, raw_analysis, brief, parameters, context, account_id
    )
    # #2947/#2204.10 — la voie d'accès probable (Q6 du dossier), calculée à
    # l'analyse et déjà persistée sur CE compte : `access_path_block` en fait
    # une ligne nommée plutôt qu'un espoir que le modèle la retrouve dans le
    # dump tronqué de `raw_analysis`. Absente = bloc vide, comme les autres
    # entrées optionnelles de ce prompt.
    evaluation = raw_analysis.get("evaluation")
    dossier_read = evaluation.get("dossier_read") if isinstance(evaluation, dict) else None
    access_path = dossier_read.get("access_path") if isinstance(dossier_read, dict) else None
    user_prompt = build_user_prompt(
        contact=contact,
        raw_analysis=prompt_raw_analysis,
        profile=profile,
        recent_signals=recent_signals,
        grounding_block=grounding_block,
        channel=req.channel,
        context=context,
        company_name=account.get("company_name") or "",
        relationship_state=relationship_state,
        brief=brief,
        parameters=parameters,
        locale=contact.get("locale"),
        access_path=access_path,
        last_loss=last_loss,
        seller_voice=seller_voice_block(profile),
        knowledge=knowledge_block(knowledge_text),
        revision=req.revision.model_dump() if req.revision else None,
    )

    logger.info("Outreach prompt size: %d chars (channel=%s)", len(user_prompt), req.channel)

    # #2877 (#2385.5 GLOBAL, Louis 11/10/2026) — ce que les messages ont appris dans
    # TOUS les espaces (base commune anonyme, k >= 3) : une vigilance de RÉDACTION,
    # jamais une preuve — hors du texte que `assert_claims_are_grounded` relit.
    # Base vide ou illisible ⇒ bloc vide, prompt d'avant à l'octet près.
    # #4334.1 — DIAGNOSTIC (call 19/10, « pas appuyé sur les protocoles du Drive ») : la génération lisait
    # la méthode intégrée et les documents de l'ESPACE, jamais le savoir du Drive interne Bellum (#3586) que
    # le chat, Découvrir, la recherche et le plan lisaient déjà. La trame du canal (script d'appel et ses
    # objections, structure d'e-mail…) entre dans la CONSIGNE de rédaction, comme la méthode — jamais dans
    # le texte des faits vérifiés : une trame n'est pas une preuve. Sans clé / corpus / en panne : `""`,
    # prompt d'avant à l'octet près.
    drive_block = await retrieve_drive_context(
        f"{_DRIVE_CHANNEL_TERMS.get(req.channel, req.channel)} {retrieval_query(contact, account, brief, parameters, context)}",
        account_id=account_id,
    )
    drafting_prompt = (
        system_prompt
        + method_block
        + (f"\n\n{drive_block}\n{_DRIVE_TEMPLATE_RULE}" if drive_block else "")
        + shared_message_learning_block(await fetch_shared_message_learning(sb, req.user_id))
    )
    draft = await _draft(drafting_prompt, user_prompt)
    # #3752.3 — contrôle du champ lexical : un mot interdit ⇒ UNE régénération qui le nomme ;
    # s'il revient, le message part tel quel avec un avertissement nommé — jamais de
    # réécriture silencieuse.
    lexicon_warning: list[str] = []
    avoided = lexicon_violations(f"{draft.subject or ''}\n{draft.body}", profile)
    if avoided:
        retry_prompt = user_prompt + regeneration_note(avoided)
        try:
            retried = await _draft(drafting_prompt, retry_prompt)
        except HTTPException:
            retried = None
        if retried is not None:
            draft, user_prompt = retried, retry_prompt
            avoided = lexicon_violations(f"{draft.subject or ''}\n{draft.body}", profile)
        lexicon_warning = avoided
    if req.revision is not None:
        # #3419 (recette prod nuit 08→09/10) — « Autres accroches » a réécrit le message
        # ENTIER (≠ consigne « seule l'ouverture change ») et laissé des placeholders
        # bruts (« [Prénom] [fonction] [coordonnées] ») : deux repères DÉJÀ écrits dans
        # le prompt (`alternative_hook_block`, `build_system_prompt`), repris ici en
        # repli déterministe plutôt qu'en second appel de modèle.
        draft.body = enforce_only_opening_changed(draft.body, req.revision.current_body)
        first_name = contact_full_name(contact).split(" ", 1)[0] or None
        draft.body = resolve_placeholders(
            draft.body,
            first_name=first_name,
            role=contact.get("title") or contact.get("decision_role"),
            email=contact.get("email"),
            phone=contact.get("phone"),
        )
    # #3248.3/.4 (recette prod 29/09) — un brouillon qui laisse fuir l'annonce
    # d'hypothèse de Laura (« Je pars sur… Tu peux corriger. ») ou se coupe sur
    # une signature tronquée n'est jamais renvoyé : refusé et nommé, comme une
    # affirmation sans preuve juste en dessous.
    assert_draft_is_clean(draft.body)
    # #2368.14 — NO-GO : chaque affirmation déclarée doit citer une preuve
    # RÉELLEMENT présente dans le packet envoyé au modèle. Bloque tout le
    # brouillon plutôt que de renvoyer une affirmation fabriquée.
    # #4981 — le refus est légitime (chiffre absent du packet) : UNE régénération qui NOMME
    # l'affirmation à retirer, avant d'échouer sec. Si elle revient, la porte refuse (422).
    unsupported = ungrounded_claims(draft.claims, f"{system_prompt}\n{user_prompt}")
    if unsupported:
        retry_prompt = user_prompt + ungrounded_retry_note(unsupported)
        draft = await _draft(drafting_prompt, retry_prompt)
        # La preuve se cherche dans le packet D'ORIGINE : la consigne de correction cite l'affirmation
        # refusée, elle ne doit jamais la rendre « prouvée ».
        assert_draft_is_clean(draft.body)
    assert_claims_are_grounded(draft.claims, f"{system_prompt}\n{user_prompt}")
    # #2370 — un plafond DUR de plateforme (note LinkedIn 300, SMS 160) : un
    # brouillon plus long est refusé et nommé, jamais tronqué à la place du modèle.
    max_chars = CHANNEL_MAX_CHARS.get(req.channel)
    if max_chars is not None and len(draft.body.strip()) > max_chars:
        raise HTTPException(
            status_code=422,
            detail=f"Brouillon rejeté : {len(draft.body.strip())} caractères, au-delà des {max_chars} du canal.",
        )
    # #2123.72 — l'intitulé d'une tâche devient le libellé de l'action créée.
    subject = draft.subject if req.channel in _CHANNELS_WITH_SUBJECT else ""

    # #1925 / #1926.30 — ce que le brouillon CITE réellement, compté sur les champs
    # structurés du compte et du contact (pas déclaré par le modèle). Un brouillon
    # « générique » est rendu tel quel, avec son verdict : aucune régénération
    # silencieuse (elle doublerait l'appel au modèle sans le dire), aucun débit.
    specificity = assess_specificity([subject, draft.body, contact_name], context_registry)

    extras: dict[str, Any] = {}
    if knowledge_sources:
        # #3752.2 — les documents RÉELLEMENT injectés au prompt (même forme que le chat).
        extras["knowledgeSources"] = knowledge_sources
    if lexicon_warning:
        # #3752.3 — le mot interdit qui a survécu à la régénération, nommé.
        extras["lexiconWarning"] = {"terms": lexicon_warning}

    return {
        "success": True,
        "data": {
            **extras,
            "channel": req.channel,
            "subject": subject,
            "body": draft.body,
            # #1926.29 — la raison du choix ; #1926.28 — l'angle alternatif.
            "rationale": draft.rationale,
            "alternativeAngle": draft.alternative_angle,
            # #1926.2-.5 / .8 — le cadrage retenu, codes + provenance, et ce qui
            # manque (`missing`) : la matière d'UNE question groupée.
            "brief": brief,
            # #1925 — le verdict, même forme que `nextBestAction.specificity` du plan ;
            # #1926.30 — ses `elements` SONT les données utilisées.
            "specificity": specificity,
            # #2368.14 — les affirmations déclarées, chacune DÉJÀ vérifiée contre
            # le packet (une preuve introuvable a bloqué la réponse plus haut).
            "claims": [claim.model_dump() for claim in draft.claims],
            # #1926.31 — changer le ton : l'instruction se renvoie comme angle.
            "toneOptions": tone_options(brief),
        },
    }
