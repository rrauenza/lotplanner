---
status: accepted
---

# One fragment grammar carries both hidden arrivals

Two things now reach the app by URL fragment: the hidden creator mode (ADR 0006) and a shared artifact
(ADR 0009). They share one grammar, read in one place, so they cannot collide:

    #create              the creator, adding a Site
    #create/<site-id>    the creator, correcting a Site
    #layout/<payload>    a shared Layout, as the codec and link spell it
    #collection/<payload> a shared Collection, the same way

The first word after the `#` is the route and decides everything. A word this app does not recognise
means **nothing at all** — the visitor's page — which is what a mistyped or foreign fragment lands on.
That is deliberate: the one accident worth preventing is a visitor arriving in the creator, and the only
way in is the exact word `create`, typed or pasted. A `layout` or `collection` payload can never be read
as a route word, because it always sits on the far side of a slash, and an unpadded-base64url payload
never contains one.

The creator's own reading of `#create` and `#create/<site-id>` is delegated to, not restated: the grammar
asks the creator's parser first. Two parsers that each decide what `create` means would be two things to
keep in step, and the day they disagree is the day a visitor lands somewhere they did not ask for.

## Considered options

- **A query string, `?layout=…`.** Rejected for the creator already and for the same reasons here: a
  query is sent to the server, so it needs a server route or a rewrite on GitHub Pages, and it would
  appear in logs and referrers rather than staying between the two people sharing.
- **A path segment, `/share/<payload>`.** Rejected: it needs the same server rewrite a query does, and
  the payload would be a URL path, which has more escaping rules than a fragment's base64url.
- **One route word for both artifacts, with the kind inside the payload.** Rejected: the route would no
  longer say what is being opened, and the creator would have to share its word with a payload that
  arrives from strangers.
- **Recognising a shared link by the payload's shape rather than a word.** Rejected outright: a visitor
  must never open the creator by accident, and "this looks like a payload" is exactly the guess that
  would let a crafted fragment become one.

## Consequences

- The grammar is a pure function of the fragment, tested in `src/core/route.test.ts`, and the glue that
  turns a fragment into what a page load _is_ — visitor, creator, a shared Layout, or a polite refusal —
  is `src/core/arrival.ts`, tested beside it.
- A link made with a newer version of the app opens, decodes, and is refused with a sentence rather than
  silently misread (ADR 0009).
- A Collection link decodes but has nowhere to land yet; it says so, and issue #14 gives Collections
  their file and their opening screen.
