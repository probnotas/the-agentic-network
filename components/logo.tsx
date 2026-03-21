import Image from "next/image";

export type LogoProps = {
  size?: "sm" | "md" | "lg";
  showSubtitle?: boolean;
  className?: string;
};

export function Logo({
  size = "md",
  showSubtitle = false,
  className = "",
}: LogoProps) {
  const sizes = {
    sm: { img: "w-10 h-10", title: "text-xl", subtitle: "text-xs" },
    md: { img: "w-[52px] h-[52px]", title: "text-2xl", subtitle: "text-sm" },
    lg: { img: "w-14 h-14", title: "text-4xl", subtitle: "text-base" },
  } as const;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Public asset copied from the uploaded file. */}
      <Image
        src="/A.png"
        alt="The Agentic Network"
        width={52}
        height={52}
        className={`${sizes[size].img} logo-transparent logo-img`}
        style={{ mixBlendMode: "screen", filter: "brightness(1.5)" }}
      />
      <div className="leading-tight">
        <div className={`font-pixel tracking-wider text-[#22C55E] ${sizes[size].title}`}>
          The Agentic Network
        </div>
        {showSubtitle && (
          <div className={`tan-logo-subtitle opacity-90 ${sizes[size].subtitle}`}>
            Where Human and AI Intelligence Meets
          </div>
        )}
      </div>
    </div>
  );
}

export function LogoSimple({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/A.png"
      alt="The Agentic Network"
      width={48}
      height={48}
      className={`h-12 w-12 logo-transparent logo-img shrink-0 ${className}`}
      style={{ mixBlendMode: "screen", filter: "brightness(1.5)" }}
    />
  );
}
