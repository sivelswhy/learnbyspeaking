"use client";

/**
 * Noam, le tuteur : illustration maison (pas de photo d'une vraie personne).
 * La bouche s'anime quand il parle, les yeux clignent.
 */
export function Avatar({ speaking = false, size = 96, className = "" }: { speaking?: boolean; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={className} role="img" aria-label={speaking ? "Noam parle" : "Noam"}>
      <defs>
        <clipPath id="noa-clip">
          <circle cx="60" cy="60" r="60" />
        </clipPath>
      </defs>
      <g clipPath="url(#noa-clip)">
        <rect width="120" height="120" fill="#e6e2ff" />
        {/* cou + épaules, chemise à col ouvert */}
        <rect x="50" y="76" width="20" height="18" rx="6" fill="#d9a07a" />
        <path d="M14 120 C16 97 36 88 60 88 C84 88 104 97 106 120 Z" fill="#4f46e5" />
        <path d="M48 89 L60 104 L72 89 L66 87 L60 95 L54 87 Z" fill="#fff" />
        {/* oreilles */}
        <ellipse cx="36.5" cy="58" rx="4" ry="6" fill="#e3ad87" />
        <ellipse cx="83.5" cy="58" rx="4" ry="6" fill="#e3ad87" />
        {/* visage, mâchoire un peu plus carrée */}
        <path d="M37 52 C37 36 47 28 60 28 C73 28 83 36 83 52 L83 62 C83 75 73 84 60 84 C47 84 37 75 37 62 Z" fill="#ecb994" />
        {/* barbe de quelques jours */}
        <path d="M38 62 C40 76 49 84 60 84 C71 84 80 76 82 62 C78 70 72 73 66 72 C62 71 58 71 54 72 C48 73 42 70 38 62 Z" fill="#3a2a20" opacity="0.28" />
        {/* cheveux courts */}
        <path d="M35 52 C33 32 46 21 61 21 C77 21 88 31 85 52 C83 44 80 40 76 38 C70 41 58 42 48 38 C42 40 38 45 35 52 Z" fill="#2e1f17" />
        {/* yeux */}
        <g className="noa-eyes">
          <ellipse cx="51" cy="56" rx="2.6" ry="3" fill="#2b1d16" />
          <ellipse cx="69" cy="56" rx="2.6" ry="3" fill="#2b1d16" />
        </g>
        {/* sourcils épais */}
        <path d="M45 49.5 Q50.5 46.5 55.5 49" stroke="#2e1f17" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <path d="M64.5 49 Q69.5 46.5 75 49.5" stroke="#2e1f17" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        {/* nez */}
        <path d="M60 58 Q58 64 60.5 65.5" stroke="#c98d68" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        {/* bouche */}
        {speaking ? (
          <ellipse className="noa-mouth" cx="60" cy="72" rx="5" ry="3" fill="#7a2a33" />
        ) : (
          <path d="M53 70.5 Q60 75.5 67 70.5" stroke="#7a2a33" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        )}
      </g>
    </svg>
  );
}
