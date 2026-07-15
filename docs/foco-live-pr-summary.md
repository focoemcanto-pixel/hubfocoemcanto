# PR summary

This branch refactors Foco Live presentation behavior around a single stage compositor.

## Main changes

- Screen share is rendered inside the room instead of triggering an external presentation route.
- Presenter camera remains visible in picture-in-picture while sharing.
- Main camera and shared content use `object-fit: contain` to avoid cropping.
- Participant thumbnails float over the stage and no longer reduce the main video area.
- Guest camera and microphone are enabled by default after joining and are only blocked by explicit host moderation.
- Offer QR codes use the direct checkout URL; CTA clicks continue using the analytics redirect.
- Split offers, banners and floating buttons remain inside the same room layout.
- No parallel Daily controller or DOM runtime was added.
