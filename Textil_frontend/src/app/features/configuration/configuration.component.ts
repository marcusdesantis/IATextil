import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { CaptureConfigService } from '../../core/services/capture-config.service';

@Component({
  selector: 'app-configuration',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatDividerModule,
    MatTooltipModule,
    MatSnackBarModule,
  ],
  template: `
    <div class="page">

      <div class="page-header">
        <div class="page-header__left">
          <h1 class="page-title">Configurazione</h1>
          <span class="page-subtitle">Parametri di cattura e impostazioni di sistema</span>
        </div>
        <a mat-stroked-button routerLink="/inspection" class="back-btn">
          <mat-icon>arrow_back</mat-icon>
          Torna all'ispezione
        </a>
      </div>

      <!-- Capture parameters -->
      <div class="section-card">
        <div class="section-header">
          <mat-icon class="section-icon">tune</mat-icon>
          <div>
            <div class="section-title">Parametri di cattura</div>
            <div class="section-subtitle">Applicati ad ogni cattura di difetti e sessione di registrazione.</div>
          </div>
        </div>

        <mat-divider />

        <div class="fields-grid">

          <div class="field-group">
            <mat-form-field appearance="outline" class="field">
              <mat-label>Dimensione buffer (fotogrammi)</mat-label>
              <input matInput type="number" [(ngModel)]="cfg.config.ringBufferSize" min="50" max="5000" />
              <mat-icon matSuffix matTooltip="Fotogrammi massimi mantenuti in memoria. Applicato all'avvio della registrazione."
                matTooltipPosition="above" class="suffix-info">info_outline</mat-icon>
            </mat-form-field>
            <p class="field-hint">Fotogrammi conservati nel ring buffer mentre il tessuto è in movimento. Valori più alti consentono di catturare difetti più indietro nel tempo.</p>
          </div>

          <div class="field-group">
            <mat-form-field appearance="outline" class="field">
              <mat-label>Offset predefinito (fotogrammi indietro)</mat-label>
              <input matInput type="number" [(ngModel)]="cfg.config.offsetFrames" min="1" [max]="cfg.config.ringBufferSize - 1" />
              <mat-icon matSuffix matTooltip="Sostituito automaticamente quando si seleziona una posizione sul righello."
                matTooltipPosition="above" class="suffix-info">info_outline</mat-icon>
            </mat-form-field>
            <p class="field-hint">Fotogrammi da tornare indietro dalla fine del buffer quando non è specificata una posizione sul righello. La posizione del righello ha sempre la priorità.</p>
          </div>

          <div class="field-group">
            <mat-form-field appearance="outline" class="field">
              <mat-label>Fotogrammi per lato (±)</mat-label>
              <input matInput type="number" [(ngModel)]="cfg.config.frameCount" min="1" [max]="(cfg.config.ringBufferSize - 1) / 2" />
              <mat-icon matSuffix
                [matTooltip]="'Fotogrammi uniti su ciascun lato del centro del difetto. Immagine ricostruita totale: ' + (cfg.config.frameCount * 2 + 1) + ' fotogrammi.'"
                matTooltipPosition="above" class="suffix-info">info_outline</mat-icon>
            </mat-form-field>
            <p class="field-hint">Controlla l'altezza dell'immagine ricostruita. Linee totali = frameCount × 2 + 1 = <strong>{{ cfg.config.frameCount * 2 + 1 }}</strong>.</p>
          </div>

          <div class="field-group">
            <mat-form-field appearance="outline" class="field">
              <mat-label>Stato macchina predefinito</mat-label>
              <input matInput [(ngModel)]="cfg.config.machineState" placeholder="es. Produzione" />
            </mat-form-field>
            <p class="field-hint">Etichetta associata a ogni sessione di registrazione. Può essere modificata per sessione dalla pagina di ispezione.</p>
          </div>

        </div>

        <div class="section-actions">
          <button mat-stroked-button (click)="reset()" class="reset-btn">
            <mat-icon>restart_alt</mat-icon>
            Ripristina predefiniti
          </button>
          <button mat-raised-button color="primary" (click)="save()">
            <mat-icon>save</mat-icon>
            Salva impostazioni
          </button>
        </div>
      </div>

      <!-- Backend config (read-only) -->
      <div class="section-card section-card--readonly">
        <div class="section-header">
          <mat-icon class="section-icon section-icon--gray">settings_suggest</mat-icon>
          <div>
            <div class="section-title">Configurazione di sistema <span class="readonly-badge">Sola lettura</span></div>
            <div class="section-subtitle">Caricato dal backend. Modifica <code>appsettings.json → FabricSimulation</code> per cambiare questi valori.</div>
          </div>
        </div>

        <mat-divider />

        @if (!cfg.backendConfigLoaded) {
          <div class="loading-row">
            <span>Caricamento configurazione di sistema…</span>
          </div>
        } @else {
          <div class="readonly-grid">

            <div class="readonly-item">
              <span class="readonly-label">Sezioni immagine</span>
              <span class="readonly-value">{{ cfg.imageSectionCount }}</span>
              <span class="readonly-hint">Bande orizzontali nel visualizzatore immagini difetti</span>
            </div>

            <div class="readonly-item">
              <span class="readonly-label">cm per fotogramma</span>
              <span class="readonly-value">{{ cfg.cmPerFrame }}</span>
              <span class="readonly-hint">Velocità tessuto calibrata / FPS telecamera</span>
            </div>

            <div class="readonly-item">
              <span class="readonly-label">Posizioni righello</span>
              <span class="readonly-value">{{ cfg.rulerPositions.length }}</span>
              <span class="readonly-hint">Posizioni fisiche sul righello (1–{{ cfg.rulerPositions.length }})</span>
            </div>

            <div class="readonly-item">
              <span class="readonly-label">Tipi di difetto</span>
              <span class="readonly-value">{{ cfg.defectTypes.length }}</span>
              <span class="readonly-hint">
                @for (dt of cfg.defectTypes; track dt) {
                  <span class="defect-chip">{{ dt }}</span>
                }
              </span>
            </div>

          </div>
        }
      </div>

    </div>
  `,
  styles: [`
    .page {
      padding: 28px 32px;
      max-width: 860px;
      margin: 0 auto;
      min-height: 100%;

      @media (max-width: 640px) { padding: 16px; }
    }

    /* Header */
    .page-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 28px;
      flex-wrap: wrap;
    }

    .page-header__left { display: flex; flex-direction: column; gap: 4px; }

    .page-title { font-size: 1.6rem; font-weight: 700; color: #111827; margin: 0; }

    .page-subtitle { font-size: 0.875rem; color: #6b7280; }

    .back-btn { height: 44px; display: flex; align-items: center; gap: 6px; }

    /* Section card */
    .section-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 14px;
      overflow: hidden;
      margin-bottom: 24px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.05);

      &--readonly {
        background: #fafafa;
        border-color: #e5e7eb;
      }
    }

    .section-header {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      padding: 20px 24px;
    }

    .section-icon {
      font-size: 26px;
      width: 26px;
      height: 26px;
      color: #4f46e5;
      flex-shrink: 0;
      margin-top: 2px;

      &--gray { color: #9ca3af; }
    }

    .section-title {
      font-size: 1rem;
      font-weight: 700;
      color: #111827;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .section-subtitle {
      font-size: 0.82rem;
      color: #6b7280;
      margin-top: 2px;

      code {
        font-size: 0.78rem;
        background: #f3f4f6;
        padding: 1px 5px;
        border-radius: 4px;
        color: #374151;
      }
    }

    .readonly-badge {
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: #f3f4f6;
      color: #6b7280;
      border: 1px solid #e5e7eb;
      padding: 2px 8px;
      border-radius: 20px;
    }

    /* Editable fields */
    .fields-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0;
      padding: 24px;

      @media (max-width: 640px) { grid-template-columns: 1fr; }
    }

    .field-group {
      padding: 0 12px 20px 12px;
      &:nth-child(odd) { padding-left: 0; }
      &:nth-child(even) { padding-right: 0; }
    }

    .field {
      width: 100%;
      ::ng-deep .mat-mdc-form-field-subscript-wrapper { display: none; }
    }

    .suffix-info {
      font-size: 18px !important;
      width: 18px !important;
      height: 18px !important;
      color: #d1d5db;
      cursor: help;
      transition: color 0.15s;
      &:hover { color: #6b7280; }
    }

    .field-hint {
      font-size: 0.75rem;
      color: #9ca3af;
      margin: 6px 0 0;
      line-height: 1.4;

      strong { color: #374151; }
    }

    .section-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      padding: 16px 24px;
      border-top: 1px solid #f3f4f6;
    }

    .reset-btn { color: #6b7280; }

    /* Read-only grid */
    .loading-row {
      padding: 24px;
      color: #9ca3af;
      font-size: 0.875rem;
    }

    .readonly-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1px;
      background: #f3f4f6;
      border-top: 1px solid #f3f4f6;

      @media (max-width: 640px) { grid-template-columns: 1fr; }
    }

    .readonly-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 18px 24px;
      background: #fafafa;
    }

    .readonly-label {
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #9ca3af;
    }

    .readonly-value {
      font-size: 1.4rem;
      font-weight: 700;
      color: #374151;
    }

    .readonly-hint {
      font-size: 0.75rem;
      color: #6b7280;
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      align-items: center;
      line-height: 1.4;
    }

    .defect-chip {
      display: inline-block;
      font-size: 0.7rem;
      font-weight: 600;
      background: #ede9fe;
      color: #5b21b6;
      border-radius: 20px;
      padding: 2px 8px;
    }
  `],
})
export class ConfigurationComponent implements OnInit {
  constructor(
    public cfg: CaptureConfigService,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.cfg.loadBackendConfig();
  }

  save(): void {
    this.cfg.save();
    this.snackBar.open('Impostazioni salvate', 'Chiudi', {
      duration: 3000,
      panelClass: ['snack-success'],
      horizontalPosition: 'end',
      verticalPosition: 'bottom',
    });
  }

  reset(): void {
    this.cfg.reset();
    this.snackBar.open('Valori predefiniti ripristinati', 'Chiudi', {
      duration: 3000,
      horizontalPosition: 'end',
      verticalPosition: 'bottom',
    });
  }
}
