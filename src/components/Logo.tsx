export default function Logo({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Family Tracker">
      <path d="M32 4C20 4 11 13 11 24c0 15 21 36 21 36s21-21 21-36C53 13 44 4 32 4z" fill="#FFC928" />
      <circle cx="32" cy="24" r="12" fill="#101828" />
      <circle cx="27" cy="21" r="3" fill="#FFC928" /><circle cx="37" cy="21" r="3" fill="#FFC928" />
      <path d="M22 31c1-4 4-5 5-5h10c1 0 4 1 5 5" fill="none" stroke="#FFC928" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}
