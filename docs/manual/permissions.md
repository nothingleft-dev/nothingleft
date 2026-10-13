# Roles and permissions

Nothing Left has five roles, and they are fixed. There is no screen for making a role or
changing what one may do. The app, the API and an AI agent all check the same rules, so
what you can do is the same wherever you do it.

## How roles work

You hold two kinds of role, and they are independent of each other.

- **An organisation role.** Everyone in an organisation is a **Member** or an **Org Admin**.
  One person is the **Org Owner**.
- **A project role** in each project you belong to: **Observer**, **Contributor** or
  **Project Admin**.

| Role              | Applies to   | In one line                                                                                                |
| ----------------- | ------------ | ---------------------------------------------------------------------------------------------------------- |
| **Org Owner**     | Organisation | Everything an Org Admin can do, plus handing over ownership and deleting the organisation. Exactly one     |
| **Org Admin**     | Organisation | Runs the organisation: members, settings, storage, the audit log and export. Creates and deletes projects  |
| **Project Admin** | One project  | Runs a project: its settings, lists, custom fields, members, sprints and boards. Moves and deletes issues  |
| **Contributor**   | One project  | Does the work: creates and edits issues, comments, logs time, attaches files and writes articles           |
| **Observer**      | One project  | Reads the project, its issues and published articles. Can star, watch and vote, but changes nothing shared |

**An Org Admin counts as a Project Admin in every project of the organisation**, whatever
project role they hold there. An Org Admin can be a plain Contributor on a project for
day-to-day work and still act as its admin when they need to.

