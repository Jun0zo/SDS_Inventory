import { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface PageHeaderProps {
  children: ReactNode;
  className?: string;
}

export function PageHeader({ children, className }: PageHeaderProps) {
  return (
    <div className={cn(
      "flex h-14 items-center justify-between border-b bg-background px-6",
      className
    )}>
      {children}
    </div>
  );
}
