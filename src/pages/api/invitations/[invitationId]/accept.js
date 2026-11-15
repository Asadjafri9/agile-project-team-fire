export default function handler(req, res) {
  // PROJ-02: not delivered in this release; see docs/systems/integration-log.md.
  return res.status(501).json({ error: 'Invitations is not available in this release' });
}
