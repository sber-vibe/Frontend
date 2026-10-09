import s from "./Logo.module.scss";

export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <span className={`${s.logo} ${inverted ? s.inverted : ""}`}>
      <svg className={s.mark} viewBox="0 0 40 40" aria-hidden="true">
        <defs>
          <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f2e913" />
            <stop offset="0.35" stopColor="#42e3b4" />
            <stop offset="0.65" stopColor="#21a038" />
            <stop offset="1" stopColor="#0087cd" />
          </linearGradient>
        </defs>
        <circle cx="20" cy="20" r="17" fill="none" stroke="url(#logo-g)" strokeWidth="5" />
        <path d="m13 20.5 5 5 9.5-11" fill="none" stroke="#21a038" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={s.text}>
        Субсидия<b>Чек</b>
      </span>
    </span>
  );
}
