const BASE = { fill: "none", strokeLinecap: "round", strokeLinejoin: "round" };

export function HeartIcon({ color = "currentColor", size = 80 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" {...BASE}>
      <path
        d="M50 82C50 82 12 60 12 33C12 20 22 11 33 11C40 11 46 15 50 21C54 15 60 11 67 11C78 11 88 20 88 33C88 60 50 82 50 82Z"
        stroke={color} strokeWidth="4.5" fill={color} fillOpacity="0.1"
      />
      <path d="M35 33C35 28 39 25 43 26" stroke={color} strokeWidth="3.5" />
      <path d="M50 21C50 21 48 27 47 31" stroke={color} strokeWidth="3" />
      <path d="M50 35L57 28L62 35L70 24" stroke={color} strokeWidth="3" />
    </svg>
  );
}

export function BrainIcon({ color = "currentColor", size = 80 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" {...BASE}>
      <path
        d="M28 70C20 70 13 64 13 55C13 49 16 44 21 41C20 38 20 35 22 32C24 27 29 24 35 25C37 20 42 17 48 17C54 17 59 20 61 25C67 24 72 27 74 32C76 35 76 38 75 41C80 44 83 49 83 55C83 64 76 70 68 70L28 70Z"
        stroke={color} strokeWidth="4" fill={color} fillOpacity="0.1"
      />
      <path d="M48 17L48 70" stroke={color} strokeWidth="3" strokeDasharray="3 3" />
      <path d="M28 45C33 42 38 46 36 52" stroke={color} strokeWidth="3" />
      <path d="M60 38C64 36 68 40 66 46" stroke={color} strokeWidth="3" />
      <path d="M30 58C36 55 40 59 38 64" stroke={color} strokeWidth="3" />
      <path d="M62 52C67 50 70 54 68 60" stroke={color} strokeWidth="3" />
    </svg>
  );
}

export function LungsIcon({ color = "currentColor", size = 80 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" {...BASE}>
      <path d="M50 18L50 72" stroke={color} strokeWidth="5" />
      <path
        d="M50 28C50 28 36 30 30 40C24 50 22 58 24 66C26 74 32 76 38 72C44 68 44 58 44 52L44 38"
        stroke={color} strokeWidth="4" fill={color} fillOpacity="0.1"
      />
      <path
        d="M50 28C50 28 64 30 70 40C76 50 78 58 76 66C74 74 68 76 62 72C56 68 56 58 56 52L56 38"
        stroke={color} strokeWidth="4" fill={color} fillOpacity="0.1"
      />
      <path d="M30 52C32 56 30 62 28 64" stroke={color} strokeWidth="2.5" />
      <path d="M70 52C68 56 70 62 72 64" stroke={color} strokeWidth="2.5" />
    </svg>
  );
}

export function KidneyIcon({ color = "currentColor", size = 80 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" {...BASE}>
      <path
        d="M62 20C72 22 82 34 82 50C82 66 72 80 62 82C52 84 44 76 44 66C44 60 48 56 48 50C48 44 44 40 44 34C44 24 52 18 62 20Z"
        stroke={color} strokeWidth="4" fill={color} fillOpacity="0.1"
      />
      <path d="M44 50C44 50 52 50 56 50C60 50 62 46 62 42" stroke={color} strokeWidth="3" />
      <path
        d="M38 20C28 22 18 34 18 50C18 66 28 80 38 82C48 84 56 76 56 66C56 60 52 56 52 50C52 44 56 40 56 34C56 24 48 18 38 20Z"
        stroke={color} strokeWidth="4" fill={color} fillOpacity="0.12"
      />
      <path d="M56 50C56 50 48 50 44 50C40 50 38 46 38 42" stroke={color} strokeWidth="3" />
    </svg>
  );
}

export function LiverIcon({ color = "currentColor", size = 80 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" {...BASE}>
      <path
        d="M15 42C15 30 24 20 38 18C50 16 60 22 66 20C76 18 84 26 84 36C84 50 76 62 62 68C48 74 30 70 22 62C17 56 15 50 15 42Z"
        stroke={color} strokeWidth="4" fill={color} fillOpacity="0.1"
      />
      <path d="M40 68C38 74 36 80 38 86" stroke={color} strokeWidth="3.5" />
      <path d="M30 42C35 38 42 40 44 46" stroke={color} strokeWidth="2.5" />
      <path d="M55 34C60 30 66 32 68 38" stroke={color} strokeWidth="2.5" />
      <path d="M40 54C45 50 52 52 54 58" stroke={color} strokeWidth="2.5" />
    </svg>
  );
}

export function StomachIcon({ color = "currentColor", size = 80 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" {...BASE}>
      <path
        d="M38 20C30 20 22 26 20 36C18 50 22 64 30 72C38 80 52 82 62 76C72 70 78 58 76 46C74 34 66 24 56 22C50 20 44 20 38 20Z"
        stroke={color} strokeWidth="4" fill={color} fillOpacity="0.1"
      />
      <path d="M38 20C38 20 35 14 38 10" stroke={color} strokeWidth="4" />
      <path d="M56 22C56 22 66 18 70 22" stroke={color} strokeWidth="3" />
      <path d="M30 50C34 46 40 48 42 54C44 60 42 66 38 68" stroke={color} strokeWidth="2.5" />
    </svg>
  );
}

