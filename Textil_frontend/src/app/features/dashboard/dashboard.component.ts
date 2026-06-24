import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { InspectionService } from '../../core/services/inspection.service';
import { DefectStats, DefectTypeCount } from '../../core/models/inspection.models';

type RangePreset = 'today' | '7days' | '30days';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <div class="page">

      <div class="page-header">
        <div class="page-header__left">
          <h1 class="page-title">Statistiche difetti</h1>
          <span class="page-subtitle">Difetti catturati per tipo nell'intervallo selezionato</span>
        </div>
      </div>

      <!-- Filter bar -->
      <div class="filter-card">
        <div class="filter-fields">
          <div class="filter-field">
            <label for="from">Dal</label>
            <input id="from" type="date" [(ngModel)]="from" [max]="to" />
          </div>
          <div class="filter-field">
            <label for="to">Al</label>
            <input id="to" type="date" [(ngModel)]="to" [min]="from" />
          </div>
          <button mat-raised-button color="primary" class="apply-btn" (click)="load()">
            <mat-icon>search</mat-icon>
            Applica
          </button>
        </div>

        <div class="presets">
          <button class="preset-btn" (click)="applyPreset('today')">Oggi</button>
          <button class="preset-btn" (click)="applyPreset('7days')">Ultimi 7 giorni</button>
          <button class="preset-btn" (click)="applyPreset('30days')">Ultimi 30 giorni</button>
        </div>
      </div>

      <!-- Loading -->
      @if (loading) {
        <div class="state-box">
          <mat-spinner diameter="48" />
          <span>Caricamento statistiche…</span>
        </div>
      }

      <!-- Error -->
      @else if (error) {
        <div class="state-box state-box--error">
          <mat-icon>error_outline</mat-icon>
          <span>{{ error }}</span>
          <button mat-stroked-button (click)="load()">Riprova</button>
        </div>
      }

      <!-- Empty -->
      @else if (stats && stats.total === 0) {
        <div class="state-box">
          <mat-icon class="empty-icon">inbox</mat-icon>
          <span>Nessun difetto catturato nell'intervallo selezionato.</span>
        </div>
      }

      <!-- Results -->
      @else if (stats) {
        <div class="summary-card">
          <span class="summary-label">Totale difetti</span>
          <span class="summary-value">{{ stats.total }}</span>
          <span class="summary-types">{{ stats.byType.length }} {{ stats.byType.length === 1 ? 'tipo diverso' : 'tipi diversi' }}</span>
        </div>

        <div class="list-card">
          @for (item of stats.byType; track item.defectType) {
            <div class="defect-row">
              <span class="defect-name">{{ label(item) }}</span>
              <div class="defect-bar-track">
                <div class="defect-bar" [style.width.%]="barWidth(item)"></div>
              </div>
              <span class="defect-count">{{ item.count }}</span>
            </div>
          }
        </div>
      }

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

    .page-header { margin-bottom: 24px; }
    .page-header__left { display: flex; flex-direction: column; gap: 4px; }
    .page-title { font-size: 1.6rem; font-weight: 700; color: #111827; margin: 0; }
    .page-subtitle { font-size: 0.875rem; color: #6b7280; }

    /* Filter */
    .filter-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 14px;
      padding: 20px 24px;
      margin-bottom: 24px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.05);
    }

    .filter-fields {
      display: flex;
      align-items: flex-end;
      gap: 16px;
      flex-wrap: wrap;
    }

    .filter-field {
      display: flex;
      flex-direction: column;
      gap: 6px;

      label { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; }

      input {
        height: 42px;
        border: 1px solid #d1d5db;
        border-radius: 10px;
        padding: 0 12px;
        font-size: 0.95rem;
        color: #111827;
        background: #fff;

        &:focus { outline: none; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79,70,229,0.15); }
      }
    }

    .apply-btn {
      height: 42px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .presets {
      display: flex;
      gap: 8px;
      margin-top: 16px;
      flex-wrap: wrap;
    }

    .preset-btn {
      border: 1px solid #e5e7eb;
      background: #f9fafb;
      border-radius: 20px;
      padding: 6px 14px;
      font-size: 0.8rem;
      font-weight: 600;
      color: #4b5563;
      cursor: pointer;
      transition: all 0.15s;

      &:hover { border-color: #a5b4fc; background: #eef2ff; color: #4f46e5; }
    }

    /* State boxes */
    .state-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      padding: 56px 24px;
      color: #6b7280;
      text-align: center;

      mat-icon { font-size: 48px; width: 48px; height: 48px; }
      .empty-icon { color: #cbd5e1; }
      &--error { color: #b91c1c; mat-icon { color: #dc2626; } }
    }

    /* Summary */
    .summary-card {
      background: #4f46e5;
      color: white;
      border-radius: 14px;
      padding: 22px 26px;
      margin-bottom: 20px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      box-shadow: 0 4px 16px rgba(79,70,229,0.25);
    }

    .summary-label { font-size: 0.8rem; font-weight: 600; opacity: 0.85; text-transform: uppercase; letter-spacing: 0.05em; }
    .summary-value { font-size: 2.6rem; font-weight: 800; line-height: 1.1; }
    .summary-types { font-size: 0.85rem; opacity: 0.85; }

    /* List */
    .list-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 14px;
      padding: 8px 0;
      box-shadow: 0 1px 4px rgba(0,0,0,0.05);
    }

    .defect-row {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 12px 24px;

      &:not(:last-child) { border-bottom: 1px solid #f3f4f6; }
    }

    .defect-name { flex: 0 0 200px; font-size: 0.9rem; font-weight: 600; color: #374151; }

    .defect-bar-track {
      flex: 1;
      height: 14px;
      background: #f3f4f6;
      border-radius: 8px;
      overflow: hidden;
    }

    .defect-bar {
      height: 100%;
      background: linear-gradient(90deg, #6366f1, #4f46e5);
      border-radius: 8px;
      transition: width 0.3s ease;
      min-width: 4px;
    }

    .defect-count { flex: 0 0 48px; text-align: right; font-size: 1rem; font-weight: 700; color: #111827; }

    @media (max-width: 640px) {
      .defect-name { flex-basis: 110px; }
    }
  `],
})
export class DashboardComponent implements OnInit {
  from = '';
  to = '';
  stats: DefectStats | null = null;
  loading = false;
  error: string | null = null;

  constructor(private inspection: InspectionService) {}

  ngOnInit(): void {
    this.applyPreset('30days');
  }

  applyPreset(preset: RangePreset): void {
    const today = new Date();
    const start = new Date(today);
    if (preset === '7days') start.setDate(today.getDate() - 6);
    else if (preset === '30days') start.setDate(today.getDate() - 29);
    this.from = this.formatDate(start);
    this.to = this.formatDate(today);
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = null;
    // Convert the selected local calendar days to absolute UTC instants so the
    // range honours the user's time zone. Window is [from 00:00 local, day-after-to 00:00 local).
    const from = this.from ? this.localDayStartIso(this.from) : undefined;
    const to = this.to ? this.localDayEndExclusiveIso(this.to) : undefined;
    this.inspection.getDefectStats(from, to).subscribe({
      next: (stats) => {
        this.stats = stats;
        this.loading = false;
      },
      error: () => {
        this.error = 'Impossibile caricare le statistiche. Verifica che il backend sia in esecuzione.';
        this.loading = false;
      },
    });
  }

  label(item: DefectTypeCount): string {
    return item.defectType ?? 'Non specificato';
  }

  barWidth(item: DefectTypeCount): number {
    const max = this.maxCount;
    return max > 0 ? (item.count / max) * 100 : 0;
  }

  private get maxCount(): number {
    return this.stats ? Math.max(...this.stats.byType.map((b) => b.count), 0) : 0;
  }

  private formatDate(d: Date): string {
    const year = d.getFullYear();
    const month = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /** Start of the given local day ('yyyy-MM-dd') as a UTC ISO instant. */
  private localDayStartIso(dateStr: string): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
  }

  /** Start of the day AFTER the given local day ('yyyy-MM-dd') as a UTC ISO instant (exclusive upper bound). */
  private localDayEndExclusiveIso(dateStr: string): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d + 1, 0, 0, 0, 0).toISOString();
  }
}
