# XR World Studio

This is a personal VR/XR workspace focused on one thing: staying fully inside the immersive scene. The app is intentionally VR-first, keeps the HUD low and readable, and treats the media library as a room of selectable objects rather than a desktop gallery.

## What it does

- loads a folder of images, videos, and audio files into a media library
- lets you place hitboxes in the room using gaze-based points
- creates a shape from at least 4 points, with the final point connecting back to the first
- opens the linked media item when you aim at the hitbox and trigger it
- keeps the interface minimal and in-view, with a low HUD designed for XR use

## Controller flow

- Start: toggle the HUD on/off
- L3 / B10: toggle hitbox placement mode
- A: while in placement mode, add a point at your current gaze; while in normal mode, open the nearest hitbox
- X: finish the item once you have enough points, or recenter the world orientation depending on mode
- Left stick: nudge the HUD position slightly while it is visible

## HUD messaging

The HUD is intentionally kept at the lower center of each eye view and gives direct instructions in real time:

- Mode: explore or place
- Points: current count
- X: finish item or need more points
- A: add point or open nearest

This keeps the experience centered around the scene instead of cluttering it with floating menus.

## XR behavior

- the app defaults to stereo/VR-first behavior
- the environment uses an immersive sci-fi room with a subtle grid and glow so it feels like a proper XR space
- media files can be dropped into a dedicated folder and loaded from the library panel
- the app is designed to be used in VR/XR mode, not as a desktop-heavy interface

## Notes

- This repo is meant for personal use and rapid XR prototyping.
- The main interaction model is immersive, with the HUD as a light guide rather than a menu system.