export function BloodDropIcon({ color = "currentColor", size = 80 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" {...BASE}>
      <path
        d="M50 15C50 15 22 45 22 62C22 76 35 88 50 88C65 88 78 76 78 62C78 45 50 15 50 15Z"
        stroke={color} strokeWidth="4" fill={color} fillOpacity="0.12"
      />
      <path d="M36 66C36 72 42 76 48 76" stroke={color} strokeWidth="3.5" />
      <circle cx="66" cy="40" r="6" stroke={color} strokeWidth="2.5" fill={color} fillOpacity="0.15" />
      <circle cx="74" cy="54" r="4" stroke={color} strokeWidth="2.5" fill={color} fillOpacity="0.15" />
      <circle cx="60" cy="55" r="5" stroke={color} strokeWidth="2.5" fill={color} fillOpacity="0.15" />
    </svg>
  );
}

export function ThyroidIcon({ color = "currentColor", size = 80 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" {...BASE}>
      <path
        d="M30 36C22 36 16 42 16 52C16 62 22 70 32 72C38 74 44 70 46 64L50 58L54 64C56 70 62 74 68 72C78 70 84 62 84 52C84 42 78 36 70 36C64 36 58 40 56 46L50 54L44 46C42 40 36 36 30 36Z"
        stroke={color} strokeWidth="4" fill={color} fillOpacity="0.1"
      />
      <path d="M50 30L50 20" stroke={color} strokeWidth="4" />
      <path d="M44 22C44 22 48 18 50 20C52 18 56 22 56 22" stroke={color} strokeWidth="3" />
    </svg>
  );
}

export function BoneIcon({ color = "currentColor", size = 80 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" {...BASE}>
      <line x1="32" y1="32" x2="68" y2="68" stroke={color} strokeWidth="10" />
      <circle cx="26" cy="26" r="10" stroke={color} strokeWidth="4" fill={color} fillOpacity="0.1" />
      <circle cx="22" cy="34" r="8" stroke={color} strokeWidth="4" fill={color} fillOpacity="0.1" />
      <circle cx="74" cy="74" r="10" stroke={color} strokeWidth="4" fill={color} fillOpacity="0.1" />
      <circle cx="78" cy="66" r="8" stroke={color} strokeWidth="4" fill={color} fillOpacity="0.1" />
    </svg>
  );
}

export function EyeIcon({ color = "currentColor", size = 80 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" {...BASE}>
      <path d="M12 50C12 50 28 22 50 22C72 22 88 50 88 50C88 50 72 78 50 78C28 78 12 50 12 50Z"
        stroke={color} strokeWidth="4" fill={color} fillOpacity="0.08" />
      <circle cx="50" cy="50" r="14" stroke={color} strokeWidth="4" fill={color} fillOpacity="0.15" />
      <circle cx="50" cy="50" r="6" stroke={color} strokeWidth="3" fill={color} fillOpacity="0.3" />
      <path d="M40 30C40 30 44 26 50 26" stroke={color} strokeWidth="2.5" />
    </svg>
  );
}

export function SpineIcon({ color = "currentColor", size = 80 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" {...BASE}>
      <line x1="50" y1="10" x2="50" y2="90" stroke={color} strokeWidth="3" strokeDasharray="2 2" />
      {[16, 28, 40, 52, 64, 76].map((y) => (
        <rect key={y} x="34" y={y} width="32" height="10" rx="4"
          stroke={color} strokeWidth="3.5" fill={color} fillOpacity="0.1" />
      ))}
    </svg>
  );
}

export function InfectiousIcon({ color = "currentColor", size = 80 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" {...BASE}>
      <circle cx="50" cy="50" r="20" stroke={color} strokeWidth="4" fill={color} fillOpacity="0.12" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = 50 + 20 * Math.cos(rad);
        const y1 = 50 + 20 * Math.sin(rad);
        const x2 = 50 + 34 * Math.cos(rad);
        const y2 = 50 + 34 * Math.sin(rad);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="3" />;
      })}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const cx = 50 + 36 * Math.cos(rad);
        const cy = 50 + 36 * Math.sin(rad);
        return <circle key={i} cx={cx} cy={cy} r="4" stroke={color} strokeWidth="2.5" fill={color} fillOpacity="0.2" />;
      })}
    </svg>
  );
}

export function StethoscopeIcon({ color = "currentColor", size = 80 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" {...BASE}>
      <path d="M28 20C28 20 22 30 22 44C22 56 30 64 42 64C54 64 62 56 62 44C62 38 60 32 56 28"
        stroke={color} strokeWidth="4" fill="none" />
      <path d="M28 20L28 14" stroke={color} strokeWidth="4" />
      <path d="M56 28L56 14" stroke={color} strokeWidth="4" />
      <path d="M62 44C62 44 62 62 70 68C76 72 82 68 82 62C82 56 78 52 72 52"
        stroke={color} strokeWidth="4" fill="none" />
      <circle cx="72" cy="50" r="7" stroke={color} strokeWidth="4" fill={color} fillOpacity="0.15" />
    </svg>
  );
}

