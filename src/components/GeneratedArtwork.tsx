"use client";

/**
 * Procedurally generated artwork for tracks without album art.
 * Uses genre-based color palettes and a deterministic hash of the
 * track title/artist to create unique gradient visuals per track.
 */

interface GeneratedArtworkProps {
  genre: string;
  title: string;
  size?: "sm" | "md"; // sm = 56px (feed), md = 40px (player bar)
  className?: string;
}

/* ---- Deterministic hash → number ---- */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32-bit int
  }
  return Math.abs(hash);
}

/* ---- Genre → color palette ---- */
interface Palette {
  colors: [string, string, string];
  accent: string;
}

function getPalette(genre: string): Palette {
  const g = genre.toLowerCase();

  if (g.includes("afro house"))
    return {
      colors: ["#e65100", "#ff8f00", "#ffd54f"],
      accent: "#ffab40",
    };
  if (g.includes("deep house"))
    return {
      colors: ["#1a237e", "#283593", "#5c6bc0"],
      accent: "#7986cb",
    };
  if (g.includes("tech house"))
    return {
      colors: ["#004d40", "#00695c", "#26a69a"],
      accent: "#4db6ac",
    };
  if (g.includes("progressive"))
    return {
      colors: ["#4a148c", "#6a1b9a", "#ab47bc"],
      accent: "#ce93d8",
    };
  if (g.includes("techno"))
    return {
      colors: ["#880e4f", "#ad1457", "#e91e63"],
      accent: "#f06292",
    };
  if (g.includes("electro"))
    return {
      colors: ["#01579b", "#0277bd", "#039be5"],
      accent: "#4fc3f7",
    };
  if (g.includes("minimal"))
    return {
      colors: ["#37474f", "#455a64", "#78909c"],
      accent: "#90a4ae",
    };
  if (g.includes("electronica"))
    return {
      colors: ["#1b5e20", "#2e7d32", "#66bb6a"],
      accent: "#81c784",
    };
  if (g.includes("indie dance"))
    return {
      colors: ["#bf360c", "#d84315", "#ff7043"],
      accent: "#ff8a65",
    };
  if (g.includes("house"))
    return {
      colors: ["#e65100", "#f57c00", "#ffb74d"],
      accent: "#ffcc80",
    };

  // Default
  return {
    colors: ["#263238", "#37474f", "#546e7a"],
    accent: "#78909c",
  };
}

export default function GeneratedArtwork({
  genre,
  title,
  size = "sm",
  className = "",
}: GeneratedArtworkProps) {
  const hash = hashString(title + genre);
  const palette = getPalette(genre);

  // Derive variation from hash
  const angle = (hash % 360);
  const offsetX = 30 + (hash % 40);        // 30–70
  const offsetY = 30 + ((hash >> 8) % 40);  // 30–70
  const radius = 25 + ((hash >> 4) % 30);   // 25–55

  // Secondary circle
  const x2 = 100 - offsetX;
  const y2 = 100 - offsetY;
  const r2 = 20 + ((hash >> 12) % 25);      // 20–45

  // Tiny decorative circle
  const x3 = 15 + ((hash >> 16) % 70);      // 15–85
  const y3 = 15 + ((hash >> 20) % 70);      // 15–85

  const dim = size === "sm" ? "w-14 h-14" : "w-10 h-10";

  return (
    <svg
      viewBox="0 0 100 100"
      className={`${dim} rounded-md flex-shrink-0 ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={`bg-${hash}`}
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
          gradientTransform={`rotate(${angle}, 0.5, 0.5)`}
        >
          <stop offset="0%" stopColor={palette.colors[0]} />
          <stop offset="50%" stopColor={palette.colors[1]} />
          <stop offset="100%" stopColor={palette.colors[2]} />
        </linearGradient>
        <radialGradient id={`glow-${hash}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={palette.accent} stopOpacity="0.4" />
          <stop offset="100%" stopColor={palette.accent} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Base gradient */}
      <rect width="100" height="100" fill={`url(#bg-${hash})`} />

      {/* Abstract circles */}
      <circle
        cx={offsetX}
        cy={offsetY}
        r={radius}
        fill={palette.accent}
        opacity="0.15"
      />
      <circle
        cx={x2}
        cy={y2}
        r={r2}
        fill={palette.colors[2]}
        opacity="0.2"
      />
      <circle
        cx={x3}
        cy={y3}
        r="8"
        fill={palette.accent}
        opacity="0.3"
      />

      {/* Central glow */}
      <circle cx="50" cy="50" r="40" fill={`url(#glow-${hash})`} />

      {/* Vinyl/music icon in center */}
      <circle cx="50" cy="50" r="14" fill="white" opacity="0.12" />
      <circle cx="50" cy="50" r="9" fill="white" opacity="0.08" />
      <circle cx="50" cy="50" r="3" fill="white" opacity="0.25" />
    </svg>
  );
}
