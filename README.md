# XR World Studio

This app is designed for personal use in a full VR/XR workflow only. It defaults into stereo VR mode and keeps the HUD in the lower center of each eye view so it stays readable without blocking the main scene.

## Controller layout and behavior

- Start button: press once to open the XR HUD, press again to close it.
- A button: aim at a hitbox and press A to open the linked image, video, or audio file.
- X button: recenter the world orientation.
- B button: use B if your controller layout assigns a secondary action to a panel or viewer close event.
- Left stick: while the HUD is visible, use the stick to nudge the HUD slightly around the lower-center area without blocking the main view.
- Look around: use the headset or device orientation to inspect the room and aim at hitboxes.

## HUD text

The HUD appears in the bottom middle of each mono eye view and tells you:

- Start = toggle HUD on/off
- A = open nearest hitbox
- X = recenter
- Left Stick = nudge the HUD position

This keeps your view open while still giving you the exact controls you need.

## XR behavior

- The app starts in VR mode automatically.
- The HUD is intentionally kept low and centered so it does not block the center of the view.
- Hitboxes are created from at least four points and the final point connects back to the first to form the shape.
- When you activate a hitbox, the media item assigned to it appears in the immersive viewer.

## Notes

- This is a personal immersive workspace and is intended to be used in VR mode.
- The HUD is the only menu-style overlay and is designed to stay out of the center of the scene.
