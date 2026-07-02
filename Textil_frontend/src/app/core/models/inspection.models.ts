export interface CameraInfo {
  id: string;
  serial: string;
  name: string;
  modelName: string;
  interfaceName: string;
}

export interface ActiveSession {
  cameraId: string;
  recordingId: number;
  sessionName: string;
  isRecording: boolean;
  totalFrames: number;
  latestFrameId: number;
  fabricIsMoving: boolean;
  isPaused: boolean;
  bufferFrameCount: number;
  ringBufferSize: number;
}

export interface StartRecordingResponse {
  message: string;
  cameraId: string;
  folder: string;
}

export interface StopRecordingResponse {
  message: string;
  cameraId: string;
}

export interface DefectAnnotation {
  annotationId: number;
  snapshotId: number;
  sectionIndex: number;
  defectType: string | null;
  cropImagePath: string | null;
  createdAt: string;
}

export interface DefectTypeCount {
  defectType: string | null;
  count: number;
}

export interface DefectStats {
  from: string | null;
  to: string | null;
  total: number;
  byType: DefectTypeCount[];
}

export interface InspectionSnapshot {
  snapshotId: number;
  recordingId: number | null;
  fileName: string;
  fileRelativePath: string;
  captureTimestamp: string;
  cameraFrameId: number;
  machineState: string;
  notes: string;
  defectType: string | null;
  rulerPosition: number | null;
  calculatedOffsetFrames: number | null;

  // Composition info (only present on the response right after a capture)
  stitchedFrameCount?: number | null;
  framesBack?: number | null;
  framesForward?: number | null;
  stitchedWidth?: number | null;
  stitchedHeight?: number | null;
  bufferFrameCount?: number | null;
  firstFrameId?: number | null;
  lastFrameId?: number | null;

  // Recording run ("corrida") the stitched frames came from. Meaningful for LOCAL sessions whose
  // buffer holds several concatenated runs; a physical camera session is always a single run.
  corrida?: number | null;
  corridaCount?: number | null;
  corridaSpansMultiple?: boolean | null;
}
