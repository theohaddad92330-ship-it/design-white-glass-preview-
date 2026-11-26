"""#2313 — RELATION-FIRST ACCOUNT ENTRY ET INTRODUCTION GOVERNANCE (LAU-FINAL-054).

Le module sous test (`app.services.relation_first_entry`) est PUR — sans I/O ni
LLM, même famille que `relationship_playbook` et `warmIntroGovernance.ts`
(#2373, côté web) dont il reprend la philosophie côté IA : une capacité
relationnelle ne se suppose JAMAIS, elle se VÉRIFIE ; une introduction ne se
cite jamais sans autorisation confirmée.
"""

from __future__ import annotations

from app.services.relation_first_entry import (
    DEPARTED_CONTACT_EXCLUSION_REASON,
    DEPARTED_CONTACT_ROLES,
    KNOWN_CONTACT_ENTRY_KINDS,
    RELATIONAL_CAPABILITIES,
    RELATION_FIRST_SEQUENCE,
    can_introduce,
    departed_contact_reclassification,
    first_touch_message_guard,
    next_relation_first_step,
    no_go_guard,
    relational_capability,
    team_network_permission_gate,
    verify_before_recommend,
)


class TestEntryKinds:
    """#2313.1 — les huit façons d'entrer une relation connue, closed list."""

    def test_eight_entry_kinds_named(self) -> None:
        assert len(KNOWN_CONTACT_ENTRY_KINDS) == 8
        assert "former_colleague" in KNOWN_CONTACT_ENTRY_KINDS
        assert "consultant" in KNOWN_CONTACT_ENTRY_KINDS
        assert "met_before" in KNOWN_CONTACT_ENTRY_KINDS


class TestVerifyBeforeRecommend:
    """#2313.2 — dix vérifications avant toute recommandation."""

    def test_missing_everything_is_not_ready(self) -> None:
        result = verify_before_recommend({})
        assert result["ready"] is False
        assert "identity" in result["missing"]
        assert "owner" in result["missing"]
        assert "visibility_permission" in result["missing"]
        assert len(result["missing"]) == 10

    def test_ready_only_once_all_ten_are_present(self) -> None:
        known = {
            "identity": "Marie Martin",
            "current_title": "DSI",
            "company": "Latecoere",
            "entity": "DSI groupe",
            "last_contact_date": "2026-03-01",
            "relation_nature": "ancien collègue",
            "owner": "user-1",
            "visibility_permission": True,
            "context": "mission ESN 2023",
            "relation_state": "dormant",
        }
        result = verify_before_recommend(known)
        assert result == {"missing": [], "ready": True}

    def test_one_missing_field_is_named_not_silently_dropped(self) -> None:
        known = {
            "identity": "Marie Martin",
            "current_title": "DSI",
            "company": "Latecoere",
            "entity": "DSI groupe",
            "last_contact_date": "2026-03-01",
            "relation_nature": "ancien collègue",
            "owner": "user-1",
            "visibility_permission": True,
            "context": "mission ESN 2023",
            # relation_state manquant
        }
        result = verify_before_recommend(known)
        assert result["missing"] == ["relation_state"]
        assert result["ready"] is False


class TestRelationalCapability:
    """#2313.3 — lecture commerciale : ce qu'une personne peut FAIRE."""

    def test_six_capabilities_named(self) -> None:
        assert RELATIONAL_CAPABILITIES == ("confirm", "explain", "orient", "introduce", "sponsor", "none")

    def test_unverified_relation_never_gets_a_capability(self) -> None:
        # #2313.4 — ne jamais supposer une capacité sur une relation non vérifiée,
        # même si l'utilisateur en réclame une.
        assert relational_capability(verified=False, claimed="introduce") == "none"

    def test_verified_relation_keeps_its_classified_capability(self) -> None:
        assert relational_capability(verified=True, claimed="orient") == "orient"

    def test_unknown_claim_falls_back_to_none(self) -> None:
        assert relational_capability(verified=True, claimed="closer") == "none"


