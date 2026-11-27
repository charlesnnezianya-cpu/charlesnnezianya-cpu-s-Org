import React, { useId } from 'react';

interface BrainFallbackVisualProps {
  className?: string;
  compact?: boolean;
}

/**
 * Architectural sculpted SVG fallback depicting cerebral gyri/sulci folds,
 * temporal lobe, cerebellum, and neural circuit illumination for non-WebGL / reduced-motion modes.
 */
export function BrainFallbackVisual({ className = '', compact = false }: BrainFallbackVisualProps) {
  const uid = useId().replace(/:/g, '');
  const leftGradId = `brain_left_${uid}`;
  const rightGradId = `brain_right_${uid}`;
  const cerebGradId = `brain_cereb_${uid}`;
  const orbitGradId = `brain_orbit_${uid}`;
  const glowId = `brain_glow_${uid}`;

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden select-none ${className}`}
      aria-hidden="true"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 48%, rgba(56, 189, 248, 0.22) 0%, rgba(124, 58, 237, 0.14) 38%, rgba(6, 11, 24, 0) 72%)',
        }}
      />
      <svg
        viewBox="0 0 460 470"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`relative z-10 ${compact ? 'h-60 w-60 sm:h-76 sm:w-76' : 'h-80 w-80 sm:h-[26rem] sm:w-[26rem] lg:h-[32rem] lg:w-[32rem]'}`}
      >
        <defs>
          <radialGradient id={glowId} cx="50%" cy="46%" r="50%">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.34" />
            <stop offset="55%" stopColor="#8B5CF6" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#060B18" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`beam_${uid}`} x1="230" y1="420" x2="230" y2="180" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.32" />
            <stop offset="55%" stopColor="#8B5CF6" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={leftGradId} x1="100" y1="88" x2="220" y2="310" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#E0F2FE" stopOpacity="0.92" />
            <stop offset="52%" stopColor="#3B82F6" stopOpacity="0.62" />
            <stop offset="100%" stopColor="#1E3A8A" stopOpacity="0.82" />
          </linearGradient>
          <linearGradient id={rightGradId} x1="238" y1="88" x2="362" y2="310" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#BAE6FD" stopOpacity="0.9" />
            <stop offset="48%" stopColor="#38BDF8" stopOpacity="0.54" />
            <stop offset="100%" stopColor="#6D28D9" stopOpacity="0.72" />
          </linearGradient>
          <linearGradient id={cerebGradId} x1="160" y1="295" x2="300" y2="355" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1E40AF" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#5B21B6" stopOpacity="0.82" />
          </linearGradient>
          <linearGradient id={orbitGradId} x1="55" y1="305" x2="405" y2="135" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.18" />
            <stop offset="48%" stopColor="#38BDF8" stopOpacity="0.78" />
            <stop offset="100%" stopColor="#A78BFA" stopOpacity="0.65" />
          </linearGradient>
        </defs>

        <circle cx="230" cy="204" r="185" fill={`url(#${glowId})`} />

        {/* Upward Volumetric Light Rays from Futuristic Pedestal */}
        <path
          d="M152 420L104 185H356L308 420H152Z"
          fill={`url(#beam_${uid})`}
        />

        {/* Illuminated Circular Pedestal Platform */}
        <ellipse
          cx="230"
          cy="428"
          rx="124"
          ry="24"
          fill="#071230"
          stroke="#6366F1"
          strokeOpacity="0.55"
          strokeWidth="1.8"
        />
        <ellipse
          cx="230"
          cy="422"
          rx="102"
          ry="18"
          fill="#0B1B45"
          stroke="#38BDF8"
          strokeOpacity="0.82"
          strokeWidth="2"
        />
        <ellipse
          cx="230"
          cy="421"
          rx="62"
          ry="10"
          fill="#38BDF8"
          fillOpacity="0.28"
          stroke="#93C5FD"
          strokeOpacity="0.7"
          strokeWidth="1.2"
        />

        {/* Dual Tilted Orbital Rings */}
        <ellipse
          cx="230"
          cy="206"
          rx="186"
          ry="64"
          transform="rotate(-22 230 206)"
          stroke={`url(#${orbitGradId})`}
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <ellipse
          cx="230"
          cy="206"
          rx="196"
          ry="58"
          transform="rotate(24 230 206)"
          stroke="#8B5CF6"
          strokeOpacity="0.45"
          strokeWidth="1.4"
          strokeLinecap="round"
        />

        {/* Subtle Brainstem & Cerebellum */}
        <path
          d="M214 292C214 326 218 350 223 366H237C242 350 246 326 246 292H214Z"
          fill="#172554"
          fillOpacity="0.85"
          stroke="#60A5FA"
          strokeOpacity="0.45"
          strokeWidth="1.4"
        />
        <path
          d="M158 282C152 308 172 334 204 332C214 331 224 326 230 318C236 326 246 331 256 332C288 334 308 308 302 282"
          fill={`url(#${cerebGradId})`}
          stroke="#93C5FD"
          strokeOpacity="0.48"
          strokeWidth="1.6"
        />
        <path
          d="M168 296H214M172 308H216M182 320H216M246 296H292M244 308H288M244 320H278"
          stroke="#93C5FD"
          strokeOpacity="0.48"
          strokeWidth="1.4"
          strokeLinecap="round"
        />

        {/* Left Cerebral Hemisphere */}
        <path
          d="M222 80C178 80 140 104 126 138C106 148 96 176 102 204C94 228 105 260 134 274C146 290 172 298 202 294L222 290V80Z"
          fill={`url(#${leftGradId})`}
          stroke="#93C5FD"
          strokeOpacity="0.72"
          strokeWidth="2"
        />

        {/* Right Cerebral Hemisphere */}
        <path
          d="M238 80C282 80 320 104 334 138C354 148 364 176 358 204C366 228 355 260 326 274C314 290 288 298 258 294L238 290V80Z"
          fill={`url(#${rightGradId})`}
          stroke="#38BDF8"
          strokeOpacity="0.78"
          strokeWidth="2"
        />

        {/* Interhemispheric Longitudinal Fissure */}
        <rect x="226" y="80" width="8" height="212" rx="4" fill="#091534" stroke="#38BDF8" strokeOpacity="0.5" strokeWidth="1.1" />

        {/* Rich Gyri & Sulci Folds across Both Hemispheres */}
        <g stroke="#0C1E4A" strokeOpacity="0.65" strokeWidth="2.8" strokeLinecap="round">
          <path d="M150 124C168 116 190 124 198 140M130 160C152 150 176 160 184 178M118 198C144 188 172 200 182 220M138 240C164 230 188 240 196 258" />
          <path d="M168 104C184 110 196 104 208 110M144 268C166 262 186 270 202 280" />
          <path d="M310 124C292 116 270 124 262 140M330 160C308 150 284 160 276 178M342 198C316 188 288 200 278 220M322 240C296 230 272 240 264 258" />
          <path d="M292 104C276 110 264 104 252 110M316 268C294 262 274 270 258 280" />
        </g>

        {/* Illuminated Neural Connections & Synaptic Nodes */}
        <g stroke="#7DD3FC" strokeOpacity="0.92" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M250 130C276 128 298 140 312 164C324 186 316 218 294 234" />
          <path d="M248 184C272 180 296 190 318 208C330 218 334 238 318 254" />
          <path d="M210 144C184 142 162 156 148 178C138 196 146 220 166 236" stroke="#A78BFA" />
        </g>
        <circle cx="250" cy="130" r="4.2" fill="#E0F2FE" />
        <circle cx="312" cy="164" r="5" fill="#38BDF8" />
        <circle cx="294" cy="234" r="4.5" fill="#A78BFA" />
        <circle cx="318" cy="208" r="5.2" fill="#38BDF8" />
        <circle cx="148" cy="178" r="4.5" fill="#A78BFA" />
        <circle cx="166" cy="236" r="4" fill="#38BDF8" />
      </svg>
    </div>
  );
}
