import type { DemoState, Invitation, Notification, Role } from './model';
import type { Action } from './store';

export type LiveUser = { id: string; username: string; name: string; initials: string };
export type WorkspacePayload = { user: LiveUser; roles: Record<string, Role>; revisions: Record<string, number>; state: DemoState; inbox: Invitation[]; notifications: Notification[] };

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

type ErrorBody = { error?: unknown; code?: unknown };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', ...init });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = null; }
  }
  if (!response.ok) {
    const payload = (body ?? {}) as ErrorBody;
    const message = typeof payload.error === 'string' && payload.error ? payload.error : `Request failed (${response.status})`;
    const code = typeof payload.code === 'string' ? payload.code : undefined;
    throw new ApiError(message, response.status, code);
  }
  return body as T;
}

export function loginRequest(username: string, password: string): Promise<{ user: LiveUser }> {
  return request<{ user: LiveUser }>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
}

export function logoutRequest(): Promise<void> {
  return request<void>('/api/auth/logout', { method: 'POST' });
}

export function getWorkspace(): Promise<WorkspacePayload> {
  return request<WorkspacePayload>('/api/workspace');
}

export function postAction(action: Action): Promise<{ ok: true }> {
  return request<{ ok: true }>('/api/actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
}

export function getRevisions(projectId: string): Promise<{ boardRevision: number }> {
  return request<{ boardRevision: number }>(`/api/projects/${encodeURIComponent(projectId)}/revisions`);
}

export function changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
  return request<{ message: string }>('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export const ATTACHMENT_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain'] as const;
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * REL-02 upload: the server checks role, type, size and project budget and
 * returns a one-time signed URL; the file goes straight to private storage
 * (bypassing the 4.5 MB serverless body limit); then the metadata is recorded.
 */
export async function uploadAttachment(projectId: string, itemId: string, file: File): Promise<void> {
  if (!(ATTACHMENT_TYPES as readonly string[]).includes(file.type)) throw new ApiError('Only PDF, PNG, JPEG and plain-text files can be attached', 422);
  if (file.size > ATTACHMENT_MAX_BYTES) throw new ApiError('Files must be 10 MB or smaller', 422);
  const signed = await request<{ path: string; signedUrl: string }>('/api/attachments/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, itemId, name: file.name, size: file.size, mime: file.type }),
  });
  const put = await fetch(signed.signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type, 'x-upsert': 'false' }, body: file });
  if (!put.ok) throw new ApiError(`Upload failed (${put.status})`, put.status);
  await postAction({ type: 'add-attachment', projectId, itemId, path: signed.path, name: file.name, size: file.size, mime: file.type });
}

/** Opens through a short-lived signed URL; only current project members get one. */
export const attachmentUrl = (attachmentId: string) => `/api/attachments/${encodeURIComponent(attachmentId)}`;
