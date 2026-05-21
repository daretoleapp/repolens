import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl bg-[var(--background-card)] border border-[var(--border)] card-glow transition-all",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 border-b border-[var(--border)]", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-sm font-semibold tracking-tight", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-xs text-[var(--foreground-muted)] mt-0.5", className)} {...props} />
  );
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "outline" | "success" | "warning" | "danger" | "primary" | "accent";
}) {
  const variants = {
    default: "bg-[var(--border)] text-[var(--foreground-muted)]",
    outline: "border border-[var(--border-strong)] text-[var(--foreground-muted)]",
    success: "bg-[var(--success)]/15 text-[var(--success)] border border-[var(--success)]/30",
    warning: "bg-[var(--warning)]/15 text-[var(--warning)] border border-[var(--warning)]/30",
    danger: "bg-[var(--danger)]/15 text-[var(--danger)] border border-[var(--danger)]/30",
    primary: "bg-[var(--primary)]/15 text-[var(--primary)] border border-[var(--primary)]/30",
    accent: "bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "ghost" | "outline";
  size?: "default" | "sm" | "icon";
}) {
  const variants = {
    default: "bg-[var(--background-card)] hover:bg-[var(--border)] border border-[var(--border-strong)] text-[var(--foreground)]",
    primary: "bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-[var(--primary-foreground)] font-medium",
    ghost: "hover:bg-[var(--background-card)] text-[var(--foreground-muted)] hover:text-[var(--foreground)]",
    outline: "border border-[var(--border-strong)] hover:border-[var(--primary)] hover:bg-[var(--primary)]/5 text-[var(--foreground)]",
  };
  const sizes = {
    default: "h-9 px-4 text-sm",
    sm: "h-7 px-3 text-xs",
    icon: "h-8 w-8",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 px-3 rounded-lg bg-[var(--background)] border border-[var(--border-strong)] text-sm",
        "focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/30",
        "placeholder:text-[var(--foreground-subtle)]",
        className
      )}
      {...props}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("rounded-md shimmer", className)} />;
}

export function Empty({
  icon: Icon,
  title,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="w-10 h-10 text-[var(--foreground-subtle)] mb-3" />
      <div className="text-sm font-medium text-[var(--foreground)]">{title}</div>
      {hint && <div className="text-xs text-[var(--foreground-muted)] mt-1 max-w-xs">{hint}</div>}
    </div>
  );
}
