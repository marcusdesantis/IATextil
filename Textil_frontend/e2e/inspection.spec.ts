import { test, expect, Page } from '@playwright/test';

// ── Fake data ─────────────────────────────────────────────────────────────────

const CAMERA = {
  id: 'DEV_001',
  serial: 'SN001',
  name: 'Demo Cam 1',
  modelName: 'Vimba Demo',
  interfaceName: 'USB3',
};

const IDLE_SESSION = null;

const ACTIVE_SESSION = {
  cameraId: 'DEV_001',
  recordingId: 1,
  sessionName: 'session-001',
  isRecording: true,
  totalFrames: 320,
  latestFrameId: 319,
  fabricIsMoving: true,
  isPaused: false,
  bufferFrameCount: 300,
  ringBufferSize: 500,
};

const RULER_CONFIG = {
  defectTypes: ['Slub', 'Floats', 'Knot', 'Holes', 'Ladder'],
  imageSectionCount: 10,
  positionCount: 12,
  baseDistanceCm: 50,
  positionSpacingCm: 5,
  cmPerFrame: 0.4,
  positions: Array.from({ length: 12 }, (_, i) => ({
    position: i + 1,
    distanceCm: 52.5 + i * 5,
    framesBack: 131 + i * 13,
  })),
};

// ── Route mock helpers ────────────────────────────────────────────────────────

/** Intercepts all standard read-only endpoints needed on every page load. */
async function mockBaseRoutes(page: Page, sessions: object[]) {
  await page.route(url => url.href.includes('/api/inspection/cameras'), route =>
    route.fulfill({ json: [CAMERA] })
  );
  await page.route(url => url.href.includes('/api/inspection/ruler-config'), route =>
    route.fulfill({ json: RULER_CONFIG })
  );
  await page.route(url => url.href.includes('/api/inspection/active-sessions'), route =>
    route.fulfill({ json: sessions })
  );
}

