"""Fields people read must say something: text of only spaces is refused, not stored."""

from tests.conftest import Flow

TASK = {
    "subject": "Math",
    "title": "Help me understand derivatives",
    "description": "Chain rule practice",
    "budget_cents": 2000,
    "honor_code_ack": True,
}


async def test_a_request_needs_a_real_subject_title_and_description(flow: Flow) -> None:
    for field in ("subject", "title", "description"):
        r = await flow.client.post("/tasks", headers=flow.student.h, json={**TASK, field: "     "})
        assert r.status_code == 422, field
    r = await flow.client.post(
        "/tasks", headers=flow.student.h, json={**TASK, "title": "  Derivatives help  "}
    )
    assert r.status_code == 201 and r.json()["title"] == "Derivatives help"


async def test_delivery_notes_and_dispute_reasons_must_say_something(flow: Flow) -> None:
    await flow.to("paid")
    r = await flow.client.post(
        f"/tasks/{flow.task_id}/deliver", headers=flow.tutor.h, json={"note": "   "}
    )
    assert r.status_code == 422
    r = await flow.client.post(
        f"/tasks/{flow.task_id}/disputes", headers=flow.student.h, json={"reason": "      "}
    )
    assert r.status_code == 422


async def test_tutor_subjects_are_trimmed_unique_and_not_blank(flow: Flow) -> None:
    app = {"bio": "", "levels": ["college"], "hourly_rate_cents": 3000}
    r = await flow.client.put(
        "/tutors/me/application", headers=flow.tutor.h, json={**app, "subjects": ["Math", "  "]}
    )
    assert r.status_code == 422
    r = await flow.client.put(
        "/tutors/me/application",
        headers=flow.tutor.h,
        json={**app, "subjects": [" Math ", "math", "Physics"]},
    )
    assert r.status_code == 200 and r.json()["subjects"] == ["Math", "Physics"]
