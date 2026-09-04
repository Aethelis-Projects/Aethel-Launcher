import React from 'react';

interface LogoAnimationProps {
  size?: number;
  className?: string;
}

export const LogoAnimation: React.FC<LogoAnimationProps> = ({ size = 96, className = '' }) => {
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      {/* Outer ambient pulsing glow */}
      <div
        className="absolute inset-0 rounded-full blur-2xl opacity-60 animate-pulse"
        style={{
          background: 'radial-gradient(circle, rgba(0, 245, 212, 0.5) 0%, rgba(123, 44, 191, 0.3) 70%, transparent 100%)',
        }}
      />

      {/* Rotating gradient halo ring */}
      <div
        className="absolute inset-1 rounded-full border border-cyan-400/30 opacity-70 animate-spin"
        style={{ animationDuration: '16s' }}
      />

      {/* Stylized 'A' Emblem */}
      <svg
        width={size * 0.78}
        height={size * 0.78}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative z-10 drop-shadow-[0_0_16px_rgba(0,245,212,0.7)]"
      >
        <defs>
          <linearGradient id="aethelGlowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38BDF8" />
            <stop offset="40%" stopColor="#00F5D4" />
            <stop offset="100%" stopColor="#00FFE0" />
          </linearGradient>
        </defs>

        {/* Primary Arch & Loop */}
        <path
          d="M 26 77 
             L 47 26 
             C 49 23 53 23 55 26 
             L 65 50 
             C 67 55 65 61 60 62 
             C 52 64 41 65 34 77 
             Z"
          stroke="url(#aethelGlowGrad)"
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Inner Loop Aperture */}
        <path
          d="M 50 38 
             L 44 54 
             C 43 56 45 58 47 58 
             L 54 57 
             C 56 56 57 54 56 52 
             Z"
          stroke="url(#aethelGlowGrad)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Detached Right Leg */}
        <path
          d="M 68 56 
             L 76 77"
          stroke="url(#aethelGlowGrad)"
          strokeWidth="5.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};
