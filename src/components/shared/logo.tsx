type Props = { size?: number; className?: string; showText?: boolean };

export function Logo({ size = 48, className, showText = true }: Props) {
  return (
    <div className={`flex items-center gap-3 ${className ?? ''}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* NW — dark teal */}
        <path d="M 4 50 A 46 46 0 0 1 50 4 L 50 24 A 26 26 0 0 0 24 50 Z" fill="#175861" />
        {/* NE — sage/mint */}
        <path d="M 50 4 A 46 46 0 0 1 96 50 L 76 50 A 26 26 0 0 0 50 24 Z" fill="#ABC2B3" />
        {/* SW — medium teal */}
        <path d="M 50 96 A 46 46 0 0 1 4 50 L 24 50 A 26 26 0 0 0 50 76 Z" fill="#669E9D" />
        {/* SE — dark teal */}
        <path d="M 96 50 A 46 46 0 0 1 50 96 L 50 76 A 26 26 0 0 0 76 50 Z" fill="#175861" />

        {/* White cross separators */}
        <line x1="50" y1="3" x2="50" y2="97" stroke="white" strokeWidth="2" />
        <line x1="3" y1="50" x2="97" y2="50" stroke="white" strokeWidth="2" />

        {/* White center circle */}
        <circle cx="50" cy="50" r="25" fill="white" />

        {/* N letter */}
        <text
          x="50"
          y="60"
          textAnchor="middle"
          fontFamily="Arial Black, Arial, sans-serif"
          fontWeight="900"
          fontSize="29"
          fill="#175861"
        >
          N
        </text>
      </svg>

      {showText && (
        <span className="select-none" style={{ lineHeight: 1 }}>
          <span
            style={{
              fontFamily: 'var(--font-montserrat, sans-serif)',
              fontWeight: 800,
              fontSize: size * 0.44,
              color: '#175861',
              letterSpacing: '0.02em',
            }}
          >
            NAUTIC
          </span>
          <span
            style={{
              fontFamily: 'var(--font-montserrat, sans-serif)',
              fontWeight: 300,
              fontSize: size * 0.44,
              color: '#175861',
              letterSpacing: '0.02em',
            }}
          >
            APP
          </span>
        </span>
      )}
    </div>
  );
}
