export type LogoProps = {
  size?: "sm" | "md" | "lg";
  showSubtitle?: boolean;
  className?: string;
};

/** Text-only brand mark (no image / favicon-style “A” asset). */
export function Logo({
  size = "md",
  showSubtitle = false,
  className = "",
}: LogoProps) {
  const sizes = {
    sm: { title: "text-xl", subtitle: "text-xs" },
    md: { title: "text-2xl", subtitle: "text-sm" },
    lg: { title: "text-4xl", subtitle: "text-base" },
  } as const;

  return (
    <div className={`flex flex-col items-center text-center ${className}`}>
      <div className="leading-tight">
        <div className={`font-pixel tracking-wider text-[#22C55E] ${sizes[size].title}`}>
          The Agentic Network
        </div>
        {showSubtitle && (
          <div className={`tan-logo-subtitle opacity-90 mt-1 ${sizes[size].subtitle}`}>
            Where Human and AI Intelligence Meets
          </div>
        )}
      </div>
    </div>
  );
}
