import { describe, expect, it } from 'vitest';
import {
  buildGcodeFileName,
  computeBounds,
  fileNameFromPath,
  getInitialState,
  isEditableElement,
  loadBrowserOctoprintSettings,
  loadPreferences,
  normalizeOctoprintSettings,
  offsetOperation,
  operationsChanged,
  saveBrowserOctoprintSettings,
  savePreferences,
} from './helpers';
import { PREFERENCES_STORAGE_KEY } from './defaults';
import { getOperationBounds } from '../utils/geometry';
import { makeDrillOperation, makeLineOperation, makeMaterial, makeTool } from '../test/factories';

describe('app helpers', () => {
  it('extracts file names from windows and unix paths', () => {
    expect(fileNameFromPath('/tmp/project.cam.json')).toBe('project.cam.json');
    expect(fileNameFromPath('C:\\jobs\\part.gcode')).toBe('part.gcode');
    expect(fileNameFromPath()).toBeNull();
  });

  it('aggregates operation bounds', () => {
    const bounds = computeBounds([makeDrillOperation(), makeLineOperation({ x1: -5, y1: 3, x2: 2, y2: 8 })], getOperationBounds);

    expect(bounds).toEqual({
      minX: -5,
      minY: 3,
      maxX: 10,
      maxY: 20,
    });
  });

  it('detects operation changes by deep value', () => {
    const a = [makeDrillOperation()];
    const b = [makeDrillOperation()];
    const c = [makeDrillOperation({ depth: -4 })];

    expect(operationsChanged(a, a)).toBe(false);
    expect(operationsChanged(a, b)).toBe(false);
    expect(operationsChanged(a, c)).toBe(true);
  });

  it('normalizes octoprint settings and persists browser values', () => {
    expect(normalizeOctoprintSettings({ baseUrl: ' octoprint.local ', apiKey: ' abc ' })).toEqual({
      baseUrl: 'http://octoprint.local',
      apiKey: 'abc',
    });

    saveBrowserOctoprintSettings({ baseUrl: 'printer.local', apiKey: 'key-1' });
    expect(loadBrowserOctoprintSettings()).toEqual({
      baseUrl: 'http://printer.local',
      apiKey: 'key-1',
    });
  });

  it('persists preferences and builds initial state from normalized stored data', () => {
    savePreferences({
      settings: { activeMaterialId: 'missing-material', safeZ: 8 },
      materials: [{ id: '', name: '  Birch  ' } as never, makeMaterial({ id: 'birch' })],
      tools: [{ id: '', name: '  Tool A  ' } as never, makeTool({ id: 'tool-b' })],
      activeToolId: 'tool-b',
    });

    expect(loadPreferences()).not.toBeNull();

    const state = getInitialState();
    expect(state.settings.safeZ).toBe(8);
    expect(state.materials[0]).toEqual({ id: 'material-0', name: 'Birch' });
    expect(state.settings.activeMaterialId).toBe('material-0');
    expect(state.tools[0].id).toBe('tool-0');
    expect(state.activeToolId).toBe('tool-b');
  });

  it('falls back cleanly for invalid preference and octoprint storage values', () => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, 'not-json');
    expect(loadPreferences()).toBeNull();

    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, '5');
    expect(loadPreferences()).toBeNull();

    window.localStorage.setItem('simple-cam.octoprint.v1', 'not-json');
    expect(loadBrowserOctoprintSettings()).toEqual({
      baseUrl: '',
      apiKey: '',
    });
  });

  it('builds gcode filenames from project names', () => {
    expect(buildGcodeFileName('job.cam.json')).toBe('job.gcode');
    expect(buildGcodeFileName('job.cam')).toBe('job.gcode');
    expect(buildGcodeFileName('job.json')).toBe('job.gcode');
    expect(buildGcodeFileName('')).toBe('output.gcode');
  });

  it('stores preferences in the expected localStorage key', () => {
    savePreferences({ settings: { safeZ: 12 } });
    expect(window.localStorage.getItem(PREFERENCES_STORAGE_KEY)).toContain('"safeZ":12');
  });

  it('checks editable elements and offsets operations', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const select = document.createElement('select');

    expect(isEditableElement(input)).toBe(true);
    expect(isEditableElement(textarea)).toBe(true);
    expect(isEditableElement(select)).toBe(true);
    expect(isEditableElement(document.createElement('span'))).toBe(false);
    expect(isEditableElement(null)).toBe(false);

    expect(offsetOperation(makeDrillOperation({ x: 1, y: 2 }), 3, -1)).toMatchObject({
      x: 4,
      y: 1,
    });
  });

  it('handles empty bounds and non-array operation comparisons', () => {
    expect(computeBounds([], getOperationBounds)).toBeNull();
    expect(operationsChanged([] as never, null as never)).toBe(true);
    expect(operationsChanged([makeDrillOperation()], [makeDrillOperation(), makeDrillOperation({ id: 'd2' })])).toBe(true);
  });
});
