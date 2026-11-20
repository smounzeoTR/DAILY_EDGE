// Small charts drawn with react-native-svg (brand colours, no chart library).
import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect } from 'react-native-svg';

import type { DayState } from '@/features/progress/progress';
import { useTheme } from '@/theme';

function useWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [width, setWidth] = useState(0);
  return [width, (e) => setWidth(e.nativeEvent.layout.width)];
}

// One bar per day: done (full), plan not done (low), no plan (dot), today (outline)
export function DayBars({
  days,
  label,
}: {
  days: { date: string; state: DayState }[];
  label: string;
}) {
  const { colors } = useTheme();
  const [width, onLayout] = useWidth();
  const height = 56;
  const gap = 3;
  const bar = days.length > 0 ? Math.max(2, (width - gap * (days.length - 1)) / days.length) : 0;
  return (
    <View onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={label}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {days.map((d, i) => {
            const x = i * (bar + gap);
            if (d.state === 'done') {
              return (
                <Rect
                  key={d.date}
                  x={x}
                  y={8}
                  width={bar}
                  height={height - 8}
                  rx={bar / 3}
                  fill={colors.primary}
                />
              );
            }
            if (d.state === 'missed') {
              return (
                <Rect
                  key={d.date}
                  x={x}
                  y={height - 12}
                  width={bar}
                  height={12}
                  rx={bar / 3}
                  fill={colors.border}
                />
              );
            }
            if (d.state === 'today') {
              return (
                <Rect
                  key={d.date}
                  x={x + 0.75}
                  y={8.75}
                  width={bar - 1.5}
                  height={height - 9.5}
                  rx={bar / 3}
                  fill="none"
                  stroke={colors.primary}
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                />
              );
            }
            return (
              <Circle key={d.date} cx={x + bar / 2} cy={height - 3} r={1.5} fill={colors.border} />
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}

// Energy 1-5 over the days; gaps where there is no value
export function EnergyLine({ values, label }: { values: (number | null)[]; label: string }) {
  const { colors } = useTheme();
  const [width, onLayout] = useWidth();
  const height = 80;
  const pad = 6;
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const y = (v: number) => pad + ((5 - v) / 4) * (height - pad * 2);
  // Consecutive segments without gaps
  const segments: string[][] = [];
  values.forEach((v, i) => {
    if (v === null) return segments.push([]);
    const point = `${pad + i * step},${y(v)}`;
    if (segments.length === 0) segments.push([]);
    segments[segments.length - 1]?.push(point);
  });
  return (
    <View onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={label}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {[1, 3, 5].map((v) => (
            <Line
              key={v}
              x1={pad}
              x2={width - pad}
              y1={y(v)}
              y2={y(v)}
              stroke={colors.border}
              strokeWidth={1}
            />
          ))}
          {segments
            .filter((s) => s.length > 1)
            .map((s, i) => (
              <Polyline
                key={i}
                points={s.join(' ')}
                fill="none"
                stroke={colors.primary}
                strokeWidth={2.5}
              />
            ))}
          {values.map((v, i) =>
            v === null ? null : (
              <Circle key={i} cx={pad + i * step} cy={y(v)} r={3.5} fill={colors.primary} />
            ),
          )}
        </Svg>
      ) : null}
    </View>
  );
}

// Progress towards the goal, with the expected position on the trajectory
export function GoalBar({
  ratio,
  expectedRatio,
  label,
}: {
  ratio: number;
  expectedRatio: number | null;
  label: string;
}) {
  const { colors } = useTheme();
  const [width, onLayout] = useWidth();
  const height = 22;
  const track = 12;
  const top = (height - track) / 2;
  return (
    <View onLayout={onLayout} accessible accessibilityRole="progressbar" accessibilityLabel={label}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Rect x={0} y={top} width={width} height={track} rx={track / 2} fill={colors.border} />
          <Rect
            x={0}
            y={top}
            width={Math.max(track, width * ratio)}
            height={track}
            rx={track / 2}
            fill={colors.primary}
          />
          {expectedRatio !== null ? (
            <Line
              x1={Math.min(width - 1.5, Math.max(1.5, width * expectedRatio))}
              x2={Math.min(width - 1.5, Math.max(1.5, width * expectedRatio))}
              y1={0}
              y2={height}
              stroke={colors.momentum}
              strokeWidth={3}
              strokeLinecap="round"
            />
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
}
