export default function Header({ active }: { active?: "less" | "more" }) {
    return (
        <div className="flex items-center space-x-2 w-full">
            <div className="flex flex-col">
                <a
                    href="/less"
                    className={`text-xl tracking-tight hover:text-white transition-colors ${active === "less" ? "text-white" : "text-white/60"}`}
                >
                    less
                </a>
                <a
                    href="/more"
                    className={`text-xl tracking-tight hover:text-white transition-colors ${active === "more" ? "text-white" : "text-white/60"}`}
                >
                    more
                </a>
            </div>
            <h1 className="text-5xl italic text-[#4A6FA5] tracking-tight">fucking music</h1>
        </div>
    )
}
