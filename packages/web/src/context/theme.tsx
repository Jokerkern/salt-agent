import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import { ConfigProvider, theme as antdTheme } from "antd"
import { XProvider } from "@ant-design/x"

// ---------------------------------------------------------------------------
// Theme Context — light / dark / system
// ---------------------------------------------------------------------------

export type ThemeMode = "light" | "dark" | "system"

interface ThemeContextValue {
  mode: ThemeMode
  resolved: "light" | "dark"
  setMode: (mode: ThemeMode) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = "salt-agent-theme"

function getSystemPreference(): "light" | "dark" {
  if (typeof window === "undefined") return "dark"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function resolveTheme(mode: ThemeMode): "light" | "dark" {
  return mode === "system" ? getSystemPreference() : mode
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === "light" || stored === "dark" || stored === "system") return stored
    return "dark"
  })

  const resolved = resolveTheme(mode)

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    localStorage.setItem(STORAGE_KEY, next)
  }, [])

  const toggle = useCallback(() => {
    setMode(resolved === "dark" ? "light" : "dark")
  }, [resolved, setMode])

  // Apply class + data-theme to <html> for CSS variable switching
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute("data-theme", resolved)
    if (resolved === "dark") {
      root.classList.add("dark")
    } else {
      root.classList.remove("dark")
    }
  }, [resolved])

  // Listen to system preference changes
  useEffect(() => {
    if (mode !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => setModeState("system")
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [mode])

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode, toggle }}>
      <ConfigProvider
        theme={{
          algorithm: resolved === "dark" ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          token: {
            colorPrimary: "#6366f1",
            borderRadius: 8,
          },
        }}
      >
        <XProvider>
          {children}
        </XProvider>
      </ConfigProvider>
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider")
  return ctx
}
