import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface PlaylistGridCardProps {
    name: string
    imageUrl?: string | null
    subtitle: string
    onClick: () => void
    isSelected?: boolean
    children?: ReactNode
}

/**
 * Shared playlist card used in the playlist grid views.
 * Renders an image, name, subtitle, and optional overlay children (e.g. selection indicator).
 */
export function PlaylistGridCard({
    name,
    imageUrl,
    subtitle,
    onClick,
    isSelected,
    children,
}: PlaylistGridCardProps) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "group bg-white/5 rounded-lg p-4 hover:bg-white/10 transition-colors text-left relative",
                isSelected && "ring-2 ring-green-500 bg-green-500/10"
            )}
        >
            {children}
            <div className="aspect-square mb-4 bg-white/10 rounded overflow-hidden">
                {imageUrl ? (
                    <img
                        src={imageUrl}
                        alt={name}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/30">
                        No Image
                    </div>
                )}
            </div>
            <h3
                className={cn(
                    "font-medium truncate transition-colors",
                    isSelected ? "text-green-400" : "group-hover:text-green-400"
                )}
            >
                {name}
            </h3>
            <p className="text-sm text-white/50 truncate">{subtitle}</p>
        </button>
    )
}
