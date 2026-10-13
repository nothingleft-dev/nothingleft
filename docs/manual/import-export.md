# Import and export

Bring existing work in from a spreadsheet, and take everything out in one download.

## Importing issues from a CSV file

Any tool that can save a spreadsheet as CSV can be imported from. There is no importer tied to
another tracker: export from it to CSV, or point an agent at both (see
[Connecting an AI agent](./mcp.md)).

The file must be:

- **CSV, saved as UTF-8**, with a header row. Commas or semicolons both work.
- **At most 10,000 rows and 100 MB.** Split a larger file and import it in parts.

Importing needs a Project Admin of the project the issues go into. Every issue is created as
you, as if you had written it: it is yours in its history, and you are not added as a watcher
of each one. Nobody is notified about imported issues.

Open the project's issue list and choose **Import issues from CSV**, the upload arrow beside the
export button. A new project with no issues offers **Import from CSV** on its first screen too.
Both open the project's **Import issues** page. Choose **Choose file**, or drop the file onto the
page. It is uploaded and read straight away; a file that is too large, not UTF-8 or longer than
10,000 rows is refused there with the reason, and nothing is created.

### 1. Map the columns

Each column of the file is a line on the screen, with its first few values beside it and an
**Imports as** picker. Pick the field the column fills; a column left on **Don't import** is
ignored. Columns named like a field are matched for you - *Summary* to **Title**, *State* to
**Status**, *Labels* to **Tags**, a column named after a custom field to that field. A field
takes one column, so choosing it for a second column moves it there. **Title** is required.

| Field | What a cell holds |
|---|---|
| Title | Required. The issue's title |
| Description | Markdown, kept as written, line breaks included |
| Status, Priority, Type | The name of one the project has. An empty cell takes the project's default |
| Assignees | `@alex`, `alex` or `alex@acme.example`; several separated by commas |
| Estimate | `1w 2d 3h 30m`, by your organisation's working day and week |
| Story points | A whole number |
| Start date, Due date | `2026-10-20` |
| Tags | Names separated by commas; a new name creates the tag |
| Sprint | The name of a sprint that is planned or running |
| Parent | An existing issue's key, such as `ACME-12` |
| A custom field | As you would type it into the field; several options separated by commas |

Values are not invented: a status, priority, type or sprint the project does not have makes
that row fail rather than adding a new one. Add it to the project first, or change the file.

### 2. Do a dry run

Choose **Dry run**. It checks every row exactly as creating the issue would, and creates
nothing. It shows the rows in the file, how many would become issues and how many would fail,
and for each row that would fail, the row number as your spreadsheet shows it (the header is
row 1), the column, the reason, and the values that would have worked:

> Row 7 · Status · Unknown status "Doing" for project ACME. - Open, In Progress, Fixed…

Values the project lacks are also summed up under **Values the project does not have** -
*Status "Doing" · 42 rows* - with a link to the project's statuses, priorities or types, so one
fix to the project, or one find-and-replace in the file, clears them all. Run it as often as you
like; changing a column's field sets the dry run aside until you run it again.

### 3. Import

After a dry run, **Import 172 issues** (with the number the dry run found) starts the import.
The issues are created in the background, and the page shows how many rows are done; you can
leave it. Rows that fail are skipped and listed with the reason, the rest are created, and the
page says how many of each when it is done, with **Open the issues** and the failed rows. To
bring in the skipped rows, fix them in the file and import just those rows.

**Recent imports**, under the import, lists the latest imports into the project by anyone:
the file, its state, the rows, how many issues were created and how many rows failed, who
imported it and when. Choose one to open it in place - how far it has got while it runs, the
failed rows once it is done, or why it stopped.

The uploaded file is deleted when the import finishes. One that is uploaded but never
started shows **Not started**, with **Map the columns** to carry on, and is deleted after a
day.

## Exporting the whole organisation

An Org Admin or the Owner can export everything in the organisation as one `.zip` file:

- every project, with its statuses, priorities, types, custom fields, sprints and boards
- every issue, with its history, comments, time entries, links and tags
- every knowledge base article
- every attached file, wherever it is stored - including your own bucket
- the members, the shared saved views and the organisation's audit log

Issues come both as they appear in the API (`issues.json`, with keys and names) and, with
everything else, as the tables they are stored in (`tables/`). `manifest.json` counts what is
in the file, and names any attached file that could not be included - one deleted from
storage, or in your own bucket while it was not answering.

Not in the export: anything in the trash, private saved views, notifications, personal
settings, and secrets such as passwords, access tokens and storage keys.

Choose **Export organisation** in **Organisation → Exports**. The export is built in the
background. You get an email when it is ready, with a link back to that tab; the download itself
needs you to be signed in. It can be downloaded there for **7 days**, by any Org Admin or the
Owner, and is then deleted. One export runs at a time: asking again while one is being built
shows that one. Each request is written to the audit log.

The tab lists recent exports with their state (*Queued*, *Building*, *Ready*, *Failed* or
*Expired*), who asked and when, the size, how many files went in, and the date it can be
downloaded until. **Download** sits on each ready one. A file count followed by *3 missing*
means three attached files could not be included; `manifest.json` names them.

## Asking an agent

*"Import backlog.csv into ACME"* - the agent uses `start_csv_import`, shows you the suggested
mapping and the dry run, and imports only when you say so; `get_import_status` follows it.
*"Export our organisation"* is `request_org_export`; `get_export_status` gives a download link
once it is ready. Importing needs a token with **admin:project**, exporting **admin:org**. See
[Connecting an AI agent](./mcp.md).
