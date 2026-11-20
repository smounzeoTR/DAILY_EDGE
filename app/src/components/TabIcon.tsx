// Tab bar icons drawn with react-native-svg (no icon font dependency).
import type { ColorValue } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

export type TabIconName = 'today' | 'progress' | 'library' | 'settings';

export function TabIcon({
  name,
  color,
  size = 24,
}: {
  name: TabIconName;
  color: ColorValue;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {name === 'today' ? (
        <>
          {/* Rising sun on the horizon */}
          <Path d="M6 15 A6 6 0 0 1 18 15 Z" fill={color} />
          <Line
            x1={3}
            y1={15}
            x2={21}
            y2={15}
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
          />
          <Line
            x1={7}
            y1={19}
            x2={17}
            y2={19}
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.55}
          />
        </>
      ) : null}
      {name === 'progress' ? (
        <>
          <Rect x={4} y={13} width={4} height={7} rx={1.5} fill={color} />
          <Rect x={10} y={8} width={4} height={12} rx={1.5} fill={color} />
          <Rect x={16} y={4} width={4} height={16} rx={1.5} fill={color} />
        </>
      ) : null}
      {name === 'settings' ? (
        <>
          <Circle cx={12} cy={12} r={3.2} stroke={color} strokeWidth={2} />
          <Path
            d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
          />
        </>
      ) : null}
      {name === 'library' ? (
        <>
          <Path
            d="M4 5.5C4 4.7 4.7 4 5.5 4H11v16H5.5C4.7 20 4 19.3 4 18.5V5.5Z"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          <Path
            d="M13 4h5.5c.8 0 1.5.7 1.5 1.5v13c0 .8-.7 1.5-1.5 1.5H13V4Z"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          <Circle cx={16.5} cy={8} r={1} fill={color} />
        </>
      ) : null}
    </Svg>
  );
}
