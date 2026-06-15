import { describe, expect, it } from 'vitest';
import { appendPathWithTabs, getTabRanges } from './tabs';
import {
  makeCircleOperation,
  makeLineOperation,
  makeRectOperation,
  makeSketchOperation,
  makeTool,
} from '../../test/factories';

describe('gcode tab helpers', () => {
  it('accounts for tool diameter when computing tab width', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ];
    const tool = makeTool({ diameter: 2 });

    const circleTabs = getTabRanges(path, makeCircleOperation({ tabsEnabled: true, tabCount: 2, tabWidth: 1 }), tool);
    const sketchTabs = getTabRanges(path, makeSketchOperation({ tabsEnabled: true, tabCount: 2, tabWidth: 1 }), tool);

    expect(circleTabs[0].end - circleTabs[0].start).toBeCloseTo(3);
    expect(sketchTabs[0].end - sketchTabs[0].start).toBeCloseTo(3);
  });

  it('prefers long segments for rectangle tab placement', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 5 },
      { x: 0, y: 5 },
      { x: 0, y: 0 },
    ];

    const tabs = getTabRanges(path, makeRectOperation({ tabsEnabled: true, tabCount: 2, tabWidth: 2 }), makeTool({ diameter: 0 }));

    expect(tabs).toHaveLength(2);
    expect(tabs[0].start).toBeLessThan(10);
    expect(tabs[1].start).toBeGreaterThan(20);
  });

  it('falls back to even spacing for higher rectangle tab counts and skips unsupported operations', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ];

    const manyRectTabs = getTabRanges(path, makeRectOperation({ tabsEnabled: true, tabCount: 6, tabWidth: 2 }), makeTool({ diameter: 1 }));
    const openSketchTabs = getTabRanges(path, makeSketchOperation({ tabsEnabled: true, closed: false }), makeTool());
    const lineTabs = getTabRanges(path, makeLineOperation() as never, makeTool());

    expect(manyRectTabs).toHaveLength(6);
    expect(manyRectTabs[0].start).toBeGreaterThanOrEqual(0);
    expect(manyRectTabs[manyRectTabs.length - 1].end).toBeLessThanOrEqual(60);
    expect(openSketchTabs).toEqual([]);
    expect(lineTabs).toEqual([]);
  });

  it('emits tab moves in up-over-down order with comments', () => {
    const lines: string[] = [];
    appendPathWithTabs(
      lines,
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      -2,
      -1,
      '600.000',
      '220.000',
      [{ start: 4, end: 6 }]
    );

    expect(lines).toEqual([
      'G1 X4.000 Y0.000 F600.000',
      '; Tab 1 start',
      'G1 Z-1.000 F220.000',
      'G1 X6.000 Y0.000 F600.000',
      '; Tab 1 end',
      'G1 Z-2.000 F220.000',
      'G1 X10.000 Y0.000 F600.000',
    ]);
  });

  it('handles skipped and spanning tab ranges without duplicate lifts', () => {
    const lines: string[] = [];
    appendPathWithTabs(
      lines,
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
      ],
      -2,
      -1,
      '600.000',
      '220.000',
      [
        { start: -5, end: 2 },
        { start: 8, end: 12 },
      ]
    );

    expect(lines).toEqual([
      '; Tab 1 start',
      'G1 Z-1.000 F220.000',
      'G1 X2.000 Y0.000 F600.000',
      '; Tab 1 end',
      'G1 Z-2.000 F220.000',
      'G1 X8.000 Y0.000 F600.000',
      '; Tab 2 start',
      'G1 Z-1.000 F220.000',
      'G1 X10.000 Y0.000 F600.000',
      'G1 X12.000 Y0.000 F600.000',
      '; Tab 2 end',
      'G1 Z-2.000 F220.000',
      'G1 X20.000 Y0.000 F600.000',
    ]);
  });
});
