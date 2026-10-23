import { describe, it, expect } from 'vitest';
import {
  RIGHT_PANEL_BOTTOM, leftPanelLayout, rightPanelMaxWidth, scaleRoomRightOfBar,
} from '../../src/app/components/Map/mapEdgeLayout';

const BAR = 548; // the full-view bottom bar, measured

describe('leftPanelLayout', () => {
  it('ends the sidebar 16px short of the centered bar on wide screens', () => {
    // Bar's left edge at (1440 - 548) / 2 = 446.
    expect(leftPanelLayout(1440, BAR)).toEqual({ width: 430, clearsBar: true });
  });

  it('keeps 19rem and lets the bar overlap its corner where that gap won\'t fit', () => {
    expect(leftPanelLayout(1024, BAR)).toEqual({ width: 304, clearsBar: false });
  });

  it('stops growing at 30rem on very wide screens', () => {
    expect(leftPanelLayout(2560, BAR).width).toBe(480);
  });

  it('leaves phones (full-width sidebar) and an unmeasured bar to the defaults', () => {
    expect(leftPanelLayout(390, BAR)).toBeNull();
    expect(leftPanelLayout(1440, 0)).toBeNull();
  });
});

describe('rightPanelMaxWidth', () => {
  it('keeps right-hand panels fully right of the bar with a 16px gap', () => {
    // 1440 - 16 (margin) - 994 (bar right) - 16 (gap) = 414.
    expect(rightPanelMaxWidth(1440, BAR)).toBe(414);
  });

  it('never goes below a usable 288px', () => {
    expect(rightPanelMaxWidth(900, BAR)).toBe(288);
  });

  it('ends right-hand panels 8px above the zoom buttons', () => {
    // 16 (bottom-4) + 146 (four 36px buttons and a border) + 8.
    expect(RIGHT_PANEL_BOTTOM).toBe(170);
  });
});

describe('scaleRoomRightOfBar', () => {
  it('fits the full 100px scale between the bar and the zoom buttons on wide screens', () => {
    expect(scaleRoomRightOfBar(1440, BAR)).toBe(100);
  });

  it('has no room on phones or when the gap is too small', () => {
    expect(scaleRoomRightOfBar(390, 300)).toBe(0);
    expect(scaleRoomRightOfBar(700, BAR)).toBe(0);
  });
});
