import React from 'react';

interface BrandLogoProps {
  showTagline?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function BrandLogo({ showTagline = false, size = 'md' }: BrandLogoProps) {
  const iconSize = size === 'sm' ? 'h-7 w-7' : size === 'lg' ? 'h-10 w-10' : 'h-8 w-8';
  const textSize =
    size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-2xl' : 'text-xl';

  return (
    <div className="inline-flex items-center gap-2.5 select-none whitespace-nowrap shrink-0">
      <svg
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${iconSize} shrink-0`}
        aria-hidden="true"
      >
        <rect width="36" height="36" rx="9" className="fill-[#0F1E3D] dark:fill-[#1D4ED8]" />
        <path
          d="M10.5 11.5C10.5 10.6716 11.1716 10 12 10H18.5C21.5376 10 24 12.4624 24 15.5C24 17.248 23.184 18.8054 21.912 19.812C23.468 20.692 24.5 22.362 24.5 24.25C24.5 26.8734 22.3734 29 19.75 29H12C11.1716 29 10.5 28.3284 10.5 27.5V11.5Z"
          className="fill-white/15"
        />
        <path
          d="M13 13H18.2C19.8569 13 21.2 14.3431 21.2 16C21.2 17.6569 19.8569 19 18.2 19H13V13Z"
          className="fill-white"
        />
        <path
          d="M13 20.5H19.1C20.9225 20.5 22.4 21.9775 22.4 23.8C22.4 25.6225 20.9225 27.1 19.1 27.1H13V20.5Z"
          className="fill-[#38BDF8]"
        />
      </svg>
      <div className="flex flex-col leading-none">
        <span
          className={`font-display font-bold tracking-tight text-[#0F172A] dark:text-white ${textSize}`}
        >
          Brainstine
        </span>
        {showTagline && (
          <span className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Your Personal AI-Powered Academic Companion
          </span>
        )}
      </div>
    </div>
  );
}
