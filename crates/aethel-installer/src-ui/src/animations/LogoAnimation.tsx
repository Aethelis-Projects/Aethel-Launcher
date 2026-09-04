import React from 'react';

interface LogoAnimationProps {
  size?: number;
  className?: string;
}

export const LogoAnimation: React.FC<LogoAnimationProps> = ({ size = 96, className = '' }) => {
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      {/* Outer ambient glow */}
      <div
        className="absolute inset-0 rounded-3xl blur-xl opacity-60 animate-pulse"
        style={{
          background: 'radial-gradient(circle, rgba(0, 245, 212, 0.45) 0%, rgba(123, 44, 191, 0.35) 70%, transparent 100%)',
        }}
      />

      {/* Rotating gradient ring */}
      <div
        className="absolute inset-1 rounded-2xl border border-cyan-400/30 opacity-70 animate-spin"
        style={{ animationDuration: '14s' }}
      />

      {/* Center SVG Emblem */}
      <svg
        width={size * 0.75}
        height={size * 0.75}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative z-10 drop-shadow-[0_0_15px_rgba(0,245,212,0.6)]"
      >
        <defs>
          <linearGradient id="aethelGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00F5D4" />
            <stop offset="50%" stopColor="#00BBF9" />
            <stop offset="100%" stopColor="#9B5DE5" />
          </linearGradient>
          <linearGradient id="innerGlow" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7B2CBF" />
            <stop offset="100%" stopColor="#00F5D4" />
          </linearGradient>
        </defs>

        {/* Shield / Diamond base */}
        <polygon
          points="50,6 90,26 90,74 50,94 10,74 10,26"
          fill="url(#innerGlow)"
          fillOpacity="0.15"
          stroke="url(#aethelGrad)"
          strokeWidth="3"
          strokeLinejoin="round"
        />

        {/* Stylized 'A' Crest */}
        <path
          d="M50 20 L28 72 L38 72 L44 56 L56 56 L62 72 L72 72 Z M47 48 L50 36 L53 48 Z"
          fill="url(#aethelGrad)"
        />

        {/* Core spark */}
        <circle cx="50" cy="20" r="3" fill="#FFFFFF" className="animate-ping" style={{ animationDuration: '3s' }} />
      </svg>
    </div>
  );
};
