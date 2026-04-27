import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CameraInfo,
  ActiveSession,
  StartRecordingResponse,
  StopRecordingResponse,
  InspectionSnapshot,
  DefectAnnotation,
} from '../models/inspection.models';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class InspectionService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/inspection`;

  constructor(private http: HttpClient) {}

  getCameras(): Observable<CameraInfo[]> {
    return this.http.get<CameraInfo[]>(`${this.baseUrl}/cameras`);
  }

  getRulerConfig(): Observable<{
    defectTypes: string[];
    imageSectionCount: number;
    positionCount: number;
    baseDistanceCm: number;
    positionSpacingCm: number;
    cmPerFrame: number;
    positions: Array<{ position: number; distanceCm: number; framesBack: number }>;
  }> {
    return this.http.get<any>(`${this.baseUrl}/ruler-config`);
  }

  getActiveSessions(): Observable<ActiveSession[]> {
    return this.http.get<ActiveSession[]>(`${this.baseUrl}/active-sessions`);
  }

  startRecording(cameraId: string, machineState?: string, ringBufferSize?: number): Observable<StartRecordingResponse> {
    let params = new HttpParams();
    if (machineState) params = params.set('machineState', machineState);
    if (ringBufferSize !== undefined) params = params.set('ringBufferSize', String(ringBufferSize));
    return this.http.post<StartRecordingResponse>(
      `${this.baseUrl}/start-recording/${encodeURIComponent(cameraId)}`,
      null,
      { params }
    );
  }

  stopRecording(cameraId: string): Observable<StopRecordingResponse> {
    return this.http.post<StopRecordingResponse>(
      `${this.baseUrl}/stop-recording/${encodeURIComponent(cameraId)}`,
      null
    );
  }

  captureImage(cameraId: string, machineState?: string, notes?: string): Observable<InspectionSnapshot> {
    let params = new HttpParams();
    if (machineState) {
      params = params.set('machineState', machineState);
    }
    if (notes) {
      params = params.set('notes', notes);
    }
    return this.http.post<InspectionSnapshot>(
      `${this.baseUrl}/capture/${encodeURIComponent(cameraId)}`,
      null,
      { params }
    );
  }

  setFabricState(cameraId: string, isMoving: boolean): Observable<{ message: string; cameraId: string; fabricIsMoving: boolean }> {
    const params = new HttpParams().set('isMoving', String(isMoving));
    return this.http.post<{ message: string; cameraId: string; fabricIsMoving: boolean }>(
      `${this.baseUrl}/fabric-state/${encodeURIComponent(cameraId)}`,
      null,
      { params }
    );
  }

  getAnnotations(snapshotId: number): Observable<DefectAnnotation[]> {
    return this.http.get<DefectAnnotation[]>(`${this.baseUrl}/snapshot/${snapshotId}/annotations`);
  }

  createAnnotation(snapshotId: number, sectionIndex: number, defectType?: string): Observable<DefectAnnotation> {
    return this.http.post<DefectAnnotation>(
      `${this.baseUrl}/snapshot/${snapshotId}/annotations`,
      { sectionIndex, defectType: defectType ?? null }
    );
  }

  captureDefect(
    cameraId: string,
    offsetFrames?: number,
    frameCount?: number,
    machineState?: string,
    rulerPosition?: number
  ): Observable<InspectionSnapshot> {
    let params = new HttpParams();
    if (offsetFrames !== undefined) params = params.set('offsetFrames', String(offsetFrames));
    if (frameCount !== undefined) params = params.set('frameCount', String(frameCount));
    if (machineState) params = params.set('machineState', machineState);
    if (rulerPosition !== undefined) params = params.set('rulerPosition', String(rulerPosition));
    return this.http.post<InspectionSnapshot>(
      `${this.baseUrl}/capture-defect/${encodeURIComponent(cameraId)}`,
      null,
      { params }
    );
  }
}
