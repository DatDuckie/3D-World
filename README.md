# XR World Studio

This app is designed for personal use in a full VR/XR workflow only. It defaults to the stereo VR view and assumes a headset plus controller are present.

## Controller layout and behavior

- Start button / Menu toggle (B9-style): press once to open the floating menu, press again to close it.
- Left stick: while the menu is active, move the stick to drag the floating menu around your view inside the invisible circular zone. This keeps the menu in front of you without taking over the whole scene.
- A button: aim at a hitbox and press A to activate it. The app opens the assigned image, audio, or video file in the center of the XR view.
- Main Xbox button / Center button (B16-style): press to recenter the world and reset the current orientation so the menu and hitboxes feel stable again.
- X button / alternate recenter: if your controller variant maps X differently, that input also recenters the scene.
- Look around: use the headset or device orientation to inspect the world. The menu stays centered relative to your view and the hitboxes are triggered from the direction you are looking.

## XR behavior

- The app starts in VR mode automatically.
- The menu is movable in a circular area around the center of your view.
- The menu always tries to remain in front of you while you look around.
- Hitboxes are created from at least four points and the final point connects back to the first to form the shape.
- When you activate a hitbox, the media item assigned to it appears in the immersive viewer.

## Notes

- This is a personal immersive workspace and is intended to be used in VR mode, not as a desktop app.
- The app keeps the world immersive with the menu floating in your field of view rather than using a bottom bar or desktop toolbar.