/** Intercepts the snapshot-image endpoint with a 1×1 transparent PNG. */
async function mockSnapshotImage(page: Page) {
  // Minimal valid 1×1 transparent PNG (67 bytes)
  const PNG_1X1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  await page.route(url => url.href.includes('/api/inspection/snapshot-image'), route =>
    route.fulfill({ body: PNG_1X1, contentType: 'image/png' })
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Inspection page', () => {

  // ── Flow 1: cameras list ────────────────────────────────────────────────────

  test('shows camera panel with name and idle state when no session is active', async ({ page }) => {
    await mockBaseRoutes(page, []);

    await page.goto('/inspection');

    // Camera name and model are visible
    await expect(page.getByText('Demo Cam 1')).toBeVisible();
    await expect(page.getByText('Vimba Demo')).toBeVisible();

    // Idle state message
    await expect(page.getByText('No active session', { exact: false })).toBeVisible();

    // Start enabled, Stop disabled
    const startBtn = page.getByRole('button', { name: /start/i });
    const stopBtn  = page.getByRole('button', { name: /stop/i });
    await expect(startBtn).toBeEnabled();
    await expect(stopBtn).toBeDisabled();
  });

  // ── Flow 2: empty cameras ───────────────────────────────────────────────────

  test('shows "No cameras found" when the backend returns an empty list', async ({ page }) => {
    await page.route(url => url.href.includes('/api/inspection/cameras'), route =>
      route.fulfill({ json: [] })
    );
    await page.route(url => url.href.includes('/api/inspection/ruler-config'), route =>
      route.fulfill({ json: RULER_CONFIG })
    );
    // active-sessions is not called when there are no cameras, but mock it defensively
    await page.route(url => url.href.includes('/api/inspection/active-sessions'), route =>
      route.fulfill({ json: [] })
    );

    await page.goto('/inspection');

    await expect(page.getByRole('heading', { name: /no cameras found/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /retry/i })).toBeVisible();
  });

  // ── Flow 3: backend error ───────────────────────────────────────────────────

  test('shows error banner when the camera endpoint returns a server error', async ({ page }) => {
    await page.route(url => url.href.includes('/api/inspection/cameras'), route =>
      route.fulfill({ status: 500, json: { message: 'Internal Server Error' } })
    );
    await page.route(url => url.href.includes('/api/inspection/ruler-config'), route =>
      route.fulfill({ json: RULER_CONFIG })
    );

    await page.goto('/inspection');

    await expect(page.getByText(/could not load cameras/i)).toBeVisible();
  });

  // ── Flow 4: start recording changes UI ─────────────────────────────────────

  test('shows REC badge and Fabric moving state after starting a recording', async ({ page }) => {
    // active-sessions returns empty on first call, then returns an active session
    let sessionCalls = 0;
    await page.route(url => url.href.includes('/api/inspection/cameras'), route =>
      route.fulfill({ json: [CAMERA] })
    );
    await page.route(url => url.href.includes('/api/inspection/ruler-config'), route =>
      route.fulfill({ json: RULER_CONFIG })
    );
    await page.route(url => url.href.includes('/api/inspection/active-sessions'), route => {
      sessionCalls++;
      // First call (on load): no session; subsequent calls (after start): active session
      route.fulfill({ json: sessionCalls === 1 ? [] : [ACTIVE_SESSION] });
    });
    await page.route(url => url.href.includes('/api/inspection/start-recording'), route =>
      route.fulfill({ json: { message: 'Recording started', cameraId: 'DEV_001', folder: '/captures/DEV_001' } })
    );

    await page.goto('/inspection');
    await expect(page.getByText('Demo Cam 1')).toBeVisible();

    // Click Start
    await page.getByRole('button', { name: /start/i }).click();

    // REC badge and fabric state appear
    await expect(page.locator('.rec-badge')).toBeVisible();
    await expect(page.locator('.fabric-state__main')).toContainText('Fabric moving');

    // Stop button is now enabled, Start is disabled
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeDisabled();
  });

  // ── Flow 5: stop fabric enables capture button ──────────────────────────────

  test('enables Capture button and shows "Fabric stopped" after stopping the fabric', async ({ page }) => {
    // fabricIsMoving starts as true; after the toggle API call the flag is flipped so
    // the subsequent refreshSessions() call also returns fabricIsMoving: false
    let fabricIsMoving = true;

    await page.route(url => url.href.includes('/api/inspection/cameras'), route =>
      route.fulfill({ json: [CAMERA] })
    );
    await page.route(url => url.href.includes('/api/inspection/ruler-config'), route =>
      route.fulfill({ json: RULER_CONFIG })
    );
    await page.route(url => url.href.includes('/api/inspection/active-sessions'), route =>
      route.fulfill({ json: [{ ...ACTIVE_SESSION, fabricIsMoving, isPaused: !fabricIsMoving }] })
    );
    await page.route(url => url.href.includes('/api/inspection/fabric-state'), route => {
      fabricIsMoving = false; // flip before fulfilling so refreshSessions sees the new state
      route.fulfill({
        json: { message: 'Fabric stopped', cameraId: 'DEV_001', fabricIsMoving: false },
      });
    });

    await page.goto('/inspection');

    // Verify recording is active
    await expect(page.locator('.rec-badge')).toBeVisible();
    await expect(page.locator('.fabric-state__main')).toContainText('Fabric moving');

    // Capture button disabled while fabric is moving
    const captureBtn = page.getByRole('button', { name: /capture/i });
    await expect(captureBtn).toBeDisabled();

    // Click "Stop fabric"
    await page.getByRole('button', { name: /stop fabric/i }).click();

    // Fabric stopped state
    await expect(page.locator('.fabric-state__main')).toContainText('Fabric stopped');

    // Capture button is now enabled
    await expect(captureBtn).toBeEnabled();
  });

  // ── Flow 6: stop recording ──────────────────────────────────────────────────

  test('hides REC badge and re-enables Start after stopping a recording', async ({ page }) => {
    let sessionCalls = 0;
    await page.route(url => url.href.includes('/api/inspection/cameras'), route =>
      route.fulfill({ json: [CAMERA] })
    );
    await page.route(url => url.href.includes('/api/inspection/ruler-config'), route =>
      route.fulfill({ json: RULER_CONFIG })
    );
    await page.route(url => url.href.includes('/api/inspection/active-sessions'), route => {
      sessionCalls++;
      route.fulfill({ json: sessionCalls === 1 ? [ACTIVE_SESSION] : [] });
    });
    await page.route(url => url.href.includes('/api/inspection/stop-recording'), route =>
      route.fulfill({ json: { message: 'Recording stopped' } })
    );

    await page.goto('/inspection');

    // Verify we start with a recording active
    await expect(page.locator('.rec-badge')).toBeVisible();

    // Click Stop
    await page.getByRole('button', { name: 'Stop', exact: true }).click();

    // REC badge disappears, idle message appears
    await expect(page.locator('.rec-badge')).not.toBeVisible();
    await expect(page.getByText('No active session', { exact: false })).toBeVisible();

    // Start re-enabled, Stop disabled
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeDisabled();
  });

  // ── Flow 7: open capture defect dialog ─────────────────────────────────────

  test('opens capture dialog with camera name and 12 ruler buttons when Capture is clicked', async ({ page }) => {
    await page.route(url => url.href.includes('/api/inspection/cameras'), route =>
      route.fulfill({ json: [CAMERA] })
    );
    await page.route(url => url.href.includes('/api/inspection/ruler-config'), route =>
      route.fulfill({ json: RULER_CONFIG })
    );
    await page.route(url => url.href.includes('/api/inspection/active-sessions'), route =>
      route.fulfill({ json: [{ ...ACTIVE_SESSION, fabricIsMoving: false, isPaused: true }] })
    );

    await page.goto('/inspection');

    // Wait for the fabric-stopped state so Capture is enabled
    await expect(page.locator('.fabric-state__main')).toContainText('Fabric stopped');

    await page.getByRole('button', { name: /capture/i }).click();

    // Dialog is visible with correct title and camera name
    await expect(page.locator('.dialog-header__title')).toContainText('Capture Defect');
    await expect(page.locator('.dialog-header__camera')).toContainText('Demo Cam 1');

    // 12 ruler position buttons rendered
    const rulerButtons = page.locator('.ruler-btn');
    await expect(rulerButtons).toHaveCount(12);
  });

  // ── Flow 8: select ruler position ──────────────────────────────────────────

  test('marks selected ruler button and shows info banner when a position is tapped', async ({ page }) => {
    await page.route(url => url.href.includes('/api/inspection/cameras'), route =>
      route.fulfill({ json: [CAMERA] })
    );
    await page.route(url => url.href.includes('/api/inspection/ruler-config'), route =>
      route.fulfill({ json: RULER_CONFIG })
    );
    await page.route(url => url.href.includes('/api/inspection/active-sessions'), route =>
      route.fulfill({ json: [{ ...ACTIVE_SESSION, fabricIsMoving: false, isPaused: true }] })
    );

    await page.goto('/inspection');
    await expect(page.locator('.fabric-state__main')).toContainText('Fabric stopped');

    await page.getByRole('button', { name: /capture/i }).click();
    await expect(page.locator('.ruler-btn')).toHaveCount(12);

    // Click position 3 (third button in the grid)
    await page.locator('.ruler-btn').nth(2).click();

    // The clicked button gets the selected class
    await expect(page.locator('.ruler-btn--selected')).toHaveText('3');

    // Info banner shows position details
    await expect(page.locator('.info-banner--active')).toBeVisible();
    await expect(page.locator('.info-banner__main')).toContainText('Position #3');

    // Confirm button is now enabled
    await expect(page.getByRole('button', { name: /capture/i }).last()).toBeEnabled();
  });

  // ── Flow 9: confirm capture → snackbar shows fileName ──────────────────────

  test('closes dialog and shows captured file name in snackbar after confirming capture', async ({ page }) => {
    const FAKE_SNAPSHOT = {
      id: 42,
      cameraId: 'DEV_001',
      fileName: 'capture_20240101_120000.png',
      captureTimestamp: '2024-01-01T12:00:00Z',
      defectType: null,
      rulerPosition: 3,
      sectionIndex: null,
    };

    await page.route(url => url.href.includes('/api/inspection/cameras'), route =>
      route.fulfill({ json: [CAMERA] })
    );
    await page.route(url => url.href.includes('/api/inspection/ruler-config'), route =>
      route.fulfill({ json: RULER_CONFIG })
    );
    await page.route(url => url.href.includes('/api/inspection/active-sessions'), route =>
      route.fulfill({ json: [{ ...ACTIVE_SESSION, fabricIsMoving: false, isPaused: true }] })
    );
    await mockSnapshotImage(page);
    await page.route(url => url.href.includes('/api/inspection/capture-defect'), route =>
      route.fulfill({ json: FAKE_SNAPSHOT })
    );
    // Mock annotations endpoint that the image viewer may request
    await page.route(url => url.href.includes('/api/inspection/snapshot'), route =>
      route.fulfill({ json: [] })
    );

    await page.goto('/inspection');
    await expect(page.locator('.fabric-state__main')).toContainText('Fabric stopped');

    // Open dialog
    await page.getByRole('button', { name: /capture/i }).click();
    await expect(page.locator('.ruler-btn')).toHaveCount(12);

    // Select position 3
    await page.locator('.ruler-btn').nth(2).click();
    await expect(page.locator('.ruler-btn--selected')).toBeVisible();

    // Confirm capture
    await page.getByRole('button', { name: /capture/i }).last().click();

    // Snackbar shows the file name (proves dialog closed and POST succeeded)
    await expect(page.locator('mat-snack-bar-container')).toContainText('capture_20240101_120000.png');
  });

  // ── Flow 10: resume fabric ──────────────────────────────────────────────────

  test('shows "Fabric moving" and disables Capture after resuming the fabric', async ({ page }) => {
    let fabricIsMoving = false;

    await page.route(url => url.href.includes('/api/inspection/cameras'), route =>
      route.fulfill({ json: [CAMERA] })
    );
    await page.route(url => url.href.includes('/api/inspection/ruler-config'), route =>
      route.fulfill({ json: RULER_CONFIG })
    );
    await page.route(url => url.href.includes('/api/inspection/active-sessions'), route =>
      route.fulfill({ json: [{ ...ACTIVE_SESSION, fabricIsMoving, isPaused: !fabricIsMoving }] })
    );
    await page.route(url => url.href.includes('/api/inspection/fabric-state'), route => {
      fabricIsMoving = true;
      route.fulfill({ json: { message: 'Fabric moving — buffer active', cameraId: 'DEV_001', fabricIsMoving: true } });
    });

    await page.goto('/inspection');

    // Starts in paused / stopped state
    await expect(page.locator('.rec-badge--paused')).toBeVisible();
    await expect(page.locator('.fabric-state__main')).toContainText('Fabric stopped');

    // Click "Move fabric"
    await page.getByRole('button', { name: /move fabric/i }).click();

    // Fabric is now moving: regular REC badge, no paused badge, Capture disabled
    await expect(page.locator('.fabric-state__main')).toContainText('Fabric moving');
    await expect(page.locator('.rec-badge--paused')).not.toBeVisible();
    await expect(page.locator('.rec-badge')).toBeVisible();
    await expect(page.getByRole('button', { name: /capture/i })).toBeDisabled();
  });

  // ── Flow 11: image viewer — select section, annotate, save ─────────────────

  test('image viewer: clicking a section opens zoom, selecting defect type and saving shows Saved badge', async ({ page }) => {
    const SNAPSHOT = {
      snapshotId: 42,
      recordingId: 1,
      fileName: 'defect_snap.bin',
      fileRelativePath: 'snapshots/defect_snap.bin',
      captureTimestamp: '2024-01-01T12:00:00Z',
      cameraFrameId: 150,
      machineState: 'DefectCapture',
      notes: null,
      defectType: null,
      rulerPosition: 3,
      calculatedOffsetFrames: 131,
    };
    const ANNOTATION = {
      annotationId: 1,
      snapshotId: 42,
      sectionIndex: 3,
      defectType: 'Slub',
      cropImagePath: null,
      createdAt: '2024-01-01T12:00:00Z',
    };

    await page.route(url => url.href.includes('/api/inspection/cameras'), route =>
      route.fulfill({ json: [CAMERA] })
    );
    await page.route(url => url.href.includes('/api/inspection/ruler-config'), route =>
      route.fulfill({ json: RULER_CONFIG })
    );
    await page.route(url => url.href.includes('/api/inspection/active-sessions'), route =>
      route.fulfill({ json: [{ ...ACTIVE_SESSION, fabricIsMoving: false, isPaused: true }] })
    );
    await page.route(url => url.href.includes('/api/inspection/capture-defect'), route =>
      route.fulfill({ json: SNAPSHOT })
    );
    await mockSnapshotImage(page);
    await page.route(url => url.href.includes('/api/inspection/snapshot/42'), async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ json: ANNOTATION });
      } else {
        await route.fulfill({ json: [] });
      }
    });

    await page.goto('/inspection');
    await expect(page.locator('.fabric-state__main')).toContainText('Fabric stopped');

    // Open capture dialog → select position 3 → confirm
    await page.getByRole('button', { name: /capture/i }).click();
    await page.locator('.ruler-btn').nth(2).click();
    await page.getByRole('button', { name: /capture/i }).last().click();

    // Image viewer opens — wait for section bands (appears once image loads)
    await expect(page.locator('.section-band').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.section-band')).toHaveCount(10);

    // Click section 3 (index 2) → zoomed view
    await page.locator('.section-band').nth(2).click();
    await expect(page.locator('.zoomed-wrapper')).toBeVisible();
    await expect(page.locator('.zoomed-label')).toContainText('Section 3');

    // Defect type picker is visible; select "Slub"
    await expect(page.locator('.picker-chip').first()).toBeVisible();
    await page.locator('.picker-chip', { hasText: 'Slub' }).click();
    await expect(page.locator('.picker-chip--selected')).toContainText('Slub');

    // Save annotation
    await page.locator('.save-btn').click();

    // Saved badge appears, picker and save button disappear
    await expect(page.locator('.annotated-badge')).toBeVisible();
    await expect(page.locator('.annotated-badge')).toContainText('Saved');
    await expect(page.locator('.save-btn')).not.toBeVisible();
  });

});

