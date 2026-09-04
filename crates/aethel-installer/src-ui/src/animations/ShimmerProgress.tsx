import React from 'react';

interface ShimmerProgressProps {
  percent: number; // 0 to 100
  className?: string;
  height?: number;
}

export const ShimmerProgress: React.FC<ShimmerProgressProps> = ({
  percent,
  className = '',
  height = 10,
}) => {
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <div className={`relative w-full overflow-hidden rounded-full bg-slate-800/80 border border-slate-700/50 shadow-inner ${className}`} style={{ height }}>
      {/* Active progress fill */}
      <div
        className="h-full rounded-full transition-all duration-300 ease-out relative overflow-hidden"
        style={{
          width: `${clamped}%`,
          background: 'linear-gradient(90deg, #00F5D4 0%, #00BBF9 50%, #9B5DE5 100%)',
          boxShadow: '0 0 12px rgba(0, 245, 212, 0.5)',
        }}
      >
        {/* Shimmer sweep effect */}
        <div
          className="absolute inset-0 w-full h-full opacity-60 animate-[shimmer_1.8s_infinite]"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.6) 50%, transparent 100%)',
            backgroundSize: '200% 100%',
          }}
        />
      </div>
    </div>
  );
};
