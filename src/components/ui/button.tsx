import * as React from 'react';
import { cn } from '@/components/ui/utils';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive';
  size?: 'default' | 'sm' | 'icon';
};
const variants = {
  default: 'bg-[#C8431A] text-white hover:bg-[#A8370F]',
  outline: 'border border-[#DEDEDE] bg-white text-[#111111] hover:bg-[#F3F3F3]',
  ghost: 'bg-transparent text-[#5F5F5F] hover:bg-[#F3F3F3]',
  destructive: 'bg-[#A13B45] text-white hover:bg-[#8B303A]',
};
const sizes = { default: 'min-h-10 px-4 py-2', sm: 'min-h-8 px-3 py-1', icon: 'h-10 w-10 p-0' };

export function Button({ variant = 'default', size = 'default', className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#F2561D] disabled:pointer-events-none disabled:opacity-50', variants[variant], sizes[size], className)} {...props} />;
}
