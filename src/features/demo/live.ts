import type { DemoState, Role } from './model';
import type { Action } from './store';

export type LiveUser = { id: string; username: string; name: string; initials: string };
export type WorkspacePayload = { user: LiveUser; roles: Record<string, Role>; revisions: Record<string, number>; state: DemoState };

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
