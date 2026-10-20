# Lotplanner

Reviewing whether vehicles fit a real place, by laying out scaled vehicle footprints over satellite imagery of that place.

## Language

**Site**:
The real-world place a Layout applies to.
_Avoid_: location, lot

**Site Frame**:
The oriented rectangle that defines a Site's working area and the axes its Placements snap to.
_Avoid_: boundary, grid, bounding box

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

**Layout**:
The arrangement of Placements at a Site, carrying its own copies of the Vehicles it uses.
_Avoid_: plan, drawing