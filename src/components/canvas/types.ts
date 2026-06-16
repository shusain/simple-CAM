import type {
  CircleOperation,
  DrillOperation,
  MachineSettings,
  Operation,
  PastePreview,
  Point,
  SketchEditState,
  SketchHandle,
  SketchOperation,
  SketchSegment,
  ZoomRequest,
  LineOperation,
  RectOperation,
} from '../../types';
import type { ToolpathPreview } from '../../utils/toolpathPreview';

export type CanvasTool = 'select' | 'drill' | 'line' | 'sketch' | 'arc' | 'rect' | 'circle';

export type SketchInsertTool = 'sketch' | 'arc';

export type SketchPreviewOperation = SketchOperation;

export type OperationInput =
  | Omit<DrillOperation, 'id'>
  | Omit<LineOperation, 'id'>
  | Omit<RectOperation, 'id'>
  | Omit<CircleOperation, 'id'>
  | Omit<SketchOperation, 'id'>;

export interface ViewportSize {
  width: number;
  height: number;
}

export interface BaseViewport extends ViewportSize {
  workWidth: number;
  workHeight: number;
  fitScale: number;
}

export interface ViewState {
  zoom: number;
  center: Point;
}

export interface ViewTransform extends BaseViewport {
  zoom: number;
  scale: number;
  viewWidth: number;
  viewHeight: number;
  center: Point;
  left: number;
  bottom: number;
  right: number;
  top: number;
}

export interface SketchSegmentOperationItem {
  index: number;
  segment: SketchSegment;
  start: Point;
  operation: SketchPreviewOperation;
}

export interface SketchArcInsertDraft {
  mode: SketchInsertTool;
  startPoint: Point;
  chainStartPoint?: Point;
  endPoint?: Point;
}

export interface MoveSelectedOperationsArgs {
  ids: string[];
  sourceOperations: Operation[];
  dx: number;
  dy: number;
}

export interface SelectOptions {
  additive?: boolean;
  toggle?: boolean;
}

export interface InteractionState {
  mode: 'pan' | 'marquee' | 'drag-ops' | 'draw' | 'drag-handle' | null;
  pointerId: number | null;
  start: Point | null;
  startCenter: Point | null;
  startClient: Point | null;
  selectedIds: string[] | null;
  sourceOperations: Operation[] | null;
  additive: boolean;
  handle?: SketchHandle | null;
}

export interface CamCanvasProps {
  activeTool: CanvasTool;
  settings: MachineSettings;
  operations: Operation[];
  transformPreviewOperations: Operation[];
  selectedOperationIds: string[];
  onSelectOperation: (id: string | null, options?: SelectOptions) => void;
  onSetSelection: (ids: string[], options?: { additive?: boolean }) => void;
  onAddOperation: (operation: OperationInput) => string;
  onMoveOperations: (args: MoveSelectedOperationsArgs) => void;
  activeToolId: string;
  activeMaterialId: string;
  defaultDrillDepth: number;
  zoomRequest: ZoomRequest | null;
  pastePreview: PastePreview | null;
  onPlacePaste: (point: Point) => void;
  onPointerUpdate: (point: Point) => void;
  onCommitTransformPreview: () => void;
  sketchEdit: SketchEditState;
  onUpdateOperation: (id: string, updates: Partial<Operation>) => void;
  onSelectSketchSegment: (segmentIndex: number | null) => void;
  showToolpathPreview: boolean;
  toolpathPreview: ToolpathPreview | null;
  transformHint: string | null;
}
