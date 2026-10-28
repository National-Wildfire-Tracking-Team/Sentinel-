/**
 * River gauge hydrograph, like the web's WaterGaugePanel chart: observed stage as a solid blue line
 * over a soft fill, forecast dashed, flood thresholds as colored lines, and a dashed "now" line.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';

import type { GaugeDetail, GaugeSeriesPoint } from '@/data/monitoringLayers';
import { sentinelText } from '@/theme';

const HEIGHT = 210;
const PAD = { top: 12, right: 8, bottom: 22, left: 36 };

export const THRESHOLD_COLORS: Record<string, string> = {
  action: '#f59e0b',
  minor: '#f97316',
  moderate: '#dc2626',
  major: '#9333ea',
};

export function GaugeChart({ detail }: { detail: GaugeDetail }) {
  const [width, setWidth] = useState(0);
  const [now] = useState(() => Date.now());
  const all = [...detail.observed, ...detail.forecast];
  if (all.length < 2) return null;

  const t0 = Math.min(...all.map(p => p.t));
  const t1 = Math.max(...all.map(p => p.t), now);
  const thresholdValues = Object.values(detail.thresholds);
  const values = all.map(p => p.ft);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  // Show the thresholds that are near the data, like the web.
  for (const v of thresholdValues) if (v <= hi + (hi - lo) * 0.6 + 1) hi = Math.max(hi, v);
  const span = Math.max(hi - lo, 1);
  lo -= span * 0.08;
  hi += span * 0.08;

  const plotW = Math.max(width - PAD.left - PAD.right, 1);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0 || 1)) * plotW;
  const y = (ft: number) => PAD.top + (1 - (ft - lo) / (hi - lo)) * plotH;
  const path = (pts: GaugeSeriesPoint[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.ft).toFixed(1)}`).join('');
  const obsPath = path(detail.observed);
  const lastObs = detail.observed[detail.observed.length - 1];
  const fillPath = detail.observed.length > 1 ? `${obsPath}L${x(lastObs.t)},${PAD.top + plotH}L${x(detail.observed[0].t)},${PAD.top + plotH}Z` : '';
  const ticks = [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1];
  const shortDate = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      <Text style={styles.caption}>Water level in ft</Text>
      {width > 0 ? (
        <Svg width={width} height={HEIGHT}>
          <Defs>
            <LinearGradient id="obs" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#3b82f6" stopOpacity={0.35} />
              <Stop offset="1" stopColor="#3b82f6" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x={PAD.left} y={PAD.top} width={Math.max(x(now) - PAD.left, 0)} height={plotH} fill="rgba(59,130,246,0.07)" />
          {ticks.map(v => (
            <SvgText key={v} x={PAD.left - 6} y={y(v) + 4} fontSize={10} fill={sentinelText[300]} textAnchor="end">
              {v.toFixed(v < 10 ? 1 : 0)}
            </SvgText>
          ))}
          {Object.entries(detail.thresholds).map(([k, v]) =>
            v >= lo && v <= hi ? (
              <React.Fragment key={k}>
                <Line x1={PAD.left} x2={PAD.left + plotW} y1={y(v)} y2={y(v)} stroke={THRESHOLD_COLORS[k]} strokeWidth={1.2} />
                <SvgText x={PAD.left + plotW - 2} y={y(v) - 3} fontSize={9} fontWeight="700" fill={THRESHOLD_COLORS[k]} textAnchor="end">
                  {`${k.toUpperCase()} ${v} FT`}
                </SvgText>
              </React.Fragment>
            ) : null,
          )}
          {fillPath ? <Path d={fillPath} fill="url(#obs)" /> : null}
          {detail.observed.length > 1 ? <Path d={obsPath} stroke="#3b82f6" strokeWidth={3} fill="none" strokeLinejoin="round" /> : null}
          {detail.forecast.length > 1 ? (
            <Path d={path(detail.forecast)} stroke="#3b82f6" strokeWidth={2.5} strokeDasharray="6,4" fill="none" />
          ) : null}
          <Line x1={x(now)} x2={x(now)} y1={PAD.top} y2={PAD.top + plotH} stroke="#e2e8f0" strokeDasharray="4,3" strokeWidth={1} />
          <SvgText x={x(now)} y={HEIGHT - 6} fontSize={10} fill={sentinelText[200]} textAnchor="middle">
            Now
          </SvgText>
          <SvgText x={PAD.left} y={HEIGHT - 6} fontSize={10} fill={sentinelText[300]}>
            {shortDate(t0)}
          </SvgText>
          <SvgText x={PAD.left + plotW} y={HEIGHT - 6} fontSize={10} fill={sentinelText[300]} textAnchor="end">
            {shortDate(t1)}
          </SvgText>
        </Svg>
      ) : (
        <View style={{ height: HEIGHT }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { color: sentinelText[200], fontSize: 12, fontWeight: '600', marginBottom: 4 },
});
