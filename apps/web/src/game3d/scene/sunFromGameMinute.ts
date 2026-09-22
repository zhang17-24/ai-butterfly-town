export const DAY_LENGTH_MINUTES = 1440;
/** 日出 06:00、日落 18:00。 */
const SUNRISE = 0.25;
const SUNSET = 0.75;
const MAX_ELEVATION_DEG = 70;
const NOON_INTENSITY = 1.6;
const TWILIGHT_ELEVATION_DEG = 20;
const COLOR_MORNING = "#ffd0a0";
const COLOR_DAY = "#fff5e0";
const COLOR_DUSK = "#ff9a5c";
const COLOR_NIGHT = "#4a5f8a";
const AMBIENT_DAY = "#cfe3d4";
const AMBIENT_NIGHT = "#2a3a5c";

export interface SunState {
  azimuthDeg: number;
  elevationDeg: number;
  intensity: number;
  color: string;
  ambientColor: string;
  ambientIntensity: number;
  isNight: boolean;
}

/**
 * 世界时间 → 太阳状态。高度角为正弦曲线:日出日落为 0,正午峰值 +70°,午夜 -70°。
 * elevationDeg < 0 判为夜间(夜光由 Sun 组件补)。
 */
export function sunFromGameMinute(gameMinute: number, dayLength = DAY_LENGTH_MINUTES): SunState {
  const wrapped = ((gameMinute % dayLength) + dayLength) % dayLength;
  const t = wrapped / dayLength;
  const dayProgress = (t - SUNRISE) / (SUNSET - SUNRISE);
  const elevationDeg = Math.sin(dayProgress * Math.PI) * MAX_ELEVATION_DEG;
  const isNight = elevationDeg < 0;
  const clamped = Math.max(0, Math.min(1, elevationDeg / MAX_ELEVATION_DEG));

  const color = isNight
    ? COLOR_NIGHT
    : elevationDeg < TWILIGHT_ELEVATION_DEG
      ? (dayProgress < 0.5 ? COLOR_MORNING : COLOR_DUSK)
      : COLOR_DAY;

  return {
    azimuthDeg: t * 360 + 90,
    elevationDeg,
    intensity: isNight ? 0 : clamped * NOON_INTENSITY,
    color,
    ambientColor: isNight ? AMBIENT_NIGHT : AMBIENT_DAY,
    // 夜间环境光别压太狠:小镇夜景要看得见轮廓与名牌(实测 0.45 时地面几乎全黑)
    ambientIntensity: isNight ? 0.6 : 0.7,
    isNight,
  };
}
