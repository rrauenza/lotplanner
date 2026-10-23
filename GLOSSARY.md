# Lotplanner

Reviewing whether vehicles fit a real place, by laying out scaled vehicle footprints over satellite imagery of that place.

## Language

**Site**:
The real-world place a Layout applies to — any space vehicles are placed in, marked or not.
_Avoid_: location, lot, parking lot

**Site Frame**:
The oriented rectangle marking a Site's working area and defining the axes its Placements snap to. A guide only — it never confines a Placement.
_Avoid_: boundary, grid, bounding box

**Fetch Area**:
The ground a Site's picture is fetched for — its Site Frame plus the context margin, a default square when it has no frame, and, while a new Site is still being found, a provisional square sized to the imagery service's pixel cap.
_Avoid_: working area, working frame, bounding box

**Candidate**:
A place the address search offered, before it becomes a Site — what to call it, where it is, and usually its full address. The creator confirms one and draws the Site Frame over it.
_Avoid_: place, result, match

**Creator mode**:
The hidden flow that adds a Site to the manifest. It is reached only by the `#create` fragment, and is hidden rather than secret: a static app has nothing to check a key against, so it relies on no visitor being told the address.
_Avoid_: admin, back office

**Vehicle**:
A named vehicle type with a width, a length and a colour. A single Vehicle may describe a combination, such as a pickup towing a trailer.
_Avoid_: car, unit, asset

**Vehicle Collection**:
A named, editable set of Vehicles. Collections are local to a browser and can be shared in their own right.
_Avoid_: palette (that name belongs to the UI panel that presents a collection), library, catalog

**System Collection**:
The one Vehicle Collection that ships with the app. It is always present and cannot be edited or deleted.
_Avoid_: default collection, built-in collection

**Placement**:
A single instance of a Vehicle laid out on the map. One Vehicle may have many Placements.
_Avoid_: instance, marker, pin

**Overlap**:
Two or more Placements covering some of the same ground. A shared edge is not an overlap: vehicles parked abreast or nose to tail fit, and only ground held in common counts.
_Avoid_: collision, clash, conflict, intersection

**Layout**:
The arrangement of Placements at a Site, carrying its own copies of the Vehicles it uses. A Site keeps several of them as its saved work, and the name belongs to the saved work rather than to the arrangement.
_Avoid_: plan, drawing

**Saved work**:
The named Layouts a Site keeps between visits, most recently worked on first. It lives in the browser, and it belongs to that person alone.
_Avoid_: document, file, project

**Editor**:
A Layout together with the edits behind it and ahead of it — what an undo would reverse and what a redo would re-apply. It is memory, so it lasts for the session and no longer.
_Avoid_: history, state, session, document

**Artifact**:
A whole Layout or Vehicle Collection in the form it travels in — compact, versioned and self-contained, whether carried by a shared link or by a file. It is never a reference into somebody else's browser.
_Avoid_: payload, blob, record, document

**Shared link**:
A URL whose fragment carries an Artifact, so it opens for anyone with no account and nothing installed. What it opens is a copy: nothing of the recipient's is read into it or written over.
_Avoid_: share URL, deep link