class TestCanIntroduce:
    """#2313.4 — ne jamais supposer qu'un contact peut introduire juste parce
    qu'il connaît l'entreprise."""

    def test_knowing_the_company_alone_never_grants_introduction(self) -> None:
        # capacité non vérifiée (donc "none" en amont) + pas de confirmation.
        assert can_introduce(capability="none", referrer_confirmed=False) is False

    def test_classified_as_introduce_but_not_confirmed_stays_blocked(self) -> None:
        assert can_introduce(capability="introduce", referrer_confirmed=False) is False

    def test_introduce_plus_explicit_confirmation_is_allowed(self) -> None:
        assert can_introduce(capability="introduce", referrer_confirmed=True) is True

    def test_sponsor_also_counts_as_able_to_introduce(self) -> None:
        assert can_introduce(capability="sponsor", referrer_confirmed=True) is True

    def test_explain_capability_never_allows_introduction(self) -> None:
        assert can_introduce(capability="explain", referrer_confirmed=True) is False


class TestRelationFirstSequence:
    """#2313.5 — séquence terrain en 6 étapes, dans l'ordre."""

    def test_six_steps_in_order(self) -> None:
        assert RELATION_FIRST_SEQUENCE == (
            "resume_or_open",
            "ask_their_context",
            "identify_topic_owner",
            "understand_buying",
            "propose_introduction",
            "obtain_authorization",
        )

    def test_next_step_is_the_first_undone_one(self) -> None:
        assert next_relation_first_step(set()) == "resume_or_open"
        assert next_relation_first_step({"resume_or_open"}) == "ask_their_context"

    def test_no_step_left_once_all_are_done(self) -> None:
        assert next_relation_first_step(set(RELATION_FIRST_SEQUENCE)) is None

    def test_introduction_never_proposed_before_the_field_steps(self) -> None:
        # #2313.6 — "proposer intro" est l'avant-dernière étape : elle ne peut
        # pas être la PROCHAINE tant que le terrain n'a pas été fait.
        done = {"resume_or_open", "ask_their_context"}
        assert next_relation_first_step(done) == "identify_topic_owner"
        assert next_relation_first_step(done) != "propose_introduction"


class TestFirstTouchMessageGuard:
    """#2313.6 — la première approche ne demande pas d'emblée une présentation."""

    def test_direct_ask_for_the_decision_maker_is_blocked(self) -> None:
        result = first_touch_message_guard("Bonjour, peux-tu me présenter au décideur ?")
        assert result["allowed"] is False
        assert result["reason"] is not None

    def test_natural_reconnection_is_allowed(self) -> None:
        result = first_touch_message_guard("Ça fait longtemps ! Comment se passe la nouvelle mission chez eux ?")
        assert result == {"allowed": True, "reason": None}


class TestTeamNetworkPermissionGate:
    """#2313.7 — réseau équipe : permissions, owner, solliciter le collègue."""

    def test_relation_not_owned_by_a_colleague_is_never_gated(self) -> None:
        result = team_network_permission_gate(
            owner_user_id=None, requester_user_id="user-1", owner_permission_granted=False
        )
        assert result["allowed"] is True
        assert result["requires_owner_permission"] is False

    def test_own_relation_is_never_gated(self) -> None:
        result = team_network_permission_gate(
            owner_user_id="user-1", requester_user_id="user-1", owner_permission_granted=False
        )
        assert result["allowed"] is True

    def test_colleague_owned_relation_without_permission_is_blocked_and_proposes_soliciting(self) -> None:
        result = team_network_permission_gate(
            owner_user_id="user-2", requester_user_id="user-1", owner_permission_granted=False
        )
        assert result == {"allowed": False, "requires_owner_permission": True, "propose_soliciting_owner": True}

    def test_colleague_owned_relation_with_permission_granted_is_allowed(self) -> None:
        result = team_network_permission_gate(
            owner_user_id="user-2", requester_user_id="user-1", owner_permission_granted=True
        )
        assert result == {"allowed": True, "requires_owner_permission": True, "propose_soliciting_owner": False}


