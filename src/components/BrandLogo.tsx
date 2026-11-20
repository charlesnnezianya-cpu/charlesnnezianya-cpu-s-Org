import React, { useId } from 'react';

interface BrandLogoProps {
  showTagline?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'full' | 'mark';
}

export function BrandLogo({
  showTagline = false,
  size = 'md',
  variant = 'full',
}: BrandLogoProps) {
  const uid = useId().replace(/:/g, '');
  const bgId = `bs_bg_${uid}`;
  const orbitId = `bs_orbit_${uid}`;

  const iconSize =
    size === 'sm' ? 'h-7 w-7' : size === 'lg' ? 'h-11 w-11' : 'h-9 w-9';
  const textSize =
    size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-2xl' : 'text-xl';

  return (
    <div className="inline-flex items-center gap-2.5 select-none whitespace-nowrap shrink-0">
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${iconSize} shrink-0 drop-shadow-xs`}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={bgId} x1="4" y1="3" x2="60" y2="61" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#0B162E" />
            <stop offset="55%" stopColor="#132A5C" />
            <stop offset="100%" stopColor="#1D4ED8" />
          </linearGradient>
          <linearGradient id={orbitId} x1="11" y1="45" x2="53" y2="17" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.25" />
            <stop offset="50%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#93C5FD" />
          </linearGradient>
        </defs>

        <rect width="64" height="64" rx="15" fill={`url(#${bgId})`} />

        {/* Relativity orbital arc */}
        <ellipse
          cx="32"
          cy="32"
          rx="22.5"
          ry="8.5"
          transform="rotate(-24 32 32)"
          stroke={`url(#${orbitId})`}
          strokeWidth="2.1"
          strokeLinecap="round"
        />

        {/* Left Hemisphere (human brain folds) */}
        <path
          d="M30.5 17C24.5 17 19.75 21 18.75 26C16 27.25 14.75 30.5 15.75 33.75C14.75 37 16.25 41 19.5 42.75C21 45.75 24.5 47.5 28.5 47.5H30.5V17Z"
          fill="#FFFFFF"
          fillOpacity="0.97"
        />

        {/* Right Hemisphere (AI neural grid) */}
        <path
          d="M33.5 17C39.5 17 44.25 21 45.25 26C48 27.25 49.25 30.5 48.25 33.75C49.25 37 47.75 41 44.5 42.75C43 45.75 39.5 47.5 35.5 47.5H33.5V17Z"
          fill="#E0F2FE"
          fillOpacity="0.95"
        />

        {/* Neural center seam */}
        <rect x="31.1" y="16.75" width="1.8" height="31" rx="0.9" fill="#0F2147" />

        {/* Left organic sulci */}
        <path
          d="M21.8 25C24.2 24.5 26.2 26 26.2 28M19.3 32.5C22 32 24.5 33.5 24.5 36M23 41C25.5 40.5 27.2 41.7 27.8 43.5"
          stroke="#1E3A8A"
          strokeWidth="1.75"
          strokeLinecap="round"
        />

        {/* Right AI synaptic paths & nodes */}
        <path
          d="M36.8 25H40.8L42.5 27.5M36.8 32.2H42.2L44.2 35M36.8 40H40.5"
          stroke="#0284C7"
          strokeWidth="1.65"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="42.7" cy="27.7" r="1.75" fill="#0284C7" />
        <circle cx="44.4" cy="35.2" r="1.75" fill="#0284C7" />
        <circle cx="40.7" cy="40" r="1.5" fill="#0284C7" />

        {/* Insight Spark */}
        <path
          d="M50.2 15.8L51.3 18.6L54.1 19.7L51.3 20.8L50.2 23.6L49.1 20.8L46.3 19.7L49.1 18.6Z"
          fill="#38BDF8"
        />
        <circle cx="14.2" cy="41.4" r="1.85" fill="#38BDF8" />
      </svg>

      {variant === 'full' && (
        <div className="flex flex-col leading-none">
          <span
            className={`font-display font-bold tracking-tight text-[#0F172A] dark:text-white ${textSize}`}
          >
            Brain<span className="text-[#1D4ED8] dark:text-[#38BDF8]">stine</span>
          </span>
          {showTagline && (
            <span className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
              AI-Powered Academic Companion
            </span>
          )}
        </div>
      )}
    </div>
  );
}