// ── Configuration page ────────────────────────────────────────────────────────

test.describe('Configuration page', () => {

  async function mockConfigRoutes(page: Page) {
    await page.route(url => url.href.includes('/api/inspection/ruler-config'), route =>
      route.fulfill({ json: RULER_CONFIG })
    );
  }

  // ── Flow 12a: page loads with form fields and backend config section ────────

  test('shows form fields and backend config section after loading', async ({ page }) => {
    await mockConfigRoutes(page);

    await page.goto('/configuration');

    // Static page structure
    await expect(page.getByRole('heading', { name: /configuration/i })).toBeVisible();

    // Editable fields present
    await expect(page.getByLabel(/buffer size/i)).toBeVisible();
    await expect(page.getByLabel(/default offset/i)).toBeVisible();
    await expect(page.getByLabel(/frames each side/i)).toBeVisible();
    await expect(page.getByLabel(/default machine state/i)).toBeVisible();

    // Backend config section loaded from ruler-config
    await expect(page.getByText('System configuration', { exact: false })).toBeVisible();
    await expect(page.getByText('10')).toBeVisible();             // imageSectionCount
    await expect(page.getByText('0.4')).toBeVisible();            // cmPerFrame
    // Defect type chips from RULER_CONFIG
    await expect(page.getByText('Slub')).toBeVisible();
    await expect(page.getByText('Floats')).toBeVisible();
  });

  // ── Flow 12b: Save shows snackbar ──────────────────────────────────────────

  test('shows "Settings saved" snackbar after clicking Save', async ({ page }) => {
    await mockConfigRoutes(page);

    await page.goto('/configuration');
    await expect(page.getByLabel(/buffer size/i)).toBeVisible();

    await page.getByRole('button', { name: /save settings/i }).click();

    await expect(page.locator('mat-snack-bar-container')).toContainText('Settings saved');
  });

  // ── Flow 12c: Reset shows snackbar and restores defaults ───────────────────

  test('shows "Reset to defaults" snackbar and restores default buffer size after reset', async ({ page }) => {
    await mockConfigRoutes(page);

    await page.goto('/configuration');

    const bufferInput = page.getByLabel(/buffer size/i);
    await expect(bufferInput).toBeVisible();

    // Change buffer size to a custom value
    await bufferInput.fill('999');
    await expect(bufferInput).toHaveValue('999');

    // Reset
    await page.getByRole('button', { name: /reset to defaults/i }).click();

    await expect(page.locator('mat-snack-bar-container')).toContainText('Reset to defaults');

    // Buffer size reverts to default (500)
    await expect(bufferInput).toHaveValue('500');
  });

});
