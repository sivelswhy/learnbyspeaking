"use client";

/**
 * Noa, la tutrice : illustration maison (pas de photo d'une vraie personne).
 * La bouche s'anime quand elle parle, les yeux clignent.
 */
export function Avatar({ speaking = false, size = 96, className = "" }: { speaking?: boolean; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={className} role="img" aria-label={speaking ? "Noa parle" : "Noa"}>
      <defs>
        <clipPath id="noa-clip">
          <circle cx="60" cy="60" r="60" />
        </clipPath>
      </defs>
      <g clipPath="url(#noa-clip)">
        <rect width="120" height="120" fill="#e6e2ff" />
        {/* cheveux arrière */}
        <path d="M24 70 C18 30 40 14 60 14 C82 14 102 30 96 72 L100 120 L20 120 Z" fill="#3b2418" />
        {/* cou + épaules */}
        <rect x="51" y="78" width="18" height="16" rx="6" fill="#e9b48f" />
        <path d="M18 120 C20 98 38 90 60 90 C82 90 100 98 102 120 Z" fill="#4f46e5" />
        <path d="M50 90 L60 102 L70 90 Z" fill="#fff" opacity="0.9" />
        {/* visage */}
        <ellipse cx="60" cy="56" rx="23" ry="27" fill="#f2c4a0" />
        {/* frange */}
        <path d="M36 50 C38 30 52 24 62 25 C76 26 86 36 85 52 C78 40 66 36 50 40 C44 42 39 46 36 50 Z" fill="#3b2418" />
        {/* yeux */}
        <g className="noa-eyes">
          <ellipse cx="51" cy="57" rx="2.6" ry="3.2" fill="#2b1d16" />
          <ellipse cx="69" cy="57" rx="2.6" ry="3.2" fill="#2b1d16" />
        </g>
        <path d="M46 51 Q51 48.5 55 50.5" stroke="#3b2418" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M65 50.5 Q69 48.5 74 51" stroke="#3b2418" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        {/* joues */}
        <ellipse cx="45" cy="65" rx="4" ry="2.4" fill="#ec8f7a" opacity="0.35" />
        <ellipse cx="75" cy="65" rx="4" ry="2.4" fill="#ec8f7a" opacity="0.35" />
        {/* bouche */}
        {speaking ? (
          <ellipse className="noa-mouth" cx="60" cy="70" rx="5" ry="3" fill="#8c2f39" />
        ) : (
          <path d="M53 68.5 Q60 74 67 68.5" stroke="#8c2f39" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        )}
      </g>
    </svg>
  );
}
