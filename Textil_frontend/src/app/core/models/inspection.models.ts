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
}