Org Admins and the Org Owner change organisation roles and remove people from the
organisation ([Members](./members.md)). A Project Admin adds people to their project and
changes their project roles. The Org Owner hands over ownership from **Organisation → Danger
zone** ([Account security](./account-security.md#transferring-ownership)).

## What each role can do

Each table reads left to right: every role can do everything the role to its left can.

| Mark | Means                                                     |
| ---- | --------------------------------------------------------- |
| ✅   | Allowed                                                   |
| Own  | Allowed on your own records only; each section says which |
| ❌   | Not allowed                                               |

Something you cannot read is treated as if it does not exist: you get _not found_, never
_forbidden_. That way nobody learns that an issue exists in a project they have no access to.

### Organisation

A member's project roles make no difference here: only Org Admins and the Org Owner manage
the organisation.

| Capability                          | Observer | Contributor | Project Admin | Org Admin | Org Owner |
| ----------------------------------- | :------: | :---------: | :-----------: | :-------: | :-------: |
| Read the organisation               |    ✅    |     ✅      |      ✅       |    ✅     |    ✅     |
| Change organisation settings        |    ❌    |     ❌      |      ❌       |    ✅     |    ✅     |
| See the member list                 |    ✅    |     ✅      |      ✅       |    ✅     |    ✅     |
| Invite people to the organisation   |    ❌    |     ❌      |      ❌       |    ✅     |    ✅     |
| Create or revoke org share links    |    ❌    |     ❌      |      ❌       |    ✅     |    ✅     |
| Change a member's organisation role |    ❌    |     ❌      |      ❌       |    ✅     |    ✅     |
| Remove a member                     |    ❌    |     ❌      |      ❌       |    ✅     |    ✅     |
| See storage use, file by file       |    ❌    |     ❌      |      ❌       |    ✅     |    ✅     |
| Connect your own storage bucket     |    ❌    |     ❌      |      ❌       |    ✅     |    ✅     |
| Read the organisation's audit log   |    ❌    |     ❌      |      ❌       |    ✅     |    ✅     |
| Export the organisation's data      |    ❌    |     ❌      |      ❌       |    ✅     |    ✅     |
| Transfer ownership                  |    ❌    |     ❌      |      ❌       |    ❌     |    ✅     |
| Delete the organisation             |    ❌    |     ❌      |      ❌       |    ❌     |    ✅     |

- Creating a new organisation needs only an account.
- Every member sees the storage meter. The storage screen, with every file by size, is for
  Org Admins and the Org Owner. Deleting a file from it follows the Attachments rules below
  ([Storage](./storage.md)).

### Projects

| Capability                                     | Observer | Contributor | Project Admin | Org Admin | Org Owner |
| ---------------------------------------------- | :------: | :---------: | :-----------: | :-------: | :-------: |
| Read the project                               |    ✅    |     ✅      |      ✅       |    ✅     |    ✅     |
| Create a project                               |    ❌    |     ❌      |      ❌       |    ✅     |    ✅     |
| Change name, description, lead and avatar      |    ❌    |     ❌      |      ✅       |    ✅     |    ✅     |
| Manage statuses, priorities, types, work types |    ❌    |     ❌      |      ✅       |    ✅     |    ✅     |
| Manage custom fields                           |    ❌    |     ❌      |      ✅       |    ✅     |    ✅     |
| Manage project members and their roles         |    ❌    |     ❌      |      ✅       |    ✅     |    ✅     |
| Create or revoke project share links           |    ❌    |     ❌      |      ✅       |    ✅     |    ✅     |
| Manage sprints and boards                      |    ❌    |     ❌      |      ✅       |    ✅     |    ✅     |
| Archive the project                            |    ❌    |     ❌      |      ✅       |    ✅     |    ✅     |
| Delete the project                             |    ❌    |     ❌      |      ❌       |    ✅     |    ✅     |

- **Managing sprints and boards** is creating, renaming, starting, finishing and deleting
  sprints, and creating, changing and deleting boards. **Planning is an issue edit**: putting
  an issue into a sprint or the backlog, and reordering the backlog, is for Contributors and
  up ([Sprints and boards](./agile.md)).
- **Managing custom fields** is creating, changing, archiving and deleting fields and their
  options. **Setting a field's value on an issue is an issue edit**, for Contributors and up
  ([Custom fields](./custom-fields.md)).
- Turning time tracking on or off, and choosing which field holds the estimate or the time
  spent, are project settings.
- An archived project is read-only. Its issues can still be read, starred, watched and voted
  on ([Issues](./issues.md#archived-projects)).

### Issues

| Capability                       | Observer | Contributor | Project Admin | Org Admin | Org Owner |
| -------------------------------- | :------: | :---------: | :-----------: | :-------: | :-------: |
| Read an issue                    |    ✅    |     ✅      |      ✅       |    ✅     |    ✅     |
| Create an issue                  |    ❌    |     ✅      |      ✅       |    ✅     |    ✅     |
| Change an issue's fields         |    ❌    |     ✅      |      ✅       |    ✅     |    ✅     |
| Change status                    |    ❌    |     ✅      |      ✅       |    ✅     |    ✅     |
| Assign and unassign              |    ❌    |     ✅      |      ✅       |    ✅     |    ✅     |
| Link and unlink issues           |    ❌    |     ✅      |      ✅       |    ✅     |    ✅     |
| Set a parent or subtask          |    ❌    |     ✅      |      ✅       |    ✅     |    ✅     |
| Change many issues at once       |    ❌    |     ✅      |      ✅       |    ✅     |    ✅     |
| Import issues from a CSV file    |    ❌    |     ❌      |      ✅       |    ✅     |    ✅     |
| Move an issue to another project |    ❌    |     ❌      |      ✅       |    ✅     |    ✅     |
| Delete an issue                  |    ❌    |     ❌      |      ✅       |    ✅     |    ✅     |
| Star, watch, vote                |    ✅    |     ✅      |      ✅       |    ✅     |    ✅     |
| See watchers and voters          |    ✅    |     ✅      |      ✅       |    ✅     |    ✅     |
| Add or remove other watchers     |    ❌    |     ✅      |      ✅       |    ✅     |    ✅     |

- Star, watch and vote are personal and change nothing anyone else works with, so Observers
  have them. Everything that changes an issue is closed to Observers.
- A link is checked on the issue you link from. The other issue only has to be one you can
  read, and it may be in another project.
- Ticking a checkbox in an issue's description is a change to its fields.

### Comments

| Capability         | Observer | Contributor | Project Admin | Org Admin | Org Owner |
| ------------------ | :------: | :---------: | :-----------: | :-------: | :-------: |
| Read comments      |    ✅    |     ✅      |      ✅       |    ✅     |    ✅     |
| Comment            |    ❌    |     ✅      |      ✅       |    ✅     |    ✅     |
| Edit a comment     |    ❌    |     Own     |      ✅       |    ✅     |    ✅     |
| Delete a comment   |    ❌    |     Own     |      ✅       |    ✅     |    ✅     |
| React to a comment |    ❌    |     ✅      |      ✅       |    ✅     |    ✅     |

- **Own** is a comment you wrote.
- Whoever can see an issue sees all of its comments.
- Ticking a checkbox in a comment is an edit of that comment, so a Contributor ticks boxes
  only in their own comments.

### Attachments

| Capability      | Observer | Contributor | Project Admin | Org Admin | Org Owner |
| --------------- | :------: | :---------: | :-----------: | :-------: | :-------: |
| Download a file |    ✅    |     ✅      |      ✅       |    ✅     |    ✅     |
| Upload a file   |    ❌    |     ✅      |      ✅       |    ✅     |    ✅     |
| Delete a file   |    ❌    |     Own     |      ✅       |    ✅     |    ✅     |

- **Own** is a file you uploaded.
- Anyone who can read the issue can download its files. Access is checked on every
  download, so someone who loses access to the project loses the files at once.
- Uploading to a comment or to logged time also needs the right to edit it, and for logged
  time, time tracking turned on. Nobody uploads to an archived project.
- A file uploaded before its issue or comment is saved belongs to you alone until it is.
- Files are never edited. Replacing one is a delete and an upload.

### Time tracking

| Capability                | Observer | Contributor | Project Admin | Org Admin | Org Owner |
| ------------------------- | :------: | :---------: | :-----------: | :-------: | :-------: |
| See logged time           |    ✅    |     ✅      |      ✅       |    ✅     |    ✅     |
| Log your own time         |    ❌    |     ✅      |      ✅       |    ✅     |    ✅     |
| Log time for someone else |    ❌    |     ❌      |      ✅       |    ✅     |    ✅     |
| Edit logged time          |    ❌    |     Own     |      ✅       |    ✅     |    ✅     |
| Delete logged time        |    ❌    |     Own     |      ✅       |    ✅     |    ✅     |

- **Own** is time logged _for_ you, whoever recorded it. Time a Project Admin logs on your
  behalf is yours to edit and delete.
- Time can be logged for anyone who could log their own time in the project - never an
  Observer. Only a Project Admin and up can change whose time a record is.
- With time tracking off, or the project archived, nobody logs, edits or deletes time.
  Logged time can still be read.

### Tags

| Capability                    | Observer | Contributor | Project Admin | Org Admin | Org Owner |
| ----------------------------- | :------: | :---------: | :-----------: | :-------: | :-------: |
| Add and remove tags on issues |    ❌    |     ✅      |      ✅       |    ✅     |    ✅     |
| Create a new tag              |    ❌    |     ✅      |      ✅       |    ✅     |    ✅     |
| Rename or recolour a tag      |    ❌    |     ❌      |      ✅       |    ✅     |    ✅     |
| Merge or delete a tag         |    ❌    |     ❌      |      ❌       |    ✅     |    ✅     |

Tags belong to the whole organisation and are shared by issues and articles. A Project Admin
of any project may rename or recolour one. Merging or deleting one changes every project, so
it is for Org Admins ([Tags](./tags.md)). Creating a tag is open to
Contributors, so an agent can tag freely; `Needs Review` and `needs-review` are the same tag,
so this does not breed near-duplicates.

### Knowledge base

| Capability                        | Observer | Contributor | Project Admin | Org Admin | Org Owner |
| --------------------------------- | :------: | :---------: | :-----------: | :-------: | :-------: |
| Read published articles           |    ✅    |     ✅      |      ✅       |    ✅     |    ✅     |
| Read drafts                       |    ❌    |     Own     |      ✅       |    ✅     |    ✅     |
| Create an article                 |    ❌    |     ✅      |      ✅       |    ✅     |    ✅     |
| Edit an article                   |    ❌    |     ✅      |      ✅       |    ✅     |    ✅     |
| Publish or unpublish an article   |    ❌    |     ✅      |      ✅       |    ✅     |    ✅     |
| Reorder or move articles          |    ❌    |     ✅      |      ✅       |    ✅     |    ✅     |
| Delete an article                 |    ❌    |     Own     |      ✅       |    ✅     |    ✅     |
| Comment on an article             |    ❌    |     ✅      |      ✅       |    ✅     |    ✅     |
| Add and remove tags on an article |    ❌    |     ✅      |      ✅       |    ✅     |    ✅     |
| Star or watch an article          |    ✅    |     ✅      |      ✅       |    ✅     |    ✅     |

- **Own** is an article you created.
- The knowledge base is private to the project's members. There is no public or anonymous
  access.
- Someone else's draft is invisible to a Contributor, not refused. An author who becomes an
  Observer no longer sees their own drafts.
- A Contributor can delete an article together with the articles under it only when every
  one of them is their own ([Knowledge base](./knowledge-base.md#deleting-and-restoring)).
- Comments on an article follow the Comments rules; its files follow the Attachments rules.

### Saved views and reports

| Capability                                | Observer | Contributor | Project Admin | Org Admin | Org Owner |
| ----------------------------------------- | :------: | :---------: | :-----------: | :-------: | :-------: |
| Search                                    |    ✅    |     ✅      |      ✅       |    ✅     |    ✅     |
| Save a private view                       |    ✅    |     ✅      |      ✅       |    ✅     |    ✅     |
| Save a view for a project or organisation |    ❌    |     ✅      |      ✅       |    ✅     |    ✅     |
| Change or delete a shared view            |    ❌    |     Own     |      ✅       |    ✅     |    ✅     |
| See reports                               |    ✅    |     ✅      |      ✅       |    ✅     |    ✅     |
| Export a report to CSV                    |    ✅    |     ✅      |      ✅       |    ✅     |    ✅     |

- **Own** is a view you created. A private view is seen and changed by you alone.
- A project view is checked in its project: its Project Admin can change anyone's. An
  organisation view needs you to be a Contributor in at least one project, and only its
  creator, an Org Admin or the Org Owner can change it ([Search](./search.md#saved-searches)).
- Changing who can see a view, or which project it belongs to, is checked as if you were
  creating it.
- A report never shows an issue you could not open yourself: it is limited to what you can
  read before anything is counted ([Reports](./reports.md)).

### Your own account

Whatever your roles, you can:

- change your name, avatar, timezone and your username in each organisation;
- change your password and email address;
- turn two-factor authentication on or off, and create new recovery codes;
- create, see and revoke your access tokens;
- see and sign out your signed-in devices;
- choose your notification settings, and read and mark your notifications;
- deactivate your account;
- accept or decline ownership of an organisation offered to you.

The Org Owner cannot deactivate their account while their organisation still exists. Erasing
an account is not self-service: you, or an Org Admin on your behalf, email admin@nothingleft.dev
([Account security](./account-security.md)).

## Agents and tokens

An AI agent connected with your access token acts **as you**
([Connecting an AI agent](./mcp.md)). It has your roles, and everything it changes appears
under your name.

- **A token never does more than you can do now.** Your roles are checked on every request,
  so losing access to a project limits every token you hold straight away.
- **Scopes narrow, never widen.** A token with only `issues:read` cannot change anything,
  even if you are the Org Owner.
- **A missing scope is named.** When your role allows something and only the token's scopes
  refuse it, the answer says which scope is missing. When your role does not allow it, the
  answer is a plain refusal.
- **Some things need the browser.** Two-factor authentication, deactivating your account,
  creating and revoking tokens, signing devices out, transferring ownership, deleting the
  organisation and connecting your own storage bucket are refused to any token. A token can
  still list your tokens and devices.

## Deliberately not implemented

These are left out on purpose, not waiting to be built.

| Not built                            | Why                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| Custom roles and permission schemes  | Five fixed roles. Configurable permissions are what makes a tracker heavy                   |
| Comments visible to only some people | Whoever can see an issue sees all of its comments                                           |
| Private fields                       | There is no private field. Whoever can see an issue sees every field on it                  |
| Changes made silently                | There is no command syntax, and a change nobody can see would undermine the issue's history |
| An admin console for user accounts   | Accounts are self-service. Anything else is done by hand by the people who run the service  |
