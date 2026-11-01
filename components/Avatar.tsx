"use client";

/**
 * Shuli (שולי), le renard tuteur : illustration maison (ni photo, ni personnage existant).
 * La bouche s'anime quand il parle, les yeux clignent (classes dans globals.css).
 */
export type Mood = "happy" | "think" | "wow" | "sad" | "cheer" | "wink";

const BROWS: Record<Mood, [string, string]> = {
  happy: ["M104 166 Q136 150 166 164", "M234 164 Q264 150 296 166"],
  think: ["M104 172 Q136 170 166 176", "M234 150 Q264 136 296 152"],
  wow: ["M104 150 Q136 130 166 148", "M234 148 Q264 130 296 150"],
  sad: ["M104 154 Q136 160 166 176", "M234 176 Q264 160 296 154"],
  cheer: ["M104 160 Q136 142 166 158", "M234 158 Q264 142 296 160"],
  wink: ["M104 166 Q136 150 166 164", "M234 150 Q264 134 296 152"],
};

export function Avatar({ speaking = false, size = 96, className = "", mood = "happy" }: { speaking?: boolean; size?: number; className?: string; mood?: Mood }) {
  return (
    <svg viewBox="0 0 400 400" width={size} height={size} className={className} role="img" aria-label={speaking ? "Shuli parle" : "Shuli"}>
      <defs>
        <clipPath id="shuli-clip"><circle cx="200" cy="200" r="200" /></clipPath>
        <linearGradient id="shuli-fur" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff9a45" />
          <stop offset="1" stopColor="#f06f2b" />
        </linearGradient>
      </defs>
      <g clipPath="url(#shuli-clip)">
        <rect width="400" height="400" fill="#ffe3cf" />
        <g transform="translate(200 214) scale(0.94) translate(-200 -214)">
          {/* oreilles */}
          <path d="M60 190 L66 52 L168 118 Z" fill="url(#shuli-fur)" />
          <path d="M340 190 L334 52 L232 118 Z" fill="url(#shuli-fur)" />
          <path d="M86 160 L88 92 L142 124Z" fill="#3a2a2a" />
          <path d="M314 160 L312 92 L258 124Z" fill="#3a2a2a" />
          {/* tête et joues blanches */}
          <path d="M48 200 Q50 110 200 104 Q350 110 352 200 Q354 300 200 352 Q46 300 48 200Z" fill="url(#shuli-fur)" />
          <path d="M48 214 Q130 232 200 300 Q270 232 352 214 Q340 310 200 352 Q60 310 48 214Z" fill="#fff6ec" />
          <circle cx="96" cy="262" r="18" fill="#ff8a7a" opacity=".5" />
          <circle cx="304" cy="262" r="18" fill="#ff8a7a" opacity=".5" />
          {/* yeux */}
          {mood === "wink" ? (
            <g>
              <ellipse cx="138" cy="210" rx="30" ry="36" fill="#fff" />
              <ellipse cx="141" cy="215" rx="16" ry="18" fill="#2a1f1a" />
              <circle cx="147" cy="208" r="5.8" fill="#fff" />
              <path d="M232 218 Q262 190 292 218" stroke="#2a1f1a" strokeWidth="9" fill="none" strokeLinecap="round" />
            </g>
          ) : mood === "cheer" ? (
            <g stroke="#2a1f1a" strokeWidth="9" fill="none" strokeLinecap="round">
              <path d="M110 220 Q138 190 166 220" />
              <path d="M234 220 Q262 190 290 220" />
            </g>
          ) : (
          <g className="noa-eyes">
            <ellipse cx="138" cy="210" rx="30" ry="36" fill="#fff" />
            <ellipse cx="141" cy="215" rx="16" ry="18" fill="#2a1f1a" />
            <circle cx="147" cy="208" r="5.8" fill="#fff" />
            <circle cx="136" cy="222" r="2.6" fill="#fff" opacity=".8" />
            <ellipse cx="262" cy="210" rx="30" ry="36" fill="#fff" />
            <ellipse cx="259" cy="215" rx="16" ry="18" fill="#2a1f1a" />
            <circle cx="265" cy="208" r="5.8" fill="#fff" />
            <circle cx="254" cy="222" r="2.6" fill="#fff" opacity=".8" />
          </g>
          )}
          {/* sourcils */}
          <path d={BROWS[mood][0]} stroke="#8a3d12" strokeWidth="8" fill="none" strokeLinecap="round" />
          <path d={BROWS[mood][1]} stroke="#8a3d12" strokeWidth="8" fill="none" strokeLinecap="round" />
          {/* museau */}
          <ellipse cx="200" cy="270" rx="26" ry="19" fill="#2a1f1f" />
          <ellipse cx="193" cy="264" rx="8" ry="4.5" fill="#fff" opacity=".6" />
          {/* bouche */}
          {speaking ? (
            <g className="noa-mouth">
              <path d="M170 296 Q200 286 230 296 Q226 330 200 334 Q174 330 170 296Z" fill="#7a2a33" />
              <path d="M184 318 Q200 310 216 318 Q210 332 200 333 Q190 332 184 318Z" fill="#ff7a86" />
            </g>
          ) : (
            <>
              {mood === "wow" ? (
                <ellipse cx="200" cy="318" rx="15" ry="19" fill="#7a2a33" />
              ) : mood === "cheer" ? (
                <>
                  <path d="M166 298 Q200 296 234 298 Q228 340 200 342 Q172 340 166 298Z" fill="#7a2a33" />
                  <path d="M182 326 Q200 316 218 326 Q212 338 200 339 Q188 338 182 326Z" fill="#ff7a86" />
                </>
              ) : mood === "think" ? (
                <path d="M182 306 Q204 302 224 296" stroke="#2a1f1f" strokeWidth="7" fill="none" strokeLinecap="round" />
              ) : mood === "sad" ? (
                <path d="M176 312 Q200 292 224 312" stroke="#2a1f1f" strokeWidth="7" fill="none" strokeLinecap="round" />
              ) : (
                <path d="M174 294 Q200 316 226 294" stroke="#2a1f1f" strokeWidth="7" fill="none" strokeLinecap="round" />
              )}
              <path d="M200 289 V298" stroke="#2a1f1f" strokeWidth="7" />
            </>
          )}
        </g>
      </g>
    </svg>
  );
}
