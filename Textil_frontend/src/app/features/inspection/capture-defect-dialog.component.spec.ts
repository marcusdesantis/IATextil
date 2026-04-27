import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import {
  CaptureDefectDialogComponent,
  CaptureDefectDialogData,
  CaptureDefectDialogResult,
  RulerPositionInfo,
} from './capture-defect-dialog.component';

// ── Fake data ─────────────────────────────────────────────────────────────────

const RULER_POSITIONS: RulerPositionInfo[] = Array.from({ length: 12 }, (_, i) => ({
  position: i + 1,
  distanceCm: 52.5 + i * 5,
  framesBack: 131 + i * 13,
}));

const DIALOG_DATA: CaptureDefectDialogData = {
  cameraName: 'Demo Cam 1',
  rulerPositions: RULER_POSITIONS,
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('CaptureDefectDialogComponent', () => {
  let fixture: ComponentFixture<CaptureDefectDialogComponent>;
  let component: CaptureDefectDialogComponent;
  let dialogRef: jasmine.SpyObj<MatDialogRef<CaptureDefectDialogComponent, CaptureDefectDialogResult>>;

  beforeEach(async () => {
    dialogRef = jasmine.createSpyObj('MatDialogRef', ['close']);

    await TestBed.configureTestingModule({
      imports: [CaptureDefectDialogComponent],
      providers: [
        provideNoopAnimations(),
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: DIALOG_DATA },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CaptureDefectDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function el<T extends HTMLElement>(selector: string): T {
    return fixture.nativeElement.querySelector(selector) as T;
  }
  function els<T extends HTMLElement>(selector: string): T[] {
    return Array.from(fixture.nativeElement.querySelectorAll(selector)) as T[];
  }
  function click(selector: string): void {
    el<HTMLElement>(selector).click();
    fixture.detectChanges();
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  it('should display the camera name from dialog data', () => {
    expect(el('.dialog-header__camera').textContent).toContain('Demo Cam 1');
  });

  it('should render one ruler button for each position', () => {
    expect(els('.ruler-btn').length).toBe(12);
  });

  it('should label each button with its 1-based position number', () => {
    els<HTMLButtonElement>('.ruler-btn').forEach((btn, i) => {
      expect(btn.textContent?.trim()).toBe(String(i + 1));
    });
  });

  // ── Initial state (no position selected) ───────────────────────────────────

  it('should disable Confirm when no position is selected', () => {
    expect(el<HTMLButtonElement>('.action-btn--confirm').disabled).toBeTrue();
  });

  it('should show idle info banner and hide active banner initially', () => {
    expect(el('.info-banner--idle')).toBeTruthy();
    expect(el('.info-banner--active')).toBeNull();
  });

  // ── Position selection ─────────────────────────────────────────────────────

  it('should enable Confirm after a position is selected', () => {
    click('.ruler-btn');
    expect(el<HTMLButtonElement>('.action-btn--confirm').disabled).toBeFalse();
  });

  it('should apply ruler-btn--selected only to the clicked button', () => {
    const buttons = els<HTMLButtonElement>('.ruler-btn');
    buttons[2].click(); // position 3
    fixture.detectChanges();

    expect(buttons[2].classList).toContain('ruler-btn--selected');
    buttons.filter((_, i) => i !== 2).forEach(btn =>
      expect(btn.classList).not.toContain('ruler-btn--selected')
    );
  });

  it('should move selection when a different button is clicked', () => {
    const buttons = els<HTMLButtonElement>('.ruler-btn');
    buttons[0].click();
    fixture.detectChanges();
    buttons[5].click();
    fixture.detectChanges();

    expect(buttons[5].classList).toContain('ruler-btn--selected');
    expect(buttons[0].classList).not.toContain('ruler-btn--selected');
  });

  it('should show active info banner with position number and framesBack', () => {
    const buttons = els<HTMLButtonElement>('.ruler-btn');
    buttons[2].click(); // position 3
    fixture.detectChanges();

    expect(el('.info-banner--active')).toBeTruthy();
    expect(el('.info-banner--idle')).toBeNull();
    const mainText = el('.info-banner__main').textContent ?? '';
    expect(mainText).toContain('#3');
    expect(mainText).toContain(String(RULER_POSITIONS[2].framesBack));
  });

  // ── Dialog actions ─────────────────────────────────────────────────────────

  it('should close the dialog with position and framesBack on confirm', () => {
    const buttons = els<HTMLButtonElement>('.ruler-btn');
    buttons[2].click(); // position 3
    fixture.detectChanges();

    click('.action-btn--confirm');

    expect(dialogRef.close).toHaveBeenCalledOnceWith({
      rulerPosition: 3,
      framesBack: RULER_POSITIONS[2].framesBack,
    });
  });

  it('should close the dialog with undefined on cancel', () => {
    click('.action-btn--cancel');
    expect(dialogRef.close).toHaveBeenCalledOnceWith(undefined);
  });

  it('should not close the dialog if confirm() is called without a selection', () => {
    component.confirm();
    expect(dialogRef.close).not.toHaveBeenCalled();
  });
});