class TestNoGoGuard:
    """#2313.10 — NO-GO : jamais un message qui laisse croire à une
    recommandation ou une introduction jamais autorisée."""

    def test_message_claiming_an_unauthorized_introduction_is_blocked(self) -> None:
        result = no_go_guard(
            message="Je vous contacte de la part de Marie Martin, qui vous recommande de me recevoir.",
            capability="none",
            referrer_confirmed=False,
            owner_user_id=None,
            requester_user_id="user-1",
            owner_permission_granted=False,
        )
        assert result["allowed"] is False
        assert "introduction" in result["reason"]

    def test_message_that_claims_nothing_and_respects_sequence_is_allowed(self) -> None:
        result = no_go_guard(
            message="Ça fait longtemps ! Comment se passe la nouvelle mission chez eux ?",
            capability="none",
            referrer_confirmed=False,
            owner_user_id=None,
            requester_user_id="user-1",
            owner_permission_granted=False,
        )
        assert result == {"allowed": True, "reason": None}

    def test_message_blocked_when_relation_belongs_to_a_colleague_without_permission(self) -> None:
        result = no_go_guard(
            message="Ça fait longtemps ! Comment se passe la nouvelle mission chez eux ?",
            capability="none",
            referrer_confirmed=False,
            owner_user_id="user-2",
            requester_user_id="user-1",
            owner_permission_granted=False,
        )
        assert result["allowed"] is False
        assert "owner" in result["reason"]

    def test_authorized_introduction_claim_is_allowed(self) -> None:
        result = no_go_guard(
            message="Je vous contacte de la part de Marie Martin, qui vous recommande de me recevoir.",
            capability="introduce",
            referrer_confirmed=True,
            owner_user_id=None,
            requester_user_id="user-1",
            owner_permission_granted=False,
        )
        assert result == {"allowed": True, "reason": None}


class TestDepartedContactReclassification:
    """#2313.9 — CONTACT PARTI : l'exclusion (#2313.8, `contact-eligibility.ts`,
    raison `former_employee`) est DÉFINITIVE — jamais un contact ACTUEL à
    nouveau — mais elle ne doit plus être un cul-de-sac : la personne peut
    encore expliquer l'ancien terrain, ouvrir son nouvel employeur, ou rester
    une relation réseau."""

    def test_three_roles_named(self) -> None:
        assert DEPARTED_CONTACT_ROLES == ("explain_former_terrain", "open_new_employer", "network_relation")
        assert DEPARTED_CONTACT_EXCLUSION_REASON == "former_employee"

    def test_does_not_apply_to_the_other_three_exclusion_reasons(self) -> None:
        # permission_denied, entity_mismatch, homonym_conflict : aucun des
        # trois ne parle d'un DÉPART, rien à reclasser.
        for reason in ("permission_denied", "entity_mismatch", "homonym_conflict"):
            result = departed_contact_reclassification(exclusion_reason=reason, capability="explain")
            assert result == {"applies": False, "roles": [], "current_contact": None}

    def test_exclusion_stays_definitive_never_a_current_contact_again(self) -> None:
        # #2313.8 — même avec une capacité vérifiée, la personne ne redevient
        # JAMAIS le contact ACTUEL du compte.
        result = departed_contact_reclassification(exclusion_reason="former_employee", capability="explain")
        assert result["current_contact"] is False

    def test_unverified_capability_reclassifies_no_role_departing_invents_nothing(self) -> None:
        # Partir ne crée pas, à lui seul, une capacité que rien n'a vérifiée
        # (même doctrine que #2313.3/#2313.4 : jamais supposé).
        result = departed_contact_reclassification(exclusion_reason="former_employee", capability="none")
        assert result == {"applies": True, "roles": [], "current_contact": False}

    def test_verified_capability_opens_the_three_departed_roles(self) -> None:
        result = departed_contact_reclassification(exclusion_reason="former_employee", capability="orient")
        assert result == {
            "applies": True,
            "roles": ["explain_former_terrain", "open_new_employer", "network_relation"],
            "current_contact": False,
        }
