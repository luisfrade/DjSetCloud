"use client";

import { useState, useRef, useCallback } from "react";

interface SearchFilterProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeGenre: string;
  onGenreChange: (genre: string) => void;
}

const GENRE_CHIPS = [
  { label: "All", value: "all" },
  { label: "Following", value: "following" },
  { label: "Afro House", value: "afro house" },
  { label: "House", value: "house" },
  { label: "Techno", value: "techno" },
  { label: "Tech House", value: "tech house" },
  { label: "Lofi", value: "lofi" },
];

export default function SearchFilter({
  searchQuery,
  onSearchChange,
  activeGenre,
  onGenreChange,
}: SearchFilterProps) {
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = useCallback(
    (value: string) => {
      setLocalQuery(value);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onSearchChange(value), 200);
    },
    [onSearchChange]
  );

  const handleClear = useCallback(() => {
    setLocalQuery("");
    onSearchChange("");
    inputRef.current?.focus();
  }, [onSearchChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        // Dismiss keyboard on mobile
        inputRef.current?.blur();
      }
    },
    []
  );

  return (
    <div className="flex-shrink-0 border-b border-white/10 px-4 pt-3 pb-2">
      <div className="max-w-3xl mx-auto space-y-2">
        {/* Search input */}
        <div className="relative">
          {/* Magnifying glass icon */}
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>

          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Search artists or sets..."
            value={localQuery}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full h-10 pl-10 pr-9 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.07] transition-colors"
          />

          {/* Clear button */}
          {localQuery && (
            <button
              onClick={handleClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full text-white/30 hover:text-white/60 hover:bg-white/10 transition-colors"
              aria-label="Clear search"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Genre chips */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1" style={{ scrollSnapType: "x mandatory" }}>
          {GENRE_CHIPS.map((chip) => (
            <button
              key={chip.value}
              onClick={() => onGenreChange(chip.value)}
              className={`flex-shrink-0 h-8 px-4 rounded-full text-xs font-medium transition-colors ${
                activeGenre === chip.value
                  ? "bg-blue-500 text-white shadow-sm shadow-blue-500/30"
                  : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70"
              }`}
              style={{ scrollSnapAlign: "start" }}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
