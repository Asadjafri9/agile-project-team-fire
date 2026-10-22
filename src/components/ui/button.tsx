import * as React from 'react';
import { cn } from '@/components/ui/utils';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive';
  size?: 'default' | 'sm' | 'icon';
};
const variants = {
  default: 'bg-[#315A70] text-white hover:bg-[#244658]',
  outline: 'border border-[#D9E0E5] bg-white text-[#18242D] hover:bg-[#F1F4F5]',
  ghost: 'bg-transparent text-[#52616D] hover:bg-[#F0F3F5]',
  destructive: 'bg-[#A13B45] text-white hover:bg-[#8B303A]',
};
const sizes = { default: 'min-h-10 px-4 py-2', sm: 'min-h-8 px-3 py-1', icon: 'h-10 w-10 p-0' };

export function Button({ variant = 'default', size = 'default', className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#7E9BAC] disabled:pointer-events-none disabled:opacity-50', variants[variant], sizes[size], className)} {...props} />;
}
