import { describe, expect, it } from 'vitest';
import {
  beginTransformSession,
  buildTransformPreview,
  formatTransformStatus,
  isTransformInputKey,
  normalizeTransformAxis,
  resolveTransform,
} from './transforms';
import { makeCircleOperation, makeLineOperation, makeRectOperation } from '../test/factories';

describe('app transforms', () => {
  it('builds move transforms with axis locks and numeric distance', () => {
    const session = beginTransformSession('move', [makeLineOperation()], ['line-1'], { x: 0, y: 0 });
    if (!session) {
      throw new Error('Expected transform session');
    }

    session.currentPoint = { x: 5, y: 2 };
    expect(resolveTransform(session)).toMatchObject({ dx: 5, dy: 2 });

    session.axis = 'x';
    session.input = '12.5';
    expect(resolveTransform(session)).toMatchObject({ dx: 12.5, dy: 0 });

    session.currentPoint = { x: -80, y: 40 };
    expect(resolveTransform(session)).toMatchObject({ dx: 12.5, dy: 0 });

    session.axis = 'y';
    session.input = '-7';
    expect(resolveTransform(session)).toMatchObject({ dx: 0, dy: -7 });
  });

  it('builds rotate transforms from numeric degrees and pointer delta', () => {
    const session = beginTransformSession('rotate', [makeLineOperation()], ['line-1'], { x: 10, y: 0 });
    if (!session) {
      throw new Error('Expected transform session');
    }

    session.pivot = { x: 0, y: 0 };
    session.currentPoint = { x: 0, y: 10 };
    expect(resolveTransform(session).angleRadians).toBeCloseTo(Math.PI / 2);

    session.input = '180';
    expect(resolveTransform(session).angleRadians).toBeCloseTo(Math.PI);
  });

  it('builds scale transforms and converts circles on non-uniform scaling', () => {
    const session = beginTransformSession('scale', [makeCircleOperation()], ['circle-1'], { x: 9, y: 5 });
    if (!session) {
      throw new Error('Expected transform session');
    }

    session.pivot = { x: 5, y: 5 };
    session.axis = 'x';
    session.input = '2';

    const preview = buildTransformPreview(session, 24);
    expect(preview[0].type).toBe('sketch');
  });

  it('rotates rectangles by converting them into sketch geometry', () => {
    const session = beginTransformSession('rotate', [makeRectOperation()], ['rect-1'], { x: 20, y: 5 });
    if (!session) {
      throw new Error('Expected transform session');
    }

    session.pivot = { x: 10, y: 5 };
    session.input = '90';

    const preview = buildTransformPreview(session);
    expect(preview[0].type).toBe('sketch');
    if (preview[0].type !== 'sketch') {
      throw new Error('Expected sketch conversion');
    }
    expect(preview[0].segments).toHaveLength(4);
  });

  it('formats transform status and validates input keys', () => {
    const session = beginTransformSession('scale', [makeLineOperation()], ['line-1'], { x: 10, y: 0 });
    if (!session) {
      throw new Error('Expected transform session');
    }

    session.axis = 'y';
    session.input = '1.5';
    expect(formatTransformStatus(session)).toContain('Scale Y [1.5]');

    const rotateSession = beginTransformSession('rotate', [makeLineOperation()], ['line-1'], { x: 10, y: 0 });
    if (!rotateSession) {
      throw new Error('Expected transform session');
    }
    rotateSession.input = '45';
    expect(formatTransformStatus(rotateSession)).toContain('Rotate [45]');
    expect(formatTransformStatus(rotateSession)).not.toContain('X/Y axis lock');

    expect(isTransformInputKey('1')).toBe(true);
    expect(isTransformInputKey('-')).toBe(true);
    expect(isTransformInputKey('x')).toBe(false);
    expect(normalizeTransformAxis('scale', null, 'x')).toBe('x');
    expect(normalizeTransformAxis('scale', 'x', 'x')).toBeNull();
    expect(normalizeTransformAxis('rotate', null, 'x')).toBeNull();
  });
});
