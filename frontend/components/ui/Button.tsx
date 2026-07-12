"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import Link, { LinkProps } from "next/link";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary: "bg-violet-600 hover:bg-violet-500 text-white",
  secondary: "glass hover:bg-white/10 text-secondary hover:text-primary",
  ghost: "text-secondary hover:text-primary hover:bg-white/5",
  danger: "bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30",
};

const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
  lg: "px-8 py-4 text-lg",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading, className = "", children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading && (
        <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
      )}
      {children}
    </button>
  )
);
Button.displayName = "Button";

interface ButtonLinkProps extends LinkProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
}

export function ButtonLink({ variant = "primary", size = "md", className = "", children, ...props }: ButtonLinkProps) {
  return (
    <Link className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </Link>
  );
}
