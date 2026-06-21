"use client";

import { useRole } from "@/hooks/useRole";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/** Renders children only for admin role. Shows fallback (or nothing) for regular users. */
export function AdminOnly({ children, fallback = null }: Props) {
  const { isAdmin } = useRole();
  return isAdmin ? <>{children}</> : <>{fallback}</>;
}

/** Returns a disabled button with tooltip for non-admin users. */
export function AdminButton({
  children,
  onClick,
  className,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
  title?: string;
}) {
  const { isAdmin } = useRole();

  if (!isAdmin) {
    return (
      <span
        title="Solo administradores pueden realizar esta acción"
        className={`${className ?? ""} opacity-30 cursor-not-allowed`}
      >
        {children}
      </span>
    );
  }

  return (
    <button onClick={onClick} className={className} title={title}>
      {children}
    </button>
  );
}
