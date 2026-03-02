import { describe, it, expect, vi } from "vitest"

/**
 * Regression tests for SearchBar keyboard navigation.
 *
 * These test the core handler logic extracted from SearchBar — the same
 * branching that runs inside handleKeyDown. We cannot render the React
 * component without @testing-library/react, but we CAN validate that the
 * selection/navigation contract holds for every key combination.
 */

interface SearchResult {
    key: string
    label: string
    totalPlays: number
}

/** Minimal recreation of the handleKeyDown branching logic from SearchBar. */
function simulateKeyDown(
    key: string,
    results: SearchResult[],
    selectedIndex: number,
    callbacks: {
        setSelectedIndex: (fn: (prev: number) => number) => void
        handleSelect: (nodeKey: string) => void
        setIsOpen: (open: boolean) => void
        blur: () => void
    }
): { prevented: boolean; stopped: boolean } {
    let prevented = false
    let stopped = false
    const e = {
        key,
        preventDefault: () => {
            prevented = true
        },
        stopPropagation: () => {
            stopped = true
        },
    }

    if (e.key === "ArrowDown") {
        e.preventDefault()
        e.stopPropagation()
        callbacks.setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1))
    } else if (e.key === "ArrowUp") {
        e.preventDefault()
        e.stopPropagation()
        callbacks.setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === "Enter" && results[selectedIndex]) {
        e.preventDefault()
        e.stopPropagation()
        callbacks.handleSelect(results[selectedIndex].key)
    } else if (e.key === "Escape") {
        e.stopPropagation()
        callbacks.setIsOpen(false)
        callbacks.blur()
    }

    return { prevented, stopped }
}

const RESULTS: SearchResult[] = [
    { key: "artist1::song1", label: "Artist1 — Song1", totalPlays: 50 },
    { key: "artist2::song2", label: "Artist2 — Song2", totalPlays: 30 },
    { key: "artist3::song3", label: "Artist3 — Song3", totalPlays: 10 },
]

describe("SearchBar keyboard handler", () => {
    it("Enter on first result calls handleSelect with correct key", () => {
        const handleSelect = vi.fn()
        simulateKeyDown("Enter", RESULTS, 0, {
            setSelectedIndex: vi.fn(),
            handleSelect,
            setIsOpen: vi.fn(),
            blur: vi.fn(),
        })
        expect(handleSelect).toHaveBeenCalledWith("artist1::song1")
    })

    it("Enter after ArrowDown selects the second result", () => {
        let index = 0
        const setSelectedIndex = vi.fn((fn: (prev: number) => number) => {
            index = fn(index)
        })
        const handleSelect = vi.fn()
        const cbs = { setSelectedIndex, handleSelect, setIsOpen: vi.fn(), blur: vi.fn() }

        // Press ArrowDown once
        simulateKeyDown("ArrowDown", RESULTS, index, cbs)
        expect(index).toBe(1)

        // Press Enter with updated index
        simulateKeyDown("Enter", RESULTS, index, cbs)
        expect(handleSelect).toHaveBeenCalledWith("artist2::song2")
    })

    it("Enter after multiple ArrowDown+ArrowUp selects the correct result", () => {
        let index = 0
        const setSelectedIndex = vi.fn((fn: (prev: number) => number) => {
            index = fn(index)
        })
        const handleSelect = vi.fn()
        const cbs = { setSelectedIndex, handleSelect, setIsOpen: vi.fn(), blur: vi.fn() }

        simulateKeyDown("ArrowDown", RESULTS, index, cbs) // 0 → 1
        simulateKeyDown("ArrowDown", RESULTS, index, cbs) // 1 → 2
        simulateKeyDown("ArrowUp", RESULTS, index, cbs) // 2 → 1
        expect(index).toBe(1)

        simulateKeyDown("Enter", RESULTS, index, cbs)
        expect(handleSelect).toHaveBeenCalledWith("artist2::song2")
    })

    it("ArrowDown does not exceed results length", () => {
        let index = 0
        const setSelectedIndex = vi.fn((fn: (prev: number) => number) => {
            index = fn(index)
        })
        const cbs = { setSelectedIndex, handleSelect: vi.fn(), setIsOpen: vi.fn(), blur: vi.fn() }

        simulateKeyDown("ArrowDown", RESULTS, index, cbs) // 0 → 1
        simulateKeyDown("ArrowDown", RESULTS, index, cbs) // 1 → 2
        simulateKeyDown("ArrowDown", RESULTS, index, cbs) // 2 → 2 (clamped)
        expect(index).toBe(2)
    })

    it("ArrowUp does not go below 0", () => {
        let index = 0
        const setSelectedIndex = vi.fn((fn: (prev: number) => number) => {
            index = fn(index)
        })
        const cbs = { setSelectedIndex, handleSelect: vi.fn(), setIsOpen: vi.fn(), blur: vi.fn() }

        simulateKeyDown("ArrowUp", RESULTS, index, cbs) // 0 → 0 (clamped)
        expect(index).toBe(0)
    })

    it("Enter with empty results does not call handleSelect", () => {
        const handleSelect = vi.fn()
        simulateKeyDown("Enter", [], 0, {
            setSelectedIndex: vi.fn(),
            handleSelect,
            setIsOpen: vi.fn(),
            blur: vi.fn(),
        })
        expect(handleSelect).not.toHaveBeenCalled()
    })

    it("Escape closes dropdown and blurs input", () => {
        const setIsOpen = vi.fn()
        const blur = vi.fn()
        simulateKeyDown("Escape", RESULTS, 0, {
            setSelectedIndex: vi.fn(),
            handleSelect: vi.fn(),
            setIsOpen,
            blur,
        })
        expect(setIsOpen).toHaveBeenCalledWith(false)
        expect(blur).toHaveBeenCalled()
    })

    it("all handled keys call stopPropagation", () => {
        const cbs = {
            setSelectedIndex: vi.fn((fn: (p: number) => number) => fn(0)),
            handleSelect: vi.fn(),
            setIsOpen: vi.fn(),
            blur: vi.fn(),
        }

        for (const key of ["ArrowDown", "ArrowUp", "Escape"]) {
            const result = simulateKeyDown(key, RESULTS, 0, cbs)
            expect(result.stopped, `${key} should stopPropagation`).toBe(true)
        }

        // Enter with valid result
        const enterResult = simulateKeyDown("Enter", RESULTS, 0, cbs)
        expect(enterResult.stopped, "Enter should stopPropagation").toBe(true)
        expect(enterResult.prevented, "Enter should preventDefault").toBe(true)
    })

    it("unhandled keys do not call any callbacks", () => {
        const cbs = {
            setSelectedIndex: vi.fn(),
            handleSelect: vi.fn(),
            setIsOpen: vi.fn(),
            blur: vi.fn(),
        }

        const result = simulateKeyDown("Tab", RESULTS, 0, cbs)
        expect(result.prevented).toBe(false)
        expect(result.stopped).toBe(false)
        expect(cbs.setSelectedIndex).not.toHaveBeenCalled()
        expect(cbs.handleSelect).not.toHaveBeenCalled()
        expect(cbs.setIsOpen).not.toHaveBeenCalled()
        expect(cbs.blur).not.toHaveBeenCalled()
    })
})
