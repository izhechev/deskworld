# Design decisions

Sources checked on 2 November 2026.

## A city you can play immediately

The starter neighbourhood is loaded at launch, and the mouse and keyboard map work without a camera. The camera is an optional input method. A synthetic paper board uses the same detector so a reviewer can inspect the interaction without a physical setup.

The visual design uses a paper background, green controls, small clay-like buildings, and a large city view. Controls use both labels and colour. Secondary text was darkened and enlarged after the first browser check, using [W3C's contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) as a reference; this is not an accessibility certification.

## Separate simulation, input, and rendering

`world.js` owns map and route rules; `vision.js` turns frames into token positions; `scene.js` draws the city. The controller passes data between them. This applies the [single-responsibility principle](https://blog.cleancoder.com/uncle-bob/2014/05/08/SingleReponsibilityPrinciple.html) without adding a framework or a class for every tile.

The camera session accepts its media provider and video element as dependencies, so tests can model delayed permission and playback failure.

## An actual 3D scene

The view uses a [Three.js orthographic camera](https://threejs.org/docs/pages/OrthographicCamera.html), which keeps distant objects the same apparent size. [Raycasting](https://threejs.org/docs/pages/Raycaster.html) converts pointer locations into board cells. Shared geometry and materials are reused across procedural buildings and trees.

The [WebGL renderer](https://threejs.org/docs/pages/WebGLRenderer.html) requires WebGL 2; the keyboard map remains available if the renderer cannot start. Pinned modules are copied locally following the ES module options in the [installation guide](https://threejs.org/manual/pages/installation.html).

## Explainable colour tracking

[OpenCV's HSV thresholding guide](https://docs.opencv.org/4.13.0/da/d97/tutorial_threshold_inRange.html) describes separating colours with ranges. DeskWorld implements that small operation directly on 160 × 160 Canvas pixels, then finds four-connected components; no OpenCV runtime or trained model is needed.

The selected hue ranges, minimum area, three-frame threshold, and 750 ms grace period are prototype choices. They are not calibrated camera-performance claims. A fixed square board avoids pretending to solve camera pose or perspective estimation.

## Camera lifetime and privacy

[MDN documents](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) secure-context and permission requirements. Camera access begins only after a button click, requests no audio, and displays failures in the interface. A generation counter rejects late permission results after cancellation.

Every stream track is [stopped explicitly](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/stop) when input ends, the tab is hidden, or playback fails. Camera frames are used in memory and never sent to a service.

## Routes and time

[Breadth-first search](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/6afd7e9a85d7d36e204533569f9fccf6_MIT6_006S20_r09.pdf) fits this graph because each orthogonal road step has equal cost. Tests include disconnected homes, blocked roads, restored routes, and both challenge outcomes.

The controller uses 50 ms simulation steps and the timestamp supplied by [requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame). It clears accumulated time when visibility changes, so returning to a tab does not jump the clock forward.

## Familiar controls

Help, challenge instructions, and the keyboard map use native dialogs with labelled headings and Escape handling, following the [W3C modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). Map buttons use a single tab stop and arrow-key navigation.

Browser storage is optional because [localStorage can be unavailable](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage). JSON export remains available, and imports validate the version, size, tile count, and tile values before replacing the current map.
