export type Theme = 'light' | 'dark' | 'system'

export function applyTheme(t: Theme) {
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  localStorage.setItem('ft-theme', t)
}

export const getTheme = (): Theme => (localStorage.getItem('ft-theme') as Theme) || 'system'
