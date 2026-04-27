import { Routes } from '@angular/router';
import { Shell } from './shell/shell';
import { InspectionComponent } from './features/inspection/inspection.component';
import { ConfigurationComponent } from './features/configuration/configuration.component';

export const routes: Routes = [
  {
    path: '',
    component: Shell,
    children: [
      { path: '', redirectTo: 'inspection', pathMatch: 'full' },
      { path: 'inspection', component: InspectionComponent },
      { path: 'configuration', component: ConfigurationComponent },
    ],
  },
];
