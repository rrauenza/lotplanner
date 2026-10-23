---
status: accepted
---

# A file is legible JSON, not an encoded link

A Layout or a Vehicle Collection can leave the browser two ways: as a shared link (ADR 0009) or as a
file. Both carry the same Artifact, and both carry it with the same version field and the same
migration discipline — but they are spelled differently on purpose.

A link deflates the artifact with `deflate-raw` and base64urls the bytes, because a link has to fit a
URL fragment, and every character it does not spend is a character of the sender's message it does not
eat. **A file has no such budget.** So a file is plain, indented JSON: an envelope of
`{ "format": "lotplanner", "name": …, "artifact": [ … ] }`, where the body is exactly the artifact a
link would carry. A person can open it, read that it is a lotplanner layout called "Option A", and
`jq` it — which is worth more than the third of its size that compressing it would save, because the
reason to keep a file is to keep hold of work, and work nobody can read is harder to trust.

**The body is the codec's own tuple shape, not a second, prettier one.** A file could have been spelled
as an object with named fields, and it would read better still — but it would be a second shape
claiming the same version number, and the day the two disagreed about what "version 1" means is the day
one of them misreads the other. Every artifact carries one version field, one migration chain and one
reader; ADR 0009 rejects two counters for one envelope for exactly this reason, and a second spelling
would be the same mistake wearing different clothes. So the file takes the codec's body whole, through
`decodeArtifactFields`, and buys its legibility where it is free: a named envelope, an indented
document, and a filename a person can read.

The envelope carries one thing a link cannot: the **name** of a Layout. A link carries the arrangement
without a name (ADR 0008), because a name belongs to saved work and a link is a budget of characters.
A file has room, and a Layout imported from a file is meant to be kept, so it arrives under the name it
left with.

## Considered options

- **Compress a file the way a link does.** Rejected: the compression exists for the fragment's budget,
  and a file pays for it in the one currency a file is for — being readable. The size it saves buys
  nothing.
- **A named object for the body (`siteId`, `origin`, `placements`…).** Rejected: a second spelling of
  the same version needs a second migration chain, and two chains can disagree about what a version
  means. Legibility is not worth a shape that can drift from the one a link uses.
- **The version in the envelope as well as the body.** Rejected: two numbers for one artifact is the
  thing ADR 0009 refuses. The envelope has no counter; if a later app adds an envelope field, an
  earlier one ignores it.
- **A zip or another binary container.** Rejected: there is nothing to compress for, and every extra
  layer is one more thing between a person and their work.
- **Refusing a Collection by file, as a link is refused.** Rejected: a link opens passively and must
  never change what the recipient has (issue #13); a file is chosen deliberately, so a Collection file
  is kept — forked, never overwriting (issue #11).

## Consequences

- A file is offered as `<name>.lotplanner.json`: plainly JSON, plainly ours. A name that leaves nothing
  behind still names a file.
- An imported Layout is **added** as a named Layout for its Site — name de-collided, existing work
  untouched byte for byte — through `withImported`. A Layout from a link is shown but not kept, because
  opening a link is not an act of keeping.
- An imported Collection is forked through `received`, so it can never overwrite or merge into one
  already here.
- A corrupt, unrecognised or too-new file is a plain sentence and no change to anything stored. The
  refusals are the codec's; only the wording is the file's.
- Reading a file is `importedFrom` in `arrival.ts`, the file's half of the one front door: a Layout
  is a Layout whichever way it arrived, and opens without the manifest having heard of its Site.
