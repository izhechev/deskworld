# Validation

## Automated checks

22 Node tests cover:

- Shortest road routes, grid boundaries, disconnected homes, and rerouting after edits
- Challenge success after a repair and failure when roads stay blocked
- Equivalent travel under different step sizes and safe handling of invalid durations
- City-file validation, export round-trips, and temporary camera layers
- HSV colour ranges, red hue wraparound, noise, multiple pieces, and edge coordinates
- Stable detections, flicker, missing pieces, and tracking reset
- Late camera permissions, audio exclusion, stream cleanup, and playback failures

The checked-in browser app also passes the pinned formatter check.

## Browser checks

Checked in the in-app browser:

- The starter city renders with roads, homes, studios, trees, a pond, and moving neighbours.
- Clicking the 3D board places a piece in the expected cell; view rotation and undo work.
- The keyboard map places pieces, arrow keys move focus, and Escape closes the dialog.
- Edits survive a reload; reset and undo restore the expected layout.
- Repairing the challenge route gets all 12 neighbours home before the deadline.
- The synthetic paper demo detects pieces, tracks dragging, keeps the resulting layout, and supports undo.
- JSON export downloads a file with the expected version and 121 tiles; importing that file restores the city.
- The narrow layout was checked at 390 pixels; two inherited alignment rules were corrected.

Remote CI and physical camera quality are not verified.

## Remaining hardware check

No real camera or physical coloured paper was used during development verification. The synthetic paper demo exercises the detector, but cannot establish reliability under changing light, blur, shadows, camera angles, or different paper colours.
