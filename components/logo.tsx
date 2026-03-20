interface LogoProps {
  size?: "sm" | "md" | "lg";
  showSubtitle?: boolean;
  className?: string;
}

export function Logo({ size = "md", showSubtitle = true, className = "" }: LogoProps) {
  const sizes = {
    sm: { tan: "text-2xl", subtitle: "text-xs" },
    md: { tan: "text-4xl", subtitle: "text-sm" },
    lg: { tan: "text-6xl", subtitle: "text-base" },
  };

  return (
    <div className={`flex items-baseline gap-3 ${className}`}>
      <span className={`tan-logo ${sizes[size].tan} tracking-wider`}>TAN</span>
      {showSubtitle && (
        <span className={`tan-logo-subtitle ${sizes[size].subtitle} opacity-90`}>
          The Agentic Network
        </span>
      )}
    </div>
  );
}

export function LogoSimple({ className = "" }: { className?: string }) {
  return (
    <span className={`tan-logo text-2xl tracking-wider ${className}`}>TAN</span>
  );
}