export function PsychIcon({ color = "currentColor", size = 80 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" {...BASE}>
      <circle cx="50" cy="40" r="22" stroke={color} strokeWidth="4" fill={color} fillOpacity="0.1" />
      <path d="M50 62L50 78" stroke={color} strokeWidth="4" />
      <path d="M38 78L62 78" stroke={color} strokeWidth="4" />
      <path d="M40 34C40 30 44 28 48 30" stroke={color} strokeWidth="3" />
      <path d="M52 34C54 30 58 30 60 34C62 38 58 42 54 44C52 46 50 46 50 50" stroke={color} strokeWidth="3" />
      <circle cx="50" cy="54" r="2.5" fill={color} />
    </svg>
  );
}

export function SkinIcon({ color = "currentColor", size = 80 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" {...BASE}>
      <rect x="18" y="18" width="64" height="64" rx="16"
        stroke={color} strokeWidth="4" fill={color} fillOpacity="0.08" />
      <path d="M18 40L82 40" stroke={color} strokeWidth="2" strokeDasharray="4 3" />
      <path d="M18 60L82 60" stroke={color} strokeWidth="2" strokeDasharray="4 3" />
      <circle cx="35" cy="30" r="4" stroke={color} strokeWidth="2.5" fill={color} fillOpacity="0.2" />
      <circle cx="65" cy="50" r="5" stroke={color} strokeWidth="2.5" fill={color} fillOpacity="0.2" />
      <circle cx="40" cy="70" r="3.5" stroke={color} strokeWidth="2.5" fill={color} fillOpacity="0.2" />
    </svg>
  );
}

const IMAGE_MAP = [
  { keys: ["cardio", "heart", "cardiac"], src: "/organs/heart.png" },
  { keys: ["neuro", "brain", "cerebr"], src: "/organs/brain.png" },
  { keys: ["pulmo", "lung", "respir", "thorac"], src: "/organs/lungs.png" },
  { keys: ["nephr", "kidney", "renal"], src: "/organs/kidney.png" },
  { keys: ["hepat", "liver"], src: "/organs/liver.png" },
  { keys: ["gastro", "gi ", "gastroint", "bowel", "colon", "abdom"], src: "/organs/stomach.png" },
  { keys: ["hemat", "blood", "oncol"], src: "/organs/blood.png" },
  { keys: ["endocrin", "thyroid", "diabet", "adren", "hormon"], src: "/organs/thyroid.png" },
  { keys: ["rheuma", "musculo", "ortho", "joint", "bone", "msk", "spine", "neurosu", "back"], src: "/organs/bone.png" },
  { keys: ["ophthal", "eye", "ocul", "retina"], src: "/organs/eye.png" },
];

export function getBodyPartImage(specialtyName = "") {
  const lower = specialtyName.toLowerCase();
  for (const { keys, src } of IMAGE_MAP) {
    if (keys.some((k) => lower.includes(k))) return src;
  }
  return null;
}

const ICON_MAP = [
  { keys: ["cardio", "heart", "cardiac"], Icon: HeartIcon },
  { keys: ["neuro", "brain", "cerebr"], Icon: BrainIcon },
  { keys: ["pulmo", "lung", "respir", "thorac"], Icon: LungsIcon },
  { keys: ["nephr", "kidney", "renal"], Icon: KidneyIcon },
  { keys: ["hepat", "liver"], Icon: LiverIcon },
  { keys: ["gastro", "gi ", "gastroint", "bowel", "colon", "abdom"], Icon: StomachIcon },
  { keys: ["hemat", "blood", "oncol"], Icon: BloodDropIcon },
  { keys: ["endocrin", "thyroid", "diabet", "adren", "hormon"], Icon: ThyroidIcon },
  { keys: ["rheuma", "musculo", "ortho", "joint", "bone", "msk"], Icon: BoneIcon },
  { keys: ["ophthal", "eye", "ocul", "retina"], Icon: EyeIcon },
  { keys: ["spine", "neurosu", "back"], Icon: SpineIcon },
  { keys: ["infect", "micro", "parasit", "virus", "bacter", "tropical"], Icon: InfectiousIcon },
  { keys: ["psych", "mental", "behav"], Icon: PsychIcon },
  { keys: ["dermat", "skin"], Icon: SkinIcon },
  { keys: ["general", "internal", "medicine"], Icon: StethoscopeIcon },
];

export function getBodyPartIcon(specialtyName = "") {
  const lower = specialtyName.toLowerCase();
  for (const { keys, Icon } of ICON_MAP) {
    if (keys.some((k) => lower.includes(k))) return Icon;
  }
  return StethoscopeIcon;
}
