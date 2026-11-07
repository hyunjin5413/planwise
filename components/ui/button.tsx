import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "ghost" | "gradient";
  size?: "default" | "sm" | "lg";
  children: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

const baseStyles =
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";

const variants = {
  default: "bg-white text-black hover:bg-gray-100",
  secondary: "bg-gray-800 text-white hover:bg-gray-700",
  ghost: "hover:bg-gray-800/50 text-white",
  gradient:
    "bg-linear-to-b from-white via-white/95 to-white/60 text-black hover:scale-105 active:scale-95",
};

const sizes = {
  default: "h-10 px-4 py-2 text-sm",
  sm: "h-10 px-5 text-sm",
  lg: "h-12 px-8 text-base",
};

/** 링크를 버튼처럼 보이게 할 때 쓰는 클래스 */
export function buttonClasses({
  variant = "default",
  size = "default",
  className = "",
}: { variant?: ButtonProps["variant"]; size?: ButtonProps["size"]; className?: string } = {}) {
  return `${baseStyles} ${variants[variant!]} ${sizes[size!]} ${className}`;
}

export function Button({
  variant = "default",
  size = "default",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
