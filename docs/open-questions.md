# Open questions

- **Voting style.** One pick per category (as in 2025), or ranked voting like jadseya.com? To decide with rinlux.
- **Real destiny.gg OAuth app.** Who registers it, and the redirect domain. Until then, local login uses dev/dgg-oauth.
- **Tunnel domain.** Which domain the Cloudflare tunnel publishes on for the preview.
- **Emotes.** Re-pull from cdn.destiny.gg (emotes.json + emotes.css). Some emotes animate through CSS, see dggradio/emotes.md.

## Later (agreed, not started)

- Dependency upgrades to current versions.
- End-to-end type safety between server and client (validated requests and responses).
- Admin editing with preview, limited to an allowlist of DGG accounts, including a preview of the results reveal.
- A privacy page describing what is collected (DGG id and name, IP and user agent per vote) and why.
- Fixes from the 2025 stream brief, one at a time, checked with StrawWaffle first.
