'use client';
import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
// useFormStatus reads the enclosing <form>, so this must be a child of it, never the form itself.
export function SubmitButton({
  children,
  name,
  value,
  variant,
}: {
  children: ReactNode;
  name?: string;
  value?: string;
  variant?: 'ghost' | 'danger';
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} data-variant={variant} disabled={pending}>
      {children}
    </button>
  );
}
