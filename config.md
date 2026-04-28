# Dynamic Backend Configuration

Source file: `Textil_backend/Textil_backend/appsettings.json`  
C# model: `Textil_backend/Textil_backend/Models/FabricSettings.cs`

---

## Ring Buffer and Defect Capture

| JSON Key | Type | Current Value | Description |
|---|---|---|---|
| `RingBufferSize` | int | `500` | Maximum number of frames retained in memory while the fabric moves. Applied when each recording starts. |
| `DefaultOffsetFrames` | int | `100` | Number of frames to go back in the buffer when capturing a defect without using the ruler rule. |
| `DefaultFrameCount` | int | `20` | Frames taken on each side of the defect center to build the stitched image. Total image = `frameCount × 2 + 1` frames. |
| `DefectTypes` | string[] | `Slub, Floats, Knot, Holes, Ladder` | Defect types available in the capture dialog and in the image viewer. |

---

## Image Viewer

| JSON Key | Type | Current Value | Description |
|---|---|---|---|
| `ImageSectionCount` | int | `10` | Number of horizontal bands the stitched image is divided into in the web viewer. The operator clicks one to annotate it. |

---

## Physical Ruler Geometry

```text
Camera
  |-------- 50 cm (base) --------|-- ruler start
  |                              |--[1]--[2]--[3]-...-[12]--|
  |                             50 cm                      110 cm
  |                              |<--- 5 cm per position --->|
```

| JSON Key | Type | Current Value | Description |
|---|---|---|---|
| `RulerBaseDistanceCm` | double | `50.0` | Distance in cm from the camera to the physical start of the ruler. |
| `RulerPositionCount` | int | `12` | Number of fixed positions on the ruler (1 to 12). |
| `RulerPositionSpacingCm` | double | `5.0` | Number of centimeters covered by each ruler position. |

### Formula: Distance by Position

```text
distance_cm(P) = RulerBaseDistanceCm + (P - 0.5) × RulerPositionSpacingCm
```

| Position | Calculation | Distance |
|---|---|---|
| 1 | 50 + 0.5 × 5 | 52.5 cm |
| 6 | 50 + 5.5 × 5 | 77.5 cm |
| 12 | 50 + 11.5 × 5 | 107.5 cm |

---

## Calibration: Frames ↔ Centimeters

| JSON Key | Type | Current Value | Description |
|---|---|---|---|
| `CmPerFrame` | double | `0.4` | Centimeters of fabric passing under the camera per frame. Calibrated as `speed_cm_s ÷ camera_fps`. |

### Formula: Frames to Go Back for a Ruler Position

```text
frames_back(P) = round(distance_cm(P) / CmPerFrame)
```

| Position | Distance | Frames Back (with CmPerFrame = 0.4) |
|---|---|---|
| 1 | 52.5 cm | 131 frames |
| 6 | 77.5 cm | 194 frames |
| 12 | 107.5 cm | 269 frames |

### Reference for Future Calibration (AllPixa neo 6k)

| Scenario | Fabric Speed | Camera FPS | CmPerFrame |
|---|---|---|---|
| Current (simulated) | 10 cm/s | 25 fps | `0.40` |
| AllPixa neo 6k | 10 m/min ≈ 16.7 cm/s | 8,000 fps | `≈ 0.00208` |

---

## Full `appsettings.json` File

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost; Port=5432; Database=postgres; Username=postgres; Password=..."
  },
  "FabricSimulation": {
    "RingBufferSize": 500,
    "DefaultOffsetFrames": 100,
    "DefaultFrameCount": 20,
    "DefectTypes": [ "Slub", "Floats", "Knot", "Holes", "Ladder" ],
    "ImageSectionCount": 10,
    "RulerBaseDistanceCm": 50.0,
    "RulerPositionCount": 12,
    "RulerPositionSpacingCm": 5.0,
    "CmPerFrame": 0.4
  }
}
```


