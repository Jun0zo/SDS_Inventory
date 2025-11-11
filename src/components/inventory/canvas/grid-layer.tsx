import { useLayoutStore } from '@/store/useLayoutStore';

export function GridLayer() {
  const { grid } = useLayoutStore();

  if (!grid.showGrid) return null;

  return (
    <div
      className="absolute inset-0 pointer-events-none grid-background"
      style={{
        '--grid-size': `${grid.cellPx}px`,
      } as React.CSSProperties}
    />
  );
}
