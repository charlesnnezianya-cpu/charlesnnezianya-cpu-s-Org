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
        viewBox="0 0 460 440"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`relative z-10 ${compact ? 'h-60 w-60 sm:h-76 sm:w-76' : 'h-80 w-80 sm:h-[26rem] sm:w-[26rem] lg:h-[31rem] lg:w-[31rem]'}`}
      >
        <defs>
          <radialGradient id={glowId} cx="50%" cy="48%" r="50%">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.32" />
            <stop offset="55%" stopColor="#8B5CF6" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#060B18" stopOpacity="0" />
          </radialGradient>
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
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.12" />
            <stop offset="48%" stopColor="#38BDF8" stopOpacity="0.72" />
            <stop offset="100%" stopColor="#A78BFA" stopOpacity="0.55" />
          </linearGradient>
        </defs>

        <circle cx="230" cy="212" r="185" fill={`url(#${glowId})`} />

        {/* Subtle framing orbital arc */}
        <ellipse
          cx="230"
          cy="214"
          rx="184"
          ry="64"
          transform="rotate(-24 230 214)"
          stroke={`url(#${orbitGradId})`}
          strokeWidth="1.8"
          strokeLinecap="round"
        />

        {/* Subtle Brainstem & Cerebellum */}
        <path
          d="M214 300C214 334 218 358 223 374H237C242 358 246 334 246 300H214Z"
          fill="#172554"
          fillOpacity="0.85"
          stroke="#60A5FA"
          strokeOpacity="0.4"
          strokeWidth="1.4"
        />
        <path
          d="M158 290C152 316 172 342 204 340C214 339 224 334 230 326C236 334 246 339 256 340C288 342 308 316 302 290"
          fill={`url(#${cerebGradId})`}
          stroke="#93C5FD"
          strokeOpacity="0.45"
          strokeWidth="1.6"
        />
        <path
          d="M168 304H214M172 316H216M182 328H216M246 304H292M244 316H288M244 328H278"
          stroke="#93C5FD"
          strokeOpacity="0.45"
          strokeWidth="1.4"
          strokeLinecap="round"
        />

        {/* Left Cerebral Hemisphere with Frontal, Parietal, Occipital & Temporal Contours */}
        <path
          d="M222 88C178 88 140 112 126 146C106 156 96 184 102 212C94 236 105 268 134 282C146 298 172 306 202 302L222 298V88Z"
          fill={`url(#${leftGradId})`}
          stroke="#93C5FD"
          strokeOpacity="0.72"
          strokeWidth="2"
        />

        {/* Right Cerebral Hemisphere */}
        <path
          d="M238 88C282 88 320 112 334 146C354 156 364 184 358 212C366 236 355 268 326 282C314 298 288 306 258 302L238 298V88Z"
          fill={`url(#${rightGradId})`}
          stroke="#38BDF8"
          strokeOpacity="0.78"
          strokeWidth="2"
        />

        {/* Interhemispheric Longitudinal Fissure */}
        <rect x="226" y="88" width="8" height="212" rx="4" fill="#091534" stroke="#38BDF8" strokeOpacity="0.5" strokeWidth="1.1" />

        {/* Rich Gyri & Sulci Folds across Both Hemispheres */}
        <g stroke="#0C1E4A" strokeOpacity="0.65" strokeWidth="2.8" strokeLinecap="round">
          <path d="M150 132C168 124 190 132 198 148M130 168C152 158 176 168 184 186M118 206C144 196 172 208 182 228M138 248C164 238 188 248 196 266" />
          <path d="M168 112C184 118 196 112 208 118M144 276C166 270 186 278 202 288" />
          <path d="M310 132C292 124 270 132 262 148M330 168C308 158 284 168 276 186M342 206C316 196 288 208 278 228M322 248C296 238 272 248 264 266" />
          <path d="M292 112C276 118 264 112 252 118M316 276C294 270 274 278 258 288" />
        </g>

        {/* Illuminated Neural Connections & Synaptic Nodes */}
        <g stroke="#7DD3FC" strokeOpacity="0.92" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M250 138C276 136 298 148 312 172C324 194 316 226 294 242" />
          <path d="M248 192C272 188 296 198 318 216C330 226 334 246 318 262" />
          <path d="M210 152C184 150 162 164 148 186C138 204 146 228 166 244" stroke="#A78BFA" />
        </g>
        <circle cx="250" cy="138" r="4.2" fill="#E0F2FE" />
        <circle cx="312" cy="172" r="5" fill="#38BDF8" />
        <circle cx="294" cy="242" r="4.5" fill="#A78BFA" />
        <circle cx="318" cy="216" r="5.2" fill="#38BDF8" />
        <circle cx="148" cy="186" r="4.5" fill="#A78BFA" />
        <circle cx="166" cy="244" r="4" fill="#38BDF8" />
      </svg>
    </div>
  );
}
