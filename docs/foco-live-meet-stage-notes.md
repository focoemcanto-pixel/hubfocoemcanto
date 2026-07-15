# Foco Live — Meet-like stage refactor

## Scope

- Keeps `FocoLiveRoom` as the only Daily call controller.
- Renders screen sharing inside the room stage instead of changing routes/scenes.
- Keeps presenter camera in picture-in-picture during a presentation.
- Keeps participant thumbnails as overlays so the main frame is never cropped.
- Allows guests to enable camera and microphone unless the host explicitly blocks them.
- Uses the direct checkout URL in QR codes while keeping the tracked URL on CTA clicks.
- Keeps split offer, banner CTA and floating CTA inside the same stage compositor.

## Manual verification

1. Host and guest join from different devices.
2. Guest enables/disables camera and microphone.
3. Host blocks and releases guest camera/microphone.
4. Host shares a tab, window and full screen.
5. Presentation remains inside the room with host camera in PiP.
6. Guest thumbnails do not reduce or crop the main video.
7. Test split offer, banner and floating button before and during live.
8. Scan offer QR code on another phone and confirm checkout destination.
9. Stop sharing and confirm the camera stage returns without remounting the Daily call.
