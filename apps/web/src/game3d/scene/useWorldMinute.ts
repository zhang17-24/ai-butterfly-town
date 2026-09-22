import { useWorldStore } from "../../state/world-store";

/**
 * 世界时钟,量化到 5 分钟。光照相关组件共用同一个量化值,
 * 免得每个 tick 都重建光照对象与自发光材质。
 */
export function useWorldMinute(): number {
  return useWorldStore((state) => Math.floor((state.world?.gameMinute ?? 12 * 60) / 5) * 5);
}
