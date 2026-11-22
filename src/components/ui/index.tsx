'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { useRef } from 'react';
import { X } from 'lucide-react';
export function Modal({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string; children: React.ReactNode }) {
  const previousFocus = useRef<HTMLElement | null>(null);
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="dialog-content" onOpenAutoFocus={() => { previousFocus.current = document.activeElement as HTMLElement; }} onCloseAutoFocus={event => { event.preventDefault(); previousFocus.current?.focus(); }}><div className="dialog-head"><div><Dialog.Title>{title}</Dialog.Title>{description && <Dialog.Description>{description}</Dialog.Description>}</div><Dialog.Close className="icon-button" aria-label="Close dialog"><X size={18}/></Dialog.Close></div>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue' }) { return <span className={`pill ${tone}`}>{children}</span>; }
