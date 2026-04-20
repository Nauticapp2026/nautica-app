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
        {/* NE — sage/mint #ABC2B3 */}
        <path d="M 50 4 A 46 46 0 0 1 96 50 L 76 50 A 26 26 0 0 0 50 24 Z" fill="#ABC2B3" />
        {/* SE — dark teal #175861 */}
        <path d="M 96 50 A 46 46 0 0 1 50 96 L 50 76 A 26 26 0 0 0 76 50 Z" fill="#175861" />
        {/* SW — medium teal #669E9D */}
        <path d="M 50 96 A 46 46 0 0 1 4 50 L 24 50 A 26 26 0 0 0 50 76 Z" fill="#669E9D" />
        {/* NW — dark teal #175861 */}
        <path d="M 4 50 A 46 46 0 0 1 50 4 L 50 24 A 26 26 0 0 0 24 50 Z" fill="#175861" />

        {/* White separators */}
        <line x1="50" y1="2" x2="50" y2="98" stroke="white" strokeWidth="2.5" />
        <line x1="2" y1="50" x2="98" y2="50" stroke="white" strokeWidth="2.5" />

        {/* White center circle */}
        <circle cx="50" cy="50" r="24" fill="white" />

        {/* N letter */}
        <text
          x="50"
          y="60"
          textAnchor="middle"
          fontFamily="Arial Black, Arial, sans-serif"
          fontWeight="900"
          fontSize="30"
          fill="#175861"
        >
          N
        </text>
      </svg>

      {showText && (
        <span className="select-none">
          <span
            style={{
              fontFamily: 'var(--font-montserrat, sans-serif)',
              fontWeight: 900,
              fontSize: size * 0.42,
              color: '#1a1a1a',
              letterSpacing: '0.04em',
            }}
          >
            NAUTIC
          </span>
          <span
            style={{
              fontFamily: 'var(--font-montserrat, sans-serif)',
              fontWeight: 300,
              fontSize: size * 0.42,
              color: '#1a1a1a',
              letterSpacing: '0.04em',
            }}
          >
            APP
          </span>
        </span>
      )}
    </div>
  );
}
