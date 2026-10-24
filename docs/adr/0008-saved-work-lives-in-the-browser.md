---
status: accepted
---

# Saved work lives in the browser, one record per Site

Work is saved automatically as it is edited, and a Site holds several named Layouts, so options for
the same place can sit side by side and a layout is not lost to a phone call. There is no account
and no server, so the only place it can be kept is the browser.

A Site's named Layouts are held in **one localStorage record per Site**, in the order they were
worked on, most recent first. Layouts go to localStorage and the aerial photograph goes to IndexedDB
(ADR 0001), which is the same decision made twice with the same reasoning: the picture is megabytes
and the work is kilobytes. Storage is reached only through an injectable port, so the rules — naming,
ordering, what happens when storage refuses — are tested in the core against a trivial fake, and the
adapter that talks to a browser is exercised only end to end.

**A Layout is the arrangement; a name and an identity belong to the saved work.** A Layout is the
same piece of ground whether it is called "Option A" or nothing at all, so the name lives beside it
rather than inside it, and a shared link carries the arrangement without a name (issue #13).

**The view of a Layout is not the Layout.** The map's viewport, the opacity the placed vehicles
are drawn at, and the lock that freezes them are ways of looking at the ground rather than
arrangements on it, so none of them is written down here, and opening a Layout again begins at the
same view a first visit would. The one exception is opening, in the same session, a Layout whose
frame is the same as the open one's: the ground has not changed, so the view is left where it is
rather than fitted again, which would move the picture out from under a comparison of two options
for one place. A reload still begins at the frame, because the viewport is still not saved.

Failure is never fatal. If storage will not be read, or will not be written, the app keeps the work
in memory, says plainly that nothing will be saved, and carries on: a working tool with no memory
rather than a broken one. What storage gives back is not trusted either — a record can be from an
older version of this app, half-written, or put there by hand, so anything unreadable is dropped and
the rest is used.

**Nothing is dropped to make room.** There is no cap on how many Layouts a Site may hold: the
browser's own quota is the limit, and a spent quota is reported the way any other refusal is, rather
than paid for with somebody's oldest work. Deleting a Layout is the one destructive thing here, it
cannot be undone, and so it asks first.

**What is in memory is written at the last moment there is** — when the edits stop arriving, and
again when the page is hidden or thrown away — because the phone call this is all for can arrive in
the moment after an edit. Each edit carries the Site it belongs to rather than reading it back when
the write happens, so editing one place and choosing another cannot write one place's work under the
other's name.

## Considered options

- **IndexedDB for the work as well as the picture.** One store, one mechanism, and room to spare.
  Rejected because reading a Site's work would then be asynchronous through a database, for a few
  kilobytes, before anything can be shown; and because the work wants the simplest thing that
  survives a reload, which is a string under a key.
- **One record per Layout, plus a record holding the order.** Closer to how the list is used, and
  cheaper to write one Layout at a time. Rejected because the order _is_ part of the work — it is
  what "open where I left off" means — and two records can disagree about it.
- **A timestamp on each Layout and sorting by it.** The obvious way to say "most recent". Rejected
  because the core has no clock and no randomness, and because keeping the list in working order
  says the same thing without one.
- **Refusing to start, or failing silently, when storage is unavailable.** Rejected: silently losing
  someone's afternoon is the worst outcome available, and refusing to start over a cache is the
  second worst. The spec asks for neither.
- **Versioning the stored record, deferred at first.** Now done: the record is
  `{ version, layouts }`, and a bare list found in the wild is read as version 0 so that work already
  in a browser survives. The earlier argument — that a reader which validates what it finds and drops
  what it cannot read protects the same thing — was wrong in one respect. Validation drops what it
  cannot recognise, so a future shape change would discard somebody's work rather than migrate it, and
  an unversioned record cannot be told apart from corruption. That is the same reason ADR 0009 gives
  for versioning anything that travels, and work at rest is no different.

## Consequences

- Losing storage costs the work its future, not its present: the list, the naming and the editing
  all keep working for as long as the tab is open.
- The stored record carries a version field, and the Layouts inside a record written before it did
  are read as version 0. A record from a newer app is dropped rather than guessed at, which keeps the
  app open rather than misreading somebody's work.
- The list is held in the session and written behind, rather than read back on every change, so the
  interface never waits on storage to show what someone has just placed.
- Work is keyed by Site, so a Site carries its own Layouts and nothing is shown against a place it
  was not made for.
- The adapters stay deliberately untested, and the rules they feed are covered instead.
