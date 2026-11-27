"""The tutor directory students browse: approved, active tutors, searchable by subject."""

from tests.conftest import UserFactory


async def test_directory_lists_approved_tutors_and_matches_subjects_in_any_case(
    client, make_user: UserFactory, db
) -> None:  # type: ignore[no-untyped-def]
    student = await make_user("student")
    shown = await make_user("tutor")
    await make_user("tutor", tutor_status="pending")
    hidden = await make_user("tutor")
    await db.execute("update profiles set is_active = false where id = $1", hidden.id)

    def ids(r) -> set[str]:  # type: ignore[no-untyped-def]
        assert r.status_code == 200, r.text
        return {t["user_id"] for t in r.json()}

    assert ids(await client.get("/tutors", headers=student.h)) == {str(shown.id)}
    for q in ("Math", "math", " MATH "):
        found = ids(await client.get("/tutors", params={"subject": q}, headers=student.h))
        assert found == {str(shown.id)}, q
    none = await client.get("/tutors", params={"subject": "Chemistry"}, headers=student.h)
    assert ids(none) == set()
    assert (await client.get("/tutors")).status_code == 401
