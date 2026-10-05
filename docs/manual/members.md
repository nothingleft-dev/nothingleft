# Members

Everyone in an organisation is a member with one handle there, `@alex.lee`, and
an organisation role: **Org Admin** or **Member**. What they can do inside a project
comes from their project role. The member list is under **Organisation →
Members**; everyone can read it, and only Org Admins and the owner change it.

## Removing someone from the organisation

Org Admins and the owner remove a member from the ⋯ menu on their row, with
**Remove from organisation**. The owner cannot be removed: transfer ownership
first.

Removing someone takes away their access to this organisation. It never
touches their account: they can still sign in, and any other organisations
they belong to are unaffected. Their name and avatar stay on everything they
did here, marked _Former member_, and their handle stays reserved, so adding
them back later restores the same `@handle`.

The dialog shows exactly what the removal changes, with real counts:

| Row                      | What happens                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Open issues assigned     | **Reassign** them to someone you pick on the line below, or **Leave unassigned**. Only issues that are not resolved move |
| Resolved issues assigned | Unchanged. Finished work keeps the person who did it                                                                     |
| Issues created           | Unchanged. Who filed an issue is history, not a pointer                                                                  |
| Comments                 | Unchanged                                                                                                                |
| Time logged              | Unchanged, in the organisation's `1w 1d 1h` format                                                                       |
| Saved views              | **Delete**, or **Transfer** them to someone you pick on the line below. One choice covers private and shared views       |
| Active sessions          | Access revoked: their sessions can no longer reach this organisation                                                     |
| Access tokens            | Access revoked. Tokens limited to this organisation's projects are revoked outright                                      |

**Reassign** offers only the people who can be assigned in every project that
holds one of the open issues. If nobody qualifies, the dialog says so and
**Leave unassigned** is the only choice; assign them afterwards. When an issue has several assignees,
the removed person is replaced by the one you chose, or simply taken off.

Each reassigned issue gets an ordinary entry in its history, under the name of
the admin who removed the member:

```
Alex Lee updated 3 minutes ago
    Assignees   Riley Quinn → Casey Kim
```

A transferred view keeps its query and who can see it. If the new owner can
already see a view with that name, the transferred one gets a number:
`Assigned to me 2`.

Issues in the trash keep their assignee. Restoring one shows the former member
on it, and you can reassign it then.

The member no longer counts toward the organisation's seats as soon as the
removal is saved.

### Over the API

`GET /v1/organizations/{slug}/members/{username}/removal` returns the counts
the dialog shows and `reassign_candidates`. The removal itself is
`DELETE /v1/organizations/{slug}/members/{username}`, with the choices as query
parameters:

```
DELETE /v1/organizations/acme/members/riley.quinn?reassign_to=casey.kim
```

Leave out `reassign_to` to leave the open issues unassigned, and
`transfer_views_to` to delete the saved views — so the request above hands the
open issues to Casey Kim and deletes the views.
