'use client';

import { useState } from 'react';
import { Check, Eye, EyeOff } from 'lucide-react';

type PasswordInputProps = Omit<React.ComponentProps<'input'>, 'type'>;

export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`${className ?? ''} pr-11`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        className="absolute top-1/2 right-3 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function PasswordChecks({
  password,
  confirm,
  minLength = 8,
}: {
  password: string;
  confirm?: string;
  minLength?: number;
}) {
  const checks: { label: string; ok: boolean }[] = [
    { label: `Al menos ${minLength} caracteres`, ok: password.length >= minLength },
  ];
  if (confirm !== undefined) {
    checks.push({
      label: 'Las contraseñas coinciden',
      ok: password.length > 0 && password === confirm,
    });
  }

  return (
    <ul className="space-y-1">
      {checks.map(({ label, ok }) => (
        <li
          key={label}
          className={`flex items-center gap-1.5 text-xs ${ok ? 'text-green-600' : 'text-gray-400'}`}
        >
          <Check className="h-3.5 w-3.5" />
          {label}
        </li>
      ))}
    </ul>
  );
}
