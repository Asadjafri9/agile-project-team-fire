export default function handler(req, res) {
  // REL-02: not delivered in this release; see docs/systems/integration-log.md.
  return res.status(501).json({ error: 'Attachments is not available in this release' });
}
