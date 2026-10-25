import { createClient } from '../../../../../lib/supabase/server';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { projectId } = req.query;
  const { itemId, fileName, fileSize, fileType } = req.body;
  const supabase = createClient(req, res);

  // Validate allowed file types and 10MB limit (REL-02)
  const allowedMimetypes = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain'];
  if (!allowedMimetypes.includes(fileType)) {
    return res.status(400).json({ error: 'File type not permitted' });
  }
  if (fileSize > 10 * 1024 * 1024) {
    return res.status(400).json({ error: 'File exceeds 10MB budget limit' });
  }

  const objectPath = `${projectId}/${itemId}/${Date.now()}_${fileName}`;

  // Request signed upload URL from private bucket
  const { data, error } = await supabase.storage
    .from('project_attachments')
    .createSignedUploadUrl(objectPath);

  if (error) return res.status(400).json({ error: error.message });

  return res.status(200).json({
    uploadUrl: data.signedUrl,
    path: objectPath,
  });
}